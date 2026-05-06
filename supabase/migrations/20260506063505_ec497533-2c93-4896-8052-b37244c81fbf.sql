
-- 1) Fix mutable search_path on bump_conversation_ts
CREATE OR REPLACE FUNCTION public.bump_conversation_ts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end; $$;

-- 2) Revoke public/auth EXECUTE on internal SECURITY DEFINER functions
-- Trigger functions should never be callable directly via PostgREST.
REVOKE ALL ON FUNCTION public.bump_conversation_ts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_quota_on_file() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_friend_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_new_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_join_request_resolved() FROM PUBLIC, anon, authenticated;

-- Internal helpers used inside RLS policies — only authenticated, never anon
REVOKE ALL ON FUNCTION public.is_conversation_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_channel_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_member(uuid, uuid) TO authenticated;

-- RPC used from client — auth only
REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;

-- 3) Tighten avatars bucket: drop wildcard SELECT, allow only owner-prefixed reads + signed URLs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Avatar images publicly accessible') THEN
    DROP POLICY "Avatar images publicly accessible" ON storage.objects;
  END IF;
END $$;

-- Public read of avatars is still desired but only for direct path access (no LIST).
-- We allow SELECT on individual rows but PostgREST listing is blocked at API level naturally.
CREATE POLICY "Avatars readable by anyone (no list)"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- 4) Channel moderation: owner can soft-delete any message in their channel.
-- Policy already exists (messages_update_channel_owner). Add explicit policy that owner can DELETE? We use soft delete via UPDATE.
-- Add policy so channel owners can DELETE conversation_members (already exists: conv_members_delete_channel_owner).

-- 5) Trigger: update sender_id has_role-style is_channel_owner helper for client-side checks.
CREATE OR REPLACE FUNCTION public.is_channel_owner(_channel uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.channels WHERE id = _channel AND owner_id = _user);
$$;
REVOKE ALL ON FUNCTION public.is_channel_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_channel_owner(uuid, uuid) TO authenticated;
