import assert from "node:assert/strict";
import test from "node:test";
import { intervalosSeSobrepoem, validarDiasFuncionamento } from "../src/lib/agenda-rules.mjs";
import { gerarProtocolo } from "../src/lib/protocolo.mjs";

test("permite iniciar exatamente quando o atendimento anterior termina", () => {
  assert.equal(intervalosSeSobrepoem(13 * 60, 13 * 60 + 30, 12 * 60, 13 * 60), false);
});

test("bloqueia períodos que realmente se cruzam", () => {
  assert.equal(intervalosSeSobrepoem(12 * 60 + 45, 13 * 60 + 15, 13 * 60, 13 * 60 + 30), true);
});

test("permite o primeiro horário imediatamente após o almoço", () => {
  assert.equal(intervalosSeSobrepoem(12 * 60 + 45, 13 * 60 + 15, 12 * 60, 12 * 60 + 45), false);
});

test("detecta serviço que começa antes e termina dentro de um bloqueio", () => {
  assert.equal(intervalosSeSobrepoem(11 * 60 + 45, 12 * 60 + 15, 12 * 60, 13 * 60), true);
});

const diaValido = { nome: "Terça-feira", ativo: true, abertura: "09:00", fechamento: "18:00", temPausa: true, pausaInicio: "12:00", pausaFim: "13:00" };

test("aceita expediente e pausa em ordem válida", () => {
  assert.equal(validarDiasFuncionamento([diaValido]), null);
});

test("rejeita abertura posterior ao fechamento", () => {
  assert.match(validarDiasFuncionamento([{ ...diaValido, abertura: "19:00" }]), /abertura precisa ser anterior/);
});

test("rejeita pausa fora do expediente", () => {
  assert.match(validarDiasFuncionamento([{ ...diaValido, pausaFim: "19:00" }]), /pausa precisa ficar dentro/);
});

test("gera protocolo seguro no formato público esperado", () => {
  for (let tentativa = 0; tentativa < 100; tentativa += 1) {
    assert.match(gerarProtocolo(), /^PH10-[A-HJ-NP-Z2-9]{6}$/);
  }
});
