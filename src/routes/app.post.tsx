import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  createMyReview,
  deleteMyReview,
  listMyReviews,
  togglePublishReview,
} from "@/lib/user-dashboard.functions";
import { listMyReviewerProfiles } from "@/lib/user-reviewer-profiles.functions";

export const Route = createFileRoute("/app/post")({ component: PostReviews });

async function uploadReviewImage(file: File): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id ?? "anon";
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `user-reviews/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("review-images").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("review-images").getPublicUrl(path);
  return data.publicUrl;
}

function PostReviews() {
  const qc = useQueryClient();
  const list = useServerFn(listMyReviews);
  const create = useServerFn(createMyReview);
  const toggle = useServerFn(togglePublishReview);
  const del = useServerFn(deleteMyReview);
  const listProfiles = useServerFn(listMyReviewerProfiles);

  const q = useQuery({ queryKey: ["my-reviews"], queryFn: () => list() });
  const profiles = useQuery({
    queryKey: ["my-reviewer-profiles"],
    queryFn: () => listProfiles(),
  });

  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().slice(0, 10));
  const [imageUrl, setImageUrl] = useState("");
  const [published, setPublished] = useState(true);
  const [reviewerProfileId, setReviewerProfileId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const m = useMutation({
    mutationFn: () => {
      const payload: {
        headline: string;
        body: string;
        rating: number;
        reviewDate: string;
        published: boolean;
        subject?: string;
        imageUrl?: string;
        reviewerProfileId?: string;
      } = {
        headline: headline.trim(),
        body: body.trim(),
        rating,
        reviewDate,
        published,
      };
      if (subject.trim()) payload.subject = subject.trim();
      if (imageUrl.trim()) payload.imageUrl = imageUrl.trim();
      if (reviewerProfileId) payload.reviewerProfileId = reviewerProfileId;
      return create({ data: payload });
    },
    onSuccess: () => {
      setHeadline("");
      setBody("");
      setSubject("");
      setImageUrl("");
      setErr(null);
      qc.invalidateQueries({ queryKey: ["my-reviews"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const t = useMutation({
    mutationFn: (v: { id: string; published: boolean }) => toggle({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-reviews"] }),
  });
  const d = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-reviews"] }),
  });

  const profileList = profiles.data ?? [];
  const profileById = new Map(profileList.map((p) => [p.id, p]));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl">Post Reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each review publishes under the reviewer profile you select.
        </p>
      </div>

      {profileList.length === 0 ? (
        <div className="press-panel p-5 text-sm">
          You don't have any reviewer profiles yet.{" "}
          <Link to="/app/profiles" className="font-medium text-primary underline">
            Create one first
          </Link>{" "}
          to post a review.
        </div>
      ) : null}

      <form
        className="press-panel space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!reviewerProfileId) return setErr("Pick a reviewer profile first.");
          m.mutate();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="rp">Reviewer profile</Label>
          <select
            id="rp"
            value={reviewerProfileId}
            onChange={(e) => setReviewerProfileId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            required
          >
            <option value="">Choose a reviewer profile…</option>
            {profileList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (/{p.slug})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="headline">Headline</Label>
          <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} required maxLength={140} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="subject">Business / subject (optional)</Label>
          <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="body">Review</Label>
          <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} required maxLength={4000} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="rating">Rating</Label>
            <select
              id="rating"
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>{n} ★</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rdate">Review date</Label>
            <Input id="rdate" type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Image (optional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  setUploading(true);
                  const url = await uploadReviewImage(f);
                  setImageUrl(url);
                } catch (er) {
                  setErr(er instanceof Error ? er.message : "Upload failed");
                } finally {
                  setUploading(false);
                  if (fileRef.current) fileRef.current.value = "";
                }
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="mr-2 size-4" />
              {uploading ? "Uploading…" : imageUrl ? "Replace image" : "Upload image"}
            </Button>
            {imageUrl ? (
              <p className="truncate text-[0.7rem] text-muted-foreground">Attached</p>
            ) : null}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Publish immediately
        </label>
        <Button type="submit" disabled={m.isPending || profileList.length === 0}>
          {m.isPending ? "Saving…" : "Post review"}
        </Button>
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
      </form>

      <div className="press-panel divide-y divide-border">
        {q.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading…</p>
        ) : (q.data?.length ?? 0) === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          q.data!.map((r) => {
            const rp = r.reviewer_profile_id ? profileById.get(r.reviewer_profile_id) : null;
            return (
              <div key={r.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.headline}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.rating}★ · {r.review_date} · {r.published ? "Published" : "Draft"}
                    {rp ? ` · as ${rp.name}` : ""}
                  </p>
                  {r.published && rp ? (
                    <a
                      href={`/${rp.slug}/${r.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline"
                    >
                      /{rp.slug}/{r.slug}
                    </a>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => t.mutate({ id: r.id, published: !r.published })}
                  >
                    {r.published ? "Unpublish" : "Publish"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => d.mutate(r.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
