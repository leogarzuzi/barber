import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfiguracaoAgenda, DiaFuncionamento, PerfilBarbearia } from "@/lib/barber-storage";
import { normalizarAntecedenciaMinutos } from "@/lib/agenda-rules.mjs";

export const camposConfiguracao = "nome, subtitulo, responsavel, whatsapp, endereco, foto_url, intervalo_minutos, antecedencia_minutos, dias_para_agendar, dias_funcionamento";

export type ConfiguracaoBanco = {
  nome: string;
  subtitulo: string;
  responsavel: string;
  whatsapp: string;
  endereco: string;
  foto_url: string | null;
  intervalo_minutos: number;
  antecedencia_minutos: number;
  dias_para_agendar: number;
  dias_funcionamento: DiaFuncionamento[];
};

export function perfilDoBanco(configuracao: ConfiguracaoBanco): PerfilBarbearia {
  return {
    nome: configuracao.nome,
    subtitulo: configuracao.subtitulo,
    responsavel: configuracao.responsavel,
    whatsapp: configuracao.whatsapp,
    endereco: configuracao.endereco,
    foto: configuracao.foto_url ?? "",
  };
}

export function agendaDoBanco(configuracao: ConfiguracaoBanco): ConfiguracaoAgenda {
  return {
    diasFuncionamento: configuracao.dias_funcionamento,
    configAgenda: {
      intervalo: String(configuracao.intervalo_minutos) as ConfiguracaoAgenda["configAgenda"]["intervalo"],
      antecedenciaMinima: String(normalizarAntecedenciaMinutos(configuracao.antecedencia_minutos)),
      diasParaAgendar: String(configuracao.dias_para_agendar) as ConfiguracaoAgenda["configAgenda"]["diasParaAgendar"],
    },
  };
}

export async function buscarConfiguracao(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("configuracoes")
    .select(camposConfiguracao)
    .eq("id", 1)
    .single();

  if (error) throw error;
  return data as ConfiguracaoBanco;
}

export async function atualizarAgendaSupabase(supabase: SupabaseClient, configuracao: ConfiguracaoAgenda) {
  const { error } = await supabase
    .from("configuracoes")
    .update({
      dias_funcionamento: configuracao.diasFuncionamento,
      intervalo_minutos: Number(configuracao.configAgenda.intervalo),
      antecedencia_minutos: Number(configuracao.configAgenda.antecedenciaMinima),
      dias_para_agendar: Number(configuracao.configAgenda.diasParaAgendar),
    })
    .eq("id", 1);

  if (error) throw error;
}
