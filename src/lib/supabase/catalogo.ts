import type { SupabaseClient } from "@supabase/supabase-js";
import type { Combo, Servico } from "@/lib/barber-storage";

type ServicoBanco = { id: string; nome: string; valor_centavos: number; ativo: boolean };
type ComboBanco = { id: string; nome: string; valor_centavos: number; desconto_percentual: number; ativo: boolean };
type VinculoBanco = { combo_id: string; servico_id: string; ordem: number };

export async function buscarCatalogo(supabase: SupabaseClient, apenasAtivos = false) {
  let consultaServicos = supabase.from("servicos").select("id, nome, valor_centavos, ativo").order("criado_em");
  let consultaCombos = supabase.from("combos").select("id, nome, valor_centavos, desconto_percentual, ativo").order("criado_em");
  if (apenasAtivos) {
    consultaServicos = consultaServicos.eq("ativo", true);
    consultaCombos = consultaCombos.eq("ativo", true);
  }

  const [resultadoServicos, resultadoCombos, resultadoVinculos] = await Promise.all([
    consultaServicos,
    consultaCombos,
    supabase.from("combo_servicos").select("combo_id, servico_id, ordem").order("ordem"),
  ]);

  const erro = resultadoServicos.error ?? resultadoCombos.error ?? resultadoVinculos.error;
  if (erro) throw erro;

  const servicos = (resultadoServicos.data as ServicoBanco[]).map<Servico>((item) => ({
    id: item.id,
    nome: item.nome,
    valor: item.valor_centavos / 100,
    status: item.ativo ? "Ativo" : "Inativo",
  }));
  const vinculos = resultadoVinculos.data as VinculoBanco[];
  const combos = (resultadoCombos.data as ComboBanco[]).map<Combo>((item) => ({
    id: item.id,
    nome: item.nome,
    valor: item.valor_centavos / 100,
    descontoPercentual: item.desconto_percentual,
    status: item.ativo ? "Ativo" : "Inativo",
    servicosIds: vinculos.filter((vinculo) => vinculo.combo_id === item.id).map((vinculo) => vinculo.servico_id),
  }));

  return { servicos, combos };
}

export async function criarServico(supabase: SupabaseClient, servico: Omit<Servico, "id">) {
  const { error } = await supabase.from("servicos").insert({
    nome: servico.nome,
    duracao_minutos: 1,
    valor_centavos: Math.round(servico.valor * 100),
    ativo: servico.status === "Ativo",
  });
  if (error) throw error;
}

export async function atualizarServico(supabase: SupabaseClient, servico: Servico) {
  const { error } = await supabase.from("servicos").update({
    nome: servico.nome,
    valor_centavos: Math.round(servico.valor * 100),
    ativo: servico.status === "Ativo",
  }).eq("id", servico.id);
  if (error) throw error;
}

export async function criarCombo(supabase: SupabaseClient, combo: Omit<Combo, "id">) {
  const { data, error } = await supabase.from("combos").insert({
    nome: combo.nome,
    duracao_minutos: 1,
    valor_centavos: Math.round(combo.valor * 100),
    desconto_percentual: combo.descontoPercentual ?? 0,
    ativo: combo.status === "Ativo",
  }).select("id").single();
  if (error) throw error;
  const { error: erroVinculos } = await supabase.from("combo_servicos").insert(
    combo.servicosIds.map((servicoId, ordem) => ({ combo_id: data.id, servico_id: servicoId, ordem }))
  );
  if (erroVinculos) {
    await supabase.from("combos").delete().eq("id", data.id);
    throw erroVinculos;
  }
}

export async function atualizarCombo(supabase: SupabaseClient, combo: Combo) {
  const { error } = await supabase.from("combos").update({
    nome: combo.nome,
    valor_centavos: Math.round(combo.valor * 100),
    desconto_percentual: combo.descontoPercentual ?? 0,
    ativo: combo.status === "Ativo",
  }).eq("id", combo.id);
  if (error) throw error;

  const { error: erroRemocao } = await supabase.from("combo_servicos").delete().eq("combo_id", combo.id);
  if (erroRemocao) throw erroRemocao;
  if (combo.servicosIds.length > 0) {
    const { error: erroVinculos } = await supabase.from("combo_servicos").insert(
      combo.servicosIds.map((servicoId, ordem) => ({ combo_id: combo.id, servico_id: servicoId, ordem }))
    );
    if (erroVinculos) throw erroVinculos;
  }
}

export async function excluirCombo(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("combos").delete().eq("id", id);
  if (error) throw error;
}

export async function excluirServico(supabase: SupabaseClient, id: string) {
  const { error: erroVinculos } = await supabase.from("combo_servicos").delete().eq("servico_id", id);
  if (erroVinculos) throw erroVinculos;
  const { error } = await supabase.from("servicos").delete().eq("id", id);
  if (error) throw error;
}
