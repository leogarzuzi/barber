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

        <section className="mt-5 space-y-3">
          {clientes.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-neutral-900 p-6 text-center"><p className="text-lg font-black">Nenhum cliente cadastrado</p><p className="mt-2 text-sm text-neutral-400">O primeiro cadastro será criado automaticamente quando alguém reservar.</p></div>
          ) : clientes.map((cliente) => (
            <article key={cliente.id} className="rounded-[1.75rem] bg-neutral-900 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0"><h2 className="truncate text-lg font-black">{cliente.nome}</h2><p className="mt-1 text-sm text-neutral-400">{formatarWhatsapp(cliente.whatsapp)}</p><p className="text-sm text-neutral-400">{cliente.ultimoAtendimento ? `Último: ${cliente.ultimoAtendimento}` : "Ainda sem atendimento concluído"}</p></div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${cliente.status === "Ativo" ? "bg-green-500/10 text-green-300" : "bg-yellow-500/10 text-yellow-300"}`}>{cliente.status}</span>
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
    </main>
  );
}
