type Props = {
  titulo: string;
  descricao: string;
  onFechar: () => void;
  botaoTexto?: string;
  tipo?: "aviso" | "sucesso";
};

export default function NoticeDialog({ titulo, descricao, onFechar, botaoTexto = "Entendi", tipo = "aviso" }: Props) {
  return (
    <div onClick={onFechar} className="safe-modal-shell fixed inset-0 z-[360] flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div role="alertdialog" aria-modal="true" aria-labelledby="notice-dialog-title" onClick={(event) => event.stopPropagation()} className="safe-modal-card w-full max-w-sm rounded-[2rem] border border-white/10 bg-neutral-900 p-6 text-center text-white shadow-2xl">
        <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${tipo === "sucesso" ? "bg-green-500/10 text-green-300" : "bg-amber-400/10 text-amber-400"}`}>
          {tipo === "sucesso" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 fill-none stroke-current" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 4 4L19 6" />
            </svg>
          ) : (
            <span className="text-2xl font-black">!</span>
          )}
        </div>
        <h2 id="notice-dialog-title" className="mt-4 text-2xl font-black">{titulo}</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">{descricao}</p>
        <button type="button" onClick={onFechar} className="mt-6 w-full rounded-2xl bg-amber-400 px-4 py-4 text-sm font-black text-neutral-950">{botaoTexto}</button>
      </div>
    </div>
  );
}
