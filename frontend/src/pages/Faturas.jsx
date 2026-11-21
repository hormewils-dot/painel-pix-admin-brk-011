import { useEffect, useRef, useState } from "react";
import api, { formatBRL, formatDateTime } from "../lib/api";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Search, Copy, Eye, QrCode, Smartphone, Monitor } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";

const STATUS_CLS = {
  aguardando: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  gerado: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  copiado: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  pendente: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  pago: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  expirado: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
};

const STATUS_LABEL = { aguardando: "Aguardando", gerado: "Gerado", copiado: "Copiado", pendente: "Gerado", pago: "Pago", expirado: "Expirado" };

export default function Faturas() {
  const [faturas, setFaturas] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const knownIds = useRef(null);

  const load = async () => {
    try {
      const r = await api.get("/faturas", { params: { search: search || undefined, status, limit: 200 } });
      const novas = r.data.faturas;
      if (knownIds.current !== null) {
        const chegaram = novas.filter((f) => !knownIds.current.has(f.id));
        if (chegaram.length) {
          toast.success(
            chegaram.length === 1 ? "Nova fatura gerada" : `${chegaram.length} novas faturas geradas`,
            { description: chegaram.length === 1 ? `Documento ${chegaram[0].documento}` : "Atualizado no site público." }
          );
        }
      }
      knownIds.current = new Set(novas.map((f) => f.id));
      setFaturas(novas);
      setTotal(r.data.total);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    knownIds.current = null;
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  useEffect(() => {
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const copiarPix = async (f) => {
    if (!f.pix_code) return toast.error("Esta fatura não possui código PIX.");
    try {
      await navigator.clipboard.writeText(f.pix_code);
      toast.success("Código PIX copiado", { description: `Documento ${f.documento}` });
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="space-y-6" data-testid="faturas-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Faturas Geradas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total} fatura{total === 1 ? "" : "s"} gerada{total === 1 ? "" : "s"} no site público.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid="faturas-table-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por documento..."
            className="w-full h-11 rounded-xl border border-input bg-card pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring font-mono"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger data-testid="faturas-table-status-filter" className="w-[180px] h-11 rounded-xl">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="aguardando">Aguardando</SelectItem>
            <SelectItem value="gerado">Gerado</SelectItem>
            <SelectItem value="copiado">Copiado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="faturas-table">
            <thead>
              <tr className="border-b border-border text-left">
                {["Documento", "Valor", "Cidade", "Dispositivo", "Status", "QR", "Data", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-mono whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {faturas.map((f) => {
                const Device = f.device === "desktop" ? Monitor : Smartphone;
                return (
                  <tr key={f.id} data-testid={`fatura-row-${f.documento}`} className="border-b border-border/50 hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{f.documento}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{f.valor > 0 ? formatBRL(f.valor) : <span className="text-muted-foreground/60">—</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{f.cidade || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground capitalize">
                        <Device size={14} /> {f.device}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_CLS[f.status] || ""}`}>
                        {STATUS_LABEL[f.status] || f.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {f.qr_copiado ? <QrCode size={16} className="text-blue-500" /> : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{formatDateTime(f.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          data-testid={`faturas-table-view-${f.documento}`}
                          onClick={() => setSelected(f)}
                          className="h-9 w-9 grid place-items-center rounded-lg border border-border hover:bg-accent transition-colors"
                          title="Detalhes"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          data-testid="faturas-table-copy-pix-button"
                          onClick={() => copiarPix(f)}
                          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border hover:bg-accent transition-colors text-xs font-medium whitespace-nowrap"
                          title="Copiar PIX"
                        >
                          <Copy size={14} /> PIX
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading && <p className="p-6 text-sm text-muted-foreground">Carregando faturas...</p>}
        {!loading && !faturas.length && <p className="p-6 text-sm text-muted-foreground">Nenhuma fatura gerada ainda. Elas aparecerão aqui quando alguém gerar um PIX no site público.</p>}
      </div>

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent data-testid="fatura-detail-modal" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Detalhes da Fatura</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid place-items-center">
                {selected.pix_code ? (
                  <div className="p-3 bg-white rounded-xl border border-border">
                    <QRCodeSVG value={selected.pix_code} size={150} level="M" />
                  </div>
                ) : (
                  <div className="h-40 w-40 rounded-xl border border-border bg-background grid place-items-center">
                    <QrCode size={110} strokeWidth={1} className="text-muted-foreground" />
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground mt-2">QR Code PIX · Documento {selected.documento}</p>
              </div>
              <dl className="text-sm divide-y divide-border/60 rounded-xl border border-border/60">
                {[
                  ["Documento", selected.documento],
                  ["Valor", selected.valor > 0 ? formatBRL(selected.valor) : "—"],
                  ["Status", STATUS_LABEL[selected.status] || selected.status],
                  ["Cidade", selected.cidade || "-"],
                  ["Dispositivo", selected.device],
                  ["Navegador", selected.navegador],
                  ["Gerada em", formatDateTime(selected.created_at)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-3 py-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              {selected.pix_code && (
                <div className="rounded-xl border border-border/60 bg-background p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">PIX Copia e Cola</p>
                  <p className="font-mono text-[10px] break-all text-emerald-600 dark:text-emerald-400">{selected.pix_code}</p>
                </div>
              )}
              <button
                data-testid="fatura-detail-copy-pix"
                onClick={() => copiarPix(selected)}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm inline-flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] transition"
              >
                <Copy size={16} /> Copiar código PIX
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
