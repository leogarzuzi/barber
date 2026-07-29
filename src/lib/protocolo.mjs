import { randomInt } from "node:crypto";

const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function gerarProtocolo() {
  return `PH10-${Array.from(
    { length: 6 },
    () => caracteres[randomInt(0, caracteres.length)],
  ).join("")}`;
}
