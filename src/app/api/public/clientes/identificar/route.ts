import { NextRequest, NextResponse } from "next/server";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { interpretarAniversario } from "@/lib/aniversario";
import { chaveRateLimit, consumirRateLimit, ipDaRequisicao, respostaBloqueada } from "@/lib/supabase/rate-limit";

export const dynamic = "force-dynamic";

function origemValida(request: NextRequest) {
  const origem = request.headers.get("origin");
  return !origem || origem === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = criarClienteSupabaseAdmin();
    const limite = await consumirRateLimit(
      supabase,
      chaveRateLimit("identificar-cliente-ip", ipDaRequisicao(request)),
      { limite: 20, janelaSegundos: 300, bloqueioSegundos: 600 },
    );
    if (!limite.permitido) return respostaBloqueada(limite.tentar_em);

    const corpo = await request.json() as { whatsapp?: string };
    const whatsapp = corpo.whatsapp?.replace(/\D/g, "") ?? "";
    if (!/^55219\d{8}$/.test(whatsapp)) {
      return NextResponse.json({ erro: "WhatsApp inválido." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("clientes")
      .select("nome, plano_mensal, aniversario_dia, aniversario_mes")
      .eq("whatsapp", whatsapp)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json(
      data
        ? { encontrado: true, nome: data.nome, planoMensal: data.plano_mensal, aniversarioCadastrado: Boolean(data.aniversario_dia && data.aniversario_mes) }
        : { encontrado: false, planoMensal: "comum", aniversarioCadastrado: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (erro) {
    console.error("Falha ao identificar cliente:", erro);
    return NextResponse.json({ erro: "Não foi possível verificar o cadastro." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!origemValida(request)) {
    return NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 });
  }

  try {
    const supabase = criarClienteSupabaseAdmin();
    const corpo = await request.json() as { whatsapp?: string; aniversario?: string };
    const whatsapp = corpo.whatsapp?.replace(/\D/g, "") ?? "";
    const aniversario = interpretarAniversario(corpo.aniversario);
    if (!/^55219\d{8}$/.test(whatsapp) || !aniversario) {
      return NextResponse.json({ erro: "Dados de aniversário inválidos." }, { status: 400 });
    }

    const [limiteIp, limiteTelefone] = await Promise.all([
      consumirRateLimit(
        supabase,
        chaveRateLimit("cadastrar-aniversario-ip", ipDaRequisicao(request)),
        { limite: 10, janelaSegundos: 600, bloqueioSegundos: 900 },
      ),
      consumirRateLimit(
        supabase,
        chaveRateLimit("cadastrar-aniversario-whatsapp", whatsapp),
        { limite: 3, janelaSegundos: 3600, bloqueioSegundos: 3600 },
      ),
    ]);
    if (!limiteIp.permitido) return respostaBloqueada(limiteIp.tentar_em);
    if (!limiteTelefone.permitido) return respostaBloqueada(limiteTelefone.tentar_em);

    const { data: cliente, error: erroConsulta } = await supabase
      .from("clientes")
      .select("id, aniversario_dia, aniversario_mes")
      .eq("whatsapp", whatsapp)
      .maybeSingle();
    if (erroConsulta) throw erroConsulta;
    if (!cliente) return NextResponse.json({ erro: "Cliente ainda não cadastrado." }, { status: 404 });
    if (cliente.aniversario_dia || cliente.aniversario_mes) {
      return NextResponse.json({ erro: "Aniversário já cadastrado." }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("clientes")
      .update({ aniversario_dia: aniversario.dia, aniversario_mes: aniversario.mes })
      .eq("id", cliente.id)
      .is("aniversario_dia", null)
      .is("aniversario_mes", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ erro: "Aniversário já cadastrado." }, { status: 409 });

    return NextResponse.json(
      { salvo: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (erro) {
    console.error("Falha ao cadastrar aniversário:", erro);
    return NextResponse.json({ erro: "Não foi possível salvar o aniversário." }, { status: 503 });
  }
}
