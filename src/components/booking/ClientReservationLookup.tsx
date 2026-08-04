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
function codigoComparavel(codigo: string) { return codigo.toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function somenteDigitos(valor: string) { return valor.replace(/\D/g, "").slice(0, 9); }
function formatarData(data: string) { return data.split("-").reverse().join("/"); }
function dinheiro(valor: number) { return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function ClientReservationLookup({ agendamentos, bloqueios, configuracao, whatsappPH10, onAtualizar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [erro, setErro] = useState("");
  const [reserva, setReserva] = useState<Agendamento | null>(null);
  const [modoRemarcar, setModoRemarcar] = useState(false);
  const [novaData, setNovaData] = useState("");
  const [novoHorario, setNovoHorario] = useState("");
  const [confirmacao, setConfirmacao] = useState<"cancelar" | "remarcar" | null>(null);
  const [avisoSucesso, setAvisoSucesso] = useState<{ titulo: string; descricao: string } | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [relogio, setRelogio] = useState(() => Date.now());
  const consultandoRef = useRef(false);

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
  const dias = proximosDias(Number(configuracao?.configAgenda.diasParaAgendar ?? 7));

  const horariosRemarcacao = useMemo(() => {
    if (!reserva || !configuracao || !novaData) return [];
    const dataSelecionada = new Date(`${novaData}T12:00:00`);
    const expediente = configuracao.diasFuncionamento.find((item) => item.id === idsDosDias[dataSelecionada.getDay()]);
    if (!expediente?.ativo) return [];
    const intervalo = Number(configuracao.configAgenda.intervalo);
    const duracao = reserva.duracaoMinutos ?? intervalo;
    const minutosMinimos = Math.max(120, Number(configuracao.configAgenda.antecedenciaMinima));
    const limiteMinimo = relogio + minutosMinimos * 60 * 1000;
    const disponiveis: string[] = [];

    for (let atual = minutos(expediente.abertura); atual < minutos(expediente.fechamento); atual += intervalo) {
      const hora = horaFormatada(atual);
      const fim = atual + duracao;
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
    if (consultandoRef.current) return;
    setAberto(false);
    setCodigo("");
    setWhatsapp("");
    setErro("");
    setReserva(null);
    setModoRemarcar(false);
    setNovaData("");
    setNovoHorario("");
    setConfirmacao(null);
  }

  async function buscarReserva() {
    if (consultandoRef.current) return;

    const codigoNormalizado = codigoComparavel(codigo);
    if (codigoNormalizado.length < 10 || !/^9\d{8}$/.test(whatsapp)) {
      setErro("Informe o código completo e os 9 dígitos do WhatsApp.");
      return;
    }
    const numero = normalizarWhatsapp(`5521${whatsapp}`);
    consultandoRef.current = true;
    setConsultando(true);
    setErro("");

    try {
      const resposta = await fetch(`/api/public/reservas?codigo=${encodeURIComponent(codigo.toUpperCase())}&whatsapp=${numero}`, { cache: "no-store" });
      const resultado = await resposta.json() as { reserva?: Agendamento; erro?: string };
      if (!resposta.ok || !resultado.reserva) {
        setErro(resultado.erro ?? "Não encontramos uma reserva com esses dados.");
        return;
      }
      setReserva(resultado.reserva);
      setErro("");
    } catch {
      setErro("A conexão falhou durante a consulta. Confira sua internet e tente novamente.");
    } finally {
      consultandoRef.current = false;
      setConsultando(false);
    }
  }

  async function executarConfirmacao() {
    if (!reserva || !confirmacao) return;
    if (new Date(`${reserva.data}T${reserva.hora}:00`).getTime() - Date.now() < DUAS_HORAS) {
      setConfirmacao(null);
      setRelogio(Date.now());
      return;
    }

    if (confirmacao === "remarcar" && (!novaData || !novoHorario)) return;
    const resposta = await fetch("/api/public/reservas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: reserva.codigo, whatsapp: reserva.whatsapp, acao: confirmacao, data: novaData, hora: novoHorario }) });
    const resultado = await resposta.json() as { reserva?: Agendamento; erro?: string };
    if (!resposta.ok || !resultado.reserva) { setConfirmacao(null); setErro(resultado.erro ?? "Não foi possível alterar a reserva."); return; }
    const atualizada = resultado.reserva;
    const foiCancelada = confirmacao === "cancelar";
    const novaLista = agendamentos.map((item) => item.id === reserva.id ? atualizada : item);
    onAtualizar(novaLista);
    setRelogio(Date.now());
    fechar();
    setAvisoSucesso({
      titulo: foiCancelada ? "Reserva cancelada" : "Reserva remarcada",
      descricao: foiCancelada
        ? "Sua reserva foi cancelada e o horário já está disponível novamente."
        : `Sua reserva foi remarcada para ${formatarData(atualizada.data)} às ${atualizada.hora}.`,
    });
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
          <div><p className="text-xs font-black uppercase tracking-[.18em] text-amber-400">Área do cliente</p><h2 id="consulta-reserva-titulo" className="mt-1 text-2xl font-black">Minha reserva</h2></div>
          <button type="button" onClick={fechar} aria-label="Fechar" className="rounded-full bg-white/10 px-3 py-2 text-sm font-black">×</button>
        </div>

        {!reserva ? (
          <div className="mt-5">
            <p className="text-sm leading-relaxed text-neutral-400">Use o protocolo e o mesmo WhatsApp informado no agendamento.</p>
            <label className="mt-4 block"><span className="text-xs font-bold text-neutral-400">Código da reserva</span><input value={codigo} onChange={(event) => setCodigo(event.target.value.toUpperCase().slice(0, 11))} placeholder="PH10-XXXXXX" autoCapitalize="characters" spellCheck={false} className="mt-2 w-full rounded-2xl bg-neutral-950 px-4 py-4 font-mono text-base uppercase outline-none focus:ring-2 focus:ring-amber-400" /></label>
            <label className="mt-3 block"><span className="text-xs font-bold text-neutral-400">WhatsApp</span><div className="mt-2 flex overflow-hidden rounded-2xl bg-neutral-950 focus-within:ring-2 focus-within:ring-amber-400"><span className="flex items-center border-r border-white/10 px-4 text-sm font-black text-amber-400">+55 21</span><input value={whatsapp} onChange={(event) => setWhatsapp(somenteDigitos(event.target.value))} placeholder="9 0000-0000" inputMode="numeric" maxLength={9} className="min-w-0 flex-1 bg-transparent px-4 py-4 text-sm outline-none" /></div></label>
            {erro && <p className="mt-3 rounded-2xl bg-red-500/10 p-3 text-sm text-red-200">{erro}</p>}
            <button type="button" onClick={buscarReserva} disabled={consultando} className="mt-5 w-full rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950 disabled:cursor-wait disabled:opacity-70">{consultando ? "Consultando..." : "Consultar reserva"}</button>
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

            <button type="button" onClick={() => { setReserva(null); setCodigo(""); setWhatsapp(""); setModoRemarcar(false); }} className="mt-4 w-full rounded-2xl bg-white/5 px-4 py-3 text-xs font-black text-neutral-300">Consultar outra reserva</button>
          </div>
        )}
      </div>

      {confirmacao && reserva && (
        <div onClick={() => setConfirmacao(null)} className="fixed inset-0 z-[340] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-neutral-900 p-6 text-center text-white shadow-2xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-400/10 text-2xl font-black text-amber-400">!</div><h2 className="mt-4 text-2xl font-black">{confirmacao === "cancelar" ? "Cancelar reserva?" : "Confirmar remarcação?"}</h2><p className="mt-2 text-sm leading-relaxed text-neutral-400">{confirmacao === "cancelar" ? `O horário de ${formatarData(reserva.data)} às ${reserva.hora} será liberado.` : `Sua reserva será alterada para ${formatarData(novaData)} às ${novoHorario}.`}</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => setConfirmacao(null)} className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black">Voltar</button><button type="button" onClick={executarConfirmacao} className={`rounded-2xl px-4 py-4 text-sm font-black ${confirmacao === "cancelar" ? "bg-red-500 text-white" : "bg-amber-400 text-neutral-950"}`}>Confirmar</button></div></div>
        </div>
      )}

      {consultando && (
        <div onClick={(event) => event.stopPropagation()} className="safe-modal-shell fixed inset-0 z-[360] flex items-center justify-center bg-black/70 backdrop-blur-md" role="status" aria-live="assertive" aria-label="Consultando sua reserva">
          <div className="flex w-full max-w-xs flex-col items-center rounded-[2rem] border border-white/10 bg-neutral-900/95 px-6 py-8 text-center text-white shadow-2xl">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-400/20 border-t-amber-400" aria-hidden="true" />
            <p className="mt-5 text-xl font-black">Consultando...</p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">Estamos procurando sua reserva. Aguarde um instante.</p>
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="mt-4 flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-xs font-black text-neutral-200 sm:w-auto">Consultar minha reserva</button>
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
