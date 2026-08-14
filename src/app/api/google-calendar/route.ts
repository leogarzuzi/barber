import { NextRequest, NextResponse } from "next/server";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { autenticarDono } from "@/lib/google-calendar/owner";
import { descriptografarToken } from "@/lib/google-calendar/crypto";
import { revogarTokenGoogle } from "@/lib/google-calendar/oauth";
import {
  removerReservasFuturasDoGoogle,
  resumoGoogleCalendar,
  sincronizarReservasFuturas,
} from "@/lib/google-calendar/sync";

function origemValida(request: NextRequest) {
  const origem = request.headers.get("origin");
  return !origem || origem === request.nextUrl.origin;
}

export async function GET() {
  const dono = await autenticarDono();
  if (!dono) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  try {
    return NextResponse.json(await resumoGoogleCalendar(criarClienteSupabaseAdmin()));
  } catch {
    return NextResponse.json({ erro: "Não foi possível consultar a integração." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const dono = await autenticarDono();
  if (!dono || !origemValida(request)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const supabase = criarClienteSupabaseAdmin();
    const resultados = await sincronizarReservasFuturas(supabase);
    const falhas = resultados.filter((item) => item.status === "erro").length;
    const pendentes = resultados.filter((item) => item.status === "pendente").length;
    return NextResponse.json({
      sincronizados: resultados.filter((item) => item.status === "sincronizado").length,
      falhas,
      pendentes,
      reconexaoNecessaria: resultados.some(
        (item) => "reconexaoNecessaria" in item && item.reconexaoNecessaria,
      ),
      resumo: await resumoGoogleCalendar(supabase),
    });
  } catch {
    return NextResponse.json({ erro: "Não foi possível sincronizar as reservas." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const dono = await autenticarDono();
  if (!dono || !origemValida(request)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const supabase = criarClienteSupabaseAdmin();
    const { data: conexao, error } = await supabase
      .from("google_calendar_conexoes")
      .select("refresh_token_criptografado")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;

    const limpeza = await removerReservasFuturasDoGoogle(supabase);
    if (conexao?.refresh_token_criptografado) {
      try {
        await revogarTokenGoogle(
          descriptografarToken(conexao.refresh_token_criptografado),
        );
      } catch {
        // A conexão local deve ser encerrada mesmo que o Google já tenha revogado o token.
      }
    }

    const { error: erroAtualizar } = await supabase
      .from("google_calendar_conexoes")
      .update({
        refresh_token_criptografado: null,
        conectado: false,
      })
      .eq("id", 1);
    if (erroAtualizar) throw erroAtualizar;

    return NextResponse.json({ desconectado: true, limpeza });
  } catch {
    return NextResponse.json({ erro: "Não foi possível desconectar o Google Agenda." }, { status: 500 });
  }
}
