import { useEffect, useRef, useState } from "react";
import api from "../lib/api";
import ActivityFeed from "../components/ActivityFeed";

export default function Atividade() {
  const [activities, setActivities] = useState([]);
  const timer = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await api.get("/activities", { params: { limit: 60 } });
        setActivities(r.data.activities);
      } catch (_) {}
    };
    load();
    timer.current = setInterval(load, 2000);
    return () => clearInterval(timer.current);
  }, []);

  return (
    <div className="space-y-6" data-testid="atividade-page">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Atividade em Tempo Real</h1>
        <p className="text-muted-foreground text-sm mt-1">Fluxo ao vivo de acessos, PIX gerados e copiados — atualiza a cada 2s.</p>
      </div>
      <ActivityFeed activities={activities} />
    </div>
  );
}
