CREATE TABLE public.old_site_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_name text NOT NULL,
  review_date date,
  review_text text NOT NULL,
  business_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.old_site_reviews TO authenticated;
GRANT ALL ON public.old_site_reviews TO service_role;
ALTER TABLE public.old_site_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage old site reviews" ON public.old_site_reviews
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));