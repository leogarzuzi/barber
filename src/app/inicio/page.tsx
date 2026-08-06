"use client";

import { useEffect, useMemo, useState } from "react";
import { Agendamento, Cliente, dataLocal, obterStatusAtendimento, reservaEstaAtiva } from "@/lib/barber-storage";
import { criarClienteSupabase } from "@/lib/supabase/client";
import { buscarAgendamentos, buscarClientes } from "@/lib/supabase/agenda";

function dinheiro(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function saudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

export default function InicioPage() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [cadastros, setCadastros] = useState<Cliente[]>([]);
  const [agora, setAgora] = useState(0);

  useEffect(() => {
    async function carregar() { try { const supabase = criarClienteSupabase(); const [reservas, clientesBanco] = await Promise.all([buscarAgendamentos(supabase), buscarClientes(supabase)]); setAgendamentos(reservas); setCadastros(clientesBanco); } finally { setAgora(Date.now()); } }
    carregar();
    window.addEventListener("ph10:agendamentos-atualizados", carregar);
    window.addEventListener("ph10:clientes-atualizados", carregar);
    return () => {
      window.removeEventListener("ph10:agendamentos-atualizados", carregar);
      window.removeEventListener("ph10:clientes-atualizados", carregar);
    };
  }, []);

  const hoje = dataLocal();
  const proximos = useMemo(() => agendamentos
    .filter((item) => item.data >= hoje && reservaEstaAtiva(item, agora))
    .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`))
    .slice(0, 5), [agendamentos, hoje, agora]);
  const mesAtual = hoje.slice(0, 7);
  const faturamentoAvulso = agendamentos
    .filter((item) => item.data.startsWith(mesAtual) && !item.cobertoPorMensalidade)
    .filter((item) => { const status = obterStatusAtendimento(item, agora); return status !== "Cancelado" && status !== "Não compareceu"; })
    .reduce((total, item) => total + item.valor, 0);
  const faturamentoMensalistas = cadastros.filter((cliente) => cliente.mensalista).reduce((total, cliente) => total + cliente.mensalidade, 0);
  const faturamento = faturamentoAvulso + faturamentoMensalistas;
  const clientes = new Set(agendamentos.map((item) => item.whatsapp)).size;

  return (
    <main className="app-page"><div className="page-wrap">
      <header className="hero-panel"><div className="relative z-10 flex items-end justify-between gap-5"><div><p className="eyebrow">PH10 • Visão geral</p><h1 className="display-font page-title">{saudacao()},<br />Pedro.</h1><p className="subtle mt-4 max-w-md text-sm">Acompanhe os próximos atendimentos registrados na agenda.</p></div><div className="hidden rounded-full border border-[#eee2c9]/15 px-4 py-2 text-xs text-[#cbbda9] md:block">{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date()).toUpperCase()}</div></div></header>

      <section className="card mt-4 p-5 lg:p-6">
        <div className="flex items-center justify-between gap-4 border-b border-[#eee2c9]/10 pb-5"><div><p className="eyebrow">Agenda</p><h2 className="display-font section-title mt-2">Próximos horários</h2></div><a href="/inicio/agenda" className="btn-secondary">Ver agenda →</a></div>
        {proximos.length === 0 ? <div className="py-10 text-center"><p className="font-bold">Nenhum horário agendado</p><p className="subtle mt-2 text-sm">Os agendamentos feitos pela página pública aparecerão aqui.</p></div> : <div className="divide-y divide-[#eee2c9]/10">{proximos.map((item) => <article key={item.id} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 py-4"><div><p className="text-lg font-black text-[#dfc79f]">{item.hora}</p><p className="text-[9px] font-bold uppercase tracking-wider text-[#81786f]">{item.data === hoje ? "Hoje" : item.data.split("-").slice(1).reverse().join("/")}</p></div><div><h3 className="font-bold">{item.cliente}</h3><p className="mt-1 text-xs text-[#9e958b]">{item.servico}</p></div><span className="status status-ok">Agendado</span></article>)}</div>}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="card p-4 lg:p-5"><p className="metric-label">Agendamentos</p><strong className="metric-value">{agendamentos.length}</strong><p className="mt-3 text-[11px] text-[#8f867d]">registrados</p></div>
        <div className="card p-4 lg:p-5"><p className="metric-label">Clientes</p><strong className="metric-value text-[#c6d0ba]">{clientes}</strong><p className="mt-3 text-[11px] text-[#8f867d]">clientes únicos</p></div>
        <div className="card card-accent col-span-2 p-4 lg:col-span-1 lg:p-5"><p className="metric-label !text-[#695d4e]">Faturamento previsto</p><strong className="mt-3 block text-2xl font-black">{dinheiro(faturamento)}</strong><p className="mt-3 text-[11px] text-[#695d4e]">reservas e mensalidades deste mês</p></div>
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-3"><a href="/inicio/agenda" className="card card-accent group p-5"><p className="text-xs font-bold uppercase tracking-widest text-[#746653]">Agenda</p><h3 className="display-font mt-6 text-3xl">Organizar semana</h3><p className="mt-4 text-sm">Abrir calendário →</p></a><a href="/inicio/clientes" className="card p-5"><p className="eyebrow">Relacionamento</p><h3 className="display-font mt-6 text-3xl">Seus clientes</h3><p className="subtle mt-4 text-sm">Histórico e retornos →</p></a><a href="/inicio/servicos" className="card p-5"><p className="eyebrow">Menu</p><h3 className="display-font mt-6 text-3xl">Serviços & valores</h3><p className="subtle mt-4 text-sm">Gerenciar catálogo →</p></a></section>
    </div></main>
  );
}
