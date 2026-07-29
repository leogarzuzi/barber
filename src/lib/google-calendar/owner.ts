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

  if (!configuracao || configuracao.owner_id !== user.id) return null;
  return user;
}
