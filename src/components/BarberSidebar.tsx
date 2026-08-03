"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PerfilBarbearia, perfilInicial } from "@/lib/barber-storage";
import { criarClienteSupabase } from "@/lib/supabase/client";
import { buscarConfiguracao, perfilDoBanco } from "@/lib/supabase/configuracoes";

const menu = [
  { nome: "Início", href: "/inicio", icon: "⌂" },
  { nome: "Agenda", href: "/inicio/agenda", icon: "◷" },
  { nome: "Histórico", href: "/inicio/historico", icon: "◴" },
  { nome: "Clientes", href: "/inicio/clientes", icon: "◉" },
  { nome: "Serviços", href: "/inicio/servicos", icon: "✦" },
  { nome: "Perfil", href: "/inicio/perfil", icon: "◎" },
  { nome: "Integrações", href: "/inicio/integracoes", icon: "G" },
];

export default function BarberSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [perfil, setPerfil] = useState<PerfilBarbearia>(perfilInicial);

  useEffect(() => {
    let ativo = true;
    async function atualizarPerfil() {
      try {
        const configuracao = await buscarConfiguracao(criarClienteSupabase());
        if (ativo) setPerfil(perfilDoBanco(configuracao));
      } catch {
        // O perfil padrão mantém o menu utilizável durante falhas transitórias.
      }
    }
    atualizarPerfil();
    window.addEventListener("ph10:perfil-atualizado", atualizarPerfil);
    return () => {
      ativo = false;
      window.removeEventListener("ph10:perfil-atualizado", atualizarPerfil);
    };
  }, []);

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    await criarClienteSupabase().auth.signOut();
    setAberto(false);
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setAberto(true)} aria-label="Abrir menu" className="mobile-menu-trigger fixed right-3 z-[80] grid h-11 w-11 place-items-center rounded-full border border-[#eee2c9]/20 bg-[#302b27]/95 text-base text-[#eee2c9] shadow-xl backdrop-blur lg:hidden">☰</button>
      {aberto && <button onClick={() => setAberto(false)} aria-label="Fechar menu" className="fixed inset-0 z-[90] bg-black/65 backdrop-blur-sm lg:hidden" />}

      <aside className={`mobile-sidebar fixed right-0 top-0 z-[100] w-72 max-w-[calc(100dvw-3rem)] flex-col border-l border-[#eee2c9]/10 bg-[#211f1c] p-5 text-[#f3ead8] lg:left-0 lg:right-auto lg:flex lg:w-72 lg:max-w-none lg:border-l-0 lg:border-r ${aberto ? "flex" : "hidden"}`}>
        <div className="border-b border-[#eee2c9]/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-[#d8c29e]/50 text-sm font-black text-[#d8c29e]">{perfil.foto ? <Image src={perfil.foto} alt="" width={44} height={44} unoptimized className="h-full w-full object-cover" /> : "PH"}</div>
            <div>
              <p className="display-font text-xl leading-none">{perfil.nome}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[.2em] text-[#9f9487]">{perfil.subtitulo}</p>
            </div>
          </div>
        </div>

        <nav className="mt-7 space-y-1.5">
          <p className="mb-3 px-3 text-[9px] font-black uppercase tracking-[.28em] text-[#776f66]">Painel de controle</p>
          {menu.map((item) => {
            const ativo = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={() => setAberto(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${ativo ? "bg-[#e7d7b8] text-[#24211e]" : "text-[#aaa095] hover:bg-[#eee2c9]/[.06] hover:text-[#f3ead8]"}`}>
                <span className="w-5 text-center text-base">{item.icon}</span>{item.nome}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <Link
            href="/b/ph10"
            target="_blank"
            rel="noreferrer"
            onClick={() => setAberto(false)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#eee2c9]/10 bg-[#2c2824] px-4 py-4 text-sm font-black text-[#f3ead8] transition hover:border-[#d8c29e]/35 hover:bg-[#342f2a]"
          >
            <span>Ver página do cliente</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 text-[#d8c29e]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17 17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </Link>
          <button type="button" onClick={sair} disabled={saindo} className="block w-full px-4 py-2 text-left text-[10px] font-black uppercase tracking-[.14em] text-[#a89d91] disabled:opacity-50">{saindo ? "Saindo..." : "Sair"}</button>
        </div>
      </aside>
    </>
  );
}
