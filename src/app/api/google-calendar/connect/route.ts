import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { autenticarDono } from "@/lib/google-calendar/owner";
import { urlAutorizacaoGoogle } from "@/lib/google-calendar/oauth";

export async function GET(request: NextRequest) {
  const dono = await autenticarDono();
  if (!dono) return NextResponse.redirect(new URL("/login", request.url));

  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const redirectUri = new URL("/api/google-calendar/callback", request.nextUrl.origin).toString();

  const resposta = NextResponse.redirect(
    urlAutorizacaoGoogle({ redirectUri, state, codeChallenge }),
  );
  const opcoes = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/google-calendar",
    maxAge: 10 * 60,
  };
  resposta.cookies.set("ph10_google_oauth_state", state, opcoes);
  resposta.cookies.set("ph10_google_code_verifier", codeVerifier, opcoes);
  return resposta;
}
