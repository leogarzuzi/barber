"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import NoticeDialog from "@/components/NoticeDialog";
import { criarClienteSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState("");
  const [fotoBarbearia, setFotoBarbearia] = useState("");

  useEffect(() => {
    const controle = new AbortController();

    async function carregarFoto() {
      try {
        const resposta = await fetch("/api/public/configuracao", {
          cache: "no-store",
          signal: controle.signal,
        });
        if (!resposta.ok) return;

        const dados = await resposta.json() as { perfil?: { foto?: string } };
        setFotoBarbearia(dados.perfil?.foto ?? "");
      } catch {
        // O texto PH continua como alternativa se a foto estiver indisponivel.
      }
    }

    void carregarFoto();
    return () => controle.abort();
  }, []);

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !senha) return;
    setEntrando(true);

    const supabase = criarClienteSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });

    if (error) {
      setEntrando(false);
      setErro("Confira o e-mail e a senha informados e tente novamente.");
      return;
    }

    router.replace("/inicio");
    router.refresh();
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#211f1c] px-4 py-8 text-[#f3ead8]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="relative mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full border border-[#d8c29e]/50 bg-[#2c2824] text-lg font-black text-[#d8c29e]">
            {fotoBarbearia ? (
              <Image
                src={fotoBarbearia}
                alt="Foto da PH10 Barber"
                fill
                priority
                unoptimized
                sizes="80px"
                className="object-cover"
              />
            ) : "PH"}
          </div>
          <p className="display-font mt-4 text-3xl">PH10 Barbearia</p>
        </div>

        <form onSubmit={entrar} className="rounded-[2rem] border border-[#eee2c9]/10 bg-[#2c2824] p-5 shadow-2xl sm:p-7">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.24em] text-[#d8c29e]">Área do proprietário</p>
            <h1 className="mt-2 text-2xl font-black">Bem-vindo de volta</h1>
          </div>

          <label className="mt-6 block">
            <span className="text-xs font-bold text-[#aaa095]">E-mail</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com" autoComplete="email" required className="mt-2 w-full rounded-2xl border border-transparent bg-[#211f1c] px-4 py-4 outline-none focus:border-[#d8c29e]/40 focus:ring-2 focus:ring-[#d8c29e]/20" />
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-bold text-[#aaa095]">Senha</span>
            <div className="mt-2 flex overflow-hidden rounded-2xl border border-transparent bg-[#211f1c] focus-within:border-[#d8c29e]/40 focus-within:ring-2 focus-within:ring-[#d8c29e]/20">
              <input type={mostrarSenha ? "text" : "password"} value={senha} onChange={(event) => setSenha(event.target.value)} placeholder="Sua senha" autoComplete="current-password" required className="min-w-0 flex-1 bg-transparent px-4 py-4 outline-none" />
              <button type="button" onClick={() => setMostrarSenha((atual) => !atual)} className="shrink-0 px-4 text-xs font-black text-[#d8c29e]">{mostrarSenha ? "Ocultar" : "Mostrar"}</button>
            </div>
          </label>

          <button type="submit" disabled={entrando || !email.trim() || !senha} className="mt-6 w-full rounded-2xl bg-[#e7d7b8] px-4 py-4 text-sm font-black text-[#24211e] disabled:cursor-not-allowed disabled:opacity-50">{entrando ? "Entrando..." : "Entrar"}</button>
        </form>

        <Link href="/b/ph10" className="mt-6 block text-center text-xs font-bold text-[#aaa095]">Ver página de agendamento →</Link>
      </div>
      {erro && <NoticeDialog titulo="Não foi possível entrar" descricao={erro} onFechar={() => setErro("")} botaoTexto="Tentar novamente" />}
    </main>
  );
}
