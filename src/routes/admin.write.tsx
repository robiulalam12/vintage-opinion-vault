import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatReviewDate } from "@/components/ReviewCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  deleteReview,
  listAllReviews,
  saveReview,
  type ReviewInput,
} from "@/lib/reviews.functions";

export const Route = createFileRoute("/admin/write")({
  component: WriteReviewPage,
});

const emptyForm: ReviewInput = {
  reviewer_name: "",
  reviewer_location: "",
  subject: "",
  headline: "",
  body: "",
  rating: 5,
  review_date: new Date().toISOString().slice(0, 10),
  published: true,
};

function WriteReviewPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ReviewInput>(emptyForm);

  const fetchAll = useServerFn(listAllReviews);
  const persist = useServerFn(saveReview);
  const remove = useServerFn(deleteReview);

  const reviewsQuery = useQuery({
    queryKey: ["all-reviews"],
    queryFn: () => fetchAll(),
  });

  const saveMutation = useMutation({
    mutationFn: (input: ReviewInput) => persist({ data: input }),
    onSuccess: () => {
      toast.success(form.id ? "Review updated" : "Review published");
      setForm({ ...emptyForm, review_date: new Date().toISOString().slice(0, 10) });
      queryClient.invalidateQueries({ queryKey: ["all-reviews"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Review deleted");
      queryClient.invalidateQueries({ queryKey: ["all-reviews"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow={form.id ? "Editing review" : "New review"}
        title="Write review"
        description="Create a new review or edit an existing one. The date you pick is the date shown publicly."
      />

      <form
        className="press-panel mt-7 grid grid-cols-1 gap-5 p-6 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate(form);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="reviewer_name">Reviewer name</Label>
          <Input
            id="reviewer_name"
            required
            maxLength={80}
            value={form.reviewer_name}
            onChange={(e) => setForm({ ...form, reviewer_name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reviewer_location">Location (optional)</Label>
          <Input
            id="reviewer_location"
            maxLength={80}
            value={form.reviewer_location ?? ""}
            onChange={(e) => setForm({ ...form, reviewer_location: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subject">What is reviewed (optional)</Label>
          <Input
            id="subject"
            maxLength={120}
            value={form.subject ?? ""}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="headline">Headline</Label>
          <Input
            id="headline"
            required
            maxLength={140}
            value={form.headline}
            onChange={(e) => setForm({ ...form, headline: e.target.value })}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="body">Review text</Label>
          <Textarea
            id="body"
            required
            rows={6}
            maxLength={4000}
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
          <Label htmlFor="review_date">Review date</Label>
          <Input
            id="review_date"
            type="date"
            required
            value={form.review_date}
            onChange={(e) => setForm({ ...form, review_date: e.target.value })}
          />
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
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setForm({ ...emptyForm, review_date: new Date().toISOString().slice(0, 10) })
              }
            >
              Cancel edit
            </Button>
          ) : null}
        </div>
      </form>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="font-display text-xl text-foreground">All reviews</h2>
          <span className="pill">{reviewsQuery.data?.length ?? 0} total</span>
        </div>
        <ul className="mt-4 space-y-3">
          {(reviewsQuery.data ?? []).map((review) => (
            <li key={review.id} className="press-panel deckle-edge flex flex-wrap items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-display text-base text-foreground">{review.headline}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {review.reviewer_name} · {review.rating}/5 ·{" "}
                  <time dateTime={review.review_date}>{formatReviewDate(review.review_date)}</time>
                  {review.published ? "" : " · draft"}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-foreground/80">{review.body}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm({
                      id: review.id,
                      reviewer_name: review.reviewer_name,
                      reviewer_location: review.reviewer_location ?? "",
                      subject: review.subject ?? "",
                      headline: review.headline,
                      body: review.body,
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
      </section>
    </div>
  );
}
