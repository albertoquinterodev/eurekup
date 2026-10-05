ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
UPDATE public.profiles SET username = lower(regexp_replace(split_part(email,'@',1),'[^a-zA-Z0-9_]','','g')) || substr(replace(id::text,'-',''),1,4) WHERE username IS NULL;
ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key ON public.profiles (lower(username));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9_]{3,24}$');

-- Hide emails from other users: column-level privileges.
REVOKE SELECT ON public.profiles FROM authenticated, anon;
GRANT SELECT (id, display_name, avatar_url, username, last_seen_at, created_at, updated_at, referral_code, referred_by) ON public.profiles TO authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_url, username, last_seen_at, updated_at) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  _name text; _code text; _uname text;
  _cap bigint := 21474836480; _bonus bigint := 1073741824;
begin
  _name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1));
  _code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  _uname := lower(coalesce(new.raw_user_meta_data->>'username', ''));
  if _uname !~ '^[a-z0-9_]{3,24}$' or exists(select 1 from public.profiles where lower(username)=_uname) then
    _uname := substr(lower(regexp_replace(split_part(new.email,'@',1),'[^a-zA-Z0-9_]','','g')),1,18) || substr(replace(new.id::text,'-',''),1,4);
    if length(_uname) < 3 then _uname := 'user' || substr(replace(new.id::text,'-',''),1,6); end if;
  end if;

  insert into public.profiles (id, email, display_name, referral_code, username)
  values (new.id, new.email, _name, _code, _uname);
  insert into public.storage_quota (user_id) values (new.id);

  if new.raw_user_meta_data ? 'referral_code' then
    update public.profiles set referred_by = (
      select id from public.profiles where referral_code = upper(new.raw_user_meta_data->>'referral_code') limit 1
    ) where id = new.id;
    update public.referrals set status='verified', invited_user_id=new.id, verified_at=now()
      where invited_email = lower(new.email)
        and referrer_id = (select id from public.profiles where referral_code = upper(new.raw_user_meta_data->>'referral_code') limit 1);
    update public.storage_quota q set total_bytes = least(_cap, total_bytes + _bonus), updated_at = now()
      from public.profiles p
      where p.referral_code = upper(new.raw_user_meta_data->>'referral_code') and q.user_id = p.id;
  end if;
  return new;
end; $function$;