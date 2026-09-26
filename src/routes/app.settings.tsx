import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SupportChat } from "@/components/SupportChat";
import {
  activateKey,
  listMyMessages,
  myAccessStatus,
  myProfile,
  sendMyMessage,
  updateProfile,
} from "@/lib/user-dashboard.functions";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const qc = useQueryClient();
  const access = useServerFn(myAccessStatus);
  const profile = useServerFn(myProfile);
  const upd = useServerFn(updateProfile);
  const act = useServerFn(activateKey);
  const listMsg = useServerFn(listMyMessages);
  const sendMsg = useServerFn(sendMyMessage);

  const a = useQuery({ queryKey: ["my-access-status"], queryFn: () => access() });
  const p = useQuery({ queryKey: ["my-profile"], queryFn: () => profile() });
  const chat = useQuery({ queryKey: ["my-messages"], queryFn: () => listMsg() });

  const [token, setToken] = useState("");
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  const activateM = useMutation({
    mutationFn: () => act({ data: { token: token.trim() } }),
    onSuccess: (r) => {
      if (r.ok) {
        setTokenStatus("Key activated.");
        setToken("");
        qc.invalidateQueries({ queryKey: ["my-access-status"] });
      } else {
        setTokenStatus(r.error ?? "Failed");
      }
    },
    onError: (e: Error) => setTokenStatus(e.message),
  });

  const saveProfile = useMutation({
    mutationFn: () => {
      const payload: { displayName?: string; bio?: string } = { bio };
      const name = displayName || p.data?.displayName;
      if (name) payload.displayName = name;
      return upd({ data: payload });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-profile"] }),
  });

  const send = async (body: string) => {
    await sendMsg({ data: { body } });
  };

  const keyActive = a.data?.keyStatus === "active";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account access and public visibility.
        </p>
      </div>

      {/* Access Key — top bar */}
      <section className="group relative">
        <div
          aria-hidden
          className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-600 opacity-20 blur transition-opacity duration-1000 group-hover:opacity-40"
        />
        <div className="relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0C121E] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-500/20 bg-cyan-500/10">
              <KeyRound className="size-4 text-cyan-400" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-semibold text-foreground">7-Day Access Key</h2>
                <span
                  className={
                    keyActive
                      ? "shrink-0 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400"
                      : "shrink-0 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400"
                  }
                >
                  {a.data?.keyStatus ?? "…"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Ask the admin (chat on the right) for a key, then paste it here.
                {a.data?.expiresAt
                  ? ` Expires ${new Date(a.data.expiresAt).toLocaleString()}.`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 lg:w-auto lg:max-w-md lg:flex-row">
            <Input
              placeholder="PASTE-YOUR-KEY"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="flex-1 border-white/10 bg-[#070B14] font-mono text-sm focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
            />
            <Button
              onClick={() => activateM.mutate()}
              disabled={activateM.isPending || !token.trim()}
              className="shrink-0 bg-cyan-500 font-bold text-[#070B14] shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:bg-cyan-400"
            >
              {activateM.isPending ? "Activating…" : "Activate"}
            </Button>
          </div>
        </div>
        {tokenStatus ? (
          <p className="mt-2 px-1 text-sm text-muted-foreground">{tokenStatus}</p>
        ) : null}
      </section>

      {/* Two-column grid: profile (left) + chat (right) */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Profile Form — left */}
        <section className="space-y-5 rounded-2xl border border-white/10 bg-[#0C121E] p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-violet-500/20 bg-violet-500/10">
              <UserRound className="size-4 text-violet-400" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-foreground">Public Profile</h2>
              {p.data ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  Public URL: <code className="text-cyan-400">/u/{p.data.handle}</code>
                </p>
              ) : null}
            </div>
          </div>
          {p.data ? (
            <>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="dn"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Display name
                  </Label>
                  <Input
                    id="dn"
                    defaultValue={p.data.displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="border-white/10 bg-[#070B14] focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="handle"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Handle
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      @
                    </span>
                    <Input
                      id="handle"
                      value={p.data.handle}
                      readOnly
                      className="border-white/10 bg-[#070B14] pl-8 text-muted-foreground"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="bio"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Bio
                </Label>
                <Textarea
                  id="bio"
                  defaultValue={p.data.bio ?? ""}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  className="resize-none border-white/10 bg-[#070B14] focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20"
                />
              </div>
              <Button
                onClick={() => saveProfile.mutate()}
                disabled={saveProfile.isPending}
                variant="outline"
                className="w-full border-white/15 bg-white/5 font-semibold hover:bg-white/10"
              >
                {saveProfile.isPending ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </section>

        {/* Chat Box — right */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0C121E]">
          <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 p-4">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,1)]" />
            </span>
            <span className="text-sm font-semibold">Chat with admin</span>
          </div>
          <div className="min-h-0 flex-1 p-4">
            {chat.data ? (
              <SupportChat
                threadId={chat.data.threadId}
                initialMessages={chat.data.messages as never}
                meIs="user"
                onSend={send}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
