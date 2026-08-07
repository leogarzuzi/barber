import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const origem = "public/brand/ph10-app-icon-source.png";

await Promise.all([
  sharp(origem).resize(48, 48).png().toFile("public/icons/favicon-48.png"),
  sharp(origem).resize(180, 180).png().toFile("public/icons/apple-touch-icon.png"),
  sharp(origem).resize(192, 192).png().toFile("public/icons/icon-192.png"),
  sharp(origem).resize(512, 512).png().toFile("public/icons/icon-512.png"),
]);

const imagemComMargem = await sharp(origem).resize(410, 410).png().toBuffer();

await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: "#000000",
  },
})
  .composite([{ input: imagemComMargem, gravity: "center" }])
  .png()
  .toFile("public/icons/icon-maskable-512.png");

const faviconPng = await sharp(origem).resize(48, 48).png().toBuffer();
const cabecalhoIco = Buffer.alloc(22);
cabecalhoIco.writeUInt16LE(0, 0);
cabecalhoIco.writeUInt16LE(1, 2);
cabecalhoIco.writeUInt16LE(1, 4);
cabecalhoIco.writeUInt8(48, 6);
cabecalhoIco.writeUInt8(48, 7);
cabecalhoIco.writeUInt16LE(1, 10);
cabecalhoIco.writeUInt16LE(32, 12);
cabecalhoIco.writeUInt32LE(faviconPng.length, 14);
cabecalhoIco.writeUInt32LE(cabecalhoIco.length, 18);
await writeFile("src/app/favicon.ico", Buffer.concat([cabecalhoIco, faviconPng]));

console.log("Ícones da PH10 gerados com sucesso.");
