"use client";

import { useEffect, useMemo, useState } from "react";
import { Agendamento as AgendamentoBase, BloqueioAgenda, StatusAtendimento, dataLocal, obterStatusAtendimento, proximosDias, registrarAlteracaoAgendamento, reservaEstaAtiva } from "@/lib/barber-storage";
import { intervalosSeSobrepoem, validarDiasFuncionamento } from "@/lib/agenda-rules.mjs";
import AppointmentCard from "@/components/agenda/AppointmentCard";
import ConfirmDialog from "@/components/agenda/ConfirmDialog";
import NoticeDialog from "@/components/NoticeDialog";
import { criarClienteSupabase } from "@/lib/supabase/client";
import { agendaDoBanco, atualizarAgendaSupabase, buscarConfiguracao } from "@/lib/supabase/configuracoes";
import { atualizarAgendamento, buscarAgendamentos, buscarBloqueios, criarBloqueioSupabase, excluirBloqueioSupabase } from "@/lib/supabase/agenda";

type Status = StatusAtendimento;

type Agendamento = AgendamentoBase & { status: Status };

type DiaFuncionamento = {
  id: string;
  nome: string;
  curto: string;
  ativo: boolean;
  abertura: string;
  fechamento: string;
  temPausa: boolean;
  pausaInicio: string;
  pausaFim: string;
};

type ConfigAgenda = {
  intervalo: "15" | "30" | "45" | "60";
  antecedenciaMinima: string;
  diasParaAgendar: "7" | "15" | "30";
};

type Confirmacao =
  | { tipo: "status"; status: "Cancelado" | "Não compareceu"; item: Agendamento }
  | { tipo: "remover-bloqueio"; bloqueio: BloqueioAgenda };

const idsDosDias = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

const agendamentosIniciais: Agendamento[] = [];

const diasFuncionamentoIniciais: DiaFuncionamento[] = [
  {
    id: "domingo",
    nome: "Domingo",
    curto: "Dom",
    ativo: false,
    abertura: "09:00",
    fechamento: "14:00",
    temPausa: false,
    pausaInicio: "12:00",
    pausaFim: "13:00",
  },
  {
    id: "segunda",
    nome: "Segunda-feira",
    curto: "Seg",
    ativo: true,
    abertura: "09:00",
    fechamento: "18:00",
    temPausa: true,
    pausaInicio: "12:00",
    pausaFim: "13:00",
  },
  {
    id: "terca",
    nome: "Terça-feira",
    curto: "Ter",
    ativo: true,
    abertura: "09:00",
    fechamento: "18:00",
    temPausa: true,
    pausaInicio: "12:00",
    pausaFim: "13:00",
  },
  {
    id: "quarta",
    nome: "Quarta-feira",
    curto: "Qua",
    ativo: true,
    abertura: "09:00",
    fechamento: "18:00",
    temPausa: true,
    pausaInicio: "12:00",
    pausaFim: "13:00",
  },
  {
    id: "quinta",
    nome: "Quinta-feira",
    curto: "Qui",
    ativo: true,
    abertura: "09:00",
    fechamento: "18:00",
    temPausa: true,
    pausaInicio: "12:00",
    pausaFim: "13:00",
  },
  {
    id: "sexta",
    nome: "Sexta-feira",
    curto: "Sex",
    ativo: true,
    abertura: "09:00",
    fechamento: "18:00",
    temPausa: true,
    pausaInicio: "12:00",
    pausaFim: "13:00",
  },
  {
    id: "sabado",
    nome: "Sábado",
    curto: "Sáb",
    ativo: true,
    abertura: "09:00",
    fechamento: "14:00",
    temPausa: false,
    pausaInicio: "12:00",
    pausaFim: "13:00",
  },
];

const configAgendaInicial: ConfigAgenda = {
  intervalo: "30",
  antecedenciaMinima: "120",
  diasParaAgendar: "15",
};

const opcoesAntecedencia = [
  { valor: "15", rotulo: "15 minutos antes" },
  { valor: "30", rotulo: "30 minutos antes" },
  { valor: "45", rotulo: "45 minutos antes" },
  ...Array.from({ length: 3 }, (_, indice) => {
    const horas = indice + 1;
    return {
      valor: String(horas * 60),
      rotulo: horas === 1 ? "1 hora antes" : `${horas} horas antes`,
    };
  }),
];

function dinheiro(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function statusClass(status: Status) {
  if (status === "Concluído") return "bg-green-500/10 text-green-300";
  if (status === "Em atendimento") return "bg-blue-500/10 text-blue-300";
  if (status === "Agendado") return "bg-amber-400/10 text-amber-300";
  return "bg-red-500/10 text-red-300";
}

function whatsappLink(item: Agendamento) {
  const msg = encodeURIComponent(
    `Olá, ${item.cliente}! Tudo bem? Estou passando para confirmar seu horário na PH10 no dia ${item.data.split("-").reverse().join("/")} às ${item.hora}.\n\nServiço: ${item.servico}\n\nAté lá!`
  );

  const numero = item.whatsapp.replace(/\D/g, "");
  const numeroCompleto = numero.startsWith("55") ? numero : `55${numero}`;
  return `https://wa.me/${numeroCompleto}?text=${msg}`;
}

export default function AgendaPage() {
  const [diaSelecionado, setDiaSelecionado] = useState(dataLocal());
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>(
    agendamentosIniciais
  );

  const [modalHorariosAberto, setModalHorariosAberto] = useState(false);
  const [modalBloqueioAberto, setModalBloqueioAberto] = useState(false);
  const [diaExpandido, setDiaExpandido] = useState<string | null>(null);
  const [bloqueios, setBloqueios] = useState<BloqueioAgenda[]>([]);
  const [bloqueioData, setBloqueioData] = useState(dataLocal());
  const [bloqueioDiaInteiro, setBloqueioDiaInteiro] = useState(false);
  const [bloqueioInicio, setBloqueioInicio] = useState("");
  const [bloqueioFim, setBloqueioFim] = useState("");
  const [bloqueioMotivo, setBloqueioMotivo] = useState("");
  const [conflitosBloqueio, setConflitosBloqueio] = useState<Agendamento[]>([]);
  const [agendamentoRemarcar, setAgendamentoRemarcar] = useState<Agendamento | null>(null);
  const [novaData, setNovaData] = useState(dataLocal());
  const [novoHorario, setNovoHorario] = useState("");
  const [agoraRemarcacao, setAgoraRemarcacao] = useState(0);
  const [agendamentoEditarStatus, setAgendamentoEditarStatus] = useState<Agendamento | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [aviso, setAviso] = useState<{ titulo: string; descricao: string } | null>(null);
  const [salvandoConfiguracao, setSalvandoConfiguracao] = useState(false);

  const [diasFuncionamento, setDiasFuncionamento] = useState<
    DiaFuncionamento[]
  >(diasFuncionamentoIniciais);

  const [configAgenda, setConfigAgenda] =
    useState<ConfigAgenda>(configAgendaInicial);

  const dias = proximosDias(7);


  useEffect(() => {
    let ativo = true;
    async function carregar() {
      const agora = Date.now();
      setAgoraRemarcacao(agora);
      try {
        const supabase = criarClienteSupabase();
        const [configuracaoBanco, agendamentosBanco, bloqueiosBanco] = await Promise.all([buscarConfiguracao(supabase), buscarAgendamentos(supabase), buscarBloqueios(supabase)]);
        const configuracaoSalva = agendaDoBanco(configuracaoBanco);

        if (ativo) {
          setAgendamentos(agendamentosBanco.map((item) => ({ ...item, status: obterStatusAtendimento(item, agora) })));
          setBloqueios(bloqueiosBanco);
          setDiasFuncionamento(configuracaoSalva.diasFuncionamento);
          setConfigAgenda(configuracaoSalva.configAgenda);
        }
      } catch {
        if (ativo) setAviso({ titulo: "Agenda indisponível", descricao: "Não foi possível carregar os horários do banco de dados." });
      }
    }
    carregar();
    const eventos = ["ph10:agendamentos-atualizados", "ph10:bloqueios-atualizados", "ph10:agenda-config-atualizada"];
    eventos.forEach((evento) => window.addEventListener(evento, carregar));
    return () => {
      ativo = false;
      eventos.forEach((evento) => window.removeEventListener(evento, carregar));
    };
  }, []);

  useEffect(() => {
    const intervalo = window.setInterval(() => setAgoraRemarcacao(Date.now()), 60_000);
    return () => window.clearInterval(intervalo);
  }, []);

  useEffect(() => {
    function fecharComEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModalHorariosAberto(false);
        setModalBloqueioAberto(false);
        setConflitosBloqueio([]);
        setAgendamentoRemarcar(null);
        setAgendamentoEditarStatus(null);
        setConfirmacao(null);
      }
    }
    document.addEventListener("keydown", fecharComEsc);

    return () => {
      document.removeEventListener("keydown", fecharComEsc);
    };
  }, []);

  const agendamentosDoDia = useMemo(() => {
    return agendamentos
      .filter((item) => item.data === diaSelecionado)
      .map((item) => ({ ...item, status: obterStatusAtendimento(item, agoraRemarcacao) }))
      .sort((a, b) => a.hora.localeCompare(b.hora));
  }, [agendamentos, diaSelecionado, agoraRemarcacao]);

  const horariosRemarcacao = useMemo(() => {
    if (!agendamentoRemarcar || !novaData) return [];
    const dataEscolhida = new Date(`${novaData}T12:00:00`);
    const expediente = diasFuncionamento.find((item) => item.id === idsDosDias[dataEscolhida.getDay()]);
    if (!expediente?.ativo) return [];
    const intervalo = Number(configAgenda.intervalo);
    const duracao = agendamentoRemarcar.duracaoMinutos ?? intervalo;
    const limiteMinimo = agoraRemarcacao + Number(configAgenda.antecedenciaMinima) * 60 * 1000;
    const disponiveis: string[] = [];
    for (let atual = minutos(expediente.abertura); atual < minutos(expediente.fechamento); atual += intervalo) {
      const hora = `${String(Math.floor(atual / 60)).padStart(2, "0")}:${String(atual % 60).padStart(2, "0")}`;
      const fim = atual + duracao;
      const instante = new Date(`${novaData}T${hora}:00`).getTime();
      const sobrepoePausa = expediente.temPausa && intervalosSeSobrepoem(atual, fim, minutos(expediente.pausaInicio), minutos(expediente.pausaFim));
      const sobrepoeBloqueio = bloqueios.some((item) => item.data === novaData && intervalosSeSobrepoem(atual, fim, item.diaInteiro ? 0 : minutos(item.inicio), item.diaInteiro ? 24 * 60 : minutos(item.fim)));
      const sobrepoeReserva = agendamentos.some((item) => {
        if (item.id === agendamentoRemarcar.id || item.data !== novaData || !reservaEstaAtiva(item, agoraRemarcacao)) return false;
        const inicioExistente = minutos(item.hora);
        const fimExistente = inicioExistente + (item.duracaoMinutos ?? intervalo);
        return intervalosSeSobrepoem(atual, fim, inicioExistente, fimExistente);
      });
      if (fim <= minutos(expediente.fechamento) && instante >= limiteMinimo && !sobrepoePausa && !sobrepoeBloqueio && !sobrepoeReserva) disponiveis.push(hora);
    }
    return disponiveis;
  }, [agendamentoRemarcar, novaData, diasFuncionamento, configAgenda, agoraRemarcacao, bloqueios, agendamentos]);

  const reservasAtivasDoDia = agendamentosDoDia.filter((item) => reservaEstaAtiva(item, agoraRemarcacao));
  const reservasEncerradasDoDia = agendamentosDoDia.filter((item) => !reservaEstaAtiva(item, agoraRemarcacao));
  const totalReservasHoje = agendamentos
    .filter((item) => item.data === dataLocal())
    .map((item) => ({ ...item, status: obterStatusAtendimento(item, agoraRemarcacao) }))
    .filter((item) => item.status !== "Cancelado" && item.status !== "Não compareceu")
    .length;

  function atualizarDiaFuncionamento(
    id: string,
    campo: keyof DiaFuncionamento,
    valorAtualizado: string | boolean
  ) {
    setDiasFuncionamento((listaAtual) =>
      listaAtual.map((dia) =>
        dia.id === id ? { ...dia, [campo]: valorAtualizado } : dia
      )
    );
  }

  async function alterarStatusAtendimento(statusManual?: "Cancelado" | "Não compareceu", alvo = agendamentoEditarStatus) {
    if (!alvo) return;
    const novaLista = agendamentos.map((item) => {
      if (item.id !== alvo.id) return item;
      const statusAnterior = obterStatusAtendimento(item, agoraRemarcacao);
      const baseAtualizada = { ...item, statusManual };
      const statusNovo = obterStatusAtendimento(baseAtualizada, agoraRemarcacao);
      if (item.statusManual === statusManual) return { ...baseAtualizada, status: statusNovo };
      const tipo = statusManual === "Cancelado" ? "Cancelada" : statusManual === "Não compareceu" ? "Falta" : "Status alterado";
      const comAlteracao = registrarAlteracaoAgendamento(baseAtualizada, { tipo, origem: "Dono", statusAnterior, statusNovo });
      return { ...comAlteracao, status: statusNovo };
    });
    const atualizado = novaLista.find((item) => item.id === alvo.id);
    if (atualizado) await atualizarAgendamento(atualizado);
    setAgendamentos(novaLista);
    setAgendamentoEditarStatus(null);
  }

  async function salvarHorariosFuncionamento() {
    const erroConfiguracao = validarDiasFuncionamento(diasFuncionamento);
    if (erroConfiguracao) {
      setAviso({ titulo: "Confira os horários", descricao: erroConfiguracao });
      return;
    }

    try {
      setSalvandoConfiguracao(true);
      await atualizarAgendaSupabase(criarClienteSupabase(), { diasFuncionamento, configAgenda });
      window.dispatchEvent(new Event("ph10:agenda-config-atualizada"));
      setModalHorariosAberto(false);
      setAviso({ titulo: "Configurações salvas", descricao: "Os novos horários já estão disponíveis na página do cliente." });
    } catch {
      setAviso({ titulo: "Não foi possível salvar", descricao: "Confira sua conexão e tente novamente." });
    } finally {
      setSalvandoConfiguracao(false);
    }
  }

  function abrirBloqueio() {
    setBloqueioData(diaSelecionado);
    setBloqueioDiaInteiro(false);
    setBloqueioInicio("");
    setBloqueioFim("");
    setBloqueioMotivo("");
    setModalBloqueioAberto(true);
  }

  async function salvarBloqueio() {
    if (!bloqueioData || !bloqueioMotivo.trim() || (!bloqueioDiaInteiro && (!bloqueioInicio || !bloqueioFim))) {
      setAviso({ titulo: "Preencha o bloqueio", descricao: "Informe a data, o período e o motivo antes de continuar." });
      return;
    }
    const inicio = bloqueioDiaInteiro ? 0 : minutos(bloqueioInicio);
    const fim = bloqueioDiaInteiro ? 24 * 60 : minutos(bloqueioFim);
    if (fim <= inicio) { setAviso({ titulo: "Período inválido", descricao: "O horário final precisa ser posterior ao horário inicial." }); return; }

    const conflitos = agendamentos.filter((item) => {
      if (item.data !== bloqueioData || !reservaEstaAtiva(item, agoraRemarcacao)) return false;
      const inicioReserva = minutos(item.hora);
      const fimReserva = inicioReserva + (item.duracaoMinutos ?? Number(configAgenda.intervalo));
      return intervalosSeSobrepoem(inicio, fim, inicioReserva, fimReserva);
    });
    if (conflitos.length > 0) { setConflitosBloqueio(conflitos); return; }

    await criarBloqueioSupabase(criarClienteSupabase(), { data: bloqueioData, diaInteiro: bloqueioDiaInteiro, inicio: bloqueioDiaInteiro ? "00:00" : bloqueioInicio, fim: bloqueioDiaInteiro ? "23:59" : bloqueioFim, motivo: bloqueioMotivo.trim() });
    setBloqueios(await buscarBloqueios(criarClienteSupabase()));
    setDiaSelecionado(bloqueioData);
    setModalBloqueioAberto(false);
  }

  async function removerBloqueio(id: string) {
    await excluirBloqueioSupabase(criarClienteSupabase(), id);
    setBloqueios((lista) => lista.filter((item) => item.id !== id));
  }

  function executarConfirmacao() {
    if (!confirmacao) return;
    if (confirmacao.tipo === "remover-bloqueio") removerBloqueio(confirmacao.bloqueio.id);
    else alterarStatusAtendimento(confirmacao.status, confirmacao.item);
    setConfirmacao(null);
  }

  function abrirRemarcacao(item: Agendamento) {
    setAgendamentoRemarcar(item);
    setNovaData(item.data);
    setNovoHorario("");
  }

  function perguntarSobreRemarcacao() {
    if (!agendamentoRemarcar) return;
    const dataAtual = agendamentoRemarcar.data.split("-").reverse().join("/");
    const mensagem = encodeURIComponent(`Olá, ${agendamentoRemarcar.cliente}! Tudo bem? Vou precisar ajustar seu horário na PH10, marcado para o dia ${dataAtual} às ${agendamentoRemarcar.hora}. Qual dia e horário seriam melhores para você? Pode me enviar algumas opções para eu conferir a disponibilidade?`);
    const numero = agendamentoRemarcar.whatsapp.replace(/\D/g, "");
    const numeroCompleto = numero.startsWith("55") ? numero : `55${numero}`;
    window.open(`https://wa.me/${numeroCompleto}?text=${mensagem}`, "_blank", "noopener,noreferrer");
  }

  async function concluirRemarcacao() {
    if (!agendamentoRemarcar || !novaData || !novoHorario) { setAviso({ titulo: "Escolha um horário", descricao: "Informe a nova data e o novo horário para concluir a remarcação." }); return; }
    const anterior = agendamentoRemarcar;
    const novaLista = agendamentos.map((item) => {
      if (item.id !== anterior.id) return item;
      const atualizado = registrarAlteracaoAgendamento(
        { ...item, data: novaData, hora: novoHorario },
        { tipo: "Remarcada", origem: "Dono", dataAnterior: item.data, horaAnterior: item.hora, dataNova: novaData, horaNova: novoHorario }
      );
      return { ...atualizado, status: obterStatusAtendimento(atualizado, agoraRemarcacao) };
    });
    const atualizado = novaLista.find((item) => item.id === anterior.id);
    if (atualizado) await atualizarAgendamento(atualizado);
    setAgendamentos(novaLista);
    setDiaSelecionado(novaData);
    setAgendamentoRemarcar(null);

  }

  return (
    <main className="app-page">
      <div className="page-wrap">
        <header className="hero-panel">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-400">
            PH10
          </p>

          <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-black">Agenda</h1>
              <p className="mt-1 text-sm text-neutral-400">
                Pedro Henrique • controle do dia
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
              <button
                type="button"
                onClick={() => {
                  setDiaExpandido(null);
                  setModalHorariosAberto(true);
                }}
                className="rounded-2xl bg-amber-400 px-4 py-3 text-xs font-black text-neutral-950"
              >
                Configurar
              </button>
              <button
                type="button"
                onClick={abrirBloqueio}
                className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs font-black text-amber-300"
              >
                Bloquear período
              </button>
            </div>
          </div>
        </header>

        <div className="mt-5 flex items-center gap-2 border-b border-white/10 pb-4 text-sm text-neutral-400"><span className="h-2 w-2 rounded-full bg-amber-400" /><span>Total de reservas para hoje:</span><strong className="text-white">{totalReservasHoje}</strong></div>

        <section className="mt-6">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
            {dias.map((dia) => {
              const lista = agendamentos
                .filter((a) => a.data === dia.data)
                .map((a) => ({ ...a, status: obterStatusAtendimento(a, agoraRemarcacao) }));
              const reservasContabilizadas = lista
                .filter((a) => a.status !== "Cancelado" && a.status !== "Não compareceu");
              const previsto = reservasContabilizadas
                .reduce((total, a) => total + a.valor, 0);

              const ativo = dia.data === diaSelecionado;

              return (
                <button
                  key={dia.data}
                  type="button"
                  onClick={() => setDiaSelecionado(dia.data)}
                  className={`min-w-[80px] rounded-2xl border px-2 py-2.5 text-center ${
                    ativo
                      ? "border-amber-400 bg-amber-400 text-neutral-950"
                      : "border-white/10 bg-neutral-900 text-white"
                  }`}
                >
                  <span className="text-[11px] font-bold">{dia.semana}</span>
                  <strong className="block text-2xl leading-tight">{dia.dia}</strong>
                  <p className="mt-1 text-[10px] leading-tight opacity-70">
                    {reservasContabilizadas.length} reserva(s)
                  </p>
                  <p className="mt-1 text-[10px] font-black">
                    {dinheiro(previsto)}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-5 space-y-3">
          <div className="pb-1"><p className="text-xs font-black uppercase tracking-[.18em] text-amber-400">Agenda do dia</p><h2 className="mt-1 text-xl font-black">Próximos atendimentos</h2></div>
          {bloqueios.filter((item) => item.data === diaSelecionado).map((bloqueio) => (
            <article key={bloqueio.id} className="rounded-[1.75rem] border border-amber-400/20 bg-amber-400/5 p-4">
              <div className="flex items-center justify-between gap-4">
                <div><p className="text-xs font-black uppercase tracking-wider text-amber-400">Horário bloqueado</p><h3 className="mt-1 font-black">{bloqueio.motivo}</h3><p className="mt-1 text-sm text-neutral-400">{bloqueio.diaInteiro ? "Dia inteiro" : `${bloqueio.inicio} às ${bloqueio.fim}`}</p></div>
                <button type="button" onClick={() => setConfirmacao({ tipo: "remover-bloqueio", bloqueio })} className="rounded-2xl bg-red-500/10 px-3 py-3 text-xs font-black text-red-300">Remover</button>
              </div>
            </article>
          ))}
          {reservasAtivasDoDia.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-neutral-900 p-6 text-center">
              <p className="text-lg font-black">{agendamentosDoDia.length > 0 ? "Atendimentos do dia encerrados" : "Agenda vazia"}</p>
              <p className="mt-2 text-sm text-neutral-400">
                {agendamentosDoDia.length > 0 ? "Não há reservas para as próximas horas." : "Nenhum cliente marcado para esse dia."}
              </p>
            </div>
          ) : (
            reservasAtivasDoDia.map((item) => <AppointmentCard key={item.id} item={item} ativo={reservaEstaAtiva(item, agoraRemarcacao)} whatsappHref={whatsappLink(item)} onRemarcar={abrirRemarcacao} onEditarStatus={setAgendamentoEditarStatus} />)
          )}
        </section>

        {reservasEncerradasDoDia.length > 0 && <section className="mt-8 border-t border-white/10 pt-6"><div className="mb-3"><p className="text-xs font-black uppercase tracking-[.18em] text-neutral-500">Encerrados</p><h2 className="mt-1 text-xl font-black text-neutral-300">Atendimentos encerrados</h2></div><div className="space-y-3">{reservasEncerradasDoDia.map((item) => <AppointmentCard key={item.id} item={item} ativo={false} encerrado whatsappHref={whatsappLink(item)} onRemarcar={abrirRemarcacao} onEditarStatus={setAgendamentoEditarStatus} />)}</div></section>}
      </div>

      {agendamentoEditarStatus && (
        <div onClick={() => setAgendamentoEditarStatus(null)} className="fixed inset-0 z-[240] flex items-center justify-center bg-black/75 p-4">
          <div onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-[2rem] bg-neutral-900 p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">Editar status</h2><p className="mt-1 text-sm text-neutral-400">{agendamentoEditarStatus.cliente} • {agendamentoEditarStatus.hora}</p></div><button type="button" onClick={() => setAgendamentoEditarStatus(null)} className="rounded-full bg-white/10 px-3 py-2 font-black">×</button></div>
            <p className="mt-5 text-xs font-bold uppercase tracking-wider text-neutral-500">Status atual</p><div className={`mt-2 inline-flex rounded-full px-3 py-2 text-xs font-black ${statusClass(obterStatusAtendimento(agendamentoEditarStatus, agoraRemarcacao))}`}>{obterStatusAtendimento(agendamentoEditarStatus, agoraRemarcacao)}</div>
            <div className="mt-5 space-y-2"><button type="button" onClick={() => alterarStatusAtendimento(undefined)} className="w-full rounded-2xl bg-white/10 p-4 text-left"><p className="font-black">Usar status automático</p><p className="mt-1 text-xs text-neutral-400">O sistema calcula pelo horário do atendimento.</p></button><button type="button" onClick={() => setConfirmacao({ tipo: "status", status: "Não compareceu", item: agendamentoEditarStatus })} className="w-full rounded-2xl bg-red-500/10 p-4 text-left text-red-200"><p className="font-black">Cliente não compareceu</p><p className="mt-1 text-xs opacity-70">Mantém a reserva no histórico.</p></button><button type="button" onClick={() => setConfirmacao({ tipo: "status", status: "Cancelado", item: agendamentoEditarStatus })} className="w-full rounded-2xl bg-red-500/10 p-4 text-left text-red-200"><p className="font-black">Atendimento cancelado</p><p className="mt-1 text-xs opacity-70">Libera o horário e preserva o registro.</p></button></div>
          </div>
        </div>
      )}

      {agendamentoRemarcar && (
        <div onClick={() => setAgendamentoRemarcar(null)} className="fixed inset-0 z-[220] flex items-center justify-center bg-black/75 p-4">
          <div onClick={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-neutral-900 p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">Remarcar horário</h2><p className="mt-1 text-sm text-neutral-400">{agendamentoRemarcar.cliente} • {agendamentoRemarcar.servico}</p></div><button type="button" onClick={() => setAgendamentoRemarcar(null)} className="rounded-full bg-white/10 px-3 py-2 font-black">×</button></div>
            <div className="mt-5 rounded-2xl bg-neutral-950 p-4"><p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Horário atual</p><p className="mt-2 font-black">{agendamentoRemarcar.data.split("-").reverse().join("/")} às {agendamentoRemarcar.hora}</p></div>
            <div className="mt-4 rounded-2xl border border-green-500/20 bg-green-500/5 p-4"><p className="text-sm font-black">1. Consulte o cliente primeiro</p><p className="mt-1 text-xs leading-relaxed text-neutral-400">A reserva atual permanece intacta enquanto vocês combinam uma nova opção.</p><button type="button" onClick={perguntarSobreRemarcacao} className="mt-3 w-full rounded-2xl bg-green-500 px-4 py-3 text-sm font-black text-white">Perguntar pelo WhatsApp</button></div>
            <div className="mt-5 border-t border-white/10 pt-5"><p className="text-sm font-black">2. Remarque após a resposta</p><p className="mt-1 text-xs text-neutral-400">Como é uma ação do dono, você pode escolher qualquer data futura.</p></div>
            <label className="mt-4 block"><span className="text-xs font-bold text-neutral-400">Nova data</span><input type="date" min={dataLocal()} value={novaData} onChange={(event) => { setNovaData(event.target.value); setNovoHorario(""); }} className="mt-2 w-full rounded-2xl bg-neutral-950 px-4 py-4 outline-none focus:ring-2 focus:ring-amber-400" /></label>
            <div className="mt-5"><p className="text-xs font-bold text-neutral-400">Horários disponíveis</p>{horariosRemarcacao.length === 0 ? <p className="mt-3 rounded-2xl bg-neutral-950 p-4 text-center text-sm text-neutral-500">Nenhum horário disponível nessa data.</p> : <div className="mt-3 grid grid-cols-3 gap-2">{horariosRemarcacao.map((hora) => <button key={hora} type="button" onClick={() => setNovoHorario(hora)} className={`rounded-2xl border py-3 text-sm font-black ${novoHorario === hora ? "border-amber-400 bg-amber-400 text-neutral-950" : "border-white/10 bg-neutral-950"}`}>{hora}</button>)}</div>}</div>
            <p className="mt-4 text-xs leading-relaxed text-neutral-400">A reserva só será alterada quando você confirmar abaixo.</p>
            <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setAgendamentoRemarcar(null)} className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black">Cancelar</button><button type="button" onClick={concluirRemarcacao} className="rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950">Confirmar remarcação</button></div>
          </div>
        </div>
      )}

      {modalBloqueioAberto && (
        <div onClick={() => setModalBloqueioAberto(false)} className="safe-modal-shell fixed inset-0 z-[210] flex items-center justify-center bg-black/70">
          <div onClick={(event) => event.stopPropagation()} className="safe-modal-card w-full max-w-md rounded-[2rem] bg-neutral-900 p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">Bloquear período</h2><p className="mt-1 text-sm text-neutral-400">O período deixará de aparecer para os clientes.</p></div><button type="button" onClick={() => setModalBloqueioAberto(false)} className="rounded-full bg-white/10 px-3 py-2 text-sm font-black">×</button></div>
            <div className="mt-5 space-y-3">
              <label className="block"><span className="text-xs font-bold text-neutral-400">Data</span><input type="date" value={bloqueioData} onChange={(event) => setBloqueioData(event.target.value)} className="mt-2 w-full rounded-2xl bg-neutral-950 px-4 py-4 outline-none focus:ring-2 focus:ring-amber-400" /></label>
              <button type="button" onClick={() => setBloqueioDiaInteiro((atual) => !atual)} className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left ${bloqueioDiaInteiro ? "border-amber-400 bg-amber-400 text-neutral-950" : "border-white/10 bg-neutral-950"}`}><span className="font-black">Bloquear o dia inteiro</span><span>{bloqueioDiaInteiro ? "✓" : ""}</span></button>
              {!bloqueioDiaInteiro && <div className="mobile-form-grid gap-3"><label className="min-w-0"><span className="text-xs font-bold text-neutral-400">Início</span><input type="time" value={bloqueioInicio} onChange={(event) => setBloqueioInicio(event.target.value)} className="mt-2 block w-full min-w-0 rounded-2xl bg-neutral-950 px-3 py-4 outline-none focus:ring-2 focus:ring-amber-400" /></label><label className="min-w-0"><span className="text-xs font-bold text-neutral-400">Fim</span><input type="time" value={bloqueioFim} onChange={(event) => setBloqueioFim(event.target.value)} className="mt-2 block w-full min-w-0 rounded-2xl bg-neutral-950 px-3 py-4 outline-none focus:ring-2 focus:ring-amber-400" /></label></div>}
              <label className="block"><span className="text-xs font-bold text-neutral-400">Motivo</span><input value={bloqueioMotivo} onChange={(event) => setBloqueioMotivo(event.target.value)} placeholder="Ex: Consulta médica" className="mt-2 w-full rounded-2xl bg-neutral-950 px-4 py-4 outline-none focus:ring-2 focus:ring-amber-400" /></label>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setModalBloqueioAberto(false)} className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black">Cancelar</button><button type="button" onClick={salvarBloqueio} className="rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950">Criar bloqueio</button></div>
          </div>
        </div>
      )}

      {conflitosBloqueio.length > 0 && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-neutral-900 p-6 text-center text-white shadow-2xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-500/10 text-2xl">!</div><h2 className="mt-4 text-2xl font-black">Há clientes nesse período</h2><p className="mt-2 text-sm text-neutral-400">Cancele as reservas abaixo antes de bloquear o horário.</p><div className="mt-4 space-y-2 text-left">{conflitosBloqueio.map((item) => <div key={item.id} className="rounded-2xl bg-neutral-950 p-3"><p className="font-black">{item.hora} • {item.cliente}</p><p className="mt-1 text-xs text-neutral-400">{item.servico}</p></div>)}</div><button type="button" onClick={() => { setConflitosBloqueio([]); setModalBloqueioAberto(false); setDiaSelecionado(bloqueioData); }} className="mt-5 w-full rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950">Ir para a agenda</button></div>
        </div>
      )}

      {modalHorariosAberto && (
        <div
          onClick={() => setModalHorariosAberto(false)}
          className="safe-modal-shell fixed inset-0 z-[200] flex items-end justify-center bg-black/70 lg:items-center"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="safe-modal-card w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-neutral-900 p-5 text-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">
                  Horários de funcionamento
                </h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Esses horários vão definir a disponibilidade do cliente.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalHorariosAberto(false)}
                className="rounded-full bg-white/10 px-3 py-2 text-sm font-black"
              >
                ✕
              </button>
            </div>

            <section className="mt-5 rounded-3xl bg-neutral-950 p-4">
              <h3 className="text-lg font-black">Regras da agenda</h3>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-bold text-neutral-400">
                    Intervalo
                  </span>

                  <select
                    value={configAgenda.intervalo}
                    onChange={(event) =>
                      setConfigAgenda((atual) => ({
                        ...atual,
                        intervalo: event.target
                          .value as ConfigAgenda["intervalo"],
                      }))
                    }
                    className="mt-2 w-full rounded-2xl bg-neutral-900 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="15">15 minutos</option>
                    <option value="30">30 minutos</option>
                    <option value="45">45 minutos</option>
                    <option value="60">1 hora</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-bold text-neutral-400">
                    Antecedência mínima
                  </span>

                  <select
                    value={configAgenda.antecedenciaMinima}
                    onChange={(event) =>
                      setConfigAgenda((atual) => ({
                        ...atual,
                        antecedenciaMinima: event.target
                          .value as ConfigAgenda["antecedenciaMinima"],
                      }))
                    }
                    className="mt-2 w-full rounded-2xl bg-neutral-900 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {opcoesAntecedencia.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-bold text-neutral-400">
                    Janela de atendimento
                  </span>

                  <select
                    value={configAgenda.diasParaAgendar}
                    onChange={(event) =>
                      setConfigAgenda((atual) => ({
                        ...atual,
                        diasParaAgendar: event.target
                          .value as ConfigAgenda["diasParaAgendar"],
                      }))
                    }
                    className="mt-2 w-full rounded-2xl bg-neutral-900 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="7">7 dias</option>
                    <option value="15">15 dias</option>
                    <option value="30">30 dias</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="mt-4 space-y-3">
              {diasFuncionamento.map((dia) => (
                <article
                  key={dia.id}
                  className="rounded-3xl bg-neutral-950 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => setDiaExpandido((atual) => atual === dia.id ? null : dia.id)}
                      className="flex flex-1 items-center justify-between gap-3 text-left"
                    >
                    <div>
                      <h3 className="font-black">{dia.nome}</h3>
                      <p className="mt-1 text-xs text-neutral-400">
                        {dia.ativo
                          ? `${dia.abertura} às ${dia.fechamento}`
                          : "Fechado"}
                      </p>
                    </div>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-neutral-300 shadow-inner">
                      <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-4 w-4 transition-transform duration-200 ${diaExpandido === dia.id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 7.5 5 5 5-5" />
                      </svg>
                    </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        atualizarDiaFuncionamento(
                          dia.id,
                          "ativo",
                          !dia.ativo
                        )
                      }
                      className={`rounded-full px-4 py-2 text-xs font-black ${
                        dia.ativo
                          ? "bg-green-500/10 text-green-300"
                          : "bg-red-500/10 text-red-300"
                      }`}
                    >
                      {dia.ativo ? "Aberto" : "Fechado"}
                    </button>
                  </div>

                  {dia.ativo && diaExpandido === dia.id && (
                    <div className="mt-4 space-y-3">
                      <div className="mobile-form-grid gap-3">
                        <label className="block min-w-0">
                          <span className="text-xs font-bold text-neutral-400">
                            Abertura
                          </span>

                          <input
                            type="time"
                            value={dia.abertura}
                            onChange={(event) =>
                              atualizarDiaFuncionamento(
                                dia.id,
                                "abertura",
                                event.target.value
                              )
                            }
                            className="mt-2 block w-full min-w-0 rounded-2xl bg-neutral-900 px-3 py-4 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                          />
                        </label>

                        <label className="block min-w-0">
                          <span className="text-xs font-bold text-neutral-400">
                            Fechamento
                          </span>

                          <input
                            type="time"
                            value={dia.fechamento}
                            onChange={(event) =>
                              atualizarDiaFuncionamento(
                                dia.id,
                                "fechamento",
                                event.target.value
                              )
                            }
                            className="mt-2 block w-full min-w-0 rounded-2xl bg-neutral-900 px-3 py-4 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                          />
                        </label>
                      </div>

                      <div className="rounded-2xl bg-neutral-900 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-black">Pausa/almoço</p>
                            <p className="mt-1 text-xs text-neutral-400">
                              Bloqueia horários durante esse período.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              atualizarDiaFuncionamento(
                                dia.id,
                                "temPausa",
                                !dia.temPausa
                              )
                            }
                            className={`rounded-full px-4 py-2 text-xs font-black ${
                              dia.temPausa
                                ? "bg-amber-400 text-neutral-950"
                                : "bg-white/10 text-white"
                            }`}
                          >
                            {dia.temPausa ? "Ativa" : "Sem pausa"}
                          </button>
                        </div>

                        {dia.temPausa && (
                          <div className="mobile-form-grid mt-4 gap-3">
                            <label className="block min-w-0">
                              <span className="text-xs font-bold text-neutral-400">
                                Início
                              </span>

                              <input
                                type="time"
                                value={dia.pausaInicio}
                                onChange={(event) =>
                                  atualizarDiaFuncionamento(
                                    dia.id,
                                    "pausaInicio",
                                    event.target.value
                                  )
                                }
                                className="mt-2 block w-full min-w-0 rounded-2xl bg-neutral-950 px-3 py-4 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                              />
                            </label>

                            <label className="block min-w-0">
                              <span className="text-xs font-bold text-neutral-400">
                                Fim
                              </span>

                              <input
                                type="time"
                                value={dia.pausaFim}
                                onChange={(event) =>
                                  atualizarDiaFuncionamento(
                                    dia.id,
                                    "pausaFim",
                                    event.target.value
                                  )
                                }
                                className="mt-2 block w-full min-w-0 rounded-2xl bg-neutral-950 px-3 py-4 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </section>

            <div className="sticky bottom-0 -mx-5 mt-5 bg-neutral-900/95 px-5 pb-1 pt-4 backdrop-blur">
              <button
                type="button"
                onClick={salvarHorariosFuncionamento}
                disabled={salvandoConfiguracao}
                className="w-full rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvandoConfiguracao ? "Salvando..." : "Salvar configurações"}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        aberto={Boolean(confirmacao)}
        titulo={confirmacao?.tipo === "remover-bloqueio" ? "Remover bloqueio?" : confirmacao?.status === "Cancelado" ? "Cancelar atendimento?" : "Marcar como falta?"}
        descricao={confirmacao?.tipo === "remover-bloqueio" ? `O período de ${confirmacao.bloqueio.inicio} às ${confirmacao.bloqueio.fim} voltará a ficar disponível para reservas.` : confirmacao?.status === "Cancelado" ? "O horário será liberado, mas o atendimento continuará registrado no histórico." : "O atendimento será encerrado como não compareceu e permanecerá no histórico."}
        confirmarTexto={confirmacao?.tipo === "remover-bloqueio" ? "Remover" : "Confirmar"}
        onConfirmar={executarConfirmacao}
        onFechar={() => setConfirmacao(null)}
      />
      {aviso && <NoticeDialog titulo={aviso.titulo} descricao={aviso.descricao} onFechar={() => setAviso(null)} />}
    </main>
  );
}
function minutos(hora: string) { const [h, m] = hora.split(":").map(Number); return h * 60 + m; }
