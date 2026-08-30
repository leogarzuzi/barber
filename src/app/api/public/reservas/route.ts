import { NextRequest, NextResponse } from "next/server";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarCatalogo } from "@/lib/supabase/catalogo";
import { buscarConfiguracao, agendaDoBanco } from "@/lib/supabase/configuracoes";
import { buscarAgendamentos, buscarBloqueios } from "@/lib/supabase/agenda";
import { intervalosSeSobrepoem, validarAlteracaoReservaCliente, validarLimiteReservasCliente } from "@/lib/agenda-rules.mjs";
import { chaveRateLimit, consumirRateLimit, ipDaRequisicao, limparRateLimit, respostaBloqueada } from "@/lib/supabase/rate-limit";
import { sincronizarAgendamentoGoogle } from "@/lib/google-calendar/sync";
import { gerarProtocolo } from "@/lib/protocolo.mjs";

const idsDias = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
function minutos(hora: string) { const [h, m] = hora.split(":").map(Number); return h * 60 + m; }
function respostaReserva(item: Awaited<ReturnType<typeof buscarAgendamentos>>[number]) {
  return {
    id: item.id,
    codigo: item.codigo,
    cliente: item.cliente,
    whatsapp: item.whatsapp,
    servico: item.servico,
    data: item.data,
    hora: item.hora,
    duracaoMinutos: item.duracaoMinutos,
    valor: item.valor,
    cobertoPorMensalidade: item.cobertoPorMensalidade,
    statusManual: item.statusManual,
  };
}
async function tentarSincronizar(supabase: ReturnType<typeof criarClienteSupabaseAdmin>, id: string) {
  try {
    await sincronizarAgendamentoGoogle(supabase, id);
  } catch (erro) {
    console.error("Reserva salva, mas a sincronização com o Google falhou:", erro);
  }
}

export async function GET(request: NextRequest) {
  const supabase = criarClienteSupabaseAdmin();
  const ip = ipDaRequisicao(request);
  const chaveGeral = chaveRateLimit("consulta-geral", ip);
  const geral = await consumirRateLimit(supabase, chaveGeral, { limite: 30, janelaSegundos: 60, bloqueioSegundos: 300 });
  if (!geral.permitido) return respostaBloqueada(geral.tentar_em);
  const whatsapp = request.nextUrl.searchParams.get("whatsapp")?.replace(/\D/g, "");
  const chaveFalhas = chaveRateLimit("consulta-falhas", ip);
  if (!whatsapp || !/^55219\d{8}$/.test(whatsapp)) {
    const falha = await consumirRateLimit(supabase, chaveFalhas, { limite: 5, janelaSegundos: 900, bloqueioSegundos: 1800 });
    if (!falha.permitido) return respostaBloqueada(falha.tentar_em);
    return NextResponse.json({ erro: "Não encontramos reservas para este WhatsApp." }, { status: 404 });
  }
  const limiteTelefone = await consumirRateLimit(supabase, chaveRateLimit("consulta-reservas-whatsapp", whatsapp), { limite: 10, janelaSegundos: 900, bloqueioSegundos: 1800 });
  if (!limiteTelefone.permitido) return respostaBloqueada(limiteTelefone.tentar_em);
  const reservas = await buscarAgendamentos(supabase);
  const reservasDoCliente = reservas
    .filter((item) => item.whatsapp === whatsapp)
    .slice(0, 20)
    .map(respostaReserva);
  if (reservasDoCliente.length === 0) {
    const falha = await consumirRateLimit(supabase, chaveFalhas, { limite: 5, janelaSegundos: 900, bloqueioSegundos: 1800 });
    if (!falha.permitido) return respostaBloqueada(falha.tentar_em);
    return NextResponse.json({ erro: "Não encontramos reservas para este WhatsApp." }, { status: 404 });
  }
  await limparRateLimit(supabase, chaveFalhas);
  return NextResponse.json({ reservas: reservasDoCliente });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = criarClienteSupabaseAdmin();
    const limiteIp = await consumirRateLimit(supabase, chaveRateLimit("criar-reserva-ip", ipDaRequisicao(request)), { limite: 8, janelaSegundos: 600, bloqueioSegundos: 900 });
    if (!limiteIp.permitido) return respostaBloqueada(limiteIp.tentar_em);
    const corpo = await request.json() as { nome: string; whatsapp: string; itens: Array<{ tipo: "servico" | "combo"; id: string }>; data: string; hora: string };
    if (!/^55219\d{8}$/.test(corpo.whatsapp ?? "")) throw new Error("dados");
    const limiteTelefone = await consumirRateLimit(supabase, chaveRateLimit("criar-reserva-whatsapp", corpo.whatsapp), { limite: 4, janelaSegundos: 3600, bloqueioSegundos: 3600 });
    if (!limiteTelefone.permitido) return respostaBloqueada(limiteTelefone.tentar_em);
    const [catalogo, configBanco, bloqueios, reservas, resultadoCliente] = await Promise.all([
      buscarCatalogo(supabase, true),
      buscarConfiguracao(supabase),
      buscarBloqueios(supabase),
      buscarAgendamentos(supabase),
      supabase.from("clientes").select("id, nome, mensalista").eq("whatsapp", corpo.whatsapp).maybeSingle(),
    ]);
    if (resultadoCliente.error) throw resultadoCliente.error;
    const clienteExistente = resultadoCliente.data;
    const nomeCliente = clienteExistente?.nome ?? corpo.nome?.trim();
    const mensalista = Boolean(clienteExistente?.mensalista);
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ]+)*$/.test(nomeCliente ?? "")) throw new Error("dados");
    const selecoes = corpo.itens?.map((selecao) => selecao.tipo === "servico" ? catalogo.servicos.find((x) => x.id === selecao.id) : catalogo.combos.find((x) => x.id === selecao.id));
    if (!selecoes?.length || selecoes.some((item) => !item) || corpo.itens.some((item) => item.tipo !== "servico" && item.tipo !== "combo")) return NextResponse.json({ erro: "Seleção de serviços inválida." }, { status: 409 });
    const itens = selecoes.filter((item): item is NonNullable<typeof item> => Boolean(item));
    const item = { nome: itens.map((x) => x.nome).join(" + "), valor: itens.reduce((total, x) => total + x.valor, 0) };
    const itemTipo = corpo.itens.length === 1 ? corpo.itens[0].tipo : "itens";
    const config = agendaDoBanco(configBanco);
    const dia = config.diasFuncionamento.find((x) => x.id === idsDias[new Date(`${corpo.data}T12:00:00`).getDay()]);
    const intervalo = Number(config.configAgenda.intervalo);
    const inicio = minutos(corpo.hora); const fim = inicio + intervalo;
    const instante = new Date(`${corpo.data}T${corpo.hora}:00-03:00`).getTime();
    const antecedencia = Number(config.configAgenda.antecedenciaMinima) * 60000;
    const diasDisponiveis = mensalista ? Math.max(20, Number(config.configAgenda.diasParaAgendar)) : Number(config.configAgenda.diasParaAgendar);
    const limiteJanela = Date.now() + diasDisponiveis * 86400000;
    const invalido = instante < Date.now() + antecedencia || instante > limiteJanela || !dia?.ativo || inicio < minutos(dia.abertura) || fim > minutos(dia.fechamento) || (dia.temPausa && intervalosSeSobrepoem(inicio, fim, minutos(dia.pausaInicio), minutos(dia.pausaFim))) || bloqueios.some((b) => b.data === corpo.data && intervalosSeSobrepoem(inicio, fim, b.diaInteiro ? 0 : minutos(b.inicio), b.diaInteiro ? 1440 : minutos(b.fim))) || reservas.some((r) => !r.statusManual && r.data === corpo.data && intervalosSeSobrepoem(inicio, fim, minutos(r.hora), minutos(r.hora) + (r.duracaoMinutos ?? intervalo)));
    if (invalido) return NextResponse.json({ erro: "Horário indisponível." }, { status: 409 });
    const reservasAtivasCliente = reservas.filter((r) => !r.statusManual && r.whatsapp === corpo.whatsapp && new Date(`${r.data}T${r.hora}:00-03:00`).getTime() + (r.duracaoMinutos ?? intervalo) * 60000 > Date.now());
    const limiteReservas = validarLimiteReservasCliente({ mensalista, datasAtivas: reservasAtivasCliente.map((reserva) => reserva.data), novaData: corpo.data });
    if (limiteReservas === "reserva-existente") return NextResponse.json({ erro: "Este WhatsApp já possui uma reserva ativa." }, { status: 409 });
    if (limiteReservas === "limite-mensalista") return NextResponse.json({ erro: "Você já possui o limite de 4 reservas futuras." }, { status: 409 });
    if (limiteReservas === "mesmo-dia") return NextResponse.json({ erro: "Mensalistas podem manter apenas uma reserva por dia." }, { status: 409 });
    const { data: cliente, error: erroCliente } = await supabase.from("clientes").upsert({ nome: nomeCliente, whatsapp: corpo.whatsapp }, { onConflict: "whatsapp" }).select("id").single();
    if (erroCliente) throw erroCliente;
    const historico = [{ id: crypto.randomUUID(), tipo: "Criada", origem: "Cliente", realizadaEm: new Date().toISOString(), dataNova: corpo.data, horaNova: corpo.hora }];
    const { data: criada, error } = await supabase.from("agendamentos").insert({ protocolo: gerarProtocolo(), cliente_id: cliente.id, cliente_nome: nomeCliente, whatsapp: corpo.whatsapp, item_tipo: itemTipo, servico_id: itemTipo === "servico" ? corpo.itens[0].id : null, combo_id: itemTipo === "combo" ? corpo.itens[0].id : null, item_nome: item.nome, data: corpo.data, hora: corpo.hora, duracao_minutos: intervalo, valor_centavos: mensalista ? 0 : Math.round(item.valor * 100), coberto_por_mensalidade: mensalista, historico }).select("id").single();
    if (error) throw error;
    const servicosSelecionados = corpo.itens.filter((selecao) => selecao.tipo === "servico");
    const combosSelecionados = corpo.itens.filter((selecao) => selecao.tipo === "combo");
    if (servicosSelecionados.length > 0) {
      const { error: erroVinculos } = await supabase.from("agendamento_servicos").insert(servicosSelecionados.map((selecao, ordem) => ({ agendamento_id: criada.id, servico_id: selecao.id, ordem })));
      if (erroVinculos) { await supabase.from("agendamentos").delete().eq("id", criada.id); throw erroVinculos; }
    }
    if (combosSelecionados.length > 0) {
      const { error: erroVinculos } = await supabase.from("agendamento_combos").insert(combosSelecionados.map((selecao, ordem) => ({ agendamento_id: criada.id, combo_id: selecao.id, ordem })));
      if (erroVinculos) { await supabase.from("agendamentos").delete().eq("id", criada.id); throw erroVinculos; }
    }
    await tentarSincronizar(supabase, criada.id);
    const reserva = (await buscarAgendamentos(supabase)).find((x) => x.id === criada.id);
    return NextResponse.json({ reserva }, { status: 201 });
  } catch {
    return NextResponse.json({ erro: "Não foi possível criar a reserva." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const corpo = await request.json() as { codigo: string; whatsapp: string; acao: "cancelar" | "remarcar"; data?: string; hora?: string };
    if (corpo.acao !== "cancelar" && corpo.acao !== "remarcar") {
      return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
    }
    const codigo = corpo.codigo?.trim().toUpperCase();
    const whatsapp = corpo.whatsapp?.replace(/\D/g, "");
    if (!/^PH10-[A-Z0-9]{6}$/.test(codigo ?? "") || !/^55219\d{8}$/.test(whatsapp ?? "")) {
      return NextResponse.json({ erro: "Dados da reserva inválidos." }, { status: 400 });
    }
    const supabase = criarClienteSupabaseAdmin();
    const [limiteIp, limiteWhatsapp, limiteCodigo] = await Promise.all([
      consumirRateLimit(supabase, chaveRateLimit("alterar-reserva-ip", ipDaRequisicao(request)), { limite: 10, janelaSegundos: 600, bloqueioSegundos: 900 }),
      consumirRateLimit(supabase, chaveRateLimit("alterar-reserva-whatsapp", whatsapp), { limite: 6, janelaSegundos: 600, bloqueioSegundos: 900 }),
      consumirRateLimit(supabase, chaveRateLimit("alterar-reserva-codigo", codigo), { limite: 4, janelaSegundos: 600, bloqueioSegundos: 900 }),
    ]);
    if (!limiteIp.permitido) return respostaBloqueada(limiteIp.tentar_em);
    if (!limiteWhatsapp.permitido) return respostaBloqueada(limiteWhatsapp.tentar_em);
    if (!limiteCodigo.permitido) return respostaBloqueada(limiteCodigo.tentar_em);
    const reservas = await buscarAgendamentos(supabase);
    const reserva = reservas.find((x) => x.codigo === codigo && x.whatsapp === whatsapp);
    if (!reserva) return NextResponse.json({ erro: "Alteração não permitida." }, { status: 409 });
    const erroAlteracao = validarAlteracaoReservaCliente({ reserva, acao: corpo.acao, dataNova: corpo.data, horaNova: corpo.hora, agora: Date.now() });
    if (erroAlteracao === "alteracao-nao-permitida") return NextResponse.json({ erro: "Alteração não permitida." }, { status: 409 });
    if (erroAlteracao === "novo-horario-invalido") return NextResponse.json({ erro: "Novo horário inválido." }, { status: 400 });
    if (erroAlteracao === "mesmo-horario") return NextResponse.json({ erro: "Escolha um horário diferente do atual." }, { status: 409 });
    let duracaoRemarcacao: number | undefined;
    if (corpo.acao === "remarcar") {
      const dataNova = corpo.data;
      const horaNova = corpo.hora;
      if (!dataNova || !horaNova) return NextResponse.json({ erro: "Novo horário inválido." }, { status: 400 });
      const [configBanco, bloqueios] = await Promise.all([buscarConfiguracao(supabase), buscarBloqueios(supabase)]);
      const config = agendaDoBanco(configBanco);
      const dia = config.diasFuncionamento.find((x) => x.id === idsDias[new Date(`${dataNova}T12:00:00`).getDay()]);
      const intervalo = Number(config.configAgenda.intervalo);
      duracaoRemarcacao = intervalo;
      const inicio = minutos(horaNova); const fim = inicio + intervalo;
      const instante = new Date(`${dataNova}T${horaNova}:00-03:00`).getTime();
      const diasDisponiveis = reserva.cobertoPorMensalidade ? Math.max(20, Number(config.configAgenda.diasParaAgendar)) : Number(config.configAgenda.diasParaAgendar);
      const limiteJanela = Date.now() + diasDisponiveis * 86400000;
      const invalido = instante < Date.now() + 2 * 3600000 || instante > limiteJanela || !dia?.ativo || inicio < minutos(dia.abertura) || fim > minutos(dia.fechamento) || (dia.temPausa && intervalosSeSobrepoem(inicio, fim, minutos(dia.pausaInicio), minutos(dia.pausaFim))) || bloqueios.some((b) => b.data === dataNova && intervalosSeSobrepoem(inicio, fim, b.diaInteiro ? 0 : minutos(b.inicio), b.diaInteiro ? 1440 : minutos(b.fim))) || reservas.some((r) => r.id !== reserva.id && !r.statusManual && r.data === dataNova && intervalosSeSobrepoem(inicio, fim, minutos(r.hora), minutos(r.hora) + (r.duracaoMinutos ?? intervalo)));
      if (invalido) return NextResponse.json({ erro: "Novo horário indisponível." }, { status: 409 });
    }
    const historico = [...(reserva.historicoAlteracoes ?? []), { id: crypto.randomUUID(), tipo: corpo.acao === "cancelar" ? "Cancelada" : "Remarcada", origem: "Cliente", realizadaEm: new Date().toISOString(), dataAnterior: reserva.data, horaAnterior: reserva.hora, dataNova: corpo.data, horaNova: corpo.hora }];
    const alteracao = corpo.acao === "cancelar" ? { status: "cancelado", historico } : { data: corpo.data, hora: corpo.hora, duracao_minutos: duracaoRemarcacao, historico };
    const { error } = await supabase.from("agendamentos").update(alteracao).eq("id", reserva.id);
    if (error) throw error;
    await tentarSincronizar(supabase, reserva.id);
    const atualizada = (await buscarAgendamentos(supabase)).find((x) => x.id === reserva.id);
    return NextResponse.json({ reserva: atualizada });
  } catch { return NextResponse.json({ erro: "Não foi possível alterar a reserva." }, { status: 400 }); }
}
