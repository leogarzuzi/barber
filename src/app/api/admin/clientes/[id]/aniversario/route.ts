import { NextRequest, NextResponse } from "next/server";
import { interpretarAniversario } from "@/lib/aniversario";
import { autenticarDono } from "@/lib/google-calendar/owner";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";

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
    const corpo = await request.json() as { aniversario?: unknown };
    const aniversario = interpretarAniversario(corpo.aniversario);
    if (!aniversario) {
      return NextResponse.json({ erro: "Data de aniversário inválida." }, { status: 400 });
    }

    const { data, error } = await criarClienteSupabaseAdmin()
      .from("clientes")
      .update({ aniversario_dia: aniversario.dia, aniversario_mes: aniversario.mes })
      .eq("id", id)
      .select("id, aniversario_dia, aniversario_mes")
      .single();
    if (error) throw error;

    return NextResponse.json({ cliente: data });
  } catch (erro) {
    console.error("Falha ao alterar aniversário:", erro);
    return NextResponse.json({ erro: "Não foi possível alterar o aniversário." }, { status: 400 });
  }
}
