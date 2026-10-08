CREATE OR REPLACE FUNCTION public.can_see_profile(_profile uuid, _viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _viewer IS NOT NULL AND (
    _profile = _viewer
    OR EXISTS (SELECT 1 FROM public.contacts c WHERE (c.owner_id = _viewer AND c.contact_user_id = _profile) OR (c.owner_id = _profile AND c.contact_user_id = _viewer))
    OR EXISTS (SELECT 1 FROM public.conversation_members a JOIN public.conversation_members b ON b.conversation_id = a.conversation_id WHERE a.user_id = _viewer AND b.user_id = _profile)
    OR EXISTS (SELECT 1 FROM public.friend_requests f WHERE (f.from_user = _viewer AND f.to_user = _profile) OR (f.from_user = _profile AND f.to_user = _viewer))
    OR EXISTS (SELECT 1 FROM public.channel_join_requests j JOIN public.channels ch ON ch.id = j.channel_id WHERE (ch.owner_id = _viewer AND j.user_id = _profile) OR (ch.owner_id = _profile AND j.user_id = _viewer))
    OR EXISTS (SELECT 1 FROM public.channels ch WHERE ch.owner_id = _profile AND (ch.visibility = 'public' OR public.is_channel_member(ch.id, _viewer)))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.can_see_profile(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_profile(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_related ON public.profiles FOR SELECT TO authenticated
  USING (public.can_see_profile(id, auth.uid()));

CREATE OR REPLACE FUNCTION public.find_profile_by_username(_u text)
RETURNS TABLE(id uuid, display_name text, username text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.display_name, p.username,
    CASE WHEN p.avatar_visibility = 'everyone' OR p.id = auth.uid() THEN p.avatar_url ELSE NULL END
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND lower(p.username) = lower(trim(_u))
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.find_profile_by_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_profile_by_username(text) TO authenticated;