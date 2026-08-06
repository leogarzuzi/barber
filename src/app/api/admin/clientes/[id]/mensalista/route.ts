import { NextRequest, NextResponse } from "next/server";
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
    const corpo = await request.json() as { mensalista?: unknown };
    if (typeof corpo.mensalista !== "boolean") {
      return NextResponse.json({ erro: "Situação de mensalista inválida." }, { status: 400 });
    }

    const { data, error } = await criarClienteSupabaseAdmin()
      .from("clientes")
      .update({ mensalista: corpo.mensalista })
      .eq("id", id)
      .select("id, mensalista")
      .single();
    if (error) throw error;

    return NextResponse.json({ cliente: data });
  } catch (erro) {
    console.error("Falha ao alterar mensalista:", erro);
    return NextResponse.json({ erro: "Não foi possível alterar o cliente." }, { status: 400 });
  }
}
