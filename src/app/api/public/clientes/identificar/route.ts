import { NextRequest, NextResponse } from "next/server";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { chaveRateLimit, consumirRateLimit, ipDaRequisicao, respostaBloqueada } from "@/lib/supabase/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = criarClienteSupabaseAdmin();
    const limite = await consumirRateLimit(
      supabase,
      chaveRateLimit("identificar-cliente-ip", ipDaRequisicao(request)),
      { limite: 20, janelaSegundos: 300, bloqueioSegundos: 600 },
    );
    if (!limite.permitido) return respostaBloqueada(limite.tentar_em);

    const corpo = await request.json() as { whatsapp?: string };
    const whatsapp = corpo.whatsapp?.replace(/\D/g, "") ?? "";
    if (!/^55219\d{8}$/.test(whatsapp)) {
      return NextResponse.json({ erro: "WhatsApp inválido." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("clientes")
      .select("nome, mensalista")
      .eq("whatsapp", whatsapp)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json(
      data
        ? { encontrado: true, nome: data.nome, mensalista: data.mensalista }
        : { encontrado: false, mensalista: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (erro) {
    console.error("Falha ao identificar cliente:", erro);
    return NextResponse.json({ erro: "Não foi possível verificar o cadastro." }, { status: 503 });
  }
}
