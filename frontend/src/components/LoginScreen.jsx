import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Eye, EyeOff, ShieldCheck, ArrowRight, Loader2, Receipt } from "lucide-react";

const HERO =
  "https://customer-assets-4nw71qhi.emergentagent.net/job_painel-pix-admin--8o1srzaj/artifacts/88d17c75c6d9b6a1_As-Tartarugas-Ninja-Fora-das-Sombras-Novo-Trailer.webp";

const formatErr = (detail) => {
  if (!detail) return "Não foi possível entrar. Tente novamente.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || "").join(" ");
  return String(detail);
};

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(formatErr(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full relative flex items-center justify-center p-4 sm:p-6 bg-[#0b0a08] text-white selection:bg-amber-500/40"
      style={{ backgroundImage: `url(${HERO})`, backgroundSize: "cover", backgroundPosition: "center" }}
    >
      {/* Dark overlay for legibility */}
      <div className="absolute inset-0 bg-black/55" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />

      {/* Centered login card */}
      <div
        data-testid="login-card"
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-black/55 backdrop-blur-2xl p-8 sm:p-10 shadow-[0_40px_90px_-25px_rgba(0,0,0,0.9)]"
      >
        {/* Brand */}
        <div className="flex flex-col items-center text-center">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 grid place-items-center shadow-lg shadow-orange-900/50">
            <Receipt size={26} className="text-black/80" />
          </div>
          <p className="font-display font-extrabold text-xl mt-4">
            BRK <span className="text-amber-400">Faturas</span>
          </p>
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-200/60 mt-1">Painel Admin</p>
        </div>

        <h1 className="font-display text-2xl font-extrabold tracking-tight mt-7 text-center">Acessar painel</h1>
        <p className="text-white/50 text-sm mt-2 text-center">Digite suas credenciais para continuar.</p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-amber-200/70">Usuário</label>
            <input
              data-testid="login-username-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Digite seu usuário"
              autoComplete="off"
              className="mt-2 w-full h-12 rounded-xl border border-white/10 bg-white/5 text-white px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400/70 focus:border-transparent placeholder:text-white/30 transition-shadow"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-amber-200/70">Senha</label>
            <div className="mt-2 relative">
              <input
                data-testid="login-password-input"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                autoComplete="current-password"
                className="w-full h-12 rounded-xl border border-white/10 bg-white/5 text-white pl-4 pr-11 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400/70 focus:border-transparent placeholder:text-white/30 transition-shadow"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                data-testid="login-toggle-password"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p data-testid="login-error-message" className="text-sm text-rose-300 font-medium text-center">
              {error}
            </p>
          )}

          <button
            data-testid="login-submit-button"
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-400 to-orange-600 text-black font-bold text-sm flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] transition shadow-lg shadow-orange-900/40 disabled:opacity-60"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : null}
            {loading ? "Entrando..." : "Entrar"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 text-white/40 text-xs">
          <ShieldCheck size={14} /> Conexão segura · Apenas administradores autorizados
        </div>
      </div>
    </div>
  );
}
