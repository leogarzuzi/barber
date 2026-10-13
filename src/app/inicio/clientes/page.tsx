"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Agendamento,
  Cliente,
  type ClienteBloqueado,
  nomePlanoMensal,
  normalizarWhatsapp,
  obterStatusAtendimento,
  type PlanoMensal,
  reservaEstaAtiva,
} from "@/lib/barber-storage";
import { criarClienteSupabase } from "@/lib/supabase/client";
import { buscarAgendamentos, buscarClientes, buscarClientesBloqueados } from "@/lib/supabase/agenda";
import { formatarAniversario, formatarEntradaAniversario, interpretarAniversario, nomeDoMes } from "@/lib/aniversario";
import NoticeDialog from "@/components/NoticeDialog";

type ClienteResumo = Cliente & {
  ultimoAtendimento: string | null;
  ultimoServico: string | null;
  totalVisitas: number;
  status: "Ativo" | "Sumido";
};

type FiltroPlano = "todos" | "mensalista" | "mensalista_plus";

function proximoPlano(plano: PlanoMensal): PlanoMensal {
  if (plano === "comum") return "mensalista";
  if (plano === "mensalista") return "mensalista_plus";
  return "comum";
}

function formatarData(data: string) { return data.split("-").reverse().join("/"); }
function formatarWhatsapp(numero: string) {
  const local = normalizarWhatsapp(numero).replace(/^5521/, "");
  return `+55 21 ${local.slice(0, 1)} ${local.slice(1, 5)}-${local.slice(5)}`;
}
function somenteDigitosWhatsapp(valor: string) { return valor.replace(/\D/g, "").slice(0, 9); }
function statusClass(status: string) {
  if (status === "Concluído") return "bg-green-500/10 text-green-300";
  if (status === "Cancelado" || status === "Não compareceu") return "bg-red-500/10 text-red-300";
  return "bg-yellow-500/10 text-yellow-300";
}

export default function ClientesPage() {
  const [cadastros, setCadastros] = useState<Cliente[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [bloqueiosClientes, setBloqueiosClientes] = useState<ClienteBloqueado[]>([]);
  const [agora, setAgora] = useState(() => Date.now());
  const [clienteHistorico, setClienteHistorico] = useState<ClienteResumo | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroPlano, setFiltroPlano] = useState<FiltroPlano>("todos");
  const [clienteMensalista, setClienteMensalista] = useState<ClienteResumo | null>(null);
  const [aniversariantesAbertos, setAniversariantesAbertos] = useState(false);
  const [clienteAniversario, setClienteAniversario] = useState<ClienteResumo | null>(null);
  const [aniversarioEdicao, setAniversarioEdicao] = useState("");
  const [erroAniversario, setErroAniversario] = useState("");
  const [salvandoAniversario, setSalvandoAniversario] = useState(false);
  const [bloqueadosAbertos, setBloqueadosAbertos] = useState(false);
  const [bloqueioFormularioAberto, setBloqueioFormularioAberto] = useState(false);
  const [whatsappBloqueio, setWhatsappBloqueio] = useState("");
  const [motivoBloqueio, setMotivoBloqueio] = useState("");
  const [erroBloqueio, setErroBloqueio] = useState("");
  const [processandoBloqueio, setProcessandoBloqueio] = useState(false);
  const [bloqueioParaRemover, setBloqueioParaRemover] = useState<ClienteBloqueado | null>(null);
  const [processando, setProcessando] = useState(false);
  const [aviso, setAviso] = useState<{ titulo: string; descricao: string } | null>(null);

  useEffect(() => {
    async function carregar() {
      const supabase = criarClienteSupabase();
      const [clientesBanco, agendamentosBanco, bloqueiosBanco] = await Promise.all([buscarClientes(supabase), buscarAgendamentos(supabase), buscarClientesBloqueados(supabase)]);
      setCadastros(clientesBanco);
      setAgendamentos(agendamentosBanco);
      setBloqueiosClientes(bloqueiosBanco);
      setAgora(Date.now());
    }
    function fecharComEsc(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setClienteAniversario(null);
      setClienteMensalista(null);
      setAniversariantesAbertos(false);
      setClienteHistorico(null);
      setBloqueadosAbertos(false);
      setBloqueioFormularioAberto(false);
      setBloqueioParaRemover(null);
    }
    carregar();
    window.addEventListener("ph10:clientes-atualizados", carregar);
    window.addEventListener("ph10:agendamentos-atualizados", carregar);
    window.addEventListener("ph10:clientes-bloqueados-atualizados", carregar);
    document.addEventListener("keydown", fecharComEsc);
    const intervalo = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => {
      window.removeEventListener("ph10:clientes-atualizados", carregar);
      window.removeEventListener("ph10:agendamentos-atualizados", carregar);
      window.removeEventListener("ph10:clientes-bloqueados-atualizados", carregar);
      document.removeEventListener("keydown", fecharComEsc);
      window.clearInterval(intervalo);
    };
  }, []);

  const clientes = useMemo<ClienteResumo[]>(() => cadastros.map((cliente) => {
    const reservas = agendamentos
      .filter((item) => normalizarWhatsapp(item.whatsapp) === normalizarWhatsapp(cliente.whatsapp))
      .sort((a, b) => `${b.data} ${b.hora}`.localeCompare(`${a.data} ${a.hora}`));
    const concluidos = reservas.filter((item) => obterStatusAtendimento(item, agora) === "Concluído");
    const ultimo = concluidos[0];
    const limiteSumido = 45 * 24 * 60 * 60 * 1000;
    const estaSumido = Boolean(ultimo) && !reservas.some((item) => reservaEstaAtiva(item, agora)) && agora - new Date(`${ultimo.data}T${ultimo.hora}:00`).getTime() > limiteSumido;
    const status: ClienteResumo["status"] = estaSumido ? "Sumido" : "Ativo";
    return {
      ...cliente,
      ultimoAtendimento: ultimo ? formatarData(ultimo.data) : null,
      ultimoServico: ultimo?.servico ?? null,
      totalVisitas: concluidos.length,
      status,
    };
  }).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)), [cadastros, agendamentos, agora]);

  const reservasHistorico = useMemo(() => {
    if (!clienteHistorico) return [];
    return agendamentos
      .filter((item) => normalizarWhatsapp(item.whatsapp) === normalizarWhatsapp(clienteHistorico.whatsapp))
      .sort((a, b) => `${b.data} ${b.hora}`.localeCompare(`${a.data} ${a.hora}`));
  }, [agendamentos, clienteHistorico]);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const numeros = busca.replace(/\D/g, "");
    return clientes.filter((cliente) => {
      if (filtroPlano !== "todos" && cliente.planoMensal !== filtroPlano) return false;
      if (!termo) return true;
      return cliente.nome.toLocaleLowerCase("pt-BR").includes(termo)
        || Boolean(numeros && normalizarWhatsapp(cliente.whatsapp).includes(numeros));
    });
  }, [clientes, busca, filtroPlano]);

  const planoDestino = clienteMensalista ? proximoPlano(clienteMensalista.planoMensal) : "comum";
  const mesAtual = new Date(agora).getMonth() + 1;
  const aniversariantesDoMes = useMemo(() => clientes
    .filter((cliente) => cliente.aniversarioMes === mesAtual && cliente.aniversarioDia)
    .sort((a, b) => (a.aniversarioDia ?? 0) - (b.aniversarioDia ?? 0) || a.nome.localeCompare(b.nome, "pt-BR")), [clientes, mesAtual]);
  const whatsappsBloqueados = useMemo(() => new Set(bloqueiosClientes.map((bloqueio) => normalizarWhatsapp(bloqueio.whatsapp))), [bloqueiosClientes]);
  const bloqueioClienteHistorico = clienteHistorico
    ? bloqueiosClientes.find((bloqueio) => normalizarWhatsapp(bloqueio.whatsapp) === normalizarWhatsapp(clienteHistorico.whatsapp))
    : undefined;

  async function alternarMensalista() {
    if (!clienteMensalista || processando) return;
    const novoPlano = proximoPlano(clienteMensalista.planoMensal);
    const novaMensalidade = novoPlano === "mensalista_plus" ? 180 : 160;
    try {
      setProcessando(true);
      const resposta = await fetch(`/api/admin/clientes/${encodeURIComponent(clienteMensalista.id)}/mensalista`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planoMensal: novoPlano }),
      });
      const resultado = await resposta.json() as { erro?: string };
      if (!resposta.ok) throw new Error(resultado.erro);
      setCadastros((lista) => lista.map((cliente) => cliente.id === clienteMensalista.id ? { ...cliente, planoMensal: novoPlano, mensalista: novoPlano !== "comum", mensalidade: novaMensalidade } : cliente));
      window.dispatchEvent(new Event("ph10:clientes-atualizados"));
      setClienteMensalista(null);
    } catch {
      setAviso({ titulo: "Não foi possível alterar", descricao: "O plano mensal do cliente não foi modificado. Tente novamente." });
    } finally {
      setProcessando(false);
    }
  }

  function avancarFiltroPlano() {
    setFiltroPlano((atual) => atual === "todos" ? "mensalista" : atual === "mensalista" ? "mensalista_plus" : "todos");
  }

  function abrirWhatsapp(cliente: Cliente) {
    const mensagem = encodeURIComponent(`Olá, ${cliente.nome}! Tudo bem? Gostaria de agendar um horário na PH10 esta semana?`);
    return `https://wa.me/${normalizarWhatsapp(cliente.whatsapp)}?text=${mensagem}`;
  }

  function abrirWhatsappAniversario(cliente: Cliente) {
    const primeiroNome = cliente.nome.trim().split(/\s+/)[0];
    const mensagem = encodeURIComponent(`Olá, ${primeiroNome}! A PH10 deseja um feliz aniversário. Que seu novo ciclo seja excelente!`);
    return `https://wa.me/${normalizarWhatsapp(cliente.whatsapp)}?text=${mensagem}`;
  }

  function abrirEdicaoAniversario(cliente: ClienteResumo) {
    setClienteAniversario(cliente);
    setAniversarioEdicao(formatarAniversario(cliente.aniversarioDia, cliente.aniversarioMes) ?? "");
    setErroAniversario("");
  }

  async function salvarEdicaoAniversario() {
    if (!clienteAniversario || salvandoAniversario) return;
    const aniversario = interpretarAniversario(aniversarioEdicao);
    if (!aniversario) {
      setErroAniversario("Informe uma data válida no formato DD/MM.");
      return;
    }

    try {
      setSalvandoAniversario(true);
      setErroAniversario("");
      const aniversarioFormatado = `${String(aniversario.dia).padStart(2, "0")}/${String(aniversario.mes).padStart(2, "0")}`;
      const resposta = await fetch(`/api/admin/clientes/${encodeURIComponent(clienteAniversario.id)}/aniversario`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aniversario: aniversarioFormatado }),
      });
      const resultado = await resposta.json() as { erro?: string };
      if (!resposta.ok) throw new Error(resultado.erro);
      const atualizar = <T extends Cliente>(cliente: T): T => cliente.id === clienteAniversario.id
        ? { ...cliente, aniversarioDia: aniversario.dia, aniversarioMes: aniversario.mes }
        : cliente;
      setCadastros((lista) => lista.map(atualizar));
      setClienteHistorico((cliente) => cliente ? atualizar(cliente) : null);
      window.dispatchEvent(new Event("ph10:clientes-atualizados"));
      setClienteAniversario(null);
    } catch (erro) {
      setErroAniversario(erro instanceof Error && erro.message ? erro.message : "Não foi possível salvar a data.");
    } finally {
      setSalvandoAniversario(false);
    }
  }

  function abrirFormularioBloqueio(cliente?: Cliente) {
    setBloqueadosAbertos(false);
    setClienteHistorico(null);
    setWhatsappBloqueio(cliente ? normalizarWhatsapp(cliente.whatsapp).replace(/^5521/, "") : "");
    setMotivoBloqueio("");
    setErroBloqueio("");
    setBloqueioFormularioAberto(true);
  }

  async function salvarBloqueio() {
    if (processandoBloqueio) return;
    if (!/^9\d{8}$/.test(whatsappBloqueio)) {
      setErroBloqueio("Informe um celular válido com 9 dígitos.");
      return;
    }

    try {
      setProcessandoBloqueio(true);
      setErroBloqueio("");
      const resposta = await fetch("/api/admin/clientes/bloqueios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp: `5521${whatsappBloqueio}`, motivo: motivoBloqueio.trim() }),
      });
      const resultado = await resposta.json() as { erro?: string; bloqueio?: { id: string; whatsapp: string; motivo: string; criado_em: string } };
      if (!resposta.ok) throw new Error(resultado.erro);
      if (resultado.bloqueio) {
        const novoBloqueio: ClienteBloqueado = {
          id: resultado.bloqueio.id,
          whatsapp: resultado.bloqueio.whatsapp,
          motivo: resultado.bloqueio.motivo,
          criadoEm: resultado.bloqueio.criado_em,
        };
        setBloqueiosClientes((lista) => [novoBloqueio, ...lista.filter((item) => item.id !== novoBloqueio.id)]);
      }
      setBloqueioFormularioAberto(false);
    } catch (erro) {
      setErroBloqueio(erro instanceof Error && erro.message ? erro.message : "Não foi possível bloquear o cliente.");
    } finally {
      setProcessandoBloqueio(false);
    }
  }

  async function removerBloqueio() {
    if (!bloqueioParaRemover || processandoBloqueio) return;
    try {
      setProcessandoBloqueio(true);
      const resposta = await fetch("/api/admin/clientes/bloqueios", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp: bloqueioParaRemover.whatsapp }),
      });
      const resultado = await resposta.json() as { erro?: string };
      if (!resposta.ok) throw new Error(resultado.erro);
      setBloqueiosClientes((lista) => lista.filter((item) => item.id !== bloqueioParaRemover.id));
      setBloqueioParaRemover(null);
    } catch {
      setBloqueioParaRemover(null);
      setAviso({ titulo: "Não foi possível desbloquear", descricao: "O bloqueio não foi removido. Tente novamente." });
    } finally {
      setProcessandoBloqueio(false);
    }
  }

  return (
    <main className="app-page">
      <div className="page-wrap">
        <header className="hero-panel">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-400">PH10</p>
          <div className="mt-3"><h1 className="text-3xl font-black">Clientes</h1><p className="mt-1 text-sm text-neutral-400">Cadastros criados automaticamente pelas reservas.</p></div>
        </header>

        <section className="mt-5 rounded-[1.75rem] bg-neutral-900 p-4">
          <span className="text-xs font-black uppercase tracking-[.18em] text-amber-400">Pesquisar</span>
          <div className="mt-3 flex items-stretch gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-neutral-950 px-4 focus-within:ring-2 focus-within:ring-amber-400"><span className="sr-only">Pesquisar por nome ou WhatsApp</span><svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 text-neutral-500" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Nome ou WhatsApp" inputMode="search" className="min-w-0 flex-1 bg-transparent py-4 text-base outline-none" /></label>
            <button type="button" onClick={avancarFiltroPlano} aria-pressed={filtroPlano !== "todos"} aria-label={filtroPlano === "todos" ? "Filtrar mensalistas" : filtroPlano === "mensalista" ? "Filtrar mensalistas plus" : "Mostrar todos os clientes"} title={filtroPlano === "todos" ? "Filtrar mensalistas" : filtroPlano === "mensalista" ? "Filtrar mensalistas plus" : "Mostrar todos"} className={`relative grid w-14 shrink-0 place-items-center rounded-2xl border text-sm font-black transition-colors ${filtroPlano !== "todos" ? "border-amber-400 bg-amber-400 text-neutral-950" : "border-white/10 bg-neutral-950 text-amber-300 hover:border-amber-400/50"}`}><span className="inline-flex items-start leading-none">M{filtroPlano === "mensalista_plus" && <sup className="-ml-px -translate-y-1 text-[13px] font-black leading-none text-red-600">+</sup>}</span></button>
          </div>
          {filtroPlano !== "todos" && <p className="mt-3 text-xs font-bold text-amber-300">Filtro de {filtroPlano === "mensalista_plus" ? "mensalistas plus" : "mensalistas"} ativo</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setAniversariantesAbertos(true)} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-black transition-colors hover:border-amber-400/40 hover:bg-amber-400/5">
              <span>Aniversariantes do mês</span>
              <span className="grid min-w-7 place-items-center rounded-full bg-amber-400 px-2 py-1 text-xs text-neutral-950">{aniversariantesDoMes.length}</span>
            </button>
            <button type="button" onClick={() => setBloqueadosAbertos(true)} className="flex w-full items-center justify-between rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-left text-sm font-black transition-colors hover:border-red-400/50 hover:bg-red-400/10">
              <span>Clientes bloqueados</span>
              <span className="grid min-w-7 place-items-center rounded-full bg-red-500 px-2 py-1 text-xs text-white">{bloqueiosClientes.length}</span>
            </button>
          </div>
        </section>

        <section className="mt-5 space-y-3">
          {clientes.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-neutral-900 p-6 text-center"><p className="text-lg font-black">Nenhum cliente cadastrado</p><p className="mt-2 text-sm text-neutral-400">O primeiro cadastro será criado automaticamente quando alguém reservar.</p></div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-neutral-900 p-6 text-center"><p className="text-lg font-black">{filtroPlano !== "todos" ? `Nenhum ${filtroPlano === "mensalista_plus" ? "mensalista plus" : "mensalista"} encontrado` : "Nenhum cliente encontrado"}</p><p className="mt-2 text-sm text-neutral-400">{filtroPlano !== "todos" && !busca.trim() ? "Ainda não há clientes neste plano." : "Confira o nome ou o WhatsApp pesquisado."}</p></div>
          ) : clientesFiltrados.map((cliente) => (
            <article key={cliente.id} className="rounded-[1.75rem] bg-neutral-900 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-lg font-black">{cliente.nome}</h2>{cliente.mensalista && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-400 text-[10px] font-black text-neutral-950" title={nomePlanoMensal(cliente.planoMensal)}><span className="inline-flex items-start leading-none">M{cliente.planoMensal === "mensalista_plus" && <sup className="-ml-px -translate-y-1 text-[10px] font-black leading-none text-red-600">+</sup>}</span></span>}</div><p className="mt-1 text-sm text-neutral-400">{formatarWhatsapp(cliente.whatsapp)}</p><p className="text-sm text-neutral-400">{cliente.ultimoAtendimento ? `Último: ${cliente.ultimoAtendimento}` : "Ainda sem atendimento concluído"}</p></div>
                <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => setClienteMensalista(cliente)} aria-label={`Alterar plano de ${cliente.nome}. Plano atual: ${nomePlanoMensal(cliente.planoMensal)}`} title={`Plano atual: ${nomePlanoMensal(cliente.planoMensal)}`} className={`grid h-9 w-9 place-items-center rounded-full border text-xs font-black ${cliente.mensalista ? "border-amber-400 bg-amber-400 text-neutral-950" : "border-white/10 bg-white/5 text-neutral-400"}`}><span className="inline-flex items-start leading-none">M{cliente.planoMensal === "mensalista_plus" && <sup className="-ml-px -translate-y-1 text-[12px] font-black leading-none text-red-600">+</sup>}</span></button><span className={`rounded-full px-3 py-1 text-[11px] font-black ${whatsappsBloqueados.has(normalizarWhatsapp(cliente.whatsapp)) ? "bg-red-500/10 text-red-300" : cliente.status === "Ativo" ? "bg-green-500/10 text-green-300" : "bg-yellow-500/10 text-yellow-300"}`}>{whatsappsBloqueados.has(normalizarWhatsapp(cliente.whatsapp)) ? "Bloqueado" : cliente.status}</span></div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2"><a href={abrirWhatsapp(cliente)} target="_blank" rel="noreferrer" className="rounded-2xl bg-green-500 px-3 py-3 text-center text-xs font-black text-white">WhatsApp</a><button type="button" onClick={() => setClienteHistorico(cliente)} className="rounded-2xl bg-white/10 px-3 py-3 text-xs font-black">Ver histórico</button></div>
            </article>
          ))}
        </section>
      </div>

      {aniversariantesAbertos && (
        <div onClick={() => setAniversariantesAbertos(false)} className="safe-modal-shell fixed inset-0 z-[210] flex items-end justify-center bg-black/70 lg:items-center">
          <div role="dialog" aria-modal="true" aria-labelledby="aniversariantes-titulo" onClick={(event) => event.stopPropagation()} className="safe-modal-card w-full max-w-md rounded-[2rem] bg-neutral-900 p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[.18em] text-amber-400">Clientes</p><h2 id="aniversariantes-titulo" className="mt-1 text-2xl font-black">Aniversariantes de {nomeDoMes(mesAtual)}</h2></div>
              <button type="button" onClick={() => setAniversariantesAbertos(false)} aria-label="Fechar" className="rounded-full bg-white/10 px-3 py-2 text-sm font-black">×</button>
            </div>
            <p className="mt-2 text-sm text-neutral-400">{aniversariantesDoMes.length === 1 ? "1 cliente faz aniversário neste mês." : `${aniversariantesDoMes.length} clientes fazem aniversário neste mês.`}</p>
            <div className="mt-5 space-y-3">
              {aniversariantesDoMes.length === 0 ? (
                <p className="rounded-2xl bg-neutral-950 p-5 text-center text-sm text-neutral-400">Nenhum aniversário cadastrado para este mês.</p>
              ) : aniversariantesDoMes.map((cliente) => (
                <article key={cliente.id} className="rounded-2xl bg-neutral-950 p-4">
                  <div className="flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="truncate font-black">{cliente.nome}</h3><p className="mt-1 text-sm text-neutral-400">{formatarWhatsapp(cliente.whatsapp)}</p></div><strong className="shrink-0 text-lg text-amber-400">{formatarAniversario(cliente.aniversarioDia, cliente.aniversarioMes)}</strong></div>
                  <div className="mt-3 grid grid-cols-2 gap-2"><a href={abrirWhatsappAniversario(cliente)} target="_blank" rel="noreferrer" className="rounded-xl bg-green-500 px-3 py-3 text-center text-xs font-black text-white">Enviar mensagem</a><button type="button" onClick={() => abrirEdicaoAniversario(cliente)} className="rounded-xl bg-white/10 px-3 py-3 text-xs font-black">Editar data</button></div>
                </article>
              ))}
            </div>
            <button type="button" onClick={() => setAniversariantesAbertos(false)} className="mt-5 w-full rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950">Fechar</button>
          </div>
        </div>
      )}

      {clienteHistorico && (
        <div onClick={() => setClienteHistorico(null)} className="safe-modal-shell fixed inset-0 z-[200] flex items-end justify-center bg-black/70 lg:items-center">
          <div onClick={(event) => event.stopPropagation()} className="safe-modal-card w-full max-w-md rounded-[2rem] bg-neutral-900 p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">Histórico</h2><p className="mt-1 text-sm text-neutral-400">{clienteHistorico.nome}</p></div><button type="button" onClick={() => setClienteHistorico(null)} className="rounded-full bg-white/10 px-3 py-2 text-sm font-black">×</button></div>
            <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-neutral-950 p-4"><p className="text-xs text-neutral-400">Visitas concluídas</p><p className="mt-1 text-2xl font-black text-amber-400">{clienteHistorico.totalVisitas}</p></div><div className="rounded-2xl bg-neutral-950 p-4"><p className="text-xs text-neutral-400">Último serviço</p><p className="mt-1 text-sm font-bold">{clienteHistorico.ultimoServico ?? "Nenhum"}</p></div></div>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-neutral-950 p-4"><div><p className="text-xs text-neutral-400">Aniversário</p><p className="mt-1 font-black">{formatarAniversario(clienteHistorico.aniversarioDia, clienteHistorico.aniversarioMes) ?? "Não informado"}</p></div><button type="button" onClick={() => abrirEdicaoAniversario(clienteHistorico)} className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-xs font-black">{clienteHistorico.aniversarioDia ? "Editar data" : "Adicionar data"}</button></div>
            <div className="mt-4 space-y-2">
              {reservasHistorico.length === 0 ? <p className="rounded-2xl bg-neutral-950 p-4 text-center text-sm text-neutral-400">Nenhuma reserva registrada.</p> : reservasHistorico.map((item) => { const status = obterStatusAtendimento(item, agora); return <div key={item.id} className="rounded-2xl bg-neutral-950 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{formatarData(item.data)} às {item.hora}</p><p className="mt-1 text-sm text-neutral-400">{item.servico}</p>{item.codigo && <p className="mt-1 text-xs text-neutral-500">{item.codigo}</p>}</div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${statusClass(status)}`}>{status}</span></div></div>; })}
            </div>
            {bloqueioClienteHistorico && <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/5 p-4"><p className="text-sm font-black text-red-300">Cliente bloqueado</p>{bloqueioClienteHistorico.motivo && <p className="mt-1 text-sm text-neutral-400">{bloqueioClienteHistorico.motivo}</p>}</div>}
            <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setClienteHistorico(null)} className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black">Fechar</button>{bloqueioClienteHistorico ? <button type="button" onClick={() => setBloqueioParaRemover(bloqueioClienteHistorico)} className="rounded-2xl bg-red-500 px-4 py-4 text-sm font-black text-white">Desbloquear</button> : <button type="button" onClick={() => abrirFormularioBloqueio(clienteHistorico)} className="rounded-2xl bg-red-500 px-4 py-4 text-sm font-black text-white">Bloquear cliente</button>}</div>
          </div>
        </div>
      )}
      {bloqueadosAbertos && (
        <div onClick={() => setBloqueadosAbertos(false)} className="safe-modal-shell fixed inset-0 z-[215] flex items-center justify-center bg-black/70">
          <div role="dialog" aria-modal="true" aria-labelledby="bloqueados-titulo" onClick={(event) => event.stopPropagation()} className="safe-modal-card w-full max-w-md rounded-[2rem] bg-neutral-900 p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-red-400">Clientes</p><h2 id="bloqueados-titulo" className="mt-1 text-2xl font-black">Clientes bloqueados</h2></div><button type="button" onClick={() => setBloqueadosAbertos(false)} aria-label="Fechar" className="rounded-full bg-white/10 px-3 py-2 text-sm font-black">×</button></div>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">Esses números não conseguem fazer novas reservas. Os agendamentos existentes continuam normalmente.</p>
            <button type="button" onClick={() => abrirFormularioBloqueio()} className="mt-4 w-full rounded-2xl bg-red-500 px-4 py-4 text-sm font-black text-white">Bloquear número</button>
            <div className="mt-4 space-y-3">
              {bloqueiosClientes.length === 0 ? <p className="rounded-2xl bg-neutral-950 p-5 text-center text-sm text-neutral-400">Nenhum número bloqueado.</p> : bloqueiosClientes.map((bloqueio) => { const cliente = clientes.find((item) => normalizarWhatsapp(item.whatsapp) === normalizarWhatsapp(bloqueio.whatsapp)); return <article key={bloqueio.id} className="rounded-2xl bg-neutral-950 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-black">{cliente?.nome ?? "Número sem cadastro"}</h3><p className="mt-1 text-sm text-neutral-400">{formatarWhatsapp(bloqueio.whatsapp)}</p>{bloqueio.motivo && <p className="mt-2 text-sm text-neutral-300">{bloqueio.motivo}</p>}<p className="mt-2 text-xs text-neutral-500">Bloqueado em {new Date(bloqueio.criadoEm).toLocaleDateString("pt-BR")}</p></div><button type="button" onClick={() => setBloqueioParaRemover(bloqueio)} className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-red-300">Desbloquear</button></div></article>; })}
            </div>
          </div>
        </div>
      )}
      {clienteMensalista && (
        <div onClick={() => !processando && setClienteMensalista(null)} className="fixed inset-0 z-[230] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-neutral-900 p-6 text-center text-white shadow-2xl">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-amber-400/30 bg-amber-400/10 text-xl font-black text-amber-300"><span className="inline-flex items-start leading-none">M{planoDestino === "mensalista_plus" && <sup className="-ml-0.5 -translate-y-1.5 text-base font-black leading-none text-red-500">+</sup>}</span></div>
            <h2 className="mt-4 text-2xl font-black">{planoDestino === "comum" ? "Remover plano mensal?" : planoDestino === "mensalista_plus" ? "Ativar Mensalista Plus?" : "Ativar mensalista?"}</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">{planoDestino === "comum" ? `Ao confirmar, ${clienteMensalista.nome} voltará a ser cliente comum.` : `${clienteMensalista.nome} passará para o plano ${nomePlanoMensal(planoDestino)}.`}</p>
            {planoDestino !== "comum" && <div className="mt-5 rounded-2xl bg-neutral-950 p-4 text-left"><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-400">Benefícios do plano</p><ul className="mt-3 space-y-2 text-sm text-neutral-300"><li>• Até 5 reservas simultâneas</li><li>• Uma reserva por dia</li><li>• {planoDestino === "mensalista_plus" ? "Qualquer dia em que a loja esteja aberta" : "Reservas de segunda a quinta"}</li><li>• Serviços inclusos por <strong className="text-white">{planoDestino === "mensalista_plus" ? "R$ 180" : "R$ 160"}/mês</strong></li></ul></div>}
            <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={processando} onClick={() => setClienteMensalista(null)} className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black disabled:opacity-50">Cancelar</button><button type="button" disabled={processando} onClick={alternarMensalista} className="rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950 disabled:opacity-50">{processando ? "Salvando..." : "Confirmar"}</button></div>
          </div>
        </div>
      )}
      {clienteAniversario && (
        <div onClick={() => !salvandoAniversario && setClienteAniversario(null)} className="fixed inset-0 z-[260] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form onSubmit={(event) => { event.preventDefault(); void salvarEdicaoAniversario(); }} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="editar-aniversario-titulo" className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-neutral-900 p-6 text-white shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[.18em] text-amber-400">{clienteAniversario.nome}</p>
            <h2 id="editar-aniversario-titulo" className="mt-2 text-2xl font-black">Editar aniversário</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">Informe apenas o dia e o mês.</p>
            <label className="mt-5 block"><span className="text-xs font-bold text-neutral-400">Data de aniversário</span><input autoFocus value={aniversarioEdicao} onChange={(event) => { setAniversarioEdicao(formatarEntradaAniversario(event.target.value)); setErroAniversario(""); }} placeholder="DD/MM" inputMode="numeric" maxLength={5} className="mt-2 w-full rounded-2xl bg-neutral-950 px-4 py-4 text-center text-xl font-black tracking-widest outline-none focus:ring-2 focus:ring-amber-400" /></label>
            {erroAniversario && <p className="mt-3 text-sm text-red-300">{erroAniversario}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={salvandoAniversario} onClick={() => setClienteAniversario(null)} className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black disabled:opacity-50">Cancelar</button><button type="submit" disabled={salvandoAniversario} className="rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950 disabled:opacity-50">{salvandoAniversario ? "Salvando..." : "Salvar"}</button></div>
          </form>
        </div>
      )}
      {bloqueioFormularioAberto && (
        <div onClick={() => !processandoBloqueio && setBloqueioFormularioAberto(false)} className="safe-modal-shell fixed inset-0 z-[370] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <form onSubmit={(event) => { event.preventDefault(); void salvarBloqueio(); }} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="bloquear-cliente-titulo" className="safe-modal-card w-full max-w-sm rounded-[2rem] border border-red-400/20 bg-neutral-900 p-6 text-white shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[.18em] text-red-400">Acesso às reservas</p><h2 id="bloquear-cliente-titulo" className="mt-2 text-2xl font-black">Bloquear cliente</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">O cliente verá os horários como indisponíveis. Ele não receberá nenhum aviso de bloqueio e as reservas existentes serão mantidas.</p>
            <label className="mt-5 block"><span className="text-xs font-bold text-neutral-400">WhatsApp</span><div className="mt-2 flex items-center rounded-2xl bg-neutral-950 px-4 focus-within:ring-2 focus-within:ring-red-400"><span className="shrink-0 text-sm font-bold text-neutral-400">+55 21</span><input autoFocus value={whatsappBloqueio} onChange={(event) => { setWhatsappBloqueio(somenteDigitosWhatsapp(event.target.value)); setErroBloqueio(""); }} placeholder="999999999" inputMode="numeric" maxLength={9} className="min-w-0 flex-1 bg-transparent px-3 py-4 text-base font-bold outline-none" /></div></label>
            <label className="mt-4 block"><span className="text-xs font-bold text-neutral-400">Motivo interno (opcional)</span><textarea value={motivoBloqueio} onChange={(event) => setMotivoBloqueio(event.target.value.slice(0, 300))} maxLength={300} rows={3} placeholder="Somente o dono verá esta informação" className="mt-2 w-full resize-none rounded-2xl bg-neutral-950 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-400" /><span className="mt-1 block text-right text-[11px] text-neutral-500">{motivoBloqueio.length}/300</span></label>
            {erroBloqueio && <p className="mt-3 text-sm text-red-300">{erroBloqueio}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={processandoBloqueio} onClick={() => setBloqueioFormularioAberto(false)} className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black disabled:opacity-50">Cancelar</button><button type="submit" disabled={processandoBloqueio} className="rounded-2xl bg-red-500 px-4 py-4 text-sm font-black text-white disabled:opacity-50">{processandoBloqueio ? "Bloqueando..." : "Bloquear cliente"}</button></div>
          </form>
        </div>
      )}
      {bloqueioParaRemover && (
        <div onClick={() => !processandoBloqueio && setBloqueioParaRemover(null)} className="fixed inset-0 z-[290] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="desbloquear-cliente-titulo" className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-neutral-900 p-6 text-center text-white shadow-2xl">
            <h2 id="desbloquear-cliente-titulo" className="text-2xl font-black">Desbloquear cliente?</h2><p className="mt-2 text-sm leading-relaxed text-neutral-400">O número {formatarWhatsapp(bloqueioParaRemover.whatsapp)} voltará a enxergar e reservar horários disponíveis.</p>
            <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={processandoBloqueio} onClick={() => setBloqueioParaRemover(null)} className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black disabled:opacity-50">Cancelar</button><button type="button" disabled={processandoBloqueio} onClick={() => void removerBloqueio()} className="rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950 disabled:opacity-50">{processandoBloqueio ? "Salvando..." : "Desbloquear"}</button></div>
          </div>
        </div>
      )}
      {aviso && <NoticeDialog titulo={aviso.titulo} descricao={aviso.descricao} onFechar={() => setAviso(null)} />}
    </main>
  );
}
