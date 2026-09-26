import { useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type ChatMessage = {
  id: string;
  sender: string;
  body: string;
  created_at: string;
};

export function SupportChat({
  threadId,
  initialMessages,
  meIs,
  onSend,
}: {
  threadId: string;
  initialMessages: ChatMessage[];
  meIs: "user" | "admin";
  onSend: (body: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const ch = supabase
      .channel(`support:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          setMessages((prev) => {
            const row = payload.new as ChatMessage;
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [threadId]);

  async function submit() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      await onSend(text);
      setBody("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[520px] flex-col rounded-xl border border-border bg-background">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender === meIs;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <div className="flex items-end gap-2 border-t border-border p-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Type a message…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button onClick={submit} disabled={busy || !body.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
