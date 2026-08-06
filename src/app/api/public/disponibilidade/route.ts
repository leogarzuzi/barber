import { NextResponse } from "next/server";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function dataNaZona(timezone: string) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

function somarDias(data: string, quantidade: number) {
  const [ano, mes, dia] = data.split("-").map(Number);
  const resultado = new Date(Date.UTC(ano, mes - 1, dia + quantidade));
  return resultado.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const supabase = criarClienteSupabaseAdmin();
    const { data: configuracao, error: erroConfiguracao } = await supabase
      .from("configuracoes")
      .select("dias_para_agendar, timezone")
      .eq("id", 1)
      .single();
    if (erroConfiguracao) throw erroConfiguracao;

    const inicio = dataNaZona(configuracao.timezone);
    const fim = somarDias(inicio, Math.max(19, configuracao.dias_para_agendar - 1));
    const [reservaResposta, bloqueioResposta] = await Promise.all([
      supabase
        .from("agendamentos")
        .select("id, data, hora, duracao_minutos")
        .eq("status", "agendado")
        .gte("data", inicio)
        .lte("data", fim)
        .order("data")
        .order("hora"),
      supabase
        .from("bloqueios")
        .select("id, data, dia_inteiro, inicio, fim")
        .gte("data", inicio)
        .lte("data", fim)
        .order("data"),
    ]);
    if (reservaResposta.error) throw reservaResposta.error;
    if (bloqueioResposta.error) throw bloqueioResposta.error;

    return NextResponse.json(
      {
        agendamentos: reservaResposta.data.map((item) => ({
          id: item.id,
          data: item.data,
          hora: item.hora.slice(0, 5),
          duracaoMinutos: item.duracao_minutos,
        })),
        bloqueios: bloqueioResposta.data.map((item) => ({
          id: item.id,
          data: item.data,
          diaInteiro: item.dia_inteiro,
          inicio: item.inicio?.slice(0, 5) ?? "00:00",
          fim: item.fim?.slice(0, 5) ?? "23:59",
        })),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=15",
        },
      },
    );
  } catch {
    return NextResponse.json({ erro: "Disponibilidade indisponível." }, { status: 503 });
  }
}
