ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_visibility text NOT NULL DEFAULT 'everyone';
ALTER TABLE public.profiles ADD CONSTRAINT profiles_avatar_visibility_chk CHECK (avatar_visibility IN ('everyone','contacts'));

-- Computed column that respects avatar privacy
CREATE OR REPLACE FUNCTION public.visible_avatar(p public.profiles)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p.id = auth.uid() OR p.avatar_visibility = 'everyone' THEN p.avatar_url
    WHEN EXISTS (SELECT 1 FROM public.contacts c WHERE c.owner_id = p.id AND c.contact_user_id = auth.uid()) THEN p.avatar_url
    ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.visible_avatar(public.profiles) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visible_avatar(public.profiles) TO authenticated;

REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, display_name, username, last_seen_at, created_at, updated_at, referral_code, referred_by, avatar_visibility) ON public.profiles TO authenticated;
GRANT UPDATE (avatar_visibility) ON public.profiles TO authenticated;

-- Username availability (usable before sign-up)
CREATE OR REPLACE FUNCTION public.username_available(_u text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(_u) ~ '^[a-z0-9_]{3,24}$' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_u))
$$;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;

-- Blocks
CREATE TABLE public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY blocks_select_own ON public.user_blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid());
CREATE POLICY blocks_insert_own ON public.user_blocks FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());
CREATE POLICY blocks_delete_own ON public.user_blocks FOR DELETE TO authenticated USING (blocker_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_blocked_in_conversation(_conv uuid, _sender uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members m
    JOIN public.user_blocks b ON b.blocker_id = m.user_id AND b.blocked_id = _sender
    WHERE m.conversation_id = _conv
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_blocked_in_conversation(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS messages_insert_member ON public.messages;
CREATE POLICY messages_insert_member ON public.messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND is_conversation_member(conversation_id, auth.uid()) AND NOT is_blocked_in_conversation(conversation_id, auth.uid()));

-- Avatar uploads: users write only inside their own folder
DROP POLICY IF EXISTS "avatars_own_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_own_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_own_delete" ON storage.objects;
CREATE POLICY "avatars_own_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_own_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_own_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);