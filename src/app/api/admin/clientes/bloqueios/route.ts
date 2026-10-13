import { NextRequest, NextResponse } from "next/server";
import { autenticarDono } from "@/lib/google-calendar/owner";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";

function origemValida(request: NextRequest) {
  const origem = request.headers.get("origin");
  return !origem || origem === request.nextUrl.origin;
}

async function autorizar(request: NextRequest) {
  const dono = await autenticarDono();
  return Boolean(dono && origemValida(request));
}

export async function POST(request: NextRequest) {
  if (!await autorizar(request)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const corpo = await request.json() as { whatsapp?: unknown; motivo?: unknown };
    const whatsapp = typeof corpo.whatsapp === "string" ? corpo.whatsapp.replace(/\D/g, "") : "";
    const motivo = typeof corpo.motivo === "string" ? corpo.motivo.trim() : "";
    if (!/^55219\d{8}$/.test(whatsapp) || motivo.length > 300) {
      return NextResponse.json({ erro: "Dados do bloqueio inválidos." }, { status: 400 });
    }

    const { data, error } = await criarClienteSupabaseAdmin()
      .from("clientes_bloqueados")
      .insert({ whatsapp, motivo })
      .select("id, whatsapp, motivo, criado_em")
      .single();
    if (error?.code === "23505") {
      return NextResponse.json({ erro: "Este número já está bloqueado." }, { status: 409 });
    }
    if (error) throw error;

    return NextResponse.json({ bloqueio: data }, { status: 201 });
  } catch (erro) {
    console.error("Falha ao bloquear cliente:", erro);
    return NextResponse.json({ erro: "Não foi possível bloquear o cliente." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!await autorizar(request)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const corpo = await request.json() as { whatsapp?: unknown };
    const whatsapp = typeof corpo.whatsapp === "string" ? corpo.whatsapp.replace(/\D/g, "") : "";
    if (!/^55219\d{8}$/.test(whatsapp)) {
      return NextResponse.json({ erro: "WhatsApp inválido." }, { status: 400 });
    }

    const { data, error } = await criarClienteSupabaseAdmin()
      .from("clientes_bloqueados")
      .delete()
      .eq("whatsapp", whatsapp)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ erro: "Bloqueio não encontrado." }, { status: 404 });

    return NextResponse.json({ removido: true });
  } catch (erro) {
    console.error("Falha ao desbloquear cliente:", erro);
    return NextResponse.json({ erro: "Não foi possível desbloquear o cliente." }, { status: 400 });
  }
}
