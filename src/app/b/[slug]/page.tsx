"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import ClientReservationLookup from "@/components/booking/ClientReservationLookup";
import {
  Agendamento,
  BloqueioAgenda,
  Combo,
  ConfiguracaoAgenda,
  PerfilBarbearia,
  Servico,
  proximosDias,
  reservaEstaAtiva,
  perfilInicial,
} from "@/lib/barber-storage";
import { intervalosSeSobrepoem } from "@/lib/agenda-rules.mjs";

const idsDosDias = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

function minutos(hora: string) { const [h, m] = hora.split(":").map(Number); return h * 60 + m; }
function horaFormatada(total: number) { return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }

function dinheiro(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function somenteLetras(valor: string) {
  return valor.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s]/g, "").replace(/\s{2,}/g, " ");
}
function somenteDigitos(valor: string) { return valor.replace(/\D/g, "").slice(0, 9); }

function CarregandoAgendamento() {
  return (
    <main className="min-h-screen bg-[#24211e] text-[#f3ead8]" aria-busy="true" aria-label="Carregando agendamento">
      <div className="mx-auto w-full max-w-md animate-pulse px-4 py-5 lg:max-w-4xl">
        <div className="hero-panel">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="h-28 w-28 shrink-0 rounded-full bg-white/10 sm:h-32 sm:w-32" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-2.5 w-24 rounded-full bg-amber-400/20" />
              <div className="h-6 w-36 rounded-full bg-white/10" />
              <div className="border-t border-white/10 pt-3">
                <div className="h-3 w-40 rounded-full bg-white/10" />
                <div className="mt-2 h-3 w-28 rounded-full bg-white/5" />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-10 h-5 w-24 rounded-full bg-white/10" />
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {[0, 1, 2].map((item) => <div key={item} className="h-[78px] rounded-3xl border border-white/5 bg-neutral-900/70" />)}
        </div>
        <div className="mt-7 h-5 w-12 rounded-full bg-white/10" />
        <div className="mt-3 flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-[72px] min-w-16 rounded-3xl border border-white/5 bg-neutral-900/70" />)}
        </div>
        <div className="mt-7 h-5 w-20 rounded-full bg-white/10" />
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-12 rounded-2xl border border-white/5 bg-neutral-900/70" />)}
        </div>
        <p className="mt-6 text-center text-xs font-bold text-neutral-500">Carregando horários...</p>
      </div>
    </main>
  );
}

export default function PaginaCliente() {
  const [selecoes, setSelecoes] = useState<string[]>([]);
  const [dia, setDia] = useState(() => proximosDias(1)[0].data);
  const [horario, setHorario] = useState("");
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [bloqueios, setBloqueios] = useState<BloqueioAgenda[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [configuracao, setConfiguracao] = useState<ConfiguracaoAgenda | null>(null);
  const [perfil, setPerfil] = useState<PerfilBarbearia>(perfilInicial);
  const [carregado, setCarregado] = useState(false);
  const [agora, setAgora] = useState(0);
  const [reservaConcluida, setReservaConcluida] = useState<Agendamento | null>(null);
  const [codigoCopiado, setCodigoCopiado] = useState(false);
  const [reservaExistenteAviso, setReservaExistenteAviso] = useState<Agendamento | null>(null);
  const [avisoFormulario, setAvisoFormulario] = useState<{ titulo: string; mensagem: string; recarregar?: boolean } | null>(null);
  const [processandoReserva, setProcessandoReserva] = useState(false);
  const dadosCarregadosRef = useRef(false);
  const carregandoDadosRef = useRef(false);
  const processandoReservaRef = useRef(false);

  useEffect(() => {
    let ativo = true;
    async function carregar(tentativa = 0) {
      if (carregandoDadosRef.current) return;
      carregandoDadosRef.current = true;
      setAgora(Date.now());
      try {
        const [respostaConfiguracao, respostaCatalogo, respostaDisponibilidade] = await Promise.all([
          fetch("/api/public/configuracao", { cache: "no-store" }),
          fetch("/api/public/catalogo", { cache: "no-store" }),
          fetch("/api/public/disponibilidade", { cache: "no-store" }),
        ]);
        if (!respostaConfiguracao.ok || !respostaCatalogo.ok || !respostaDisponibilidade.ok) throw new Error("Dados indisponíveis");
        const dados = await respostaConfiguracao.json() as { perfil: PerfilBarbearia; configuracao: ConfiguracaoAgenda };
        const catalogo = await respostaCatalogo.json() as { servicos: Servico[]; combos: Combo[] };
        const disponibilidade = await respostaDisponibilidade.json() as { agendamentos: Array<Pick<Agendamento, "id" | "data" | "hora" | "duracaoMinutos">>; bloqueios: BloqueioAgenda[] };
        if (dados.perfil.foto) {
          await new Promise<void>((resolve) => {
            const imagem = new window.Image();
            let finalizado = false;
            const concluir = () => {
              if (finalizado) return;
              finalizado = true;
              window.clearTimeout(limite);
              resolve();
            };
            const limite = window.setTimeout(concluir, 2500);
            imagem.onload = concluir;
            imagem.onerror = concluir;
            imagem.src = dados.perfil.foto;
          });
        }
        if (ativo) {
          setConfiguracao(dados.configuracao);
          setPerfil(dados.perfil);
          setServicos(catalogo.servicos);
          setCombos(catalogo.combos);
          setAgendamentos(disponibilidade.agendamentos.map((item) => ({ ...item, cliente: "", servico: "", valor: 0, whatsapp: "" })));
          setBloqueios(disponibilidade.bloqueios);
          dadosCarregadosRef.current = true;
          setCarregado(true);
          setAvisoFormulario((avisoAtual) => avisoAtual?.recarregar ? null : avisoAtual);
        }
      } catch {
        if (!ativo) return;
        if (tentativa < (dadosCarregadosRef.current ? 1 : 2)) {
          window.setTimeout(() => {
            if (ativo) void carregar(tentativa + 1);
          }, 1200 * (tentativa + 1));
        } else if (!dadosCarregadosRef.current) {
          setCarregado(true);
          setAvisoFormulario({
            titulo: "Não foi possível atualizar",
            mensagem: "A conexão oscilou durante o carregamento. Toque abaixo para tentar novamente.",
            recarregar: true,
          });
        }
      } finally {
        carregandoDadosRef.current = false;
      }
    }
    void carregar();
    const atualizarDados = () => void carregar();
    const eventos = [
      "storage",
      "ph10:agendamentos-atualizados",
      "ph10:bloqueios-atualizados",
      "ph10:agenda-config-atualizada",
      "ph10:perfil-atualizado",
    ];
    eventos.forEach((evento) => window.addEventListener(evento, atualizarDados));
    window.addEventListener("focus", atualizarDados);
    const intervalo = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => {
      ativo = false;
      eventos.forEach((evento) => window.removeEventListener(evento, atualizarDados));
      window.removeEventListener("focus", atualizarDados);
      window.clearInterval(intervalo);
    };
  }, []);

  const opcoesAgendamento: Servico[] = [
    ...servicos.map((item) => ({ ...item, id: `servico:${item.id}` })),
    ...combos.map((combo) => ({ id: `combo:${combo.id}`, nome: combo.nome, valor: combo.valor, status: "Ativo" as const })),
  ];
  const itensSelecionados = opcoesAgendamento.filter((item) => selecoes.includes(item.id));
  const servico = itensSelecionados.length > 0 ? {
    id: itensSelecionados.map((item) => item.id).join(","),
    nome: itensSelecionados.map((item) => item.nome).join(" + "),
    valor: itensSelecionados.reduce((total, item) => total + item.valor, 0),
    status: "Ativo" as const,
  } : undefined;
  const whatsappPH10 = perfil.whatsapp;
  const intervaloReserva = Number(configuracao?.configAgenda.intervalo ?? 30);
  const funcionamentoHoje = useMemo(() => {
    if (!configuracao || !agora) return "Horário de funcionamento não configurado";
    const referencia = new Date(agora);
    const expediente = configuracao.diasFuncionamento.find((item) => item.id === idsDosDias[referencia.getDay()]);
    if (!expediente?.ativo) return "Fechado hoje";
    return `Hoje, ${expediente.abertura} às ${expediente.fechamento}`;
  }, [configuracao, agora]);
  const dias = proximosDias(Number(configuracao?.configAgenda.diasParaAgendar ?? 7));
  const horarios = useMemo(() => {
    if (!configuracao) return [];
    const dataSelecionada = new Date(`${dia}T12:00:00`);
    const expediente = configuracao.diasFuncionamento.find((item) => item.id === idsDosDias[dataSelecionada.getDay()]);
    if (!expediente?.ativo) return [];
    const intervalo = Number(configuracao.configAgenda.intervalo);
    const limiteMinimo = agora + Number(configuracao.configAgenda.antecedenciaMinima) * 60 * 1000;
    const lista: string[] = [];
    for (let atual = minutos(expediente.abertura); atual < minutos(expediente.fechamento); atual += intervalo) {
      const hora = horaFormatada(atual);
      const instante = new Date(`${dia}T${hora}:00`).getTime();
      const fimDoServico = atual + intervaloReserva;
      const sobrepoePausa = expediente.temPausa && intervalosSeSobrepoem(atual, fimDoServico, minutos(expediente.pausaInicio), minutos(expediente.pausaFim));
      const sobrepoeBloqueio = bloqueios.some((bloqueio) => bloqueio.data === dia && intervalosSeSobrepoem(atual, fimDoServico, bloqueio.diaInteiro ? 0 : minutos(bloqueio.inicio), bloqueio.diaInteiro ? 24 * 60 : minutos(bloqueio.fim)));
      const terminaNoExpediente = fimDoServico <= minutos(expediente.fechamento);
      if (!sobrepoePausa && !sobrepoeBloqueio && terminaNoExpediente && instante >= limiteMinimo) lista.push(hora);
    }
    return lista;
  }, [configuracao, dia, agora, intervaloReserva, bloqueios]);
  const horariosOcupados = useMemo(
    () => {
      const intervaloPadrao = Number(configuracao?.configAgenda.intervalo ?? 30);
      const reservasDoDia = agendamentos.filter((item) => item.data === dia && reservaEstaAtiva(item, agora));
      return new Set(horarios.filter((hora) => {
        const inicioPretendido = minutos(hora);
        const fimPretendido = inicioPretendido + intervaloReserva;
        return reservasDoDia.some((reserva) => {
          const inicioReserva = minutos(reserva.hora);
          const fimReserva = inicioReserva + (reserva.duracaoMinutos ?? intervaloPadrao);
          return intervalosSeSobrepoem(inicioPretendido, fimPretendido, inicioReserva, fimReserva);
        });
      }));
    },
    [agendamentos, configuracao, dia, intervaloReserva, horarios, agora]
  );

  function selecionarDia(novoDia: string) {
    setDia(novoDia);
    setHorario("");
  }

  function alternarSelecao(id: string) {
    setSelecoes((atuais) => atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]);
    setHorario("");
  }

  function fecharAvisoFormulario() {
    if (avisoFormulario?.recarregar) {
      window.location.reload();
      return;
    }
    setAvisoFormulario(null);
  }

  async function agendar() {
    if (processandoReservaRef.current) return;

    if (!servico || !dia || !horario || !nome.trim() || !whatsapp.trim()) {
      setAvisoFormulario({ titulo: "Faltam algumas informações", mensagem: "Escolha ao menos um serviço ou combo, o dia e o horário e preencha seus dados para continuar." });
      return;
    }
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ]+)*$/.test(nome.trim())) {
      setAvisoFormulario({ titulo: "Confira o nome", mensagem: "Informe seu nome usando apenas letras." });
      return;
    }
    if (!/^9\d{8}$/.test(whatsapp)) {
      setAvisoFormulario({ titulo: "Confira o WhatsApp", mensagem: "Informe os 9 dígitos do celular, começando pelo 9." });
      return;
    }

    const numeroCompletoCliente = `5521${whatsapp}`;
    const itens = itensSelecionados.map((item) => { const [tipo, id] = item.id.split(":"); return { tipo, id }; });
    processandoReservaRef.current = true;
    setProcessandoReserva(true);

    try {
      const resposta = await fetch("/api/public/reservas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: nome.trim(), whatsapp: numeroCompletoCliente, itens, data: dia, hora: horario }) });
      const resultado = await resposta.json() as { reserva?: Agendamento; erro?: string };
      if (!resposta.ok || !resultado.reserva) {
        setHorario("");
        setAvisoFormulario({ titulo: "Não foi possível reservar", mensagem: resultado.erro ?? "A disponibilidade mudou. Escolha outro horário." });
        return;
      }
      setAgendamentos((lista) => [...lista, resultado.reserva!]);
      setReservaConcluida(resultado.reserva);
      setCodigoCopiado(false);
    } catch {
      setAvisoFormulario({ titulo: "Não foi possível reservar", mensagem: "A conexão falhou durante a reserva. Confira sua internet e tente novamente." });
    } finally {
      processandoReservaRef.current = false;
      setProcessandoReserva(false);
    }
  }

  async function copiarCodigo() {
    if (!reservaConcluida?.codigo) return;
    await navigator.clipboard.writeText(reservaConcluida.codigo);
    setCodigoCopiado(true);
  }

  function linkConfirmacaoWhatsapp(reserva: Agendamento) {
    const mensagem = encodeURIComponent(
      `Olá, PH! Fiz uma reserva para o dia ${reserva.data.split("-").reverse().join("/")} às ${reserva.hora}. Seguem as informações:\n\n` +
      `Nome: ${reserva.cliente}\n` +
      `Serviço: ${reserva.servico}\n` +
      `Código: ${reserva.codigo}`
    );
    return `https://wa.me/${whatsappPH10}?text=${mensagem}`;
  }

  function linkPedidoRemarcacao(reserva: Agendamento) {
    const mensagem = encodeURIComponent(
      `Olá, PH! Tenho uma reserva para o dia ${reserva.data.split("-").reverse().join("/")} às ${reserva.hora}, mas preciso alterar esse horário. Pode me ajudar?${reserva.codigo ? `\n\nCódigo: ${reserva.codigo}` : ""}`
    );
    return `https://wa.me/${whatsappPH10}?text=${mensagem}`;
  }

  if (!carregado) return <CarregandoAgendamento />;

  return (
    <main className="min-h-screen bg-[#24211e] text-[#f3ead8]">
      <div className="mx-auto w-full max-w-md px-4 py-5 lg:max-w-4xl">
        {!reservaConcluida && (
          <>
            <header className="hero-panel">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-amber-400/30 bg-neutral-900 text-2xl font-black text-amber-400 shadow-[0_16px_40px_rgba(0,0,0,.22)] sm:h-32 sm:w-32">
                  {perfil.foto ? <Image src={perfil.foto} alt={`Foto de ${perfil.nome}`} width={128} height={128} unoptimized className="h-full w-full object-cover" /> : "PH"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">{perfil.subtitulo || "Barbearia"}</p>
                  <h1 className="mt-1 text-xl font-black leading-tight sm:text-2xl">{perfil.nome}</h1>
                  <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-[11px] leading-relaxed">
                    <p className="font-bold text-neutral-300">{funcionamentoHoje}</p>
                    {perfil.endereco && <p className="text-neutral-400">{perfil.endereco}</p>}
                  </div>
                </div>
              </div>
            </header>
            <div className="flex justify-end">
              <ClientReservationLookup
                agendamentos={agendamentos}
                bloqueios={bloqueios}
                configuracao={configuracao}
                whatsappPH10={whatsappPH10}
                onAtualizar={setAgendamentos}
              />
            </div>
            <p className="mt-5 text-sm text-neutral-400">Escolha serviços e combos, o dia e um horário disponível.</p>
          </>
        )}

        {reservaConcluida ? (
          <section className="rounded-[2rem] bg-green-500/10 p-6 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-green-400/30 bg-green-400/10 text-green-300 shadow-[0_0_40px_rgba(74,222,128,.12)]">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 4 4L19 6" />
              </svg>
            </div>
            <h2 className="mt-3 text-2xl font-black">Reserva realizada</h2>
            <p className="mt-2 text-sm text-neutral-300">Seu horário já está reservado na agenda da PH10.</p>
            <div className="mt-5 rounded-3xl bg-neutral-900 p-5 text-left">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.18em] text-neutral-400">Código da reserva</p>
                  <p className="mt-1 text-xl font-black text-amber-400">{reservaConcluida.codigo}</p>
                </div>
                <button type="button" onClick={copiarCodigo} className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-xs font-black">
                  {codigoCopiado ? "Copiado!" : "Copiar"}
                </button>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-neutral-400">Cliente</dt><dd className="text-right font-bold">{reservaConcluida.cliente}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-neutral-400">Serviço</dt><dd className="text-right font-bold">{reservaConcluida.servico}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-neutral-400">Data</dt><dd className="text-right font-bold">{reservaConcluida.data.split("-").reverse().join("/")}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-neutral-400">Horário</dt><dd className="text-right font-bold">{reservaConcluida.hora}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-neutral-400">Valor</dt><dd className="text-right font-bold">{dinheiro(reservaConcluida.valor)}</dd></div>
              </dl>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-neutral-400">Guarde esse código. Ele identifica sua reserva caso você precise falar com a PH10.</p>
            <a
              href={linkConfirmacaoWhatsapp(reservaConcluida)}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex w-full items-center justify-center rounded-2xl bg-green-500 px-4 py-4 text-sm font-black text-white"
            >
              Enviar confirmação ao PH10
            </a>
            <p className="mt-2 text-xs text-neutral-400">A mensagem será aberta pronta. Revise e toque em enviar no WhatsApp.</p>
            <button onClick={() => { setReservaConcluida(null); setSelecoes([]); setHorario(""); setNome(""); setWhatsapp(""); }} className="mt-4 w-full rounded-2xl bg-white/10 py-4 text-sm font-black">Voltar ao início</button>
          </section>
        ) : (
          <>
            {combos.length > 0 && <section className="mt-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-amber-400">Economize</p><h2 className="mt-1 text-xl font-black">Combos</h2></div><div className="mt-3 grid gap-3 lg:grid-cols-2">{combos.map((combo) => { const idSelecao = `combo:${combo.id}`; return <button key={combo.id} onClick={() => alternarSelecao(idSelecao)} className={`rounded-3xl border p-4 text-left ${selecoes.includes(idSelecao) ? "border-amber-400 bg-amber-400 text-neutral-950" : "border-amber-400/20 bg-amber-400/5"}`}><div className="flex justify-between gap-3"><p className="font-black">{combo.nome}</p><strong>{dinheiro(combo.valor)}</strong></div><p className="mt-3 text-xs font-bold opacity-70">Combo especial</p></button>; })}</div></section>}
            <section className={`${combos.length > 0 ? "mt-6 border-t border-white/10 pt-6" : "mt-3"}`}><h2 className="text-xl font-black">Serviços</h2>
              {servicos.length === 0 ? <div className="mt-3 rounded-3xl border border-dashed border-white/10 bg-neutral-900 p-5 text-center text-sm text-neutral-400">Nenhum serviço disponível no momento.</div> : <div className="mt-3 grid gap-3 lg:grid-cols-2">{servicos.map((item) => { const idSelecao = `servico:${item.id}`; return <button key={item.id} onClick={() => alternarSelecao(idSelecao)} className={`rounded-3xl border p-4 text-left ${selecoes.includes(idSelecao) ? "border-amber-400 bg-amber-400 text-neutral-950" : "border-white/10 bg-neutral-900"}`}><div className="flex justify-between gap-3"><p className="font-black">{item.nome}</p><strong>{dinheiro(item.valor)}</strong></div></button>; })}</div>}
            </section>
            <section className="mt-6"><h2 className="text-xl font-black">Dia</h2>
              <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">{dias.map((item) => <button key={item.data} onClick={() => selecionarDia(item.data)} className={`min-w-16 rounded-3xl border p-3 text-center ${item.data === dia ? "border-amber-400 bg-amber-400 text-neutral-950" : "border-white/10 bg-neutral-900"}`}><span className="block text-xs font-bold capitalize">{item.semana}</span><strong className="block text-2xl">{item.dia}</strong></button>)}</div>
            </section>
            <section className="mt-6"><h2 className="text-xl font-black">Horário</h2>
              <div className="mt-3 grid grid-cols-3 gap-3">{horarios.map((item) => { const ocupado = horariosOcupados.has(item); return <button key={item} disabled={!carregado || ocupado} onClick={() => setHorario(item)} className={`rounded-2xl border py-3 text-sm font-black ${ocupado ? "cursor-not-allowed border-white/5 bg-neutral-900/40 text-neutral-600 line-through" : item === horario ? "border-amber-400 bg-amber-400 text-neutral-950" : "border-white/10 bg-neutral-900"}`}>{item}</button>; })}</div>
              {carregado && horarios.length === 0 && <p className="mt-3 rounded-2xl bg-neutral-900 p-4 text-center text-sm text-neutral-400">Não há mais horários disponíveis para este dia.</p>}
              {horariosOcupados.size > 0 && <p className="mt-2 text-xs text-neutral-500">Horários riscados já estão ocupados.</p>}
            </section>
            <section className="mt-6 rounded-[2rem] bg-neutral-900 p-5">
              <h2 className="text-xl font-black">Seus dados</h2>
              <div className="mt-4 overflow-hidden rounded-2xl bg-neutral-950 focus-within:ring-2 focus-within:ring-amber-400">
                <input value={nome} onChange={(e) => setNome(somenteLetras(e.target.value))} placeholder="Seu nome" autoComplete="name" className="w-full bg-transparent px-4 py-4 outline-none" />
              </div>
              <div className="mt-3 flex overflow-hidden rounded-2xl bg-neutral-950 focus-within:ring-2 focus-within:ring-amber-400"><span className="flex items-center border-r border-white/10 px-4 text-sm font-black text-amber-400">+55 21</span><input value={whatsapp} onChange={(e) => setWhatsapp(somenteDigitos(e.target.value))} placeholder="9 0000-0000" inputMode="numeric" autoComplete="tel" maxLength={9} className="min-w-0 flex-1 bg-transparent px-4 py-4 outline-none" /></div>
            </section>
            <div className="sticky bottom-0 -mx-4 mt-6 bg-neutral-950/95 p-4 backdrop-blur lg:static lg:mx-0 lg:p-0"><button onClick={agendar} disabled={processandoReserva} className="w-full rounded-2xl bg-amber-400 py-4 text-sm font-black text-neutral-950 disabled:cursor-wait disabled:opacity-70">{processandoReserva ? "Processando..." : "Agendar horário"}</button>{servico && horario && <p className="mt-3 text-center text-xs text-neutral-400">{servico.nome} • {dinheiro(servico.valor)} • {horario}</p>}</div>
          </>
        )}
      </div>

      {reservaExistenteAviso && (
        <div onClick={() => setReservaExistenteAviso(null)} className="safe-modal-shell fixed inset-0 z-[300] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="reserva-existente-titulo" onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-neutral-900 p-6 text-center text-white shadow-2xl">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-amber-400/25 bg-amber-400/10 text-2xl font-black text-amber-400">!</div>
            <h2 id="reserva-existente-titulo" className="mt-4 text-2xl font-black">Você já tem uma reserva</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">Encontramos um horário ativo para este WhatsApp.</p>
            <div className="mt-5 rounded-2xl bg-neutral-950 p-4 text-left">
              <div className="flex justify-between gap-4"><span className="text-sm text-neutral-400">Data</span><strong>{reservaExistenteAviso.data.split("-").reverse().join("/")}</strong></div>
              <div className="mt-2 flex justify-between gap-4"><span className="text-sm text-neutral-400">Horário</span><strong>{reservaExistenteAviso.hora}</strong></div>
              {reservaExistenteAviso.codigo && <p className="mt-3 border-t border-white/10 pt-3 text-center font-mono text-xs font-bold tracking-wider text-neutral-500">{reservaExistenteAviso.codigo}</p>}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-neutral-400">Para trocar o horário, fale com a PH10 antes de fazer uma nova reserva.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setReservaExistenteAviso(null)} className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black">Entendi</button>
              <a href={linkPedidoRemarcacao(reservaExistenteAviso)} target="_blank" rel="noreferrer" className="flex items-center justify-center rounded-2xl bg-green-500 px-4 py-4 text-sm font-black text-white">Falar com a PH10</a>
            </div>
          </div>
        </div>
      )}

      {avisoFormulario && (
        <div onClick={fecharAvisoFormulario} className="safe-modal-shell fixed inset-0 z-[330] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div role="alertdialog" aria-modal="true" aria-labelledby="aviso-formulario-titulo" onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-neutral-900 p-6 text-center text-white shadow-2xl">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-amber-400/25 bg-amber-400/10 text-2xl font-black text-amber-400">!</div>
            <h2 id="aviso-formulario-titulo" className="mt-4 text-2xl font-black">{avisoFormulario.titulo}</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">{avisoFormulario.mensagem}</p>
            <button type="button" onClick={fecharAvisoFormulario} className="mt-6 w-full rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950">{avisoFormulario.recarregar ? "Tentar novamente" : "Entendi"}</button>
          </div>
        </div>
      )}

      {processandoReserva && (
        <div className="safe-modal-shell fixed inset-0 z-[400] flex items-center justify-center bg-black/70 backdrop-blur-md" role="status" aria-live="assertive" aria-label="Processando sua reserva">
          <div className="flex w-full max-w-xs flex-col items-center rounded-[2rem] border border-white/10 bg-neutral-900/95 px-6 py-8 text-center text-white shadow-2xl">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-400/20 border-t-amber-400" aria-hidden="true" />
            <p className="mt-5 text-xl font-black">Processando...</p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">Estamos confirmando seu horário. Aguarde um instante.</p>
          </div>
        </div>
      )}
    </main>
  );
}
