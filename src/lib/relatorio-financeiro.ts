import { jsPDF } from "jspdf";
import type { PerfilBarbearia } from "@/lib/barber-storage";
import { nomeDoMes, type ResumoFinanceiroMensal } from "@/lib/resumo-financeiro";

const CORES = {
  fundo: [24, 22, 20] as const,
  painel: [38, 35, 31] as const,
  creme: [231, 215, 184] as const,
  dourado: [245, 174, 65] as const,
  texto: [246, 242, 234] as const,
  suave: [176, 165, 151] as const,
  tinta: [36, 33, 30] as const,
  verde: [134, 239, 172] as const,
};

function dinheiro(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function nomeArquivo(perfil: PerfilBarbearia, mes: string) {
  const nome = perfil.nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `resumo-financeiro-${nome || "barbearia"}-${mes}.pdf`;
}

export type RelatorioPdf = {
  blob: Blob;
  arquivo: string;
};

export function gerarRelatorioFinanceiroPdf(
  resumo: ResumoFinanceiroMensal,
  perfil: PerfilBarbearia,
): RelatorioPdf {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const largura = 210;
  const altura = 297;
  const margem = 16;
  const larguraUtil = largura - margem * 2;
  let y = 0;

  function fundoDaPagina() {
    doc.setFillColor(...CORES.fundo);
    doc.rect(0, 0, largura, altura, "F");
  }

  function novaPagina() {
    doc.addPage();
    fundoDaPagina();
    y = 18;
  }

  function garantirEspaco(necessario: number) {
    if (y + necessario > 276) novaPagina();
  }

  function tituloSecao(sobretitulo: string, titulo: string) {
    garantirEspaco(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...CORES.dourado);
    doc.text(sobretitulo.toUpperCase(), margem, y);
    doc.setFontSize(14);
    doc.setTextColor(...CORES.texto);
    doc.text(titulo, margem, y + 6);
    y += 12;
  }

  function cartaoMetrica(x: number, topo: number, w: number, rotulo: string, valor: string, detalhe: string) {
    doc.setFillColor(...CORES.painel);
    doc.roundedRect(x, topo, w, 30, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.7);
    doc.setTextColor(...CORES.suave);
    doc.text(rotulo.toUpperCase(), x + 5, topo + 7);
    doc.setFontSize(13);
    doc.setTextColor(...CORES.texto);
    doc.text(valor, x + 5, topo + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...CORES.suave);
    doc.text(detalhe, x + 5, topo + 24);
  }

  function cabecalhoTabela(colunas: Array<{ texto: string; x: number; alinhamento?: "left" | "right" }>) {
    doc.setFillColor(...CORES.creme);
    doc.roundedRect(margem, y, larguraUtil, 9, 2.5, 2.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...CORES.tinta);
    for (const coluna of colunas) {
      doc.text(coluna.texto.toUpperCase(), coluna.x, y + 5.8, { align: coluna.alinhamento ?? "left" });
    }
    y += 12;
  }

  fundoDaPagina();

  doc.setFillColor(...CORES.painel);
  doc.roundedRect(margem, 15, larguraUtil, 48, 7, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...CORES.dourado);
  doc.text("FECHAMENTO MENSAL", margem + 8, 26);
  doc.setFontSize(24);
  doc.setTextColor(...CORES.texto);
  doc.text("Resumo financeiro", margem + 8, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CORES.suave);
  doc.text(`${perfil.nome}  |  ${nomeDoMes(resumo.mes)}`, margem + 8, 47);
  doc.text(`Responsável: ${perfil.responsavel}`, margem + 8, 54);
  y = 71;

  doc.setFillColor(...CORES.creme);
  doc.roundedRect(margem, y, larguraUtil, 36, 6, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(105, 93, 78);
  doc.text("FATURAMENTO PREVISTO NO MÊS", margem + 7, y + 9);
  doc.setFontSize(25);
  doc.setTextColor(...CORES.tinta);
  doc.text(dinheiro(resumo.total), margem + 7, y + 23);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(105, 93, 78);
  doc.text("Reservas válidas + mensalidades ativas", margem + 7, y + 30);
  y += 43;

  const gap = 4;
  const cardW = (larguraUtil - gap) / 2;
  cartaoMetrica(margem, y, cardW, "Receita avulsa", dinheiro(resumo.receitaAvulsa), `${resumo.reservasAvulsas} reserva(s) válida(s)`);
  cartaoMetrica(margem + cardW + gap, y, cardW, "Mensalidades", dinheiro(resumo.receitaMensalidades), `${resumo.mensalistas.length} mensalista(s) ativo(s)`);
  y += 34;
  cartaoMetrica(margem, y, cardW, "Atendimentos realizados", String(resumo.realizados), `${resumo.clientesAtendidos} cliente(s) atendido(s)`);
  cartaoMetrica(margem + cardW + gap, y, cardW, "Ticket médio avulso", dinheiro(resumo.ticketMedioAvulso), "sobre reservas avulsas válidas");
  y += 39;

  tituloSecao("Movimento", "Situação dos agendamentos");
  const itensMovimento = [
    ["Reservas válidas", resumo.reservasValidas],
    ["Aguardando atendimento", resumo.agendados + resumo.emAtendimento],
    ["Cancelamentos", resumo.cancelados],
    ["Não compareceram", resumo.faltas],
  ] as const;
  const colunaW = larguraUtil / itensMovimento.length;
  for (const [indice, [rotulo, valor]] of itensMovimento.entries()) {
    const x = margem + indice * colunaW;
    const corMetrica = indice < 2 ? CORES.verde : CORES.texto;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(corMetrica[0], corMetrica[1], corMetrica[2]);
    doc.text(String(valor), x, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...CORES.suave);
    const linhas = doc.splitTextToSize(rotulo, colunaW - 4) as string[];
    doc.text(linhas, x, y + 11);
  }
  y += 25;

  const servicosExibidos = resumo.servicos.slice(0, 10);
  if (y + 25 + servicosExibidos.length * 10 > 276) novaPagina();
  tituloSecao("Preferências", "Serviços mais reservados");
  if (resumo.servicos.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...CORES.suave);
    doc.text("Nenhuma reserva válida neste mês.", margem, y + 4);
    y += 12;
  } else {
    cabecalhoTabela([
      { texto: "Serviço", x: margem + 4 },
      { texto: "Reservas", x: 157, alinhamento: "right" },
      { texto: "Receita avulsa", x: 190, alinhamento: "right" },
    ]);
    for (const item of servicosExibidos) {
      if (y + 10 > 260) {
        novaPagina();
        tituloSecao("Preferências - continuação", "Serviços mais reservados");
        cabecalhoTabela([
          { texto: "Serviço", x: margem + 4 },
          { texto: "Reservas", x: 157, alinhamento: "right" },
          { texto: "Receita avulsa", x: 190, alinhamento: "right" },
        ]);
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...CORES.texto);
      const nome = doc.splitTextToSize(item.nome, 98)[0] as string;
      doc.text(nome, margem + 4, y + 4);
      doc.setFont("helvetica", "bold");
      doc.text(String(item.quantidade), 157, y + 4, { align: "right" });
      doc.text(dinheiro(item.valor), 190, y + 4, { align: "right" });
      doc.setDrawColor(61, 57, 52);
      doc.line(margem, y + 8, margem + larguraUtil, y + 8);
      y += 10;
    }
  }

  garantirEspaco(40);
  y += 3;
  tituloSecao("Planos", "Mensalistas ativos");
  if (resumo.mensalistas.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...CORES.suave);
    doc.text("Nenhum mensalista ativo na data de emissão.", margem, y + 4);
    y += 12;
  } else {
    cabecalhoTabela([
      { texto: "Cliente", x: margem + 4 },
      { texto: "Atendimentos", x: 157, alinhamento: "right" },
      { texto: "Mensalidade", x: 190, alinhamento: "right" },
    ]);
    for (const cliente of resumo.mensalistas) {
      if (y + 10 > 255) {
        novaPagina();
        tituloSecao("Planos - continuação", "Mensalistas ativos");
        cabecalhoTabela([
          { texto: "Cliente", x: margem + 4 },
          { texto: "Atendimentos", x: 157, alinhamento: "right" },
          { texto: "Mensalidade", x: 190, alinhamento: "right" },
        ]);
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...CORES.texto);
      const nome = doc.splitTextToSize(cliente.nome, 98)[0] as string;
      doc.text(nome, margem + 4, y + 4);
      doc.setFont("helvetica", "bold");
      doc.text(String(cliente.atendimentos), 157, y + 4, { align: "right" });
      doc.text(dinheiro(cliente.mensalidade), 190, y + 4, { align: "right" });
      doc.setDrawColor(61, 57, 52);
      doc.line(margem, y + 8, margem + larguraUtil, y + 8);
      y += 10;
    }
  }

  garantirEspaco(35);
  y += 5;
  doc.setFillColor(...CORES.painel);
  doc.roundedRect(margem, y, larguraUtil, 26, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...CORES.dourado);
  doc.text("OBSERVAÇÃO", margem + 6, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...CORES.suave);
  const observacao = "Este relatório apresenta valores previstos, não a confirmação de pagamentos. As mensalidades consideram os clientes ativos na data em que o PDF foi gerado.";
  doc.text(doc.splitTextToSize(observacao, larguraUtil - 12), margem + 6, y + 13);

  const paginas = doc.getNumberOfPages();
  const geradoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...CORES.suave);
    doc.text(`Gerado em ${geradoEm}`, margem, 288);
    doc.text(`${pagina} / ${paginas}`, 194, 288, { align: "right" });
  }

  return {
    blob: doc.output("blob"),
    arquivo: nomeArquivo(perfil, resumo.mes),
  };
}
