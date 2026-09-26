CREATE TABLE public.dmca_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dmca_templates TO authenticated;
GRANT ALL ON public.dmca_templates TO service_role;
ALTER TABLE public.dmca_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage dmca templates" ON public.dmca_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER dmca_templates_set_updated_at BEFORE UPDATE ON public.dmca_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.review_orders ADD COLUMN dmca_template_id uuid REFERENCES public.dmca_templates(id) ON DELETE SET NULL;
ALTER TABLE public.review_sources ADD COLUMN archive_url text;
ALTER TABLE public.review_sources ADD COLUMN archive_date date;