import { Agendamento, StatusAtendimento } from "@/lib/barber-storage";

export type AgendamentoExibido = Agendamento & { status: StatusAtendimento };

type Props = {
  item: AgendamentoExibido;
  ativo: boolean;
  encerrado?: boolean;
  whatsappHref: string;
  onRemarcar: (item: AgendamentoExibido) => void;
  onEditarStatus: (item: AgendamentoExibido) => void;
};

function dinheiro(valor: number) { return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function statusClass(status: StatusAtendimento) {
  if (status === "Concluído") return "bg-green-500/10 text-green-300";
  if (status === "Em atendimento") return "bg-blue-500/10 text-blue-300";
  if (status === "Agendado") return "bg-amber-400/10 text-amber-300";
  return "bg-red-500/10 text-red-300";
}

export default function AppointmentCard({ item, ativo, encerrado, whatsappHref, onRemarcar, onEditarStatus }: Props) {
  return <article className={`rounded-[1.75rem] p-4 ${encerrado ? "bg-neutral-900/60 text-neutral-400" : "bg-neutral-900"}`}><div className="flex items-start justify-between gap-4"><div><p className={`text-sm font-black ${encerrado ? "text-neutral-500" : "text-amber-400"}`}>{item.hora}</p><h3 className={`mt-1 text-lg font-black ${encerrado ? "text-neutral-300" : ""}`}>{item.cliente}</h3><p className="text-sm text-neutral-400">{item.servico}</p>{item.codigo && <p className="mt-2 font-mono text-[11px] font-bold tracking-wider text-neutral-500">{item.codigo}</p>}</div><div className="text-right"><p className={`font-black ${encerrado ? "text-neutral-300" : ""}`}>{item.cobertoPorMensalidade ? "Mensalista" : dinheiro(item.valor)}</p><span className={`mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-black ${statusClass(item.status)}`}>{item.status}</span></div></div>{encerrado ? <button type="button" onClick={() => onEditarStatus(item)} className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-xs font-black text-neutral-300">Editar status</button> : <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3"><a href={whatsappHref} target="_blank" rel="noreferrer" className="rounded-2xl bg-green-500 px-3 py-3 text-center text-xs font-black text-white">WhatsApp</a><button type="button" onClick={() => onRemarcar(item)} disabled={!ativo} className="rounded-2xl bg-white/10 px-3 py-3 text-xs font-black disabled:opacity-30">Remarcar</button><button type="button" onClick={() => onEditarStatus(item)} className="rounded-2xl bg-white/10 px-3 py-3 text-xs font-black">Editar status</button></div>}</article>;
}
