export type DataAniversario = {
  dia: number;
  mes: number;
};

export function interpretarAniversario(valor: unknown): DataAniversario | null {
  if (typeof valor !== "string") return null;
  const correspondencia = valor.trim().match(/^(\d{2})\/(\d{2})$/);
  if (!correspondencia) return null;

  const dia = Number(correspondencia[1]);
  const mes = Number(correspondencia[2]);
  const referencia = new Date(2000, mes - 1, dia, 12);
  if (
    referencia.getFullYear() !== 2000
    || referencia.getMonth() !== mes - 1
    || referencia.getDate() !== dia
  ) return null;

  return { dia, mes };
}

export function formatarAniversario(dia?: number, mes?: number) {
  if (!dia || !mes) return null;
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

export function formatarEntradaAniversario(valor: string) {
  const digitos = valor.replace(/\D/g, "").slice(0, 4);
  return digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos;
}

export function nomeDoMes(mes: number) {
  const data = new Date(2000, mes - 1, 1, 12);
  return new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(data);
}
