CREATE TABLE public.robiul_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  headline text NOT NULL,
  body text NOT NULL,
  subject text,
  image_url text,
  rating smallint NOT NULL DEFAULT 5,
  review_date date NOT NULL DEFAULT CURRENT_DATE,
  published boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.robiul_reviews TO authenticated;
GRANT SELECT ON public.robiul_reviews TO anon;
GRANT ALL ON public.robiul_reviews TO service_role;

ALTER TABLE public.robiul_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published robiul reviews are public"
  ON public.robiul_reviews FOR SELECT
  TO anon, authenticated
  USING (published = true);

CREATE POLICY "Admins read all robiul reviews"
  ON public.robiul_reviews FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert robiul reviews"
  ON public.robiul_reviews FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update robiul reviews"
  ON public.robiul_reviews FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete robiul reviews"
  ON public.robiul_reviews FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER robiul_reviews_set_updated_at
  BEFORE UPDATE ON public.robiul_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX robiul_reviews_published_date_idx
  ON public.robiul_reviews (published, review_date DESC);
