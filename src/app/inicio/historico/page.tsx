"use client";

import { useEffect, useMemo, useState } from "react";
import { Agendamento, StatusAtendimento, obterStatusAtendimento, reservaEstaAtiva } from "@/lib/barber-storage";
import { criarClienteSupabase } from "@/lib/supabase/client";
import { buscarAgendamentos } from "@/lib/supabase/agenda";

function dinheiro(valor: number) { return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function dataPorExtenso(data: string) { return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${data}T12:00:00`)); }
function codigoComparavel(codigo: string) { return codigo.toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function dataHoraAlteracao(valor: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(valor)); }
function descricaoAlteracao(item: NonNullable<Agendamento["historicoAlteracoes"]>[number]) {
  if (item.tipo === "Criada") return `Reserva criada para ${item.dataNova ? item.dataNova.split("-").reverse().join("/") : "a data escolhida"} às ${item.horaNova}.`;
  if (item.tipo === "Remarcada") return `De ${item.dataAnterior?.split("-").reverse().join("/")} às ${item.horaAnterior} para ${item.dataNova?.split("-").reverse().join("/")} às ${item.horaNova}.`;
  if (item.tipo === "Cancelada") return "Reserva cancelada e horário liberado.";
  if (item.tipo === "Falta") return "Atendimento marcado como não compareceu.";
  return `Status alterado de ${item.statusAnterior} para ${item.statusNovo}.`;
}
function statusClass(status: StatusAtendimento) {
  if (status === "Concluído") return "bg-green-500/10 text-green-300";
  if (status === "Cancelado" || status === "Não compareceu") return "bg-red-500/10 text-red-300";
  return "bg-yellow-500/10 text-yellow-300";
}

function RegistroCard({ item, agora }: { item: Agendamento; agora: number }) {
  const status = obterStatusAtendimento(item, agora);
  return (
    <article className="rounded-[1.5rem] bg-neutral-900 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-black text-amber-400">{item.hora}</p>
          <h3 className="mt-1 truncate font-black">{item.cliente}</h3>
          <p className="mt-1 text-sm text-neutral-400">{item.servico}</p>
          {item.codigo && <p className="mt-2 font-mono text-[11px] font-bold tracking-wider text-neutral-500">{item.codigo}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-black">{item.cobertoPorMensalidade ? "Mensalista" : dinheiro(item.valor)}</p>
          <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-black ${statusClass(status)}`}>{status}</span>
        </div>
      </div>
      {item.historicoAlteracoes && item.historicoAlteracoes.length > 0 && (
        <details className="mt-4 border-t border-white/10 pt-3">
          <summary className="cursor-pointer text-xs font-black text-neutral-400">Ver alterações ({item.historicoAlteracoes.length})</summary>
          <div className="mt-3 space-y-3 border-l border-white/10 pl-3">
            {[...item.historicoAlteracoes].reverse().map((alteracao) => (
              <div key={alteracao.id} className="relative text-xs">
                <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-amber-400" />
                <div className="flex flex-wrap items-center gap-2"><strong className="text-neutral-200">{alteracao.tipo}</strong><span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase text-neutral-500">{alteracao.origem}</span></div>
                <p className="mt-1 leading-relaxed text-neutral-400">{descricaoAlteracao(alteracao)}</p>
                <p className="mt-1 text-[10px] text-neutral-600">{dataHoraAlteracao(alteracao.realizadaEm)}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

export default function HistoricoPage() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [agora, setAgora] = useState(0);
  const [periodo, setPeriodo] = useState("");
  const [codigoBusca, setCodigoBusca] = useState("");

  useEffect(() => {
    async function carregar() { setAgendamentos(await buscarAgendamentos(criarClienteSupabase())); setAgora(Date.now()); }
    carregar();
    window.addEventListener("ph10:agendamentos-atualizados", carregar);
    const intervalo = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => {
      window.removeEventListener("ph10:agendamentos-atualizados", carregar);
      window.clearInterval(intervalo);
    };
  }, []);

  const grupos = useMemo(() => {
    if (!periodo) return {};
    const finalizados = agendamentos
      .filter((item) => item.data === periodo && !reservaEstaAtiva(item, agora))
      .sort((a, b) => `${b.data} ${b.hora}`.localeCompare(`${a.data} ${a.hora}`));
    return finalizados.reduce<Record<string, Agendamento[]>>((resultado, item) => {
      (resultado[item.data] ??= []).push(item);
      return resultado;
    }, {});
  }, [agendamentos, agora, periodo]);

  const codigoDigitado = codigoComparavel(codigoBusca);
  const codigoCompleto = codigoDigitado.length >= 10;
  const reservaPorCodigo = useMemo(() => {
    if (!codigoCompleto) return null;
    return agendamentos.find((item) => item.codigo && codigoComparavel(item.codigo) === codigoDigitado) ?? null;
  }, [agendamentos, codigoCompleto, codigoDigitado]);

  return (
    <main className="app-page">
      <div className="page-wrap">
        <header className="hero-panel">
          <p className="eyebrow">PH10 • Registros</p>
          <h1 className="display-font page-title mt-2">Histórico</h1>
          <p className="subtle mt-3 text-sm">Consulte atendimentos por data ou localize uma reserva pelo código.</p>
        </header>

        <section className="mt-5 min-w-0 rounded-[1.75rem] bg-neutral-900 p-5">
          <label className="block min-w-0">
            <span className="text-xs font-black uppercase tracking-[.18em] text-amber-400">Período</span>
            <p className="mt-1 text-sm text-neutral-400">Escolha a data que deseja consultar.</p>
            <div className="relative mt-4 w-full max-w-sm overflow-hidden rounded-2xl bg-neutral-950 focus-within:ring-2 focus-within:ring-amber-400">
              <div aria-hidden="true" className="flex min-h-14 items-center justify-between gap-3 px-4 py-4 text-sm">
                <span className={periodo ? "text-white" : "text-neutral-400"}>{periodo ? periodo.split("-").reverse().join("/") : "dd/mm/aaaa"}</span>
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4M16 2v4M3 10h18" /><rect x="3" y="4" width="18" height="17" rx="2" /></svg>
              </div>
              <input type="date" value={periodo} aria-label="Data do período" onChange={(event) => { setPeriodo(event.target.value); setCodigoBusca(""); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </div>
          </label>

          <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-white/10" /><span className="text-[10px] font-black uppercase tracking-[.2em] text-neutral-500">ou</span><span className="h-px flex-1 bg-white/10" /></div>

          <label className="block max-w-sm">
            <span className="text-xs font-black uppercase tracking-[.18em] text-amber-400">Código da reserva</span>
            <p className="mt-1 text-sm text-neutral-400">Digite o protocolo informado pelo cliente.</p>
            <input value={codigoBusca} onChange={(event) => { setCodigoBusca(event.target.value.toUpperCase().slice(0, 11)); if (event.target.value) setPeriodo(""); }} placeholder="PH10-XXXXXX" autoCapitalize="characters" spellCheck={false} className="mt-4 w-full rounded-2xl bg-neutral-950 px-4 py-4 font-mono text-base uppercase outline-none focus:ring-2 focus:ring-amber-400" />
          </label>
        </section>

        {codigoBusca ? (
          !codigoCompleto ? (
            <div className="mt-5 rounded-[1.75rem] border border-dashed border-white/10 bg-neutral-900 p-8 text-center"><p className="text-lg font-black">Digite o código completo</p><p className="mt-2 text-sm text-neutral-400">Exemplo: PH10-AB23CD.</p></div>
          ) : reservaPorCodigo ? (
            <section className="mt-6"><div className="mb-3 border-b border-white/10 pb-3"><p className="text-xs font-black uppercase tracking-[.18em] text-amber-400">Reserva encontrada</p><h2 className="mt-1 text-lg font-black">{reservaPorCodigo.data.split("-").reverse().join("/")}</h2></div><RegistroCard item={reservaPorCodigo} agora={agora} /></section>
          ) : (
            <div className="mt-5 rounded-[1.75rem] border border-dashed border-white/10 bg-neutral-900 p-8 text-center"><p className="text-lg font-black">Código não encontrado</p><p className="mt-2 text-sm text-neutral-400">Confira o protocolo e tente novamente.</p></div>
          )
        ) : !periodo ? (
          <div className="mt-5 rounded-[1.75rem] border border-dashed border-white/10 bg-neutral-900 p-8 text-center"><p className="text-lg font-black">Escolha como consultar</p><p className="mt-2 text-sm text-neutral-400">Selecione uma data ou pesquise pelo código da reserva.</p></div>
        ) : Object.keys(grupos).length === 0 ? (
          <div className="mt-5 rounded-[1.75rem] border border-dashed border-white/10 bg-neutral-900 p-8 text-center"><p className="text-lg font-black">Nenhum atendimento nessa data</p><p className="mt-2 text-sm text-neutral-400">Não existem atendimentos encerrados para o período selecionado.</p></div>
        ) : (
          <div className="mt-6 space-y-7">
            {Object.entries(grupos).map(([data, itens]) => {
              const totalConcluido = itens.filter((item) => obterStatusAtendimento(item, agora) === "Concluído").reduce((total, item) => total + item.valor, 0);
              return <section key={data}><div className="mb-3 flex items-end justify-between gap-4 border-b border-white/10 pb-3"><div><p className="text-xs font-black uppercase tracking-[.18em] text-amber-400">{data.split("-").reverse().join("/")}</p><h2 className="mt-1 capitalize text-lg font-black">{dataPorExtenso(data)}</h2></div><div className="text-right"><p className="text-xs text-neutral-500">{itens.length} registro(s)</p><p className="mt-1 text-sm font-black text-neutral-300">{dinheiro(totalConcluido)}</p></div></div><div className="space-y-3">{itens.map((item) => <RegistroCard key={item.id} item={item} agora={agora} />)}</div></section>;
            })}
          </div>
        )}
      </div>
    </main>
  );
}
