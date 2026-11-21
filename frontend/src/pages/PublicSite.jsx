import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { API, formatBRL } from "../lib/api";
import { Search, Copy, ShieldCheck, Loader2, FileText, CheckCircle2, Receipt } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";

const pub = axios.create({ baseURL: API });

const maskCPF = (v) => {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

export default function PublicSite() {
  const [info, setInfo] = useState(null);
  const [cpf, setCpf] = useState("");
  const [cidade, setCidade] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const copiedRef = useRef(false);

  useEffect(() => {
    pub.get("/public/info").then((r) => setInfo(r.data)).catch(() => {});
    pub.post("/public/acesso", { page: "home" }).catch(() => {});
  }, []);

  const consultar = async (e) => {
    e.preventDefault();
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11) return toast.error("Digite um CPF válido (11 dígitos).");
    if (info?.cidades?.length && !cidade) return toast.error("Selecione sua cidade.");
    setLoading(true);
    try {
      const r = await pub.post("/public/consulta", { documento: digits, cidade });
      setResult(r.data);
      copiedRef.current = false;
    } catch (err) {
      toast.error(err.response?.data?.detail || "Não foi possível consultar agora.");
    } finally {
      setLoading(false);
    }
  };

  const copiarPix = async () => {
    if (!result?.pix_code) return;
    try {
      await navigator.clipboard.writeText(result.pix_code);
      toast.success("Código PIX copiado! Cole no app do seu banco.");
      if (!copiedRef.current) {
        copiedRef.current = true;
        pub.post("/public/pix-copiado", { id: result.fatura.id }).catch(() => {});
      }
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const reset = () => {
    setResult(null);
    setCpf("");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" data-testid="public-site">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-3xl px-5 h-16 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center text-white">
            <Receipt size={20} />
          </div>
          <div className="leading-none">
            <p className="font-display font-extrabold text-lg">Consulta de Débitos</p>
            <p className="text-[11px] text-slate-500 mt-1">{info?.beneficiario || "Pagamentos via PIX"}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 text-emerald-600 text-xs font-semibold">
            <ShieldCheck size={15} /> Ambiente seguro
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 py-10">
        {!result ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8" data-testid="consulta-card">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-600 grid place-items-center mb-4">
              <FileText size={24} />
            </div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight">Consulte seu débito</h1>
            <p className="text-slate-500 text-sm mt-2">Informe seu CPF para verificar pendências e pagar via PIX.</p>

            <form onSubmit={consultar} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">CPF</label>
                <input
                  data-testid="public-cpf-input"
                  value={cpf}
                  onChange={(e) => setCpf(maskCPF(e.target.value))}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  className="mt-1.5 w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
                />
              </div>

              {info?.cidades?.length > 0 && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cidade</label>
                  <Select value={cidade} onValueChange={setCidade}>
                    <SelectTrigger data-testid="public-cidade-select" className="mt-1.5 h-12 rounded-xl text-base">
                      <SelectValue placeholder="Selecione sua cidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {info.cidades.map((c) => (
                        <SelectItem key={c.cidade} value={c.cidade}>{c.cidade}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <button
                data-testid="public-consultar-button"
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={16} />}
                {loading ? "Consultando..." : "Consultar débito"}
              </button>
            </form>

            {!info?.pagamento_disponivel && (
              <p className="text-xs text-amber-600 mt-4 text-center">
                Pagamentos ainda não configurados. Volte em breve.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8" data-testid="fatura-result">
            <div className="flex items-center gap-2 text-amber-600 text-sm font-semibold">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Débito pendente encontrado
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
              <div className="flex justify-between text-sm py-1">
                <span className="text-slate-500">CPF</span>
                <span className="font-mono font-medium">{maskCPF(result.fatura.documento)}</span>
              </div>
              {result.fatura.cidade && (
                <div className="flex justify-between text-sm py-1">
                  <span className="text-slate-500">Cidade</span>
                  <span className="font-medium">{result.fatura.cidade}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 mt-1 border-t border-slate-200">
                <span className="text-slate-500 text-sm">Valor a pagar</span>
                <span data-testid="fatura-valor" className="font-display text-2xl font-extrabold text-emerald-600">{formatBRL(result.fatura.valor)}</span>
              </div>
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm font-semibold">Pague com PIX</p>
              <p className="text-xs text-slate-500 mt-1">Escaneie o QR Code ou copie o código abaixo.</p>
              <div className="mt-4 inline-grid place-items-center p-4 bg-white border border-slate-200 rounded-2xl">
                <QRCodeSVG data-testid="pix-qrcode" value={result.pix_code} size={196} level="M" />
              </div>
            </div>

            <div className="mt-5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">PIX Copia e Cola</label>
              <div className="mt-1.5 rounded-xl border border-slate-300 bg-slate-50 p-3">
                <p className="font-mono text-[11px] break-all text-slate-700 leading-relaxed">{result.pix_code}</p>
              </div>
              <button
                data-testid="public-copy-pix-button"
                onClick={copiarPix}
                className="mt-3 w-full h-12 rounded-xl bg-slate-900 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 active:scale-[0.99] transition"
              >
                <Copy size={16} /> Copiar código PIX
              </button>
            </div>

            <div className="mt-5 flex items-start gap-2 text-xs text-slate-500 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              Após o pagamento a compensação é automática pelo seu banco. Guarde o comprovante.
            </div>

            <button
              data-testid="public-nova-consulta-button"
              onClick={reset}
              className="mt-4 w-full h-11 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition"
            >
              Fazer nova consulta
            </button>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          <ShieldCheck size={13} className="inline -mt-0.5 mr-1" />
          Conexão criptografada · seus dados estão protegidos
        </p>
      </main>
    </div>
  );
}
