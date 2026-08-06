"use client";

import { useEffect, useMemo, useState } from "react";
import { Agendamento, Cliente, dataLocal, obterStatusAtendimento } from "@/lib/barber-storage";
import { criarClienteSupabase } from "@/lib/supabase/client";
import { buscarAgendamentos, buscarClientes } from "@/lib/supabase/agenda";

function dinheiro(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FinanceiroPage() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [agora, setAgora] = useState(0);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const supabase = criarClienteSupabase();
        const [reservas, cadastros] = await Promise.all([buscarAgendamentos(supabase), buscarClientes(supabase)]);
        if (ativo) {
          setAgendamentos(reservas);
          setClientes(cadastros);
          setAgora(Date.now());
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void carregar();
    window.addEventListener("ph10:agendamentos-atualizados", carregar);
    window.addEventListener("ph10:clientes-atualizados", carregar);
    return () => {
      ativo = false;
      window.removeEventListener("ph10:agendamentos-atualizados", carregar);
      window.removeEventListener("ph10:clientes-atualizados", carregar);
    };
  }, []);

  const resumo = useMemo(() => {
    const mesAtual = dataLocal().slice(0, 7);
    const reservasDoMes = agendamentos.filter((item) => item.data.startsWith(mesAtual));
    const contabilizadas = reservasDoMes.filter((item) => {
      const status = obterStatusAtendimento(item, agora);
      return status !== "Cancelado" && status !== "Não compareceu";
    });
    const mensalistas = clientes.filter((cliente) => cliente.mensalista);
    const receitaAvulsa = contabilizadas
      .filter((item) => !item.cobertoPorMensalidade)
      .reduce((total, item) => total + item.valor, 0);
    const receitaMensalidades = mensalistas.reduce((total, cliente) => total + cliente.mensalidade, 0);
    return {
      mesAtual,
      mensalistas,
      receitaAvulsa,
      receitaMensalidades,
      total: receitaAvulsa + receitaMensalidades,
      reservasAvulsas: contabilizadas.filter((item) => !item.cobertoPorMensalidade).length,
      reservasMensalistas: contabilizadas.filter((item) => item.cobertoPorMensalidade).length,
    };
  }, [agendamentos, clientes, agora]);

  const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(`${resumo.mesAtual}-01T12:00:00`));

  return (
    <main className="app-page">
      <div className="page-wrap">
        <header className="hero-panel">
          <p className="eyebrow">PH10 • Controle mensal</p>
          <h1 className="display-font page-title mt-2">Financeiro</h1>
          <p className="subtle mt-3 text-sm">Visão prevista de {nomeMes}, considerando reservas válidas e mensalidades ativas.</p>
        </header>

        {carregando ? (
          <section className="mt-5 rounded-[1.75rem] bg-neutral-900 p-8 text-center text-sm text-neutral-400">Carregando resumo financeiro...</section>
        ) : (
          <>
            <section className="card card-accent mt-5 p-5 lg:p-6">
              <p className="metric-label !text-[#695d4e]">Faturamento previsto no mês</p>
              <strong className="mt-3 block text-4xl font-black">{dinheiro(resumo.total)}</strong>
              <p className="mt-3 text-xs text-[#695d4e]">Valores previstos; o controle de pagamentos será uma evolução separada.</p>
            </section>

            <section className="mt-4 grid grid-cols-2 gap-3">
              <article className="card p-4 lg:p-5"><p className="metric-label">Reservas avulsas</p><strong className="mt-3 block text-2xl font-black text-amber-300">{dinheiro(resumo.receitaAvulsa)}</strong><p className="mt-2 text-xs text-neutral-500">{resumo.reservasAvulsas} reserva(s) no mês</p></article>
              <article className="card p-4 lg:p-5"><p className="metric-label">Mensalidades</p><strong className="mt-3 block text-2xl font-black text-green-300">{dinheiro(resumo.receitaMensalidades)}</strong><p className="mt-2 text-xs text-neutral-500">{resumo.mensalistas.length} mensalista(s) ativo(s)</p></article>
            </section>

            <section className="mt-5 rounded-[1.75rem] bg-neutral-900 p-5">
              <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-amber-400">Planos mensais</p><h2 className="mt-1 text-xl font-black">Clientes ativos</h2></div><span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-300">{resumo.reservasMensalistas} reserva(s)</span></div>
              {resumo.mensalistas.length === 0 ? <p className="py-8 text-center text-sm text-neutral-400">Nenhum mensalista ativo.</p> : <div className="divide-y divide-white/10">{resumo.mensalistas.map((cliente) => <article key={cliente.id} className="flex items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="truncate font-black">{cliente.nome}</p><p className="mt-1 text-xs text-neutral-500">Plano mensal ativo</p></div><strong className="shrink-0 text-amber-300">{dinheiro(cliente.mensalidade)}</strong></article>)}</div>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
