import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SupportChat } from "@/components/SupportChat";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  adminGenerateKey,
  adminGenerateUnassignedKey,
  adminListThreadMessages,
  adminListUsers,
  adminRevokeKey,
  adminSendMessage,
} from "@/lib/user-dashboard.functions";

export const Route = createFileRoute("/admin/users")({ component: UsersPage });

function UsersPage() {
  const qc = useQueryClient();
  const list = useServerFn(adminListUsers);
  const gen = useServerFn(adminGenerateKey);
  const genFree = useServerFn(adminGenerateUnassignedKey);
  const revoke = useServerFn(adminRevokeKey);
  const listMsgs = useServerFn(adminListThreadMessages);
  const sendMsg = useServerFn(adminSendMessage);

  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => list() });
  const [chatUserId, setChatUserId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<{ token: string; expiresAt: string } | null>(null);
  const [freeKey, setFreeKey] = useState<{ token: string; expiresAt: string } | null>(null);

  const chat = useQuery({
    queryKey: ["admin-thread", chatUserId],
    queryFn: () => listMsgs({ data: { userId: chatUserId! } }),
    enabled: !!chatUserId,
  });

  const genM = useMutation({
    mutationFn: (userId: string) => gen({ data: { userId, days: 7 } }),
    onSuccess: (r) => {
      setShowKey({ token: r.token, expiresAt: r.expiresAt });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const revokeM = useMutation({
    mutationFn: (userId: string) => revoke({ data: { userId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const genFreeM = useMutation({
    mutationFn: () => genFree({ data: { days: 7 } }),
    onSuccess: (r) => setFreeKey({ token: r.token, expiresAt: r.expiresAt }),
  });

  const send = async (body: string) => {
    if (!chatUserId) return;
    await sendMsg({ data: { userId: chatUserId, body } });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Admin"
        title="User management"
        description="See signed-up users, generate 7-day keys, and chat."
        actions={
          <Button variant="outline" onClick={() => genFreeM.mutate()} disabled={genFreeM.isPending}>
            Generate unassigned key
          </Button>
        }
      />

      <div className="press-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Joined</th>
              <th className="px-4 py-2">Key</th>
              <th className="px-4 py-2">Expires</th>
              <th className="px-4 py-2">Unread</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading ? (
              <tr><td className="px-4 py-4" colSpan={6}>Loading…</td></tr>
            ) : (q.data?.length ?? 0) === 0 ? (
              <tr><td className="px-4 py-4" colSpan={6}>No users yet.</td></tr>
            ) : (
              q.data!.map((u) => (
                <tr key={u.user_id}>
                  <td className="px-4 py-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {u.email}
                      {u.unread_admin > 0 ? (
                        <span
                          className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
                          title={`${u.unread_admin} unread message${u.unread_admin === 1 ? "" : "s"} from this user`}
                        >
                          {u.unread_admin}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.key_status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : u.key_status === "expired" || u.key_status === "revoked"
                            ? "bg-red-100 text-red-800"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {u.key_status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {u.active_key_expires_at
                      ? new Date(u.active_key_expires_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">{u.unread_admin || ""}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" onClick={() => genM.mutate(u.user_id)} disabled={genM.isPending}>
                        Issue 7-day key
                      </Button>
                      {u.key_status === "active" ? (
                        <Button size="sm" variant="outline" onClick={() => revokeM.mutate(u.user_id)}>
                          Revoke
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" className="relative" onClick={() => setChatUserId(u.user_id)}>
                        Chat
                        {u.unread_admin > 0 ? (
                          <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white">
                            {u.unread_admin}
                          </span>
                        ) : null}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!showKey} onOpenChange={(o) => !o && setShowKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>7-day key generated</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Send this to the user. It's already activated and expires{" "}
            {showKey ? new Date(showKey.expiresAt).toLocaleString() : ""}.
          </p>
          <pre className="mt-2 select-all rounded bg-muted p-3 font-mono text-sm">
            {showKey?.token}
          </pre>
          <Button
            onClick={() => showKey && navigator.clipboard.writeText(showKey.token)}
          >
            Copy
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!freeKey} onOpenChange={(o) => !o && setFreeKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unassigned 7-day key</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Any signed-in user can activate it once in Settings. Expires{" "}
            {freeKey ? new Date(freeKey.expiresAt).toLocaleString() : ""}.
          </p>
          <pre className="mt-2 select-all rounded bg-muted p-3 font-mono text-sm">
            {freeKey?.token}
          </pre>
          <Button
            onClick={() => freeKey && navigator.clipboard.writeText(freeKey.token)}
          >
            Copy
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!chatUserId} onOpenChange={(o) => !o && setChatUserId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chat with user</DialogTitle>
          </DialogHeader>
          {chat.data ? (
            <SupportChat
              threadId={chat.data.threadId}
              initialMessages={chat.data.messages as never}
              meIs="admin"
              onSend={send}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
