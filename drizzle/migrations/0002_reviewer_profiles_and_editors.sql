-- Which reviewer profile each review belongs to ('robiul', 'afridi', ...)
ALTER TABLE public.robiul_reviews
  ADD COLUMN IF NOT EXISTS reviewer_key text NOT NULL DEFAULT 'robiul';

CREATE INDEX IF NOT EXISTS robiul_reviews_reviewer_key_idx
  ON public.robiul_reviews (reviewer_key, published, review_date DESC);

-- Per-profile editors (limited accounts that can only post on their own profile)
CREATE TABLE IF NOT EXISTS public.reviewer_editors (
  user_id uuid NOT NULL,
  reviewer_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reviewer_key)
);

GRANT SELECT ON public.reviewer_editors TO authenticated;
GRANT ALL ON public.reviewer_editors TO service_role;

ALTER TABLE public.reviewer_editors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors read own assignments"
  ON public.reviewer_editors FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.can_edit_reviewer(_user_id uuid, _reviewer_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.reviewer_editors
        WHERE user_id = _user_id AND reviewer_key = _reviewer_key
      )
$$;

REVOKE ALL ON FUNCTION public.can_edit_reviewer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_reviewer(uuid, text) TO authenticated, service_role;

-- Profile editors get the same read/write rights as admins, but only on their own profile
CREATE POLICY "Profile editors read own reviewer reviews"
  ON public.robiul_reviews FOR SELECT
  TO authenticated
  USING (public.can_edit_reviewer(auth.uid(), reviewer_key));

CREATE POLICY "Profile editors insert own reviewer reviews"
  ON public.robiul_reviews FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_reviewer(auth.uid(), reviewer_key));

CREATE POLICY "Profile editors update own reviewer reviews"
  ON public.robiul_reviews FOR UPDATE
  TO authenticated
  USING (public.can_edit_reviewer(auth.uid(), reviewer_key))
  WITH CHECK (public.can_edit_reviewer(auth.uid(), reviewer_key));

CREATE POLICY "Profile editors delete own reviewer reviews"
  ON public.robiul_reviews FOR DELETE
  TO authenticated
  USING (public.can_edit_reviewer(auth.uid(), reviewer_key));