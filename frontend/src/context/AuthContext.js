import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { TOKEN_KEY } from "../lib/api";

const AuthContext = createContext(null);
const USER_KEY = "brk_user";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    // Hydrate immediately from cached user so a page refresh keeps the session.
    let hadCache = false;
    try {
      const cached = localStorage.getItem(USER_KEY);
      if (cached) {
        setUser(JSON.parse(cached));
        hadCache = true;
      }
    } catch {}
    if (hadCache) setLoading(false);
    // Revalidate; only log out on an actual auth rejection,
    // never on a transient network error.
    api
      .get("/auth/me")
      .then((r) => {
        setUser(r.data);
        localStorage.setItem(USER_KEY, JSON.stringify(r.data));
      })
      .catch((err) => {
        const status = err.response?.status;
        if (status === 401 || status === 403) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          setUser(null);
        }
      })
      .finally(() => {
        if (!hadCache) setLoading(false);
      });
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post("/auth/login", { username, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
