import { NextRequest, NextResponse } from "next/server";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { autenticarDono } from "@/lib/google-calendar/owner";
import { buscarEmailGoogle, trocarCodigoPorTokens } from "@/lib/google-calendar/oauth";
import { criptografarToken } from "@/lib/google-calendar/crypto";
import {
  calendarioGoogleExiste,
  criarCalendarioGoogle,
  nomeCalendarioGoogle,
  sincronizarReservasFuturas,
} from "@/lib/google-calendar/sync";

function redirecionar(request: NextRequest, resultado: string) {
  const resposta = NextResponse.redirect(
    new URL(`/inicio/integracoes?google=${encodeURIComponent(resultado)}`, request.url),
  );
  const expirada = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/google-calendar",
    maxAge: 0,
  };
  resposta.cookies.set("ph10_google_oauth_state", "", expirada);
  resposta.cookies.set("ph10_google_code_verifier", "", expirada);
  return resposta;
}

export async function GET(request: NextRequest) {
  const dono = await autenticarDono();
  if (!dono) return NextResponse.redirect(new URL("/login", request.url));

  const erroGoogle = request.nextUrl.searchParams.get("error");
  const codigo = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const stateEsperado = request.cookies.get("ph10_google_oauth_state")?.value;
  const codeVerifier = request.cookies.get("ph10_google_code_verifier")?.value;

  if (erroGoogle || !codigo || !state || !stateEsperado || state !== stateEsperado || !codeVerifier) {
    return redirecionar(request, erroGoogle === "access_denied" ? "cancelled" : "error");
  }

  try {
    const redirectUri = new URL("/api/google-calendar/callback", request.nextUrl.origin).toString();
    const tokens = await trocarCodigoPorTokens({ codigo, redirectUri, codeVerifier });
    if (!tokens.refresh_token) throw new Error("O Google não enviou um refresh token.");

    const email = await buscarEmailGoogle(tokens.access_token);
    const supabase = criarClienteSupabaseAdmin();
    const { data: configuracao, error: erroConfiguracao } = await supabase
      .from("configuracoes")
      .select("timezone")
      .eq("id", 1)
      .single();
    if (erroConfiguracao) throw erroConfiguracao;

    const { data: conexaoAtual, error: erroConexao } = await supabase
      .from("google_calendar_conexoes")
      .select("google_email, calendar_id, calendar_nome")
      .eq("id", 1)
      .maybeSingle();
    if (erroConexao) throw erroConexao;

    let calendario: { id: string; nome: string } | null = null;
    if (
      conexaoAtual?.google_email === email
      && conexaoAtual.calendar_id
      && await calendarioGoogleExiste(tokens.access_token, conexaoAtual.calendar_id)
    ) {
      calendario = {
        id: conexaoAtual.calendar_id,
        nome: conexaoAtual.calendar_nome || nomeCalendarioGoogle,
      };
    }
    if (!calendario) {
      calendario = await criarCalendarioGoogle(tokens.access_token, configuracao.timezone);
    }

    const { error: erroSalvar } = await supabase
      .from("google_calendar_conexoes")
      .upsert({
        id: 1,
        // A integração pertence à barbearia/Pedro, mesmo quando um
        // administrador técnico conclui a configuração.
        owner_id: dono.ownerId,
        google_email: email,
        calendar_id: calendario.id,
        calendar_nome: calendario.nome,
        refresh_token_criptografado: criptografarToken(tokens.refresh_token),
        conectado: true,
        conectado_em: new Date().toISOString(),
      });
    if (erroSalvar) throw erroSalvar;

    const resultados = await sincronizarReservasFuturas(supabase);
    const possuiFalha = resultados.some((item) => item.status === "erro");
    return redirecionar(request, possuiFalha ? "connected-pending" : "connected");
  } catch (erro) {
    console.error("Falha ao conectar Google Calendar:", erro);
    return redirecionar(request, "error");
  }
}
