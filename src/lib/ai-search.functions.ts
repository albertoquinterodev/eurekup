import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AiSearchResult {
  messages: { id: string; conversation_id: string; chat: string; body: string; created_at: string; reason: string }[];
  files: { id: string; name: string; storage_path: string; mime_type: string | null; reason: string }[];
  summary: string;
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "messages", "files"],
  properties: {
    summary: { type: "string" },
    messages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "reason"],
        properties: { ref: { type: "string" }, reason: { type: "string" } },
      },
    },
    files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "reason"],
        properties: { ref: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
};

export const aiSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ query: z.string().trim().min(2).max(300), lang: z.enum(["es", "en"]).default("es") }).parse(d)
  )
  .handler(async ({ data, context }): Promise<AiSearchResult> => {
    const sb = context.supabase;
    const me = context.userId;

    // Everything below is read through the caller's session, so RLS limits it to what they can access.
    const [{ data: msgs }, { data: files }, { data: members }] = await Promise.all([
      sb.from("messages").select("id, conversation_id, body, created_at, file_id")
        .is("deleted_at", null).not("body", "is", null)
        .order("created_at", { ascending: false }).limit(400),
      sb.from("files").select("id, name, storage_path, mime_type, created_at")
        .eq("owner_id", me).order("created_at", { ascending: false }).limit(400),
      sb.from("conversation_members").select("conversation_id").eq("user_id", me),
    ]);

    const convIds = (members ?? []).map((m) => m.conversation_id);
    const labels = new Map<string, string>();
    if (convIds.length) {
      const { data: convs } = await sb.from("conversations").select("id, kind, channel_id").in("id", convIds);
      const chIds = (convs ?? []).map((c) => c.channel_id).filter((x): x is string => !!x);
      const { data: chans } = chIds.length ? await sb.from("channels").select("id, name").in("id", chIds) : { data: [] };
      const chName = new Map((chans ?? []).map((c) => [c.id, c.name]));
      const { data: peers } = await sb.from("conversation_members").select("conversation_id, user_id")
        .in("conversation_id", convIds).neq("user_id", me);
      const peerIds = Array.from(new Set((peers ?? []).map((p) => p.user_id)));
      const { data: profs } = peerIds.length ? await sb.from("profiles").select("id, display_name").in("id", peerIds) : { data: [] };
      const pName = new Map((profs ?? []).map((p) => [p.id, p.display_name]));
      for (const c of convs ?? []) {
        if (c.channel_id) labels.set(c.id, `#${chName.get(c.channel_id) ?? "canal"}`);
      }
      for (const p of peers ?? []) if (!labels.has(p.conversation_id)) labels.set(p.conversation_id, pName.get(p.user_id) ?? "Chat");
    }

    const msgList = (msgs ?? []).filter((m) => convIds.includes(m.conversation_id));
    const fileList = files ?? [];
    if (!msgList.length && !fileList.length) return { messages: [], files: [], summary: "" };

    const corpus = [
      "MESSAGES:",
      ...msgList.map((m, i) => `m${i} | ${labels.get(m.conversation_id) ?? "Chat"} | ${m.created_at.slice(0, 10)} | ${(m.body ?? "").slice(0, 240).replace(/\s+/g, " ")}`),
      "FILES:",
      ...fileList.map((f, i) => `f${i} | ${f.name} | ${f.mime_type ?? ""} | ${f.created_at.slice(0, 10)}`),
    ].join("\n");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions:
          `You find items in a user's private messages and files. Pick at most 8 messages and 8 files that best match the description (semantic match, synonyms, any language). Use only refs from the list (m0, f3...). Give a short reason per item and a one-sentence summary, written in ${data.lang === "en" ? "English" : "Spanish"}. Return empty arrays if nothing matches.`,
        input: `Description: ${data.query}\n\n${corpus}`,
        text: { format: { type: "json_schema", name: "search_results", strict: true, schema } },
      }),
    });
    if (!res.ok || !res.body) {
      const msg = res.status === 402 ? "Sin créditos de IA / Out of AI credits"
        : res.status === 429 ? "Demasiadas búsquedas, prueba en un momento / Too many searches, try again shortly"
        : `AI error ${res.status}`;
      throw new Error(msg);
    }

    // Read the SSE stream and accumulate output text.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload);
            if (ev.type === "response.output_text.delta") text += ev.delta;
            if (ev.type === "error" || ev.type === "response.failed") throw new Error("AI search failed");
          } catch (e) { if (e instanceof Error && e.message === "AI search failed") throw e; }
        }
      }
    }

    let parsed: { summary: string; messages: { ref: string; reason: string }[]; files: { ref: string; reason: string }[] };
    try { parsed = JSON.parse(text); } catch { return { messages: [], files: [], summary: "" }; }

    return {
      summary: parsed.summary ?? "",
      messages: (parsed.messages ?? []).flatMap((r) => {
        const m = msgList[Number(r.ref.replace(/^m/, ""))];
        return m ? [{ id: m.id, conversation_id: m.conversation_id, chat: labels.get(m.conversation_id) ?? "Chat", body: m.body ?? "", created_at: m.created_at, reason: r.reason }] : [];
      }).slice(0, 8),
      files: (parsed.files ?? []).flatMap((r) => {
        const f = fileList[Number(r.ref.replace(/^f/, ""))];
        return f ? [{ id: f.id, name: f.name, storage_path: f.storage_path, mime_type: f.mime_type, reason: r.reason }] : [];
      }).slice(0, 8),
    };
  });
