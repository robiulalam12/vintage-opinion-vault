import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitPublicReview } from "@/lib/reviews.functions";

const todayLabel = () =>
  new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export function LeaveReviewDialog() {
  const submit = useServerFn(submitPublicReview);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [form, setForm] = useState({
    reviewer_name: "",
    reviewer_location: "",
    subject: "",
    headline: "",
    body: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await submit({ data: { ...form, rating } });
      toast.success("Thanks! Your review was submitted for review.");
      setForm({ reviewer_name: "", reviewer_location: "", subject: "", headline: "", body: "" });
      setRating(5);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit your review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full px-5">Leave a review</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight">Leave your review</DialogTitle>
          <DialogDescription>
            Share your honest experience. Your review is dated {todayLabel()} automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="lr-name">Your name</Label>
              <Input
                id="lr-name"
                required
                minLength={2}
                maxLength={80}
                value={form.reviewer_name}
                onChange={(e) => set("reviewer_name")(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lr-location">Location (optional)</Label>
              <Input
                id="lr-location"
                maxLength={80}
                value={form.reviewer_location}
                onChange={(e) => set("reviewer_location")(e.target.value)}
                placeholder="City, State"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="lr-subject">Business or service (optional)</Label>
            <Input
              id="lr-subject"
              maxLength={120}
              value={form.subject}
              onChange={(e) => set("subject")(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="lr-headline">Review title</Label>
            <Input
              id="lr-headline"
              required
              minLength={3}
              maxLength={140}
              value={form.headline}
              onChange={(e) => set("headline")(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="lr-rating">Rating</Label>
            <div className="flex items-center gap-1.5" id="lr-rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`${value} star${value > 1 ? "s" : ""}`}
                  aria-pressed={rating === value}
                  onClick={() => setRating(value)}
                  className="p-0.5 text-2xl leading-none transition-transform hover:scale-110"
                >
                  <span className={value <= rating ? "text-primary" : "text-muted-foreground/35"}>
                    ★
                  </span>
                </button>
              ))}
              <span className="ml-2 text-sm text-muted-foreground">{rating}/5</span>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="lr-body">Your review</Label>
            <Textarea
              id="lr-body"
              required
              minLength={20}
              maxLength={4000}
              rows={6}
              value={form.body}
              onChange={(e) => set("body")(e.target.value)}
              placeholder="What happened, what stood out, and would you recommend it?"
            />
            <p className="text-xs text-muted-foreground">{form.body.length}/4000 characters</p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy} className="rounded-full">
              {busy ? "Submitting..." : "Submit review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
