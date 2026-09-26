-- next_review_slug() is SECURITY DEFINER and already raises unless the caller
-- is an admin, so signed-in execution is safe and required for publishing.
GRANT EXECUTE ON FUNCTION public.next_review_slug() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_review_slug() TO service_role;