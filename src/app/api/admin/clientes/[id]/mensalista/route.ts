import { NextRequest, NextResponse } from "next/server";
import { autenticarDono } from "@/lib/google-calendar/owner";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import type { PlanoMensal } from "@/lib/barber-storage";

const planosValidos: PlanoMensal[] = ["comum", "mensalista", "mensalista_plus"];

function origemValida(request: NextRequest) {
  const origem = request.headers.get("origin");
  return !origem || origem === request.nextUrl.origin;
}

export async function PATCH(
  request: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const dono = await autenticarDono();
  if (!dono || !origemValida(request)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const { id } = await contexto.params;
    const corpo = await request.json() as { planoMensal?: unknown };
    if (typeof corpo.planoMensal !== "string" || !planosValidos.includes(corpo.planoMensal as PlanoMensal)) {
      return NextResponse.json({ erro: "Plano mensal inválido." }, { status: 400 });
    }
    const planoMensal = corpo.planoMensal as PlanoMensal;
    const mensalidadeCentavos = planoMensal === "mensalista_plus" ? 18000 : 16000;

    const { data, error } = await criarClienteSupabaseAdmin()
      .from("clientes")
      .update({
        plano_mensal: planoMensal,
        mensalista: planoMensal !== "comum",
        mensalidade_centavos: mensalidadeCentavos,
      })
      .eq("id", id)
      .select("id, plano_mensal, mensalista, mensalidade_centavos")
      .single();
    if (error) throw error;

    return NextResponse.json({ cliente: data });
  } catch (erro) {
    console.error("Falha ao alterar mensalista:", erro);
    return NextResponse.json({ erro: "Não foi possível alterar o cliente." }, { status: 400 });
  }
}
