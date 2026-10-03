ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
DROP POLICY IF EXISTS messages_select_member ON public.messages;
CREATE POLICY messages_select_member ON public.messages FOR SELECT TO authenticated
USING (is_conversation_member(conversation_id, auth.uid()) AND (scheduled_at IS NULL OR scheduled_at <= now() OR sender_id = auth.uid()));
CREATE OR REPLACE FUNCTION public.notify_new_message()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _kind conversation_kind; _sender_name text; _preview text;
BEGIN
  IF NEW.scheduled_at IS NOT NULL AND NEW.scheduled_at > now() THEN RETURN NEW; END IF;
  SELECT kind INTO _kind FROM public.conversations WHERE id = NEW.conversation_id;
  IF _kind <> 'direct' THEN RETURN NEW; END IF;
  SELECT display_name INTO _sender_name FROM public.profiles WHERE id = NEW.sender_id;
  _preview := COALESCE(LEFT(NEW.body, 80), 'Te ha enviado un archivo');
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT cm.user_id, 'message', COALESCE(_sender_name, 'Mensaje nuevo'), _preview,
         '/app/chats/' || NEW.conversation_id
  FROM public.conversation_members cm
  WHERE cm.conversation_id = NEW.conversation_id AND cm.user_id <> NEW.sender_id;
  RETURN NEW;
END; $function$;