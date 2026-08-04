import "server-only";

import { criarClienteSupabaseServer } from "@/lib/supabase/server";

export async function autenticarDono() {
  const supabase = await criarClienteSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: configuracao } = await supabase
    .from("configuracoes")
    .select("owner_id")
    .eq("id", 1)
    .maybeSingle();

  // A própria RLS só permite que membros ativos do painel vejam esta linha.
  if (!configuracao) return null;
  return {
    usuario: user,
    ownerId: configuracao.owner_id,
    proprietario: configuracao.owner_id === user.id,
  };
}
