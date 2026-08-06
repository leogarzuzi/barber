export const AGENDAMENTOS_KEY = "ph10:agendamentos";
export const SERVICOS_KEY = "ph10:servicos";
export const COMBOS_KEY = "ph10:combos";
export const AGENDA_CONFIG_KEY = "ph10:configuracao-agenda";
export const BLOQUEIOS_KEY = "ph10:bloqueios";
export const CLIENTES_KEY = "ph10:clientes";
export const PERFIL_KEY = "ph10:perfil";

export type Servico = { id: string; nome: string; valor: number; status: "Ativo" | "Inativo" };
export type Combo = { id: string; nome: string; servicosIds: string[]; valor: number; descontoPercentual?: number; status: "Ativo" | "Inativo" };
export type DiaFuncionamento = { id: string; nome: string; curto: string; ativo: boolean; abertura: string; fechamento: string; temPausa: boolean; pausaInicio: string; pausaFim: string };
export type ConfigAgenda = { intervalo: "15" | "30" | "45" | "60"; antecedenciaMinima: string; diasParaAgendar: "7" | "15" | "30" };
export type ConfiguracaoAgenda = { diasFuncionamento: DiaFuncionamento[]; configAgenda: ConfigAgenda };
export type PerfilBarbearia = {
  nome: string;
  subtitulo: string;
  responsavel: string;
  whatsapp: string;
  endereco: string;
  foto: string;
};
export type BloqueioAgenda = { id: string; data: string; diaInteiro: boolean; inicio: string; fim: string; motivo: string };
export type Cliente = {
  id: string;
  nome: string;
  whatsapp: string;
  email?: string;
  mensalista: boolean;
  mensalidade: number;
  criadoEm: string;
  atualizadoEm: string;
};
export type AlteracaoAgendamento = {
  id: string;
  tipo: "Criada" | "Remarcada" | "Cancelada" | "Falta" | "Status alterado";
  origem: "Cliente" | "Dono";
  realizadaEm: string;
  dataAnterior?: string;
  horaAnterior?: string;
  dataNova?: string;
  horaNova?: string;
  statusAnterior?: string;
  statusNovo?: string;
};

export type Agendamento = {
  id: string;
  data: string;
  hora: string;
  cliente: string;
  servico: string;
  valor: number;
  cobertoPorMensalidade?: boolean;
  whatsapp: string;
  duracaoMinutos?: number;
  codigo?: string;
  historicoAlteracoes?: AlteracaoAgendamento[];
  statusManual?: "Cancelado" | "Não compareceu";
};

export type StatusAtendimento = "Agendado" | "Em atendimento" | "Concluído" | "Cancelado" | "Não compareceu";

export function obterStatusAtendimento(agendamento: Agendamento, agora: number): StatusAtendimento {
  if (agendamento.statusManual) return agendamento.statusManual;
  const inicio = new Date(`${agendamento.data}T${agendamento.hora}:00`).getTime();
  const fim = inicio + (agendamento.duracaoMinutos ?? 30) * 60 * 1000;
  if (agora < inicio) return "Agendado";
  if (agora < fim) return "Em atendimento";
  return "Concluído";
}

export function reservaEstaAtiva(agendamento: Agendamento, agora: number) {
  const status = obterStatusAtendimento(agendamento, agora);
  return status === "Agendado" || status === "Em atendimento";
}

export function carregarAgendamentos(): Agendamento[] {
  if (typeof window === "undefined") return [];

  try {
    const dados = window.localStorage.getItem(AGENDAMENTOS_KEY);
    return dados ? (JSON.parse(dados) as Agendamento[]) : [];
  } catch {
    return [];
  }
}

export function salvarAgendamentos(agendamentos: Agendamento[]) {
  window.localStorage.setItem(AGENDAMENTOS_KEY, JSON.stringify(agendamentos));
  window.dispatchEvent(new Event("ph10:agendamentos-atualizados"));
}

export function registrarAlteracaoAgendamento(
  agendamento: Agendamento,
  alteracao: Omit<AlteracaoAgendamento, "id" | "realizadaEm">
) {
  const novaAlteracao: AlteracaoAgendamento = {
    ...alteracao,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    realizadaEm: new Date().toISOString(),
  };
  return { ...agendamento, historicoAlteracoes: [...(agendamento.historicoAlteracoes ?? []), novaAlteracao] };
}

function carregarLista<T>(chave: string): T[] {
  if (typeof window === "undefined") return [];
  try { const dados = localStorage.getItem(chave); return dados ? JSON.parse(dados) : []; } catch { return []; }
}

export const carregarServicos = () => carregarLista<Servico>(SERVICOS_KEY);
export const carregarCombos = () => carregarLista<Combo>(COMBOS_KEY);
export const carregarBloqueios = () => carregarLista<BloqueioAgenda>(BLOQUEIOS_KEY);
export const carregarClientes = () => carregarLista<Cliente>(CLIENTES_KEY);
export function salvarServicos(servicos: Servico[]) {
  localStorage.setItem(SERVICOS_KEY, JSON.stringify(servicos));
  window.dispatchEvent(new Event("ph10:servicos-atualizados"));
}
export function salvarCombos(combos: Combo[]) {
  localStorage.setItem(COMBOS_KEY, JSON.stringify(combos));
  window.dispatchEvent(new Event("ph10:combos-atualizados"));
}
export function salvarBloqueios(bloqueios: BloqueioAgenda[]) {
  localStorage.setItem(BLOQUEIOS_KEY, JSON.stringify(bloqueios));
  window.dispatchEvent(new Event("ph10:bloqueios-atualizados"));
}
export function salvarClientes(clientes: Cliente[]) {
  localStorage.setItem(CLIENTES_KEY, JSON.stringify(clientes));
  window.dispatchEvent(new Event("ph10:clientes-atualizados"));
}

export function normalizarWhatsapp(whatsapp: string) {
  const digitos = whatsapp.replace(/\D/g, "");
  if (digitos.startsWith("55")) return digitos;
  if (digitos.startsWith("21")) return `55${digitos}`;
  return `5521${digitos}`;
}

export function cadastrarOuAtualizarCliente(nome: string, whatsapp: string) {
  const clientes = carregarClientes();
  const numero = normalizarWhatsapp(whatsapp);
  const agora = new Date().toISOString();
  const existente = clientes.find((cliente) => normalizarWhatsapp(cliente.whatsapp) === numero);

  if (existente) {
    const atualizado = { ...existente, nome: nome.trim(), whatsapp: numero, atualizadoEm: agora };
    salvarClientes(clientes.map((cliente) => cliente.id === existente.id ? atualizado : cliente));
    return atualizado;
  }

  const novo: Cliente = { id: crypto.randomUUID(), nome: nome.trim(), whatsapp: numero, mensalista: false, mensalidade: 160, criadoEm: agora, atualizadoEm: agora };
  salvarClientes([novo, ...clientes]);
  return novo;
}
export function carregarConfiguracaoAgenda(): ConfiguracaoAgenda | null {
  if (typeof window === "undefined") return null;
  try { const dados = localStorage.getItem(AGENDA_CONFIG_KEY); return dados ? JSON.parse(dados) : null; } catch { return null; }
}
export function salvarConfiguracaoAgenda(configuracao: ConfiguracaoAgenda) {
  localStorage.setItem(AGENDA_CONFIG_KEY, JSON.stringify(configuracao));
  window.dispatchEvent(new Event("ph10:agenda-config-atualizada"));
}

export const perfilInicial: PerfilBarbearia = {
  nome: "Barbearia PH10",
  subtitulo: "Estúdio masculino",
  responsavel: "Pedro Henrique",
  whatsapp: "5521994073006",
  endereco: "",
  foto: "",
};

export function carregarPerfil(): PerfilBarbearia {
  if (typeof window === "undefined") return perfilInicial;
  try {
    const dados = localStorage.getItem(PERFIL_KEY);
    return dados ? { ...perfilInicial, ...(JSON.parse(dados) as Partial<PerfilBarbearia>) } : perfilInicial;
  } catch {
    return perfilInicial;
  }
}

export function salvarPerfil(perfil: PerfilBarbearia) {
  localStorage.setItem(PERFIL_KEY, JSON.stringify(perfil));
  window.dispatchEvent(new Event("ph10:perfil-atualizado"));
}

export function dataLocal(data = new Date()) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function proximosDias(quantidade = 7) {
  return Array.from({ length: quantidade }, (_, indice) => {
    const data = new Date();
    data.setHours(12, 0, 0, 0);
    data.setDate(data.getDate() + indice);

    return {
      data: dataLocal(data),
      semana: new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
        .format(data)
        .replace(".", ""),
      dia: String(data.getDate()).padStart(2, "0"),
    };
  });
}
