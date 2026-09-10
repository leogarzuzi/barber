import {
  Agendamento,
  Cliente,
  obterStatusAtendimento,
  StatusAtendimento,
} from "@/lib/barber-storage";

export type ServicoNoResumo = {
  nome: string;
  quantidade: number;
  valor: number;
};

export type MensalistaNoResumo = Cliente & {
  atendimentos: number;
};

export type ResumoFinanceiroMensal = {
  mes: string;
  reservasDoMes: number;
  reservasValidas: number;
  realizados: number;
  agendados: number;
  emAtendimento: number;
  cancelados: number;
  faltas: number;
  clientesAtendidos: number;
  receitaAvulsa: number;
  receitaMensalidades: number;
  total: number;
  ticketMedioAvulso: number;
  reservasAvulsas: number;
  reservasMensalistas: number;
  mensalistas: MensalistaNoResumo[];
  servicos: ServicoNoResumo[];
};

function somenteDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

export function nomeDoMes(mes: string) {
  const formatado = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${mes}-01T12:00:00`));
  return formatado.charAt(0).toUpperCase() + formatado.slice(1);
}

export function calcularResumoFinanceiro(
  agendamentos: Agendamento[],
  clientes: Cliente[],
  mes: string,
  agora: number,
): ResumoFinanceiroMensal {
  const reservasDoMes = agendamentos.filter((item) => item.data.startsWith(mes));
  const porStatus = new Map<StatusAtendimento, Agendamento[]>([
    ["Agendado", []],
    ["Em atendimento", []],
    ["Concluído", []],
    ["Cancelado", []],
    ["Não compareceu", []],
  ]);

  for (const reserva of reservasDoMes) {
    porStatus.get(obterStatusAtendimento(reserva, agora))?.push(reserva);
  }

  const validas = reservasDoMes.filter((item) => {
    const status = obterStatusAtendimento(item, agora);
    return status !== "Cancelado" && status !== "Não compareceu";
  });
  const concluidas = porStatus.get("Concluído") ?? [];
  const mensalistas = clientes.filter((cliente) => cliente.mensalista);
  const avulsas = validas.filter((item) => !item.cobertoPorMensalidade);
  const receitaAvulsa = avulsas.reduce((total, item) => total + item.valor, 0);
  const receitaMensalidades = mensalistas.reduce((total, cliente) => total + cliente.mensalidade, 0);

  const atendimentosPorWhatsapp = new Map<string, number>();
  for (const reserva of validas.filter((item) => item.cobertoPorMensalidade)) {
    const whatsapp = somenteDigitos(reserva.whatsapp);
    atendimentosPorWhatsapp.set(whatsapp, (atendimentosPorWhatsapp.get(whatsapp) ?? 0) + 1);
  }

  const servicos = new Map<string, ServicoNoResumo>();
  for (const reserva of validas) {
    const atual = servicos.get(reserva.servico) ?? { nome: reserva.servico, quantidade: 0, valor: 0 };
    atual.quantidade += 1;
    if (!reserva.cobertoPorMensalidade) atual.valor += reserva.valor;
    servicos.set(reserva.servico, atual);
  }

  return {
    mes,
    reservasDoMes: reservasDoMes.length,
    reservasValidas: validas.length,
    realizados: concluidas.length,
    agendados: (porStatus.get("Agendado") ?? []).length,
    emAtendimento: (porStatus.get("Em atendimento") ?? []).length,
    cancelados: (porStatus.get("Cancelado") ?? []).length,
    faltas: (porStatus.get("Não compareceu") ?? []).length,
    clientesAtendidos: new Set(concluidas.map((item) => somenteDigitos(item.whatsapp))).size,
    receitaAvulsa,
    receitaMensalidades,
    total: receitaAvulsa + receitaMensalidades,
    ticketMedioAvulso: avulsas.length ? receitaAvulsa / avulsas.length : 0,
    reservasAvulsas: avulsas.length,
    reservasMensalistas: validas.filter((item) => item.cobertoPorMensalidade).length,
    mensalistas: mensalistas
      .map((cliente) => ({
        ...cliente,
        atendimentos: atendimentosPorWhatsapp.get(somenteDigitos(cliente.whatsapp)) ?? 0,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    servicos: [...servicos.values()].sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor),
  };
}
