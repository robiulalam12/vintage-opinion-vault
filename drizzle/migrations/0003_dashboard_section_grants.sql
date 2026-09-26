CREATE TABLE public.dashboard_section_grants (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, section)
);

GRANT SELECT ON public.dashboard_section_grants TO authenticated;
GRANT ALL ON public.dashboard_section_grants TO service_role;

ALTER TABLE public.dashboard_section_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own or admin read section grants"
ON public.dashboard_section_grants
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.can_use_section(_user_id uuid, _section text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.dashboard_section_grants
      WHERE user_id = _user_id AND section = _section
    )
$$;

REVOKE ALL ON FUNCTION public.can_use_section(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_section(uuid, text) TO authenticated, service_role;

-- Fake review tooling: allow accounts granted the 'fake_reviews' section.
CREATE POLICY "Section read templates" ON public.fake_review_templates
  FOR SELECT TO authenticated USING (public.can_use_section(auth.uid(), 'fake_reviews'));
CREATE POLICY "Section insert templates" ON public.fake_review_templates
  FOR INSERT TO authenticated WITH CHECK (public.can_use_section(auth.uid(), 'fake_reviews'));
CREATE POLICY "Section update templates" ON public.fake_review_templates
  FOR UPDATE TO authenticated USING (public.can_use_section(auth.uid(), 'fake_reviews'))
  WITH CHECK (public.can_use_section(auth.uid(), 'fake_reviews'));
CREATE POLICY "Section delete templates" ON public.fake_review_templates
  FOR DELETE TO authenticated USING (public.can_use_section(auth.uid(), 'fake_reviews'));

CREATE POLICY "Section read fake orders" ON public.fake_review_orders
  FOR SELECT TO authenticated USING (public.can_use_section(auth.uid(), 'fake_reviews'));
CREATE POLICY "Section insert fake orders" ON public.fake_review_orders
  FOR INSERT TO authenticated WITH CHECK (public.can_use_section(auth.uid(), 'fake_reviews'));
CREATE POLICY "Section update fake orders" ON public.fake_review_orders
  FOR UPDATE TO authenticated USING (public.can_use_section(auth.uid(), 'fake_reviews'))
  WITH CHECK (public.can_use_section(auth.uid(), 'fake_reviews'));
CREATE POLICY "Section delete fake orders" ON public.fake_review_orders
  FOR DELETE TO authenticated USING (public.can_use_section(auth.uid(), 'fake_reviews'));

CREATE POLICY "Section read shots" ON public.fake_review_shots
  FOR SELECT TO authenticated USING (public.can_use_section(auth.uid(), 'fake_reviews'));
CREATE POLICY "Section insert shots" ON public.fake_review_shots
  FOR INSERT TO authenticated WITH CHECK (public.can_use_section(auth.uid(), 'fake_reviews'));
CREATE POLICY "Section delete shots" ON public.fake_review_shots
  FOR DELETE TO authenticated USING (public.can_use_section(auth.uid(), 'fake_reviews'));

CREATE POLICY "Section read comments" ON public.fake_review_comments
  FOR SELECT TO authenticated USING (public.can_use_section(auth.uid(), 'fake_reviews'));
CREATE POLICY "Section insert comments" ON public.fake_review_comments
  FOR INSERT TO authenticated WITH CHECK (public.can_use_section(auth.uid(), 'fake_reviews'));
CREATE POLICY "Section update comments" ON public.fake_review_comments
  FOR UPDATE TO authenticated USING (public.can_use_section(auth.uid(), 'fake_reviews'))
  WITH CHECK (public.can_use_section(auth.uid(), 'fake_reviews'));
CREATE POLICY "Section delete comments" ON public.fake_review_comments
  FOR DELETE TO authenticated USING (public.can_use_section(auth.uid(), 'fake_reviews'));
