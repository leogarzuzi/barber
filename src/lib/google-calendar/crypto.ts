import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chaveCriptografiaGoogle } from "./config";

export function criptografarToken(valor: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chaveCriptografiaGoogle(), iv);
  const criptografado = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv.toString("base64url"), tag.toString("base64url"), criptografado.toString("base64url")].join(".");
}

export function descriptografarToken(valor: string) {
  const [versao, ivBase64, tagBase64, conteudoBase64] = valor.split(".");
  if (versao !== "v1" || !ivBase64 || !tagBase64 || !conteudoBase64) {
    throw new Error("Token do Google em formato inválido.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    chaveCriptografiaGoogle(),
    Buffer.from(ivBase64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(conteudoBase64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
