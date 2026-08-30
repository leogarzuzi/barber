/**
 * Compara períodos no formato [início, fim), permitindo que um atendimento
 * comece exatamente quando o anterior termina.
 * @param {number} inicioA
 * @param {number} fimA
 * @param {number} inicioB
 * @param {number} fimB
 */
export function intervalosSeSobrepoem(inicioA, fimA, inicioB, fimB) {
  return inicioA < fimB && fimA > inicioB;
}

const antecedenciasPermitidas = [15, 30, 45, 60, 120, 180];

/**
 * Mantém a antecedência em uma das opções oferecidas no painel. Valores antigos
 * acima de 3 horas são limitados a 3 horas.
 * @param {number | string} valor
 */
export function normalizarAntecedenciaMinutos(valor) {
  const minutos = Number(valor);
  if (!Number.isFinite(minutos)) return 60;
  return antecedenciasPermitidas.find((opcao) => minutos <= opcao) ?? 180;
}

/**
 * @param {{ mensalista: boolean, datasAtivas: string[], novaData: string }} dados
 * @returns {"reserva-existente" | "limite-mensalista" | "mesmo-dia" | null}
 */
export function validarLimiteReservasCliente({ mensalista, datasAtivas, novaData }) {
  if (!mensalista) return datasAtivas.length > 0 ? "reserva-existente" : null;
  if (datasAtivas.length >= 4) return "limite-mensalista";
  if (datasAtivas.includes(novaData)) return "mesmo-dia";
  return null;
}

/**
 * @param {{
 *   reserva?: { data: string, hora: string, statusManual?: string } | null,
 *   acao: "cancelar" | "remarcar",
 *   dataNova?: string,
 *   horaNova?: string,
 *   agora: number,
 *   antecedenciaMinimaMs?: number,
 * }} dados
 * @returns {"alteracao-nao-permitida" | "novo-horario-invalido" | "mesmo-horario" | null}
 */
export function validarAlteracaoReservaCliente({ reserva, acao, dataNova, horaNova, agora, antecedenciaMinimaMs = 2 * 3600000 }) {
  if (!reserva?.data || !reserva?.hora || reserva.statusManual) return "alteracao-nao-permitida";
  if (new Date(`${reserva.data}T${reserva.hora}:00-03:00`).getTime() - agora < antecedenciaMinimaMs) return "alteracao-nao-permitida";
  if (acao === "remarcar") {
    if (!dataNova || !horaNova) return "novo-horario-invalido";
    if (reserva.data === dataNova && reserva.hora === horaNova) return "mesmo-horario";
  }
  return null;
}

/** @param {string} hora */
function minutos(hora) {
  const [horas, minutosHora] = hora.split(":").map(Number);
  return horas * 60 + minutosHora;
}

/**
 * @param {Array<{ nome: string, ativo: boolean, abertura: string, fechamento: string, temPausa: boolean, pausaInicio: string, pausaFim: string }>} diasFuncionamento
 */
export function validarDiasFuncionamento(diasFuncionamento) {
  for (const dia of diasFuncionamento.filter((item) => item.ativo)) {
    if (!dia.abertura || !dia.fechamento) return `Preencha a abertura e o fechamento de ${dia.nome}.`;
    const abertura = minutos(dia.abertura);
    const fechamento = minutos(dia.fechamento);
    if (abertura >= fechamento) return `Em ${dia.nome}, a abertura precisa ser anterior ao fechamento.`;
    if (!dia.temPausa) continue;
    if (!dia.pausaInicio || !dia.pausaFim) return `Preencha o início e o fim da pausa de ${dia.nome}.`;
    const pausaInicio = minutos(dia.pausaInicio);
    const pausaFim = minutos(dia.pausaFim);
    if (pausaInicio >= pausaFim) return `Em ${dia.nome}, o início da pausa precisa ser anterior ao fim.`;
    if (pausaInicio < abertura || pausaFim > fechamento) return `Em ${dia.nome}, a pausa precisa ficar dentro do horário de funcionamento.`;
  }
  return null;
}
