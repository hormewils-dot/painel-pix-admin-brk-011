import { useEffect, useRef, useState } from "react";
import api, { formatBRL, formatDateTime } from "../lib/api";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell,
} from "recharts";
import {
  TrendingUp, Copy, MousePointerClick, DollarSign as Dollar,
  X, Smartphone, Monitor, Globe, MapPin, Cpu, Calendar,
} from "lucide-react";
import ActivityFeed from "../components/ActivityFeed";

const KPIS = [
  { id: "total_pagamentos_rs", label: "Total pagamentos gerados", testid: "kpi-total-pagamentos-gerados", icon: TrendingUp, accent: "text-amber-600 bg-amber-500/10", kind: "brl", deltaKey: "total_pagamentos_rs_hoje", deltaSuffix: "gerados hoje" },
  { id: "total_pix_copiados_rs", label: "Total PIX copiados", testid: "kpi-total-pix-copiados", icon: Copy, accent: "text-purple-600 bg-purple-500/10", kind: "brl", deltaKey: "total_pix_copiados_rs_hoje", deltaSuffix: "copiados hoje" },
  { id: "clicks_home", label: "Clicks página home", testid: "kpi-clicks-pagina-home", icon: MousePointerClick, accent: "text-sky-600 bg-sky-500/10", kind: "int", deltaKey: "clicks_home_hoje", deltaSuffix: "clicks hoje", clickable: true },
];

const fmtDelta = (kind, v) => (kind === "brl" ? `+${formatBRL(v)}` : `+${v}`);

function ClicksModal({ onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.get("/dashboard/clicks", { params: { page: "home", limit: 100 } })
      .then((r) => setRows(r.data.clicks || []))
      .catch(() => setRows([]));
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="clicks-modal">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-display text-lg font-semibold">Cliques · Página home</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Quem acessou — localização, dispositivo, sistema e horário.</p>
          </div>
          <button data-testid="clicks-modal-close" onClick={onClose} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-accent transition">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2" data-testid="clicks-modal-list">
          {rows === null && <p className="text-sm text-muted-foreground px-1">Carregando...</p>}
          {rows !== null && rows.length === 0 && <p className="text-sm text-muted-foreground px-1">Nenhum clique registrado ainda.</p>}
          {(rows || []).map((c, i) => {
            const Dev = c.device === "mobile" ? Smartphone : Monitor;
            const devLabel = c.device === "mobile" ? "Celular" : "Computador";
            return (
              <div key={i} data-testid={`click-row-${i}`} className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5">
                <span className="h-9 w-9 shrink-0 grid place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400"><Dev size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-sm font-medium">
                    <span className="inline-flex items-center gap-1"><MapPin size={13} className="text-muted-foreground" />{c.location || c.cidade || "Localização desconhecida"}</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground"><Dev size={13} /><span className="capitalize">{devLabel}</span></span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground"><Cpu size={13} />{c.so || "—"}</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground"><Globe size={13} />{c.navegador || "—"}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Calendar size={12} /> {formatDateTime(c.created_at)}
                    <span className="font-mono ml-1">· {c.ip || "IP desconhecido"}</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [showClicks, setShowClicks] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await api.get("/dashboard/overview");
        setData(r.data);
      } catch (_) {}
    };
    load();
    timer.current = setInterval(load, 2000);
    return () => clearInterval(timer.current);
  }, []);

  const stats = data?.stats || {};
  const chart = data?.chart || { data: [], total7: 0, melhor_dia: { label: "-", valor: 0 } };

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {showClicks && <ClicksModal onClose={() => setShowClicks(false)} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Dashboard BRK</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão geral em tempo real do site público.</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-2 font-mono text-sm">
          {formatDateTime(new Date().toISOString())}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {KPIS.map((k) => {
          const Icon = k.icon;
          const val = stats[k.id];
          const clickable = k.clickable;
          return (
            <div
              key={k.id}
              data-testid={k.testid}
              onClick={clickable ? () => setShowClicks(true) : undefined}
              className={`group rounded-2xl border border-border bg-card p-5 transition-transform hover:-translate-y-0.5 hover:shadow-md ${clickable ? "cursor-pointer" : ""}`}
            >
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</p>
                <span className={`h-9 w-9 grid place-items-center rounded-lg ${k.accent}`}><Icon size={18} /></span>
              </div>
              <p className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mt-3">
                {k.kind === "brl" ? formatBRL(val) : (val ?? 0)}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                {fmtDelta(k.kind, stats[k.deltaKey])} {k.deltaSuffix}
              </p>
              {clickable && (
                <p className="text-[11px] text-sky-600 dark:text-sky-400 font-medium mt-2">Clique para ver os detalhes dos cliques →</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Chart + recent */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-border bg-card p-5" data-testid="chart-pagamentos-7-dias">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-lg font-semibold">Pagamentos nos últimos 7 dias</h2>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <TrendingUp size={13} /> Total: {formatBRL(chart.total7)} · melhor dia: {chart.melhor_dia?.label} ({formatBRL(chart.melhor_dia?.valor)})
              </p>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--accent))" }}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--popover-foreground))" }}
                  formatter={(v) => [formatBRL(v), "Pagamentos"]}
                />
                <Bar dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {chart.data.map((_, i) => (
                    <Cell key={i} fill="hsl(var(--primary))" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold mb-1">Pagamentos gerados recentemente</h2>
          <p className="text-xs text-muted-foreground mb-4">Últimas faturas lançadas pelo site público.</p>
          <div className="space-y-2" data-testid="recent-payments">
            {(data?.recentes || []).map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-9 w-9 shrink-0 grid place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Dollar size={16} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">Documento: <span className="font-mono">{f.documento}</span></p>
                    <p className="text-[11px] text-muted-foreground">{formatDateTime(f.created_at)}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">+{formatBRL(f.valor)}</p>
              </div>
            ))}
            {!data?.recentes?.length && <p className="text-sm text-muted-foreground">Carregando...</p>}
          </div>
        </div>
      </div>

      {/* Live feed preview */}
      <ActivityFeed activities={data?.activities} compact />
    </div>
  );
}
