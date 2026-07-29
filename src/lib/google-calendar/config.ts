import "server-only";

function exigir(nome: string, valor: string | undefined) {
  if (!valor) throw new Error(`Variável de ambiente ausente: ${nome}`);
  return valor;
}

export function configuracaoGoogle() {
  return {
    clientId: exigir("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID),
    clientSecret: exigir("GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET),
  };
}

export function chaveCriptografiaGoogle() {
  const chave = Buffer.from(
    exigir("GOOGLE_TOKEN_ENCRYPTION_KEY", process.env.GOOGLE_TOKEN_ENCRYPTION_KEY),
    "base64",
  );

  if (chave.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY deve conter 32 bytes em Base64.");
  }

  return chave;
}
