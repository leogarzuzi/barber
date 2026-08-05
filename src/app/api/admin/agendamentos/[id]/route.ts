import { NextRequest, NextResponse } from "next/server";
import { autenticarDono } from "@/lib/google-calendar/owner";
import { sincronizarAgendamentoGoogle } from "@/lib/google-calendar/sync";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";

type CorpoAtualizacao = {
  data: string;
  hora: string;
  status: "agendado" | "cancelado" | "nao_compareceu";
  historico: unknown[];
};

function origemValida(request: NextRequest) {
  const origem = request.headers.get("origin");
  return !origem || origem === request.nextUrl.origin;
}

export async function PATCH(
  request: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const dono = await autenticarDono();
  if (!dono || !origemValida(request)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const { id } = await contexto.params;
    const corpo = await request.json() as CorpoAtualizacao;
    const statusValidos = new Set(["agendado", "cancelado", "nao_compareceu"]);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(corpo.data)
      || !/^\d{2}:\d{2}$/.test(corpo.hora)
      || !statusValidos.has(corpo.status)
      || !Array.isArray(corpo.historico)
    ) {
      return NextResponse.json({ erro: "Dados do agendamento inválidos." }, { status: 400 });
    }

    const supabase = criarClienteSupabaseAdmin();
    const [resultadoConfiguracao, resultadoAtual] = await Promise.all([
      supabase.from("configuracoes").select("intervalo_minutos").eq("id", 1).single(),
      supabase.from("agendamentos").select("data, hora").eq("id", id).single(),
    ]);
    if (resultadoConfiguracao.error) throw resultadoConfiguracao.error;
    if (resultadoAtual.error) throw resultadoAtual.error;
    const horarioFoiAlterado = resultadoAtual.data.data !== corpo.data
      || String(resultadoAtual.data.hora).slice(0, 5) !== corpo.hora;
    const { data, error } = await supabase
      .from("agendamentos")
      .update({
        data: corpo.data,
        hora: corpo.hora,
        ...(horarioFoiAlterado ? { duracao_minutos: resultadoConfiguracao.data.intervalo_minutos } : {}),
        status: corpo.status,
        historico: corpo.historico,
        google_sync_status: "pendente",
        google_sync_error: null,
      })
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;

    let sincronizacao: Awaited<ReturnType<typeof sincronizarAgendamentoGoogle>> | null = null;
    try {
      sincronizacao = await sincronizarAgendamentoGoogle(supabase, data.id);
    } catch (erroSincronizacao) {
      console.error("Agendamento salvo, mas a sincronização com o Google falhou:", erroSincronizacao);
    }
    return NextResponse.json({ atualizado: true, sincronizacao });
  } catch (erro) {
    console.error("Falha ao atualizar agendamento:", erro);
    return NextResponse.json({ erro: "Não foi possível atualizar o agendamento." }, { status: 400 });
  }
}
