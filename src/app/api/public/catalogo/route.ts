import { NextResponse } from "next/server";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarCatalogo } from "@/lib/supabase/catalogo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      await buscarCatalogo(criarClienteSupabaseAdmin(), true),
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120",
        },
      },
    );
  } catch {
    return NextResponse.json({ erro: "Catálogo indisponível." }, { status: 503 });
  }
}
