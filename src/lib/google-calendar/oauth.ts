import "server-only";

import { configuracaoGoogle } from "./config";

const endpointToken = "https://oauth2.googleapis.com/token";

type RespostaToken = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

async function requisitarToken(parametros: URLSearchParams) {
  const resposta = await fetch(endpointToken, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parametros,
    cache: "no-store",
  });

  if (!resposta.ok) {
    const detalhes = await resposta.text();
    throw new Error(`Google OAuth recusou a solicitação (${resposta.status}): ${detalhes}`);
  }

  return (await resposta.json()) as RespostaToken;
}

export function urlAutorizacaoGoogle({
  redirectUri,
  state,
  codeChallenge,
}: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const { clientId } = configuracaoGoogle();
  const parametros = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.app.created",
    ].join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${parametros.toString()}`;
}

export async function trocarCodigoPorTokens({
  codigo,
  redirectUri,
  codeVerifier,
}: {
  codigo: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const { clientId, clientSecret } = configuracaoGoogle();
  return requisitarToken(new URLSearchParams({
    code: codigo,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  }));
}

export async function renovarAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = configuracaoGoogle();
  const resposta = await requisitarToken(new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  }));
  return resposta.access_token;
}

export async function buscarEmailGoogle(accessToken: string) {
  const resposta = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!resposta.ok) throw new Error("Não foi possível identificar a conta Google.");
  const dados = await resposta.json() as { email?: string; email_verified?: boolean };
  if (!dados.email || dados.email_verified === false) {
    throw new Error("A conta Google não possui um e-mail verificado.");
  }
  return dados.email;
}

export async function revogarTokenGoogle(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
  });
}
