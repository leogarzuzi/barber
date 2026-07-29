import type { SupabaseClient } from "@supabase/supabase-js";
import type { Agendamento, BloqueioAgenda, Cliente } from "@/lib/barber-storage";

function horaCurta(hora: string) { return hora.slice(0, 5); }

export async function buscarAgendamentos(supabase: SupabaseClient, data?: string) {
  let consulta = supabase.from("agendamentos").select("id, protocolo, cliente_nome, whatsapp, item_nome, data, hora, duracao_minutos, valor_centavos, status, historico").order("data", { ascending: false }).order("hora", { ascending: false });
  if (data) consulta = consulta.eq("data", data);
  const { data: linhas, error } = await consulta;
  if (error) throw error;
  return linhas.map<Agendamento>((item) => ({
    id: item.id,
    codigo: item.protocolo,
    cliente: item.cliente_nome,
    whatsapp: item.whatsapp,
    servico: item.item_nome,
    data: item.data,
    hora: horaCurta(item.hora),
    duracaoMinutos: item.duracao_minutos,
    valor: item.valor_centavos / 100,
    statusManual: item.status === "cancelado" ? "Cancelado" : item.status === "nao_compareceu" ? "Não compareceu" : undefined,
    historicoAlteracoes: Array.isArray(item.historico) ? item.historico : [],
  }));
}

export async function buscarBloqueios(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("bloqueios").select("id, data, dia_inteiro, inicio, fim, motivo").order("data");
  if (error) throw error;
  return data.map<BloqueioAgenda>((item) => ({ id: item.id, data: item.data, diaInteiro: item.dia_inteiro, inicio: item.inicio ? horaCurta(item.inicio) : "00:00", fim: item.fim ? horaCurta(item.fim) : "23:59", motivo: item.motivo }));
}

export async function buscarClientes(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("clientes").select("id, nome, whatsapp, email, criado_em, atualizado_em").order("atualizado_em", { ascending: false });
  if (error) throw error;
  return data.map<Cliente>((item) => ({ id: item.id, nome: item.nome, whatsapp: item.whatsapp, email: item.email ?? undefined, criadoEm: item.criado_em, atualizadoEm: item.atualizado_em }));
}

export async function atualizarAgendamento(item: Agendamento) {
  const status = item.statusManual === "Cancelado" ? "cancelado" : item.statusManual === "Não compareceu" ? "nao_compareceu" : "agendado";
  const resposta = await fetch(`/api/admin/agendamentos/${encodeURIComponent(item.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: item.data,
      hora: item.hora,
      status,
      historico: item.historicoAlteracoes ?? [],
    }),
  });
  if (!resposta.ok) throw new Error("Não foi possível atualizar o agendamento.");
}

export async function criarBloqueioSupabase(supabase: SupabaseClient, item: Omit<BloqueioAgenda, "id">) {
  const { error } = await supabase.from("bloqueios").insert({ data: item.data, dia_inteiro: item.diaInteiro, inicio: item.diaInteiro ? null : item.inicio, fim: item.diaInteiro ? null : item.fim, motivo: item.motivo });
  if (error) throw error;
}

export async function excluirBloqueioSupabase(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("bloqueios").delete().eq("id", id);
  if (error) throw error;
}
