ALTER TABLE public.review_orders ADD COLUMN IF NOT EXISTS reviewer_key text NOT NULL DEFAULT 'robiul';
ALTER TABLE public.review_orders ADD CONSTRAINT review_orders_reviewer_key_check CHECK (reviewer_key IN ('robiul','jonas'));
ALTER TABLE public.review_sources ADD COLUMN IF NOT EXISTS published_profile_review_id uuid REFERENCES public.robiul_reviews(id) ON DELETE SET NULL;
ALTER TABLE public.review_sources ADD COLUMN IF NOT EXISTS published_path text;
ALTER TABLE public.review_sources ADD COLUMN IF NOT EXISTS date_fallback boolean NOT NULL DEFAULT false;
UPDATE public.review_sources SET published_path = '/Jordan/reviews/' || published_slug
  WHERE published_review_id IS NOT NULL AND published_slug IS NOT NULL AND published_path IS NULL;