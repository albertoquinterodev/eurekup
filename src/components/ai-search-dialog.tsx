import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X, Loader2, MessageSquare, FileText } from "lucide-react";
import { toast } from "sonner";
import { aiSearch, type AiSearchResult } from "@/lib/ai-search.functions";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";

export function AiSearchDialog({ onClose }: { onClose: () => void }) {
  const { tr, lang } = useT();
  const navigate = useNavigate();
  const run = useServerFn(aiSearch);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AiSearchResult | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2 || busy) return;
    setBusy(true);
    setRes(null);
    try {
      setRes(await run({ data: { query: q.trim(), lang: lang === "en" ? "en" : "es" } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Error en la búsqueda", "Search failed"));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("files").createSignedUrl(path, 300);
    if (error || !data) return toast.error(tr("No se pudo abrir", "Could not open"));
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const empty = res && !res.messages.length && !res.files.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-strong relative flex max-h-[80dvh] w-full max-w-lg flex-col rounded-3xl p-5 animate-slide-up">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5" /> {tr("Búsqueda inteligente", "Smart search")}
          </h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-glass" aria-label={tr("Cerrar", "Close")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr("Describe el mensaje o archivo que buscas.", "Describe the message or file you're looking for.")}
        </p>
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input
            autoFocus
            value={q}
            maxLength={300}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("p. ej. el PDF del presupuesto que me mandó Ana", "e.g. the budget PDF Ana sent me")}
            className="flex-1 rounded-2xl glass-subtle px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            disabled={busy || q.trim().length < 2}
            className="flex items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {tr("Buscar", "Search")}
          </button>
        </form>

        <div className="mt-4 -mx-1 flex-1 space-y-4 overflow-y-auto px-1">
          {busy && <p className="py-6 text-center text-sm text-muted-foreground">{tr("Buscando…", "Searching…")}</p>}
          {res?.summary && <p className="text-sm">{res.summary}</p>}
          {empty && <p className="py-6 text-center text-sm text-muted-foreground">{tr("No se encontró nada.", "Nothing found.")}</p>}
          {!!res?.messages.length && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{tr("Mensajes", "Messages")}</h3>
              <ul className="space-y-1">
                {res.messages.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => { onClose(); navigate({ to: "/app/chats/$id", params: { id: m.conversation_id } }); }}
                      className="flex w-full gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-glass"
                    >
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m.chat}</p>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{m.body}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground/80">{m.reason}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!!res?.files.length && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{tr("Archivos", "Files")}</h3>
              <ul className="space-y-1">
                {res.files.map((f) => (
                  <li key={f.id}>
                    <button onClick={() => openFile(f.storage_path)} className="flex w-full gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-glass">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{f.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground/80">{f.reason}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
