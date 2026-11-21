import {
  Eye, QrCode, Copy, DollarSign, FileText, Smartphone, Monitor,
} from "lucide-react";
import { timeAgo, formatBRL } from "../lib/api";

const META = {
  pix_gerado: { icon: QrCode, cls: "text-amber-600 bg-amber-500/10", tag: "PIX gerado" },
  qr_copiado: { icon: Copy, cls: "text-blue-600 bg-blue-500/10", tag: "QR copiado" },
  pix_copiado: { icon: DollarSign, cls: "text-emerald-600 bg-emerald-500/10", tag: "PIX copiado" },
  acesso_home: { icon: Eye, cls: "text-sky-600 bg-sky-500/10", tag: "Acesso" },
  acesso_faturas: { icon: FileText, cls: "text-indigo-600 bg-indigo-500/10", tag: "Acesso" },
};

export default function ActivityFeed({ activities, compact }) {
  const list = activities || [];
  return (
    <div className="rounded-2xl border border-border bg-card p-5" data-testid="live-activity-feed">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Atividade em tempo real</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Todos os eventos registrados no site público.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 text-[11px] font-semibold">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          AO VIVO
        </span>
      </div>
      <div className={`space-y-1.5 ${compact ? "max-h-[360px]" : "max-h-[640px]"} overflow-y-auto pr-1`}>
        {list.map((a) => {
          const m = META[a.type] || META.acesso_home;
          const Icon = m.icon;
          const Device = a.device === "desktop" ? Monitor : Smartphone;
          return (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5 hover:bg-accent/50 transition-colors">
              <span className={`h-9 w-9 shrink-0 grid place-items-center rounded-lg ${m.cls}`}><Icon size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{a.title}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  {a.device && <Device size={12} />}
                  {a.subtitle}
                </p>
              </div>
              <div className="text-right shrink-0">
                {a.valor != null && <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatBRL(a.valor)}</p>}
                <p className="text-[11px] text-muted-foreground">{timeAgo(a.created_at)}</p>
              </div>
            </div>
          );
        })}
        {!list.length && <p className="text-sm text-muted-foreground">Aguardando eventos...</p>}
      </div>
    </div>
  );
}
