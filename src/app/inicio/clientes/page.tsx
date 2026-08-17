"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Agendamento,
  Cliente,
  normalizarWhatsapp,
  obterStatusAtendimento,
  reservaEstaAtiva,
} from "@/lib/barber-storage";
import { criarClienteSupabase } from "@/lib/supabase/client";
import { buscarAgendamentos, buscarClientes } from "@/lib/supabase/agenda";
import NoticeDialog from "@/components/NoticeDialog";

type ClienteResumo = Cliente & {
  ultimoAtendimento: string | null;
  ultimoServico: string | null;
  totalVisitas: number;
  status: "Ativo" | "Sumido";
};

function formatarData(data: string) { return data.split("-").reverse().join("/"); }
function formatarWhatsapp(numero: string) {
  const local = normalizarWhatsapp(numero).replace(/^5521/, "");
  return `+55 21 ${local.slice(0, 1)} ${local.slice(1, 5)}-${local.slice(5)}`;
}
function statusClass(status: string) {
  if (status === "Concluído") return "bg-green-500/10 text-green-300";
  if (status === "Cancelado" || status === "Não compareceu") return "bg-red-500/10 text-red-300";
  return "bg-yellow-500/10 text-yellow-300";
}

export default function ClientesPage() {
  const [cadastros, setCadastros] = useState<Cliente[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [agora, setAgora] = useState(0);
  const [clienteHistorico, setClienteHistorico] = useState<ClienteResumo | null>(null);
  const [busca, setBusca] = useState("");
  const [somenteMensalistas, setSomenteMensalistas] = useState(false);
  const [clienteMensalista, setClienteMensalista] = useState<ClienteResumo | null>(null);
  const [processando, setProcessando] = useState(false);
  const [aviso, setAviso] = useState<{ titulo: string; descricao: string } | null>(null);

  useEffect(() => {
    async function carregar() {
      const supabase = criarClienteSupabase();
      const [clientesBanco, agendamentosBanco] = await Promise.all([buscarClientes(supabase), buscarAgendamentos(supabase)]);
      setCadastros(clientesBanco);
      setAgendamentos(agendamentosBanco);
      setAgora(Date.now());
    }
    function fecharComEsc(event: KeyboardEvent) {
      if (event.key === "Escape") setClienteHistorico(null);
    }
    carregar();
    window.addEventListener("ph10:clientes-atualizados", carregar);
    window.addEventListener("ph10:agendamentos-atualizados", carregar);
    document.addEventListener("keydown", fecharComEsc);
    const intervalo = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => {
      window.removeEventListener("ph10:clientes-atualizados", carregar);
      window.removeEventListener("ph10:agendamentos-atualizados", carregar);
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
      if (somenteMensalistas && !cliente.mensalista) return false;
      if (!termo) return true;
      return cliente.nome.toLocaleLowerCase("pt-BR").includes(termo)
        || Boolean(numeros && normalizarWhatsapp(cliente.whatsapp).includes(numeros));
    });
  }, [clientes, busca, somenteMensalistas]);

  async function alternarMensalista() {
    if (!clienteMensalista || processando) return;
    try {
      setProcessando(true);
      const resposta = await fetch(`/api/admin/clientes/${encodeURIComponent(clienteMensalista.id)}/mensalista`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensalista: !clienteMensalista.mensalista }),
      });
      const resultado = await resposta.json() as { erro?: string };
      if (!resposta.ok) throw new Error(resultado.erro);
      setCadastros((lista) => lista.map((cliente) => cliente.id === clienteMensalista.id ? { ...cliente, mensalista: !clienteMensalista.mensalista } : cliente));
      window.dispatchEvent(new Event("ph10:clientes-atualizados"));
      setClienteMensalista(null);
    } catch {
      setAviso({ titulo: "Não foi possível alterar", descricao: "O plano mensal do cliente não foi modificado. Tente novamente." });
    } finally {
      setProcessando(false);
    }
  }

  function abrirWhatsapp(cliente: Cliente) {
    const mensagem = encodeURIComponent(`Olá, ${cliente.nome}! Tudo bem? Gostaria de agendar um horário na PH10 esta semana?`);
    return `https://wa.me/${normalizarWhatsapp(cliente.whatsapp)}?text=${mensagem}`;
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
            <button type="button" onClick={() => setSomenteMensalistas((ativo) => !ativo)} aria-pressed={somenteMensalistas} aria-label={somenteMensalistas ? "Mostrar todos os clientes" : "Mostrar somente mensalistas"} title={somenteMensalistas ? "Exibindo mensalistas" : "Filtrar mensalistas"} className={`grid w-14 shrink-0 place-items-center rounded-2xl border text-sm font-black transition-colors ${somenteMensalistas ? "border-amber-400 bg-amber-400 text-neutral-950" : "border-white/10 bg-neutral-950 text-amber-300 hover:border-amber-400/50"}`}>M</button>
          </div>
          {somenteMensalistas && <p className="mt-3 text-xs font-bold text-amber-300">Filtro de mensalistas ativo</p>}
        </section>

        <section className="mt-5 space-y-3">
          {clientes.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-neutral-900 p-6 text-center"><p className="text-lg font-black">Nenhum cliente cadastrado</p><p className="mt-2 text-sm text-neutral-400">O primeiro cadastro será criado automaticamente quando alguém reservar.</p></div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-neutral-900 p-6 text-center"><p className="text-lg font-black">{somenteMensalistas ? "Nenhum mensalista encontrado" : "Nenhum cliente encontrado"}</p><p className="mt-2 text-sm text-neutral-400">{somenteMensalistas && !busca.trim() ? "Ainda não há clientes com plano mensal ativo." : "Confira o nome ou o WhatsApp pesquisado."}</p></div>
          ) : clientesFiltrados.map((cliente) => (
            <article key={cliente.id} className="rounded-[1.75rem] bg-neutral-900 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-lg font-black">{cliente.nome}</h2>{cliente.mensalista && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-400 text-[10px] font-black text-neutral-950" title="Mensalista">M</span>}</div><p className="mt-1 text-sm text-neutral-400">{formatarWhatsapp(cliente.whatsapp)}</p><p className="text-sm text-neutral-400">{cliente.ultimoAtendimento ? `Último: ${cliente.ultimoAtendimento}` : "Ainda sem atendimento concluído"}</p></div>
                <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => setClienteMensalista(cliente)} aria-label={cliente.mensalista ? `Remover plano mensal de ${cliente.nome}` : `Tornar ${cliente.nome} mensalista`} title={cliente.mensalista ? "Remover mensalista" : "Tornar mensalista"} className={`grid h-9 w-9 place-items-center rounded-full border text-xs font-black ${cliente.mensalista ? "border-amber-400 bg-amber-400 text-neutral-950" : "border-white/10 bg-white/5 text-neutral-400"}`}>M</button><span className={`rounded-full px-3 py-1 text-[11px] font-black ${cliente.status === "Ativo" ? "bg-green-500/10 text-green-300" : "bg-yellow-500/10 text-yellow-300"}`}>{cliente.status}</span></div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2"><a href={abrirWhatsapp(cliente)} target="_blank" rel="noreferrer" className="rounded-2xl bg-green-500 px-3 py-3 text-center text-xs font-black text-white">WhatsApp</a><button type="button" onClick={() => setClienteHistorico(cliente)} className="rounded-2xl bg-white/10 px-3 py-3 text-xs font-black">Ver histórico</button></div>
            </article>
          ))}
        </section>
      </div>

      {clienteHistorico && (
        <div onClick={() => setClienteHistorico(null)} className="safe-modal-shell fixed inset-0 z-[200] flex items-end justify-center bg-black/70 lg:items-center">
          <div onClick={(event) => event.stopPropagation()} className="safe-modal-card w-full max-w-md rounded-[2rem] bg-neutral-900 p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">Histórico</h2><p className="mt-1 text-sm text-neutral-400">{clienteHistorico.nome}</p></div><button type="button" onClick={() => setClienteHistorico(null)} className="rounded-full bg-white/10 px-3 py-2 text-sm font-black">×</button></div>
            <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-neutral-950 p-4"><p className="text-xs text-neutral-400">Visitas concluídas</p><p className="mt-1 text-2xl font-black text-amber-400">{clienteHistorico.totalVisitas}</p></div><div className="rounded-2xl bg-neutral-950 p-4"><p className="text-xs text-neutral-400">Último serviço</p><p className="mt-1 text-sm font-bold">{clienteHistorico.ultimoServico ?? "Nenhum"}</p></div></div>
            <div className="mt-4 space-y-2">
              {reservasHistorico.length === 0 ? <p className="rounded-2xl bg-neutral-950 p-4 text-center text-sm text-neutral-400">Nenhuma reserva registrada.</p> : reservasHistorico.map((item) => { const status = obterStatusAtendimento(item, agora); return <div key={item.id} className="rounded-2xl bg-neutral-950 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{formatarData(item.data)} às {item.hora}</p><p className="mt-1 text-sm text-neutral-400">{item.servico}</p>{item.codigo && <p className="mt-1 text-xs text-neutral-500">{item.codigo}</p>}</div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${statusClass(status)}`}>{status}</span></div></div>; })}
            </div>
            <button type="button" onClick={() => setClienteHistorico(null)} className="mt-5 w-full rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950">Fechar</button>
          </div>
        </div>
      )}
      {clienteMensalista && (
        <div onClick={() => !processando && setClienteMensalista(null)} className="fixed inset-0 z-[230] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-neutral-900 p-6 text-center text-white shadow-2xl">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-amber-400/30 bg-amber-400/10 text-xl font-black text-amber-300">M</div>
            <h2 className="mt-4 text-2xl font-black">{clienteMensalista.mensalista ? "Remover mensalista?" : "Ativar mensalista?"}</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">{clienteMensalista.mensalista ? `Ao confirmar, ${clienteMensalista.nome} deixará de ser mensalista.` : `Ao confirmar, ${clienteMensalista.nome} se tornará mensalista e terá os benefícios do plano.`}</p>
            <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={processando} onClick={() => setClienteMensalista(null)} className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black disabled:opacity-50">Cancelar</button><button type="button" disabled={processando} onClick={alternarMensalista} className="rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950 disabled:opacity-50">{processando ? "Salvando..." : "Confirmar"}</button></div>
          </div>
        </div>
      )}
      {aviso && <NoticeDialog titulo={aviso.titulo} descricao={aviso.descricao} onFechar={() => setAviso(null)} />}
    </main>
  );
}
