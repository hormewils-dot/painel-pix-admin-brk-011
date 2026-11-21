import { useEffect, useState } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import { KeyRound, Send, Bell, Save, Loader2, QrCode, MapPin, Plus, Trash2 } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";

const EMPTY = {
  chave_pix: "",
  tipo_chave: "aleatoria",
  nome_beneficiario: "",
  cidade: "",
  valor_padrao: 0,
  valores_por_cidade: [],
  telegram_bot_token: "",
  telegram_chat_id: "",
  notificacoes_ativas: false,
  notify_pix_gerado: true,
  notify_pix_copiado: true,
  notify_acesso: false,
};

const Field = ({ label, children, hint }) => (
  <div>
    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
    <div className="mt-1.5">{children}</div>
    {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
  </div>
);

const inputCls =
  "w-full h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring transition-shadow";

export default function Configuracoes() {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setForm({ ...EMPTY, ...r.data })).catch(() => {});
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (which) => {
    setSaving(which);
    try {
      await api.put("/settings", { ...form, valor_padrao: Number(form.valor_padrao) || 0 });
      toast.success("Configurações salvas");
    } catch (e) {
      toast.error("Erro ao salvar", { description: e.response?.data?.detail || e.message });
    } finally {
      setSaving("");
    }
  };

  const testTelegram = async () => {
    setTesting(true);
    try {
      await api.put("/settings", { ...form, valor_padrao: Number(form.valor_padrao) || 0 });
      await api.post("/settings/telegram/test");
      toast.success("Notificação de teste enviada ao grupo!");
    } catch (e) {
      toast.error("Falha no teste", { description: e.response?.data?.detail || e.message });
    } finally {
      setTesting(false);
    }
  };

  // city value rows
  const addCidade = () => setForm((f) => ({ ...f, valores_por_cidade: [...(f.valores_por_cidade || []), { cidade: "", valor: 0 }] }));
  const updCidade = (i, key, val) =>
    setForm((f) => ({
      ...f,
      valores_por_cidade: f.valores_por_cidade.map((row, idx) => (idx === i ? { ...row, [key]: key === "valor" ? val : val } : row)),
    }));
  const delCidade = (i) => setForm((f) => ({ ...f, valores_por_cidade: f.valores_por_cidade.filter((_, idx) => idx !== i) }));

  return (
    <div className="space-y-6 max-w-3xl" data-testid="configuracoes-page">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Chave PIX, valores por cidade e notificações do Telegram.</p>
      </div>

      {/* PIX */}
      <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 grid place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <QrCode size={20} />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold">Chave PIX</h2>
            <p className="text-xs text-muted-foreground">Usada para gerar o PIX copia-e-cola e o QR Code no site público.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tipo de chave">
            <Select value={form.tipo_chave} onValueChange={set("tipo_chave")}>
              <SelectTrigger data-testid="config-pix-key-type-select" className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf_cnpj">CPF / CNPJ</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="telefone">Telefone</SelectItem>
                <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Chave PIX">
            <div className="relative">
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                data-testid="config-pix-key-input"
                value={form.chave_pix}
                onChange={(e) => set("chave_pix")(e.target.value)}
                placeholder="sua-chave-pix"
                className={inputCls + " pl-9 font-mono"}
              />
            </div>
          </Field>
          <Field label="Nome do beneficiário">
            <input
              data-testid="config-pix-receiver-name-input"
              value={form.nome_beneficiario}
              onChange={(e) => set("nome_beneficiario")(e.target.value)}
              placeholder="Razão social ou nome"
              className={inputCls}
            />
          </Field>
          <Field label="Cidade do beneficiário" hint="Vai no código PIX (máx. 15 caracteres).">
            <input
              data-testid="config-pix-city-input"
              value={form.cidade}
              onChange={(e) => set("cidade")(e.target.value)}
              placeholder="São Paulo"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="flex justify-end">
          <button
            data-testid="config-pix-save-button"
            onClick={() => save("pix")}
            disabled={saving === "pix"}
            className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm inline-flex items-center gap-2 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
          >
            {saving === "pix" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar chave PIX
          </button>
        </div>
      </section>

      {/* Valores por cidade */}
      <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 grid place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <MapPin size={20} />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold">Valores por cidade</h2>
            <p className="text-xs text-muted-foreground">Define o valor do débito mostrado ao visitante conforme a cidade.</p>
          </div>
        </div>

        <Field label="Valor padrão (R$)" hint="Usado quando a cidade não está na lista abaixo.">
          <input
            data-testid="config-valor-padrao-input"
            type="number"
            step="0.01"
            min="0"
            value={form.valor_padrao}
            onChange={(e) => set("valor_padrao")(e.target.value)}
            placeholder="0,00"
            className={inputCls + " max-w-[200px] font-mono"}
          />
        </Field>

        <div className="space-y-2" data-testid="config-cidades-list">
          {(form.valores_por_cidade || []).map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                data-testid={`config-cidade-nome-${i}`}
                value={row.cidade}
                onChange={(e) => updCidade(i, "cidade", e.target.value)}
                placeholder="Cidade (ex: Curitiba/PR)"
                className={inputCls + " flex-1"}
              />
              <div className="relative w-36">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                <input
                  data-testid={`config-cidade-valor-${i}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.valor}
                  onChange={(e) => updCidade(i, "valor", e.target.value)}
                  placeholder="0,00"
                  className={inputCls + " pl-8 font-mono"}
                />
              </div>
              <button
                data-testid={`config-cidade-remove-${i}`}
                onClick={() => delCidade(i)}
                className="h-11 w-11 shrink-0 grid place-items-center rounded-xl border border-border hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {!(form.valores_por_cidade || []).length && (
            <p className="text-sm text-muted-foreground">Nenhuma cidade adicionada. Será usado o valor padrão.</p>
          )}
        </div>

        <div className="flex flex-wrap justify-between gap-3">
          <button
            data-testid="config-add-cidade-button"
            onClick={addCidade}
            className="h-11 px-4 rounded-xl border border-border bg-background font-medium text-sm inline-flex items-center gap-2 hover:bg-accent transition"
          >
            <Plus size={16} /> Adicionar cidade
          </button>
          <button
            data-testid="config-valores-save-button"
            onClick={() => save("valores")}
            disabled={saving === "valores"}
            className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm inline-flex items-center gap-2 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
          >
            {saving === "valores" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar valores
          </button>
        </div>
      </section>

      {/* Telegram */}
      <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 grid place-items-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Send size={20} />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold">Notificações do Bot Telegram</h2>
            <p className="text-xs text-muted-foreground">Receba alertas no grupo a cada evento real do site público.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Token do Bot" hint="Obtido com o @BotFather no Telegram.">
            <input
              data-testid="config-telegram-token-input"
              value={form.telegram_bot_token}
              onChange={(e) => set("telegram_bot_token")(e.target.value)}
              placeholder="123456789:ABCdef..."
              className={inputCls + " font-mono"}
            />
          </Field>
          <Field label="Chat ID do Grupo" hint="Ex: -100123456789">
            <input
              data-testid="config-telegram-chatid-input"
              value={form.telegram_chat_id}
              onChange={(e) => set("telegram_chat_id")(e.target.value)}
              placeholder="-100123456789"
              className={inputCls + " font-mono"}
            />
          </Field>
        </div>

        <div className="rounded-xl border border-border/60 divide-y divide-border/60">
          {[
            ["notificacoes_ativas", "Notificações ativas", "Liga ou desliga todos os envios ao Telegram."],
            ["notify_pix_gerado", "Notificar PIX gerado", "Avisa quando um novo PIX é gerado."],
            ["notify_pix_copiado", "Notificar PIX copiado", "Avisa quando o cliente copia o código."],
            ["notify_acesso", "Notificar novo acesso", "Avisa a cada acesso ao site público."],
          ].map(([key, label, desc]) => (
            <div key={key} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-2"><Bell size={13} className="text-muted-foreground" /> {label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <Switch
                data-testid={`config-telegram-switch-${key}`}
                checked={!!form[key]}
                onCheckedChange={set(key)}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            data-testid="config-telegram-test-button"
            onClick={testTelegram}
            disabled={testing}
            className="h-11 px-5 rounded-xl border border-border bg-background font-semibold text-sm inline-flex items-center gap-2 hover:bg-accent transition disabled:opacity-60"
          >
            {testing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Disparar teste
          </button>
          <button
            data-testid="config-telegram-save-button"
            onClick={() => save("telegram")}
            disabled={saving === "telegram"}
            className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm inline-flex items-center gap-2 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
          >
            {saving === "telegram" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar Telegram
          </button>
        </div>
      </section>
    </div>
  );
}
