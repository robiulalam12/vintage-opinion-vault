import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Check,
  Copy,
  FileText,
  Menu,
  MessageSquarePlus,
  Paperclip,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/ai")({
  head: () => ({
    meta: [
      { title: "AI Pro — People Opinion Box" },
      { name: "description", content: "Private AI assistant for the People Opinion Box team." },
      { property: "og:title", content: "AI Pro — People Opinion Box" },
      { property: "og:description", content: "Private AI assistant for the People Opinion Box team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AiPro,
});

type Attachment = { kind: "image"; name: string; dataUrl: string } | { kind: "pdf"; name: string; text: string };
type Msg = { role: "user" | "assistant"; text: string; attachments?: Attachment[] | undefined; error?: boolean };
type Chat = { id: string; title: string; updated: number; messages: Msg[] };

const STORE = "aipro-chats-v1";
const SUGGESTIONS = [
  "Write a natural 5-star review for a cosy Italian restaurant",
  "Summarise this PDF in plain English",
  "Rewrite this text so it sounds more human",
  "Draft a firm but polite complaint email",
];

function loadChats(): Chat[] {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "[]");
  } catch {
    return [];
  }
}

async function resizeImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = url;
  });
  const max = 1600;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function readPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 200); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return pages.join("\n\n").slice(0, 300_000);
}

function toApi(m: Msg) {
  if (m.role === "assistant" || !m.attachments?.length) return { role: m.role, content: m.text };
  const parts: Array<Record<string, unknown>> = [];
  for (const a of m.attachments) {
    if (a.kind === "pdf") parts.push({ type: "text", text: `[Attached PDF: ${a.name}]\n${a.text || "(no readable text — possibly scanned)"}` });
  }
  parts.push({ type: "text", text: m.text || "Please look at the attachment." });
  for (const a of m.attachments) if (a.kind === "image") parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
  return { role: m.role, content: parts };
}

function AiPro() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setChats(loadChats()), []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(chats));
    } catch {
      toast.error("Browser storage is full — delete some old chats.");
    }
  }, [chats]);

  const active = chats.find((c) => c.id === activeId) ?? null;
  const messages = active?.messages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, messages[messages.length - 1]?.text]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const updateChat = (id: string, fn: (c: Chat) => Chat) =>
    setChats((all) => all.map((c) => (c.id === id ? fn(c) : c)));

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    try {
      for (const f of Array.from(files)) {
        if (f.type.startsWith("image/")) {
          const dataUrl = await resizeImage(f);
          setPending((p) => [...p, { kind: "image", name: f.name, dataUrl }]);
        } else if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
          const text = await readPdf(f);
          setPending((p) => [...p, { kind: "pdf", name: f.name, text }]);
        } else toast.error(`${f.name}: only images and PDFs are supported.`);
      }
    } catch (e) {
      toast.error(`Couldn't read file: ${(e as Error).message}`);
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if ((!text && !pending.length) || busy) return;
    const userMsg: Msg = { role: "user", text, attachments: pending.length ? pending : undefined };
    let id = activeId;
    let history: Msg[];
    if (!active) {
      id = crypto.randomUUID();
      history = [userMsg];
      setChats((all) => [
        { id: id!, title: (text || pending[0]?.name || "New chat").slice(0, 60), updated: Date.now(), messages: [...history, { role: "assistant", text: "" }] },
        ...all,
      ]);
      setActiveId(id);
    } else {
      history = [...active.messages, userMsg];
      updateChat(id!, (c) => ({ ...c, updated: Date.now(), messages: [...history, { role: "assistant", text: "" }] }));
    }
    setInput("");
    setPending([]);
    setBusy(true);

    const setReply = (fn: (m: Msg) => Msg) =>
      updateChat(id!, (c) => {
        const msgs = [...c.messages];
        msgs[msgs.length - 1] = fn(msgs[msgs.length - 1]!);
        return { ...c, messages: msgs };
      });

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ messages: history.filter((m) => !m.error).map(toApi) }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `Error ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setReply((m) => ({ ...m, text: m.text + chunk }));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setReply((m) => ({ ...m, text: (e as Error).message, error: true }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const newChat = () => {
    setActiveId(null);
    setDrawer(false);
    setTimeout(() => taRef.current?.focus(), 50);
  };

  const history = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 p-3">
        <button
          onClick={newChat}
          className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <MessageSquarePlus className="size-4" /> New chat
        </button>
        <button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-muted-foreground md:hidden" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {chats.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">No chats yet</p> : null}
        {[...chats].sort((a, b) => b.updated - a.updated).map((c) => (
          <div
            key={c.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg pr-1 text-sm transition-colors hover:bg-muted",
              c.id === activeId && "bg-muted",
            )}
          >
            <button
              onClick={() => {
                setActiveId(c.id);
                setDrawer(false);
              }}
              className="min-w-0 flex-1 truncate px-3 py-2 text-left text-foreground"
            >
              {c.title}
            </button>
            <button
              aria-label="Delete chat"
              onClick={() => {
                setChats((all) => all.filter((x) => x.id !== c.id));
                if (activeId === c.id) setActiveId(null);
              }}
              className="rounded p-1.5 text-muted-foreground opacity-100 hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative flex h-[calc(100dvh-61px)] bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-muted/30 md:block">{history}</aside>

      {drawer ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[80%] max-w-xs bg-background shadow-xl">{history}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile app bar */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <button onClick={() => setDrawer(true)} className="rounded-lg p-2 text-foreground" aria-label="Chats">
            <Menu className="size-5" />
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-foreground">
            {active?.title ?? "AI Pro"}
          </p>
          <button onClick={newChat} className="rounded-lg p-2 text-foreground" aria-label="New chat">
            <MessageSquarePlus className="size-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-5 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-primary font-display text-xl font-bold text-primary-foreground">
                AI
              </div>
              <h1 className="mt-4 font-display text-2xl tracking-tight text-foreground sm:text-3xl">
                What can I help with?
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">Ask anything, or attach images and PDFs.</p>
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
              {messages.map((m, i) => (
                <MessageRow key={i} m={m} streaming={busy && i === messages.length - 1} />
              ))}
            </div>
          )}
        </div>

        {/* composer */}
        <div className="border-t border-border bg-background px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:border-0 md:pb-5">
          <div className="mx-auto max-w-3xl">
            {pending.length || reading ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {pending.map((a, i) => (
                  <div key={i} className="relative">
                    {a.kind === "image" ? (
                      <img src={a.dataUrl} alt={a.name} className="size-16 rounded-lg border border-border object-cover" />
                    ) : (
                      <div className="flex h-16 max-w-[180px] items-center gap-2 rounded-lg border border-border bg-muted px-3 text-xs text-foreground">
                        <FileText className="size-5 shrink-0 text-primary" />
                        <span className="truncate">{a.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background"
                      aria-label="Remove"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {reading ? <p className="self-center text-xs text-muted-foreground">Reading file…</p> : null}
              </div>
            ) : null}
            <div className="flex items-end gap-2 rounded-3xl border border-border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                hidden
                onChange={(e) => onFiles(e.target.files)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Attach image or PDF"
              >
                <Paperclip className="size-5" />
              </button>
              <textarea
                ref={taRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  if (e.clipboardData.files.length) {
                    e.preventDefault();
                    onFiles(e.clipboardData.files);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && window.innerWidth >= 768) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Message AI Pro"
                className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              {busy ? (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background"
                  aria-label="Stop"
                >
                  <Square className="size-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={(!input.trim() && !pending.length) || reading}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                  aria-label="Send"
                >
                  <ArrowUp className="size-5" />
                </button>
              )}
            </div>
            <p className="mt-1.5 hidden text-center text-[11px] text-muted-foreground md:block">
              Chats are saved in this browser. Enter to send, Shift+Enter for a new line.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ m, streaming }: { m: Msg; streaming: boolean }) {
  const [copied, setCopied] = useState(false);
  if (m.role === "user") {
    return (
      <div className="flex flex-col items-end gap-2">
        {m.attachments?.length ? (
          <div className="flex flex-wrap justify-end gap-2">
            {m.attachments.map((a, i) =>
              a.kind === "image" ? (
                <img key={i} src={a.dataUrl} alt={a.name} className="max-h-48 rounded-xl border border-border" />
              ) : (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-xs text-foreground">
                  <FileText className="size-4 text-primary" /> {a.name}
                </div>
              ),
            )}
          </div>
        ) : null}
        {m.text ? (
          <div className="max-w-[85%] rounded-3xl bg-primary px-4 py-2.5 text-[15px] whitespace-pre-wrap text-primary-foreground">
            {m.text}
          </div>
        ) : null}
      </div>
    );
  }
  if (m.error) {
    return <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{m.text}</div>;
  }
  return (
    <div className="group">
      {m.text ? (
        <div className="prose prose-sm max-w-none text-[15px] leading-relaxed text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
        </div>
      ) : (
        <p className="animate-pulse text-sm text-muted-foreground">Thinking…</p>
      )}
      {m.text && !streaming ? (
        <button
          onClick={() => {
            navigator.clipboard.writeText(m.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="mt-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      ) : null}
    </div>
  );
}
