"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NoticeDialog from "@/components/NoticeDialog";
import {
  Agendamento,
  BloqueioAgenda,
  ConfiguracaoAgenda,
  normalizarWhatsapp,
  obterStatusAtendimento,
  proximosDias,
  reservaEstaAtiva,
} from "@/lib/barber-storage";
import { intervalosSeSobrepoem } from "@/lib/agenda-rules.mjs";

type Props = {
  agendamentos: Agendamento[];
  bloqueios: BloqueioAgenda[];
  configuracao: ConfiguracaoAgenda | null;
  whatsappPH10: string;
  onAtualizar: (agendamentos: Agendamento[]) => void;
};

const idsDosDias = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const DUAS_HORAS = 2 * 60 * 60 * 1000;

function minutos(hora: string) { const [h, m] = hora.split(":").map(Number); return h * 60 + m; }
function horaFormatada(total: number) { return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }
function somenteDigitos(valor: string) { return valor.replace(/\D/g, "").slice(0, 9); }
function formatarData(data: string) { return data.split("-").reverse().join("/"); }
function dinheiro(valor: number) { return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function ClientReservationLookup({ agendamentos, bloqueios, configuracao, whatsappPH10, onAtualizar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [erro, setErro] = useState("");
  const [reservasEncontradas, setReservasEncontradas] = useState<Agendamento[] | null>(null);
  const [reserva, setReserva] = useState<Agendamento | null>(null);
  const [modoRemarcar, setModoRemarcar] = useState(false);
  const [novaData, setNovaData] = useState("");
  const [novoHorario, setNovoHorario] = useState("");
  const [confirmacao, setConfirmacao] = useState<"cancelar" | "remarcar" | null>(null);
  const [avisoSucesso, setAvisoSucesso] = useState<{ titulo: string; descricao: string } | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [processandoConfirmacao, setProcessandoConfirmacao] = useState(false);
  const [relogio, setRelogio] = useState(() => Date.now());
  const consultandoRef = useRef(false);
  const processandoConfirmacaoRef = useRef(false);

  useEffect(() => {
    const intervalo = window.setInterval(() => setRelogio(Date.now()), 60_000);
    return () => window.clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    function fecharComEsc(event: KeyboardEvent) { if (event.key === "Escape") fechar(); }
    document.addEventListener("keydown", fecharComEsc);
    return () => document.removeEventListener("keydown", fecharComEsc);
  }, [aberto]);

  const status = reserva ? obterStatusAtendimento(reserva, relogio) : null;
  const inicioReserva = reserva ? new Date(`${reserva.data}T${reserva.hora}:00`).getTime() : 0;
  const dentroDoPrazo = Boolean(reserva && status === "Agendado" && inicioReserva - relogio >= DUAS_HORAS);
  const janelaPadrao = Number(configuracao?.configAgenda.diasParaAgendar ?? 7);
  const dias = proximosDias(reserva?.cobertoPorMensalidade ? Math.max(20, janelaPadrao) : janelaPadrao);
  const { proximasReservas, historicoReservas } = useMemo(() => {
    const lista = (reservasEncontradas ?? []).map((item) => ({
      item,
      status: obterStatusAtendimento(item, relogio),
      instante: new Date(`${item.data}T${item.hora}:00`).getTime(),
    }));
    return {
      proximasReservas: lista
        .filter((entrada) => entrada.status === "Agendado")
        .sort((a, b) => a.instante - b.instante),
      historicoReservas: lista
        .filter((entrada) => entrada.status !== "Agendado")
        .sort((a, b) => b.instante - a.instante),
    };
  }, [reservasEncontradas, relogio]);

  const horariosRemarcacao = useMemo(() => {
    if (!reserva || !configuracao || !novaData) return [];
    const dataSelecionada = new Date(`${novaData}T12:00:00`);
    const expediente = configuracao.diasFuncionamento.find((item) => item.id === idsDosDias[dataSelecionada.getDay()]);
    if (!expediente?.ativo) return [];
    const intervalo = Number(configuracao.configAgenda.intervalo);
    const minutosMinimos = Math.max(120, Number(configuracao.configAgenda.antecedenciaMinima));
    const limiteMinimo = relogio + minutosMinimos * 60 * 1000;
    const disponiveis: string[] = [];

    for (let atual = minutos(expediente.abertura); atual < minutos(expediente.fechamento); atual += intervalo) {
      const hora = horaFormatada(atual);
      const fim = atual + intervalo;
      const instante = new Date(`${novaData}T${hora}:00`).getTime();
      const sobrepoePausa = expediente.temPausa && intervalosSeSobrepoem(atual, fim, minutos(expediente.pausaInicio), minutos(expediente.pausaFim));
      const sobrepoeBloqueio = bloqueios.some((item) => item.data === novaData && intervalosSeSobrepoem(atual, fim, item.diaInteiro ? 0 : minutos(item.inicio), item.diaInteiro ? 24 * 60 : minutos(item.fim)));
      const sobrepoeReserva = agendamentos.some((item) => {
        if (item.id === reserva.id || item.data !== novaData || !reservaEstaAtiva(item, relogio)) return false;
        const inicioExistente = minutos(item.hora);
        const fimExistente = inicioExistente + (item.duracaoMinutos ?? intervalo);
        return intervalosSeSobrepoem(atual, fim, inicioExistente, fimExistente);
      });
      if (fim <= minutos(expediente.fechamento) && instante >= limiteMinimo && !sobrepoePausa && !sobrepoeBloqueio && !sobrepoeReserva) disponiveis.push(hora);
    }
    return disponiveis;
  }, [reserva, configuracao, novaData, relogio, bloqueios, agendamentos]);

  function fechar() {
    if (consultandoRef.current || processandoConfirmacaoRef.current) return;
    setAberto(false);
    setWhatsapp("");
    setErro("");
    setReservasEncontradas(null);
    setReserva(null);
    setModoRemarcar(false);
    setNovaData("");
    setNovoHorario("");
    setConfirmacao(null);
    setProcessandoConfirmacao(false);
    processandoConfirmacaoRef.current = false;
  }

  async function buscarReserva() {
    if (consultandoRef.current) return;

    if (!/^9\d{8}$/.test(whatsapp)) {
      setErro("Informe os 9 dígitos do WhatsApp, começando pelo 9.");
      return;
    }
    const numero = normalizarWhatsapp(`5521${whatsapp}`);
    consultandoRef.current = true;
    setConsultando(true);
    setErro("");

    try {
      const resposta = await fetch(`/api/public/reservas?whatsapp=${numero}`, { cache: "no-store" });
      const resultado = await resposta.json() as { reservas?: Agendamento[]; erro?: string };
      if (!resposta.ok || !resultado.reservas?.length) {
        setErro(resultado.erro ?? "Não encontramos reservas para este WhatsApp.");
        return;
      }
      setReservasEncontradas(resultado.reservas);
      setReserva(null);
      setErro("");
    } catch {
      setErro("A conexão falhou durante a consulta. Confira sua internet e tente novamente.");
    } finally {
      consultandoRef.current = false;
      setConsultando(false);
    }
  }

  async function executarConfirmacao() {
    if (processandoConfirmacaoRef.current) return;
    if (!reserva || !confirmacao) return;
    if (new Date(`${reserva.data}T${reserva.hora}:00`).getTime() - Date.now() < DUAS_HORAS) {
      setConfirmacao(null);
      setRelogio(Date.now());
      return;
    }

    if (confirmacao === "remarcar" && (!novaData || !novoHorario)) return;
    processandoConfirmacaoRef.current = true;
    setProcessandoConfirmacao(true);
    try {
      const resposta = await fetch("/api/public/reservas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: reserva.codigo, whatsapp: reserva.whatsapp, acao: confirmacao, data: novaData, hora: novoHorario }) });
      const resultado = await resposta.json() as { reserva?: Agendamento; erro?: string };
      if (!resposta.ok || !resultado.reserva) { setConfirmacao(null); setErro(resultado.erro ?? "Não foi possível alterar a reserva."); return; }
      const atualizada = resultado.reserva;
      const foiCancelada = confirmacao === "cancelar";
      const novaLista = agendamentos.map((item) => item.id === reserva.id ? atualizada : item);
      setReservasEncontradas((lista) => lista?.map((item) => item.id === reserva.id ? atualizada : item) ?? null);
      onAtualizar(novaLista);
      setRelogio(Date.now());
      processandoConfirmacaoRef.current = false;
      setProcessandoConfirmacao(false);
      fechar();
      setAvisoSucesso({
        titulo: foiCancelada ? "Reserva cancelada" : "Reserva remarcada",
        descricao: foiCancelada
          ? "Sua reserva foi cancelada e o horário já está disponível novamente."
          : `Sua reserva foi remarcada para ${formatarData(atualizada.data)} às ${atualizada.hora}.`,
      });
    } finally {
      processandoConfirmacaoRef.current = false;
      setProcessandoConfirmacao(false);
    }
  }

  function linkContatoPrazo() {
    if (!reserva) return "#";
    const mensagem = encodeURIComponent(
      `Olá, PH! Preciso alterar minha reserva do dia ${formatarData(reserva.data)} às ${reserva.hora}, mas o prazo pelo site já encerrou. Pode me ajudar?\n\nCódigo: ${reserva.codigo}`,
    );
    return `https://wa.me/${whatsappPH10}?text=${mensagem}`;
  }

  const modal = aberto ? (
    <div onClick={fechar} className="safe-modal-shell fixed inset-0 z-[320] flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="consulta-reserva-titulo" onClick={(event) => event.stopPropagation()} className="safe-modal-card w-full max-w-md rounded-[2rem] border border-white/10 bg-neutral-900 p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[.18em] text-amber-400">Área do cliente</p><h2 id="consulta-reserva-titulo" className="mt-1 text-2xl font-black">Minhas reservas</h2></div>
          <button type="button" onClick={fechar} aria-label="Fechar" className="rounded-full bg-white/10 px-3 py-2 text-sm font-black">×</button>
        </div>

        {reservasEncontradas === null ? (
          <div className="mt-5">
            <p className="text-sm leading-relaxed text-neutral-400">Informe o mesmo WhatsApp usado nos agendamentos.</p>
            <label className="mt-4 block"><span className="text-xs font-bold text-neutral-400">WhatsApp</span><div className="mt-2 flex overflow-hidden rounded-2xl bg-neutral-950 focus-within:ring-2 focus-within:ring-amber-400"><span className="flex items-center border-r border-white/10 px-4 text-sm font-black text-amber-400">+55 21</span><input value={whatsapp} onChange={(event) => setWhatsapp(somenteDigitos(event.target.value))} placeholder="9 0000-0000" inputMode="numeric" autoComplete="tel" maxLength={9} className="min-w-0 flex-1 bg-transparent px-4 py-4 text-sm outline-none" /></div></label>
            {erro && <p className="mt-3 rounded-2xl bg-red-500/10 p-3 text-sm text-red-200">{erro}</p>}
            <button type="button" onClick={buscarReserva} disabled={consultando} className="mt-5 w-full rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950 disabled:cursor-wait disabled:opacity-70">{consultando ? "Consultando..." : "Consultar reservas"}</button>
          </div>
        ) : !reserva ? (
          <div className="mt-5 max-h-[65dvh] space-y-5 overflow-y-auto pr-1">
            {proximasReservas.length > 0 && (
              <section>
                <p className="text-xs font-black uppercase tracking-[.16em] text-amber-400">Próximas reservas</p>
                <div className="mt-3 space-y-2">
                  {proximasReservas.map(({ item, status: statusItem }) => (
                    <button key={item.id} type="button" onClick={() => setReserva(item)} className="w-full rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-left">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-black">{item.servico}</p><p className="mt-1 text-sm text-neutral-400">{formatarData(item.data)} às {item.hora}</p></div><span className="shrink-0 rounded-full bg-amber-400/10 px-3 py-1 text-[10px] font-black text-amber-300">{statusItem}</span></div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {historicoReservas.length > 0 && (
              <section>
                <p className="text-xs font-black uppercase tracking-[.16em] text-neutral-500">Histórico recente</p>
                <div className="mt-3 space-y-2">
                  {historicoReservas.map(({ item, status: statusItem }) => (
                    <button key={item.id} type="button" onClick={() => setReserva(item)} className="w-full rounded-2xl bg-neutral-950 p-4 text-left">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-black text-neutral-200">{item.servico}</p><p className="mt-1 text-sm text-neutral-500">{formatarData(item.data)} às {item.hora}</p></div><span className="shrink-0 rounded-full bg-white/5 px-3 py-1 text-[10px] font-black text-neutral-400">{statusItem}</span></div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <button type="button" onClick={() => { setReservasEncontradas(null); setWhatsapp(""); setErro(""); }} className="w-full rounded-2xl bg-white/5 px-4 py-3 text-xs font-black text-neutral-300">Consultar outro WhatsApp</button>
          </div>
        ) : (
          <div className="mt-5">
            <div className="rounded-3xl bg-neutral-950 p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold tracking-wider text-amber-400">{reserva.codigo}</p><h3 className="mt-2 text-lg font-black">{reserva.servico}</h3></div><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black">{status}</span></div>
              <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-4"><dt className="text-neutral-400">Data</dt><dd className="font-bold">{formatarData(reserva.data)}</dd></div><div className="flex justify-between gap-4"><dt className="text-neutral-400">Horário</dt><dd className="font-bold">{reserva.hora}</dd></div><div className="flex justify-between gap-4"><dt className="text-neutral-400">Valor</dt><dd className="font-bold">{dinheiro(reserva.valor)}</dd></div></dl>
            </div>

            {status === "Agendado" && !dentroDoPrazo && <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4"><p className="font-black text-amber-200">Prazo de alteração encerrado</p><p className="mt-1 text-xs leading-relaxed text-neutral-400">Cancelamentos e remarcações pelo aplicativo podem ser feitos até 2 horas antes.</p><a href={linkContatoPrazo()} target="_blank" rel="noreferrer" className="mt-3 flex w-full items-center justify-center rounded-xl bg-green-500 px-3 py-3 text-xs font-black text-white">Falar com a PH10</a></div>}

            {dentroDoPrazo && !modoRemarcar && <div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={() => setConfirmacao("cancelar")} className="rounded-2xl bg-red-500/10 px-4 py-4 text-sm font-black text-red-200">Cancelar reserva</button><button type="button" onClick={() => setModoRemarcar(true)} className="rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950">Remarcar</button></div>}

            {modoRemarcar && dentroDoPrazo && (
              <div className="mt-5 border-t border-white/10 pt-5">
                <h3 className="font-black">Escolha o novo horário</h3>
                <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2">{dias.map((item) => <button key={item.data} type="button" onClick={() => { setNovaData(item.data); setNovoHorario(""); }} className={`min-w-[70px] rounded-2xl border p-2 text-center ${novaData === item.data ? "border-amber-400 bg-amber-400 text-neutral-950" : "border-white/10 bg-neutral-950"}`}><span className="block text-[10px] font-bold capitalize">{item.semana}</span><strong className="block text-xl">{item.dia}</strong></button>)}</div>
                {novaData && (horariosRemarcacao.length > 0 ? <div className="mt-3 grid grid-cols-3 gap-2">{horariosRemarcacao.map((hora) => <button key={hora} type="button" onClick={() => setNovoHorario(hora)} className={`rounded-xl border py-3 text-sm font-black ${novoHorario === hora ? "border-amber-400 bg-amber-400 text-neutral-950" : "border-white/10 bg-neutral-950"}`}>{hora}</button>)}</div> : <p className="mt-3 rounded-2xl bg-neutral-950 p-4 text-center text-sm text-neutral-400">Nenhum horário disponível nessa data.</p>)}
                <div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={() => { setModoRemarcar(false); setNovaData(""); setNovoHorario(""); }} className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black">Voltar</button><button type="button" disabled={!novoHorario} onClick={() => setConfirmacao("remarcar")} className="rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950 disabled:opacity-40">Continuar</button></div>
              </div>
            )}

            <button type="button" onClick={() => { setReserva(null); setModoRemarcar(false); setNovaData(""); setNovoHorario(""); }} className="mt-4 w-full rounded-2xl bg-white/5 px-4 py-3 text-xs font-black text-neutral-300">Voltar às minhas reservas</button>
          </div>
        )}
      </div>

      {confirmacao && reserva && (
        <div onClick={() => setConfirmacao(null)} className="fixed inset-0 z-[340] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-neutral-900 p-6 text-center text-white shadow-2xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-400/10 text-2xl font-black text-amber-400">!</div><h2 className="mt-4 text-2xl font-black">{confirmacao === "cancelar" ? "Cancelar reserva?" : "Confirmar remarcação?"}</h2><p className="mt-2 text-sm leading-relaxed text-neutral-400">{confirmacao === "cancelar" ? `O horário de ${formatarData(reserva.data)} às ${reserva.hora} será liberado.` : `Sua reserva será alterada para ${formatarData(novaData)} às ${novoHorario}.`}</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => setConfirmacao(null)} disabled={processandoConfirmacao} className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black disabled:cursor-wait disabled:opacity-50">Voltar</button><button type="button" onClick={executarConfirmacao} disabled={processandoConfirmacao} className={`rounded-2xl px-4 py-4 text-sm font-black disabled:cursor-wait disabled:opacity-70 ${confirmacao === "cancelar" ? "bg-red-500 text-white" : "bg-amber-400 text-neutral-950"}`}>{processandoConfirmacao ? "Processando..." : "Confirmar"}</button></div></div>
        </div>
      )}

      {consultando && (
        <div onClick={(event) => event.stopPropagation()} className="safe-modal-shell fixed inset-0 z-[360] flex items-center justify-center bg-black/70 backdrop-blur-md" role="status" aria-live="assertive" aria-label="Consultando suas reservas">
          <div className="flex w-full max-w-xs flex-col items-center rounded-[2rem] border border-white/10 bg-neutral-900/95 px-6 py-8 text-center text-white shadow-2xl">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-400/20 border-t-amber-400" aria-hidden="true" />
            <p className="mt-5 text-xl font-black">Consultando...</p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">Estamos procurando suas reservas. Aguarde um instante.</p>
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="mt-4 flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-xs font-black text-neutral-200 sm:w-auto">Consultar minhas reservas</button>
      {modal && createPortal(modal, document.body)}
      {avisoSucesso && createPortal(
        <NoticeDialog
          tipo="sucesso"
          titulo={avisoSucesso.titulo}
          descricao={avisoSucesso.descricao}
          onFechar={() => setAvisoSucesso(null)}
        />,
        document.body,
      )}
    </>
  );
}
