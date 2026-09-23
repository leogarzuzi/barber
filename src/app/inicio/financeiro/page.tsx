"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Agendamento,
  Cliente,
  dataLocal,
  nomePlanoMensal,
  normalizarWhatsapp,
  perfilInicial,
  type PerfilBarbearia,
} from "@/lib/barber-storage";
import { criarClienteSupabase } from "@/lib/supabase/client";
import { buscarAgendamentos, buscarClientes } from "@/lib/supabase/agenda";
import { buscarConfiguracao, perfilDoBanco } from "@/lib/supabase/configuracoes";
import { calcularResumoFinanceiro, nomeDoMes } from "@/lib/resumo-financeiro";
import { gerarRelatorioFinanceiroPdf } from "@/lib/relatorio-financeiro";

function dinheiro(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function baixarArquivo(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function deslocarMes(mes: string, quantidade: number) {
  const data = new Date(`${mes}-01T12:00:00`);
  data.setMonth(data.getMonth() + quantidade);
  return dataLocal(data).slice(0, 7);
}

function iconeWhatsapp() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.4-4.7a8.5 8.5 0 1 1 16.1-4.1Z" />
      <path d="M8.2 8.1c.3 3.7 2.1 5.5 5.8 5.8l1.3-1.3c.2-.2.5-.2.7-.1l2 .9" />
    </svg>
  );
}

export default function FinanceiroPage() {
  const mesAtual = dataLocal().slice(0, 7);
  const [mesSelecionado, setMesSelecionado] = useState(mesAtual);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [perfil, setPerfil] = useState<PerfilBarbearia>({ ...perfilInicial, whatsapp: "" });
  const [agora, setAgora] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [preparando, setPreparando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const supabase = criarClienteSupabase();
        const [reservas, cadastros, configuracao] = await Promise.all([
          buscarAgendamentos(supabase),
          buscarClientes(supabase),
          buscarConfiguracao(supabase),
        ]);
        if (ativo) {
          setAgendamentos(reservas);
          setClientes(cadastros);
          setPerfil(perfilDoBanco(configuracao));
          setAgora(Date.now());
          setErro("");
        }
      } catch {
        if (ativo) setErro("Não foi possível carregar os dados do resumo financeiro.");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void carregar();
    window.addEventListener("ph10:agendamentos-atualizados", carregar);
    window.addEventListener("ph10:clientes-atualizados", carregar);
    window.addEventListener("ph10:perfil-atualizado", carregar);
    return () => {
      ativo = false;
      window.removeEventListener("ph10:agendamentos-atualizados", carregar);
      window.removeEventListener("ph10:clientes-atualizados", carregar);
      window.removeEventListener("ph10:perfil-atualizado", carregar);
    };
  }, []);

  const resumo = useMemo(
    () => calcularResumoFinanceiro(agendamentos, clientes, mesSelecionado, agora),
    [agendamentos, clientes, mesSelecionado, agora],
  );
  const periodo = nomeDoMes(resumo.mes);

  async function prepararEnvio() {
    if (preparando) return;
    setPreparando(true);
    setMensagem("");
    setErro("");

    try {
      const pdf = gerarRelatorioFinanceiroPdf(resumo, perfil);
      const arquivo = new File([pdf.blob], pdf.arquivo, { type: "application/pdf" });
      const podeCompartilharArquivo = typeof navigator.share === "function"
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [arquivo] });

      if (podeCompartilharArquivo) {
        await navigator.share({
          files: [arquivo],
          title: `Resumo financeiro - ${periodo}`,
          text: `Resumo financeiro de ${periodo} da ${perfil.nome}. Envie para ${perfil.responsavel} pelo WhatsApp.`,
        });
        setMensagem("PDF preparado. No compartilhamento, escolha o WhatsApp e envie para a sua própria conversa.");
        return;
      }

      baixarArquivo(pdf.blob, pdf.arquivo);
      const numero = normalizarWhatsapp(perfil.whatsapp);
      const texto = encodeURIComponent(`Resumo financeiro de ${periodo} - ${perfil.nome}. O PDF já foi baixado; agora é só anexá-lo nesta conversa.`);
      window.open(`https://wa.me/${numero}?text=${texto}`, "_blank", "noopener,noreferrer");
      setMensagem("O PDF foi baixado e a conversa do WhatsApp foi aberta. Agora, anexe o arquivo baixado e envie.");
    } catch (falha) {
      if (falha instanceof DOMException && falha.name === "AbortError") return;
      setErro("Não foi possível preparar o PDF. Tente novamente.");
    } finally {
      setPreparando(false);
    }
  }

  function baixarPdf() {
    try {
      const pdf = gerarRelatorioFinanceiroPdf(resumo, perfil);
      baixarArquivo(pdf.blob, pdf.arquivo);
      setErro("");
      setMensagem("PDF baixado com sucesso.");
    } catch {
      setErro("Não foi possível gerar o PDF. Tente novamente.");
    }
  }

  return (
    <main className="app-page">
      <div className="page-wrap">
        <header className="hero-panel">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">PH10 • Controle mensal</p>
              <h1 className="display-font page-title mt-2">Financeiro</h1>
              <p className="subtle mt-3 text-sm">Visão prevista de {periodo}, considerando reservas válidas e mensalidades ativas.</p>
            </div>
            <div className="block shrink-0">
              <span className="block text-[10px] font-black uppercase tracking-[.18em] text-[#d8c29e]">Mês do resumo</span>
              <span className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMesSelecionado((mes) => deslocarMes(mes, -1))}
                  aria-label="Mês anterior"
                  title="Mês anterior"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-neutral-950 text-lg font-black text-[#d8c29e]"
                >
                  ←
                </button>
                <input
                  type="month"
                  value={mesSelecionado}
                  onChange={(event) => setMesSelecionado(event.target.value || mesAtual)}
                  aria-label="Escolher mês do resumo"
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm font-black text-white outline-none focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/20"
                />
                <button
                  type="button"
                  onClick={() => setMesSelecionado((mes) => deslocarMes(mes, 1))}
                  aria-label="Próximo mês"
                  title="Próximo mês"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-neutral-950 text-lg font-black text-[#d8c29e]"
                >
                  →
                </button>
              </span>
            </div>
          </div>
        </header>

        {carregando ? (
          <section className="mt-5 rounded-[1.75rem] bg-neutral-900 p-8 text-center text-sm text-neutral-400">Carregando resumo financeiro...</section>
        ) : (
          <>
            <section className="card card-accent mt-5 p-5 lg:p-6">
              <p className="metric-label !text-[#695d4e]">Faturamento previsto no mês</p>
              <strong className="mt-3 block text-4xl font-black">{dinheiro(resumo.total)}</strong>
              <p className="mt-3 text-xs text-[#695d4e]">Valores previstos; o controle de pagamentos ainda não faz parte deste cálculo.</p>
            </section>

            <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <article className="card p-4 lg:p-5"><p className="metric-label">Reservas avulsas</p><strong className="mt-3 block text-2xl font-black text-amber-300">{dinheiro(resumo.receitaAvulsa)}</strong><p className="mt-2 text-xs text-neutral-500">{resumo.reservasAvulsas} reserva(s) válida(s)</p></article>
              <article className="card p-4 lg:p-5"><p className="metric-label">Mensalidades</p><strong className="mt-3 block text-2xl font-black text-green-300">{dinheiro(resumo.receitaMensalidades)}</strong><p className="mt-2 text-xs text-neutral-500">{resumo.mensalistas.length} mensalista(s) ativo(s)</p></article>
              <article className="card p-4 lg:p-5"><p className="metric-label">Realizados</p><strong className="mt-3 block text-2xl font-black">{resumo.realizados}</strong><p className="mt-2 text-xs text-neutral-500">{resumo.clientesAtendidos} cliente(s) atendido(s)</p></article>
              <article className="card p-4 lg:p-5"><p className="metric-label">Ticket médio</p><strong className="mt-3 block text-2xl font-black">{dinheiro(resumo.ticketMedioAvulso)}</strong><p className="mt-2 text-xs text-neutral-500">por reserva avulsa válida</p></article>
            </section>

            <section className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
              <article className="rounded-[1.75rem] bg-neutral-900 p-5 lg:p-6">
                <div className="border-b border-white/10 pb-4">
                  <p className="text-xs font-black uppercase tracking-[.18em] text-amber-400">Movimento do mês</p>
                  <h2 className="mt-1 text-xl font-black">Situação dos agendamentos</h2>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4">
                  <div><dt className="text-xs text-neutral-500">Reservas válidas</dt><dd className="mt-1 text-2xl font-black text-green-300">{resumo.reservasValidas}</dd></div>
                  <div><dt className="text-xs text-neutral-500">Aguardando atendimento</dt><dd className="mt-1 text-2xl font-black">{resumo.agendados + resumo.emAtendimento}</dd></div>
                  <div><dt className="text-xs text-neutral-500">Cancelamentos</dt><dd className="mt-1 text-2xl font-black">{resumo.cancelados}</dd></div>
                  <div><dt className="text-xs text-neutral-500">Não compareceram</dt><dd className="mt-1 text-2xl font-black">{resumo.faltas}</dd></div>
                </dl>
              </article>

              <article className="rounded-[1.75rem] border border-[#d8c29e]/20 bg-[#24211e] p-5 lg:p-6">
                <p className="text-xs font-black uppercase tracking-[.18em] text-[#d8c29e]">Fechamento mensal</p>
                <h2 className="mt-2 text-xl font-black">Enviar o PDF para você</h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">O relatório usa o WhatsApp de <strong className="text-neutral-200">{perfil.responsavel}</strong>, cadastrado no Perfil.</p>
                <button
                  type="button"
                  onClick={prepararEnvio}
                  disabled={preparando || !perfil.whatsapp}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-green-400 px-5 py-4 text-sm font-black text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {iconeWhatsapp()}
                  {preparando ? "Preparando PDF..." : "Preparar envio no WhatsApp"}
                </button>
                <button type="button" onClick={baixarPdf} className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-black text-[#e7d7b8]">Baixar PDF</button>
                <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">No celular, escolha o WhatsApp no menu de compartilhamento. No computador, o arquivo será baixado e a conversa será aberta para você anexá-lo.</p>
              </article>
            </section>

            <section className="mt-5 rounded-[1.75rem] bg-neutral-900 p-5">
              <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-amber-400">Planos mensais</p><h2 className="mt-1 text-xl font-black">Clientes ativos</h2></div><span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-300">{resumo.reservasMensalistas} reserva(s)</span></div>
              {resumo.mensalistas.length === 0 ? <p className="py-8 text-center text-sm text-neutral-400">Nenhum mensalista ativo.</p> : <div className="divide-y divide-white/10">{resumo.mensalistas.map((cliente) => <article key={cliente.id} className="flex items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="truncate font-black">{cliente.nome}</p><p className="mt-1 text-xs text-neutral-500">{nomePlanoMensal(cliente.planoMensal)} • {cliente.atendimentos} atendimento(s) no período</p></div><strong className="shrink-0 text-amber-300">{dinheiro(cliente.mensalidade)}</strong></article>)}</div>}
            </section>
          </>
        )}

        {erro && <p role="alert" className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-200">{erro}</p>}
        {mensagem && <p role="status" className="mt-4 rounded-2xl border border-green-400/20 bg-green-400/10 px-4 py-3 text-sm font-bold text-green-200">{mensagem}</p>}
      </div>
    </main>
  );
}
