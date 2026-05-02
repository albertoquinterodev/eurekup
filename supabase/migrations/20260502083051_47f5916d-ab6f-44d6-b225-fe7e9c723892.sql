
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Allow sender to update their own message (body, edited_at, deleted_at)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='messages' AND policyname='Sender can update own message'
  ) THEN
    CREATE POLICY "Sender can update own message"
      ON public.messages
      FOR UPDATE
      TO authenticated
      USING (sender_id = auth.uid())
      WITH CHECK (sender_id = auth.uid());
  END IF;
END$$;
