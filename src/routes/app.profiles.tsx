import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Pencil, Plus, Trash2, Upload, User, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createMyReviewerProfile,
  deleteMyReviewerProfile,
  listMyReviewerProfiles,
  updateMyReviewerProfile,
  uploadMyProfileAvatar,
  type MyReviewerProfile,
} from "@/lib/user-reviewer-profiles.functions";

export const Route = createFileRoute("/app/profiles")({ component: ProfilesPage });

const MAX = 100;

function randomAge() {
  return 12 + Math.floor(Math.random() * 4); // 12..15
}

async function uploadAvatar(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  const res = await uploadMyProfileAvatar({
    data: { filename: file.name || "avatar.jpg", contentType: file.type || "image/jpeg", base64: btoa(bin) },
  });
  return res.url;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function ProfileForm({
  initial,
  onSubmit,
  submitting,
  submitLabel,
}: {
  initial?: Partial<MyReviewerProfile>;
  onSubmit: (v: { name: string; age: number; bio: string; avatarUrl: string }) => void;
  submitting: boolean;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [age, setAge] = useState<number>(initial?.age ?? randomAge());
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatar_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (!name.trim()) return setErr("Name is required");
        onSubmit({ name: name.trim(), age, bio: bio.trim(), avatarUrl });
      }}
    >
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex flex-col items-center gap-3">
          <input
            type="file"
            accept="image/*"
            ref={fileRef}
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setUploading(true);
                setErr(null);
                const url = await uploadAvatar(f);
                setAvatarUrl(url);
              } catch (er) {
                setErr(er instanceof Error ? er.message : "Upload failed");
              } finally {
                setUploading(false);
                if (fileRef.current) fileRef.current.value = "";
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="group grid size-20 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-white/20 bg-[#070B14] transition-colors hover:border-cyan-500/50"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : uploading ? (
              <Upload className="size-6 animate-pulse text-cyan-400" />
            ) : (
              <Plus className="size-6 text-muted-foreground transition-colors group-hover:text-cyan-400" />
            )}
          </button>
          <span className="text-[10px] font-bold uppercase text-muted-foreground">
            {uploading ? "Uploading…" : avatarUrl ? "Replace" : "Avatar"}
          </span>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="rp-name" className="text-[10px] font-bold uppercase text-muted-foreground">
              Reviewer name
            </Label>
            <Input
              id="rp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              placeholder="e.g. Sarah Connor"
              className="border-white/10 bg-[#070B14] focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rp-age" className="text-[10px] font-bold uppercase text-muted-foreground">
              Profile age (years)
            </Label>
            <Input
              id="rp-age"
              type="number"
              min={8}
              max={80}
              value={age}
              onChange={(e) => setAge(Number(e.target.value) || randomAge())}
              className="border-white/10 bg-[#070B14] focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
            />
            <p className="text-[0.7rem] text-muted-foreground">Default is a random age between 12–15.</p>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="rp-bio" className="text-[10px] font-bold uppercase text-muted-foreground">
              Short bio (optional)
            </Label>
            <Textarea
              id="rp-bio"
              rows={2}
              maxLength={400}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Short tagline…"
              className="resize-none border-white/10 bg-[#070B14] focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
            />
          </div>
        </div>
      </div>
      <Button
        type="submit"
        disabled={submitting || uploading}
        className="w-full bg-violet-600 font-bold text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:bg-violet-500"
      >
        {submitting ? "Saving…" : submitLabel}
      </Button>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
    </form>
  );
}

function ProfilesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMyReviewerProfiles);
  const create = useServerFn(createMyReviewerProfile);
  const update = useServerFn(updateMyReviewerProfile);
  const del = useServerFn(deleteMyReviewerProfile);

  const q = useQuery({ queryKey: ["my-reviewer-profiles"], queryFn: () => list() });
  const [editing, setEditing] = useState<MyReviewerProfile | null>(null);

  const createM = useMutation({
    mutationFn: (v: { name: string; age: number; bio: string; avatarUrl: string }) =>
      create({
        data: {
          name: v.name,
          age: v.age,
          ...(v.bio ? { bio: v.bio } : {}),
          ...(v.avatarUrl ? { avatarUrl: v.avatarUrl } : {}),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-reviewer-profiles"] }),
  });

  const updateM = useMutation({
    mutationFn: (v: { id: string; name: string; age: number; bio: string; avatarUrl: string }) =>
      update({
        data: {
          id: v.id,
          name: v.name,
          age: v.age,
          bio: v.bio,
          avatarUrl: v.avatarUrl,
        },
      }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["my-reviewer-profiles"] });
    },
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-reviewer-profiles"] }),
  });

  const rows = q.data ?? [];
  const remaining = MAX - rows.length;
  const pct = Math.min(100, (rows.length / MAX) * 100);

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">Reviewer Profiles</h1>
          <p className="text-sm text-muted-foreground">Manage your virtual identity pool.</p>
        </div>
        <div className="text-right">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Usage capacity
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-cyan-400">
              {rows.length}/{MAX}
            </span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-violet-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-gradient-to-br from-[#0C121E] to-[#161B28] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Edit "{editing.name}"</h2>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
          <ProfileForm
            initial={editing}
            submitting={updateM.isPending}
            submitLabel="Save changes"
            onSubmit={(v) => updateM.mutate({ id: editing.id, ...v })}
          />
          {updateM.error ? (
            <p className="text-sm text-destructive">{(updateM.error as Error).message}</p>
          ) : null}
        </div>
      ) : remaining > 0 ? (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-gradient-to-br from-[#0C121E] to-[#161B28] p-6">
          <h2 className="font-display text-lg font-semibold">Add a new reviewer profile</h2>
          <ProfileForm
            submitting={createM.isPending}
            submitLabel="Create reviewer"
            onSubmit={(v) => createM.mutate(v)}
          />
          {createM.error ? (
            <p className="text-sm text-destructive">{(createM.error as Error).message}</p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-[#0C121E] p-5 text-sm text-muted-foreground">
          You've reached the {MAX}-profile limit. Delete one to add another.
        </div>
      )}

      <div className="space-y-3">
        <h2 className="ml-1 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Active profiles
        </h2>
        {q.isLoading ? (
          <p className="p-2 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">No reviewer profiles yet.</p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="group flex items-center gap-4 rounded-xl border border-white/10 bg-[#0C121E] p-4 transition-all hover:border-white/20 hover:bg-[#161B28]"
            >
              <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-cyan-500/20 bg-gradient-to-br from-cyan-500/20 to-violet-500/20 font-bold text-cyan-400">
                {r.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.avatar_url} alt="" className="size-full object-cover" />
                ) : (
                  initials(r.name) || <User className="size-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.age} yrs · created {new Date(r.created_at).toLocaleDateString()}
                </p>
                <a
                  href={`/${r.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-cyan-400 hover:text-cyan-300"
                >
                  /{r.slug} <ExternalLink className="size-3" />
                </a>
              </div>
              <div className="flex gap-2 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <button
                  type="button"
                  aria-label={`Edit ${r.name}`}
                  onClick={() => setEditing(r)}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${r.name}`}
                  onClick={() => {
                    if (confirm(`Delete "${r.name}"? Reviews stay but will lose this profile link.`)) {
                      delM.mutate(r.id);
                    }
                  }}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
