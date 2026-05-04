-- 1. Channel rules
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS rules text;

-- 2. last_read_at for unread counters
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz NOT NULL DEFAULT now();

-- Allow members to update their own membership row (mark-as-read)
CREATE POLICY "conv_members_update_self"
ON public.conversation_members
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Channel owner can remove (kick) members
CREATE POLICY "conv_members_delete_channel_owner"
ON public.conversation_members
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.channels ch ON ch.id = c.channel_id
    WHERE c.id = conversation_members.conversation_id
      AND ch.owner_id = auth.uid()
  )
);

-- Channel owner can add members (approve flow)
CREATE POLICY "conv_members_insert_channel_owner"
ON public.conversation_members
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.channels ch ON ch.id = c.channel_id
    WHERE c.id = conversation_members.conversation_id
      AND ch.owner_id = auth.uid()
  )
);

-- 3. Channel owner can moderate (soft-delete) any message in their channel
CREATE POLICY "messages_update_channel_owner"
ON public.messages
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.channels ch ON ch.id = c.channel_id
    WHERE c.id = messages.conversation_id
      AND ch.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.channels ch ON ch.id = c.channel_id
    WHERE c.id = messages.conversation_id
      AND ch.owner_id = auth.uid()
  )
);

-- 4. Channel owner can remove join requests (reject)
CREATE POLICY "jr_delete_owner"
ON public.channel_join_requests
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_join_requests.channel_id
      AND c.owner_id = auth.uid()
  )
);

-- 5. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own"
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "notifications_delete_own"
ON public.notifications FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Any authenticated user can create a notification (used by triggers in the app
-- such as friend requests and channel join requests).
CREATE POLICY "notifications_insert_authenticated"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- 6. Friend requests
DO $$ BEGIN
  CREATE TYPE public.friend_request_status AS ENUM ('pending', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  status public.friend_request_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (from_user, to_user)
);
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fr_select_involved"
ON public.friend_requests FOR SELECT TO authenticated
USING (from_user = auth.uid() OR to_user = auth.uid());

CREATE POLICY "fr_insert_self"
ON public.friend_requests FOR INSERT TO authenticated
WITH CHECK (from_user = auth.uid() AND from_user <> to_user);

CREATE POLICY "fr_update_recipient"
ON public.friend_requests FOR UPDATE TO authenticated
USING (to_user = auth.uid());

CREATE POLICY "fr_delete_involved"
ON public.friend_requests FOR DELETE TO authenticated
USING (from_user = auth.uid() OR to_user = auth.uid());

-- 7. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_join_requests;
