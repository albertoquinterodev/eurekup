
-- Friend request notification
CREATE OR REPLACE FUNCTION public.notify_friend_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text;
BEGIN
  SELECT display_name INTO _name FROM public.profiles WHERE id = NEW.from_user;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (NEW.to_user, 'friend_request', 'Nueva solicitud de amistad',
          COALESCE(_name, 'Alguien') || ' quiere conectar contigo', '/app/contacts');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_friend_request ON public.friend_requests;
CREATE TRIGGER trg_notify_friend_request
AFTER INSERT ON public.friend_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_friend_request();

-- New direct message notification (notify each member except sender)
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _kind conversation_kind; _sender_name text; _preview text;
BEGIN
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
END; $$;
DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

-- Channel join request status change notification
CREATE OR REPLACE FUNCTION public.notify_join_request_resolved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ch_name text;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  SELECT name INTO _ch_name FROM public.channels WHERE id = NEW.channel_id;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (NEW.user_id, 'join_request',
          CASE WHEN NEW.status = 'approved' THEN 'Solicitud aceptada' ELSE 'Solicitud rechazada' END,
          'Canal #' || COALESCE(_ch_name, ''),
          '/app/channels');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_join_request_resolved ON public.channel_join_requests;
CREATE TRIGGER trg_notify_join_request_resolved
AFTER UPDATE ON public.channel_join_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_join_request_resolved();
