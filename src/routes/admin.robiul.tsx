import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { formatReviewDate } from "@/components/ReviewCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteRobiulReview,
  listAllRobiulReviews,
  saveRobiulReview,
  uploadReviewImage,
  ADMIN_REVIEWERS,
  type AdminReviewerKey,
  type RobiulReviewInput,
} from "@/lib/robiul.functions";

export const Route = createFileRoute("/admin/robiul")({
  component: RobiulAdminPage,
});

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm: RobiulReviewInput = {
  reviewer: "robiul",
  headline: "",
  body: "",
  subject: "",
  image_url: "",
  rating: 5,
  review_date: today(),
  published: true,
};

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function RobiulAdminPage() {
  const queryClient = useQueryClient();
  const [reviewer, setReviewer] = useState<AdminReviewerKey>("robiul");
  const [form, setForm] = useState<RobiulReviewInput>(emptyForm);
  const [page, setPage] = useState(1);
  const profile = ADMIN_REVIEWERS[reviewer];
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAll = useServerFn(listAllRobiulReviews);
  const persist = useServerFn(saveRobiulReview);
  const remove = useServerFn(deleteRobiulReview);
  const upload = useServerFn(uploadReviewImage);

  const reviewsQuery = useQuery({
    queryKey: ["robiul-reviews", reviewer],
    queryFn: () => fetchAll({ data: { reviewer } }),
  });

  const reset = () => setForm({ ...emptyForm, reviewer, review_date: today() });

  const saveMutation = useMutation({
    mutationFn: (input: RobiulReviewInput) => persist({ data: { ...input, reviewer } }),
    onSuccess: (result) => {
      toast.success(form.id ? "Review updated" : `Published at ${profile.base}/${result.slug}`);
      reset();
      queryClient.invalidateQueries({ queryKey: ["robiul-reviews"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Review deleted");
      queryClient.invalidateQueries({ queryKey: ["robiul-reviews"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await readAsBase64(file);
      return upload({
        data: { filename: file.name, contentType: file.type || "image/jpeg", base64 },
      });
    },
    onSuccess: (result) => {
      setForm((current) => ({ ...current, image_url: result.url }));
      toast.success("Image uploaded");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reviews = reviewsQuery.data ?? [];
  const PAGE_SIZE = 24;
  const pageCount = Math.max(1, Math.ceil(reviews.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedReviews = reviews.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow={form.id ? "Editing review" : "New review"}
        title="Post Reviews"
        description={`Publish reviews as ${profile.name}. Each one gets its own page at ${profile.base}/<link> and shows the publish date you choose.`}
      />

      <div className="press-panel mt-6 max-w-sm space-y-2 p-4">
        <Label htmlFor="reviewer">Reviewer profile</Label>
        <Select
          value={reviewer}
          onValueChange={(value) => {
            setReviewer(value as AdminReviewerKey);
            setPage(1);
            setForm({ ...emptyForm, reviewer: value as AdminReviewerKey, review_date: today() });
          }}
        >
          <SelectTrigger id="reviewer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ADMIN_REVIEWERS).map(([key, value]) => (
              <SelectItem key={key} value={key}>
                {value.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <form
        className="press-panel mt-7 grid grid-cols-1 gap-5 p-6 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate(form);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="headline">Review title</Label>
          <Input
            id="headline"
            required
            maxLength={140}
            value={form.headline}
            onChange={(e) => setForm({ ...form, headline: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subject">Business / what is reviewed (optional)</Label>
          <Input
            id="subject"
            maxLength={120}
            value={form.subject ?? ""}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="body">Review text</Label>
          <Textarea
            id="body"
            required
            rows={8}
            maxLength={6000}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rating">Rating</Label>
          <Select
            value={String(form.rating)}
            onValueChange={(value) => setForm({ ...form, rating: Number(value) })}
          >
            <SelectTrigger id="rating">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 4, 3, 2, 1].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} star{n > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="review_date">Publish date (shown publicly)</Label>
          <Input
            id="review_date"
            type="date"
            required
            value={form.review_date}
            onChange={(e) => setForm({ ...form, review_date: e.target.value })}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="image_url">Image (optional)</Label>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              id="image_url"
              placeholder="Paste an image link or upload a file"
              maxLength={500}
              value={form.image_url ?? ""}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploadMutation.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {uploadMutation.isPending ? "Uploading…" : "Upload image"}
            </Button>
            {form.image_url ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setForm({ ...form, image_url: "" })}
              >
                Remove
              </Button>
            ) : null}
          </div>
          {form.image_url ? (
            <img
              src={form.image_url}
              alt="Selected review image"
              className="mt-3 max-h-56 rounded-xl border border-border object-cover"
            />
          ) : null}
        </div>

        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch
            id="published"
            checked={form.published}
            onCheckedChange={(checked) => setForm({ ...form, published: checked })}
          />
          <Label htmlFor="published">Published (visible to visitors and search engines)</Label>
        </div>

        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <Button type="submit" disabled={saveMutation.isPending}>
            {form.id ? "Save changes" : "Publish review"}
          </Button>
          {form.id ? (
            <Button type="button" variant="outline" onClick={reset}>
              Cancel edit
            </Button>
          ) : null}
        </div>
      </form>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="font-display text-xl text-foreground">{profile.name}'s reviews</h2>
          <span className="pill">{reviews.length} total</span>
        </div>
        {reviewsQuery.isLoading ? (
          <p className="py-8 text-sm text-muted-foreground">Loading…</p>
        ) : reviews.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pagedReviews.map((review) => (
              <li key={review.id} className="press-panel flex flex-wrap items-start gap-4 p-4">
                {review.image_url ? (
                  <img
                    src={review.image_url}
                    alt=""
                    className="size-16 shrink-0 rounded-lg object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base text-foreground">{review.headline}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {review.rating}/5 ·{" "}
                    <time dateTime={review.review_date}>
                      {formatReviewDate(review.review_date)}
                    </time>
                    {review.published ? "" : " · draft"}
                  </p>
                  <a
                    href={`${profile.base}/${review.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-primary underline"
                  >
                    {profile.base}/{review.slug}
                  </a>
                  <p className="mt-2 line-clamp-2 text-sm text-foreground/80">{review.body}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm({
                        id: review.id,
                        reviewer,
                        headline: review.headline,
                        body: review.body,
                        subject: review.subject ?? "",
                        image_url: review.image_url ?? "",
                        rating: review.rating,
                        review_date: review.review_date,
                        published: review.published,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(review.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pageCount > 1 ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((n) => (
              <Button
                key={n}
                variant={n === currentPage ? "default" : "outline"}
                size="sm"
                onClick={() => setPage(n)}
              >
                {n}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
