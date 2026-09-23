import assert from "node:assert/strict";
import test from "node:test";
import { intervalosSeSobrepoem, normalizarAntecedenciaMinutos, planoPermiteDia, podeMarcarNaoCompareceu, validarAlteracaoReservaCliente, validarDiasFuncionamento, validarLimiteReservasCliente } from "../src/lib/agenda-rules.mjs";
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

test("mantém antecedências de 15 minutos a 3 horas", () => {
  assert.equal(normalizarAntecedenciaMinutos(15), 15);
  assert.equal(normalizarAntecedenciaMinutos(45), 45);
  assert.equal(normalizarAntecedenciaMinutos(120), 120);
  assert.equal(normalizarAntecedenciaMinutos(180), 180);
});

test("limita configurações antigas acima de 3 horas", () => {
  assert.equal(normalizarAntecedenciaMinutos(240), 180);
  assert.equal(normalizarAntecedenciaMinutos(1440), 180);
});

test("cliente avulso não pode manter duas reservas futuras", () => {
  assert.equal(validarLimiteReservasCliente({ planoMensal: "comum", datasAtivas: ["2026-08-10"], novaData: "2026-08-12" }), "reserva-existente");
});

test("planos mensais podem manter até cinco reservas em dias diferentes", () => {
  const quatroDatas = ["2026-08-10", "2026-08-12", "2026-08-14", "2026-08-16"];
  const cincoDatas = [...quatroDatas, "2026-08-18"];
  assert.equal(validarLimiteReservasCliente({ planoMensal: "mensalista", datasAtivas: quatroDatas, novaData: "2026-08-18" }), null);
  assert.equal(validarLimiteReservasCliente({ planoMensal: "mensalista_plus", datasAtivas: cincoDatas, novaData: "2026-08-20" }), "limite-mensalista");
});

test("mensalista não pode criar duas reservas no mesmo dia", () => {
  assert.equal(validarLimiteReservasCliente({ planoMensal: "mensalista", datasAtivas: ["2026-08-10"], novaData: "2026-08-10" }), "mesmo-dia");
});

test("mensalista comum agenda apenas de segunda a quinta", () => {
  assert.equal(planoPermiteDia({ planoMensal: "mensalista", diaSemana: 1 }), true);
  assert.equal(planoPermiteDia({ planoMensal: "mensalista", diaSemana: 4 }), true);
  assert.equal(planoPermiteDia({ planoMensal: "mensalista", diaSemana: 5 }), false);
  assert.equal(planoPermiteDia({ planoMensal: "mensalista", diaSemana: 0 }), false);
});

test("mensalista plus e cliente comum podem usar qualquer dia aberto", () => {
  for (let diaSemana = 0; diaSemana <= 6; diaSemana += 1) {
    assert.equal(planoPermiteDia({ planoMensal: "mensalista_plus", diaSemana }), true);
    assert.equal(planoPermiteDia({ planoMensal: "comum", diaSemana }), true);
  }
});

const agoraAlteracao = new Date("2026-08-25T10:00:00-03:00").getTime();
const reservaFutura = { data: "2026-08-26", hora: "12:00" };

test("cliente não pode alterar reserva marcada como não compareceu", () => {
  assert.equal(
    validarAlteracaoReservaCliente({
      reserva: { ...reservaFutura, statusManual: "Não compareceu" },
      acao: "remarcar",
      dataNova: "2026-08-27",
      horaNova: "13:00",
      agora: agoraAlteracao,
    }),
    "alteracao-nao-permitida",
  );
});

test("cliente não pode alterar reserva cancelada", () => {
  assert.equal(
    validarAlteracaoReservaCliente({
      reserva: { ...reservaFutura, statusManual: "Cancelado" },
      acao: "cancelar",
      agora: agoraAlteracao,
    }),
    "alteracao-nao-permitida",
  );
});

test("cliente não pode remarcar para o mesmo horário", () => {
  assert.equal(
    validarAlteracaoReservaCliente({
      reserva: reservaFutura,
      acao: "remarcar",
      dataNova: "2026-08-26",
      horaNova: "12:00",
      agora: agoraAlteracao,
    }),
    "mesmo-horario",
  );
});

test("cliente pode remarcar reserva ativa para outro horário dentro do prazo", () => {
  assert.equal(
    validarAlteracaoReservaCliente({
      reserva: reservaFutura,
      acao: "remarcar",
      dataNova: "2026-08-27",
      horaNova: "13:00",
      agora: agoraAlteracao,
    }),
    null,
  );
});

test("não permite marcar falta antes do dia do atendimento", () => {
  assert.equal(
    podeMarcarNaoCompareceu({
      data: "2026-09-10",
      hora: "18:00",
      agora: new Date("2026-09-02T09:08:00-03:00").getTime(),
    }),
    false,
  );
});

test("não permite marcar falta no mesmo dia com mais de 2 horas de antecedência", () => {
  assert.equal(
    podeMarcarNaoCompareceu({
      data: "2026-09-10",
      hora: "18:00",
      agora: new Date("2026-09-10T15:59:00-03:00").getTime(),
    }),
    false,
  );
});

test("permite marcar falta no mesmo dia a partir de 2 horas antes", () => {
  assert.equal(
    podeMarcarNaoCompareceu({
      data: "2026-09-10",
      hora: "18:00",
      agora: new Date("2026-09-10T16:00:00-03:00").getTime(),
    }),
    true,
  );
});

test("permite marcar falta depois do horário do atendimento", () => {
  assert.equal(
    podeMarcarNaoCompareceu({
      data: "2026-09-10",
      hora: "18:00",
      agora: new Date("2026-09-10T18:30:00-03:00").getTime(),
    }),
    true,
  );
});

test("gera protocolo seguro no formato público esperado", () => {
  for (let tentativa = 0; tentativa < 100; tentativa += 1) {
    assert.match(gerarProtocolo(), /^PH10-[A-HJ-NP-Z2-9]{6}$/);
  }
});
