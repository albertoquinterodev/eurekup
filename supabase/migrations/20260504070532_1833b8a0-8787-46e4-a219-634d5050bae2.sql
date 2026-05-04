CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(_peer uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _conv uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF _peer IS NULL OR _peer = _me THEN
    RAISE EXCEPTION 'invalid_peer' USING ERRCODE = '22023';
  END IF;

  -- Look for an existing direct conversation that includes both users.
  SELECT c.id INTO _conv
  FROM public.conversations c
  WHERE c.kind = 'direct'
    AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id AND m.user_id = _me)
    AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id AND m.user_id = _peer)
  LIMIT 1;

  IF _conv IS NOT NULL THEN
    RETURN _conv;
  END IF;

  INSERT INTO public.conversations (kind) VALUES ('direct') RETURNING id INTO _conv;
  INSERT INTO public.conversation_members (conversation_id, user_id) VALUES (_conv, _me), (_conv, _peer);
  RETURN _conv;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;
