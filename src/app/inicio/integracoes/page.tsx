"use client";

import { useEffect, useState } from "react";
import ConfirmDialog from "@/components/agenda/ConfirmDialog";
import NoticeDialog from "@/components/NoticeDialog";

type ResumoGoogle = {
  conectado: boolean;
  email: string | null;
  calendario: string | null;
  pendentes: number;
};

type Aviso = { titulo: string; descricao: string };

export default function IntegracoesPage() {
  const [resumo, setResumo] = useState<ResumoGoogle | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [confirmarDesconexao, setConfirmarDesconexao] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  async function carregar() {
    try {
      const resposta = await fetch("/api/google-calendar", { cache: "no-store" });
      if (!resposta.ok) throw new Error();
      setResumo(await resposta.json() as ResumoGoogle);
    } catch {
      setAviso({
        titulo: "Integração indisponível",
        descricao: "Não foi possível consultar o Google Agenda agora. Tente novamente.",
      });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    async function iniciar() {
      await Promise.resolve();
      await carregar();
      const resultado = new URLSearchParams(window.location.search).get("google");
      if (resultado === "connected") {
        setAviso({
          titulo: "Google Agenda conectado",
          descricao: "As reservas futuras já foram enviadas para o calendário PH10 — Reservas.",
        });
      } else if (resultado === "connected-pending") {
        setAviso({
          titulo: "Conta conectada",
          descricao: "Algumas reservas ainda estão pendentes. Use o botão sincronizar novamente.",
        });
      } else if (resultado === "cancelled") {
        setAviso({
          titulo: "Conexão cancelada",
          descricao: "Nenhuma alteração foi feita na agenda.",
        });
      } else if (resultado === "error") {
        setAviso({
          titulo: "Não foi possível conectar",
          descricao: "Confira a configuração do Google e tente novamente.",
        });
      }
      if (resultado) window.history.replaceState({}, "", "/inicio/integracoes");
    }
    void iniciar();
  }, []);

  async function sincronizar() {
    try {
      setProcessando(true);
      const resposta = await fetch("/api/google-calendar", { method: "POST" });
      if (!resposta.ok) throw new Error();
      const dados = await resposta.json() as {
        sincronizados: number;
        falhas: number;
        resumo: ResumoGoogle;
      };
      setResumo(dados.resumo);
      setAviso({
        titulo: dados.falhas ? "Sincronização parcial" : "Agenda sincronizada",
        descricao: dados.falhas
          ? `${dados.falhas} reserva(s) ainda precisam de uma nova tentativa.`
          : `${dados.sincronizados} reserva(s) futura(s) foram conferidas no Google Agenda.`,
      });
    } catch {
      setAviso({
        titulo: "Não foi possível sincronizar",
        descricao: "As reservas continuam salvas no PH10. Tente novamente em alguns instantes.",
      });
    } finally {
      setProcessando(false);
    }
  }

  async function desconectar() {
    try {
      setConfirmarDesconexao(false);
      setProcessando(true);
      const resposta = await fetch("/api/google-calendar", { method: "DELETE" });
      if (!resposta.ok) throw new Error();
      const dados = await resposta.json() as {
        limpeza: { removidos: number; falhas: number };
      };
      await carregar();
      setAviso({
        titulo: "Google Agenda desconectado",
        descricao: dados.limpeza.falhas
          ? "A conta foi desconectada, mas alguns eventos não puderam ser removidos do calendário anterior."
          : "Os eventos futuros foram removidos do calendário e as reservas continuam salvas no PH10.",
      });
    } catch {
      setAviso({
        titulo: "Não foi possível desconectar",
        descricao: "A conexão foi mantida. Tente novamente.",
      });
    } finally {
      setProcessando(false);
    }
  }

  return (
    <main className="app-page">
      <div className="page-wrap">
        <div className="mx-auto w-full max-w-3xl">
          <header className="hero-panel">
            <p className="eyebrow">PH10 • Integrações</p>
            <h1 className="display-font page-title mt-2">Google Agenda</h1>
          </header>

          <section className="panel mt-5 p-5 lg:p-7">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-xl font-black text-[#4285f4] shadow-lg">
                G
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-black">
                  {carregando ? "Consultando conexão..." : resumo?.conectado ? "Agenda conectada" : "Conectar Google Agenda"}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                  As reservas criadas no PH10 aparecem automaticamente em um calendário separado do Pedro.
                </p>
              </div>
            </div>

            {!carregando && resumo?.conectado ? (
              <>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-neutral-950 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[.18em] text-neutral-500">Conta Google</p>
                    <p className="mt-2 truncate text-sm font-black">{resumo.email}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-neutral-950 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[.18em] text-neutral-500">Calendário</p>
                    <p className="mt-2 truncate text-sm font-black">{resumo.calendario}</p>
                  </div>
                </div>

                <div className={`mt-4 rounded-2xl border p-4 ${resumo.pendentes ? "border-amber-400/20 bg-amber-400/5" : "border-green-400/20 bg-green-400/5"}`}>
                  <p className={`text-sm font-black ${resumo.pendentes ? "text-amber-200" : "text-green-300"}`}>
                    {resumo.pendentes ? `${resumo.pendentes} reserva(s) pendente(s)` : "Todas as reservas futuras estão sincronizadas"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                    O PH10 continua sendo a agenda oficial. Remarcações e cancelamentos devem ser feitos pelo painel.
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={sincronizar} disabled={processando} className="rounded-2xl bg-[#e7d7b8] px-5 py-4 text-sm font-black text-[#24211e] disabled:opacity-50">
                    {processando ? "Sincronizando..." : "Sincronizar agora"}
                  </button>
                  <button type="button" onClick={() => setConfirmarDesconexao(true)} disabled={processando} className="rounded-2xl bg-red-500/10 px-5 py-4 text-sm font-black text-red-200 disabled:opacity-50">
                    Desconectar
                  </button>
                </div>
              </>
            ) : !carregando ? (
              <div className="mt-6">
                <div className="rounded-2xl border border-white/10 bg-neutral-950 p-4">
                  <p className="text-sm font-black">O que será sincronizado</p>
                  <ul className="mt-3 space-y-2 text-sm text-neutral-400">
                    <li>• Nova reserva cria um evento.</li>
                    <li>• Remarcação atualiza o mesmo evento.</li>
                    <li>• Cancelamento remove o evento.</li>
                  </ul>
                </div>
                <a href="/api/google-calendar/connect" className="mt-5 flex w-full items-center justify-center rounded-2xl bg-[#e7d7b8] px-5 py-4 text-sm font-black text-[#24211e] sm:w-auto">
                  Conectar Google Agenda
                </a>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <ConfirmDialog
        aberto={confirmarDesconexao}
        titulo="Desconectar Google Agenda?"
        descricao="Os eventos futuros serão removidos do calendário conectado. As reservas permanecerão salvas no PH10."
        confirmarTexto="Desconectar"
        onConfirmar={desconectar}
        onFechar={() => setConfirmarDesconexao(false)}
      />
      {aviso && <NoticeDialog titulo={aviso.titulo} descricao={aviso.descricao} onFechar={() => setAviso(null)} />}
    </main>
  );
}
