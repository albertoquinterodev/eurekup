DROP POLICY IF EXISTS "conversations_insert_auth" ON public.conversations;

CREATE POLICY "conversations_insert_authenticated"
ON public.conversations
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
