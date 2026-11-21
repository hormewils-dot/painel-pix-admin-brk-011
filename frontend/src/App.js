import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginScreen from "./components/LoginScreen";
import PanelLayout from "./components/PanelLayout";
import PaginaBRK from "./pages/PaginaBRK";

function Gate() {
  const { user, loading } = useAuth();
  useEffect(() => {
    const previous = document.title;
    document.title = "Painel Adm BRK";
    return () => { document.title = previous; };
  }, []);
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground text-sm">
        Carregando...
      </div>
    );
  }
  return user ? <PanelLayout /> : <LoginScreen />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<PaginaBRK />} />
          <Route path="/donaspainel/*" element={<Gate />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
