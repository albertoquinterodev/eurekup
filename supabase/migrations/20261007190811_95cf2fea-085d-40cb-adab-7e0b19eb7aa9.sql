REVOKE ALL ON FUNCTION public.is_blocked_in_conversation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_in_conversation(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;