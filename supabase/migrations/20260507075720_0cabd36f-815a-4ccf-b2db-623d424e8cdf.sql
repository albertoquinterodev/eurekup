
-- Update handle_new_user to cap referral bonus at 15 GB extra (5 GB base + 15 GB = 20 GB total)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _name text;
  _code text;
  _base bigint := 5368709120; -- 5 GB
  _cap  bigint := 21474836480; -- 20 GB
  _bonus bigint := 1073741824; -- 1 GB
begin
  _name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1));
  _code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.profiles (id, email, display_name, referral_code)
  values (new.id, new.email, _name, _code);

  insert into public.storage_quota (user_id) values (new.id);

  if new.raw_user_meta_data ? 'referral_code' then
    update public.profiles set referred_by = (
      select id from public.profiles where referral_code = upper(new.raw_user_meta_data->>'referral_code') limit 1
    ) where id = new.id;

    update public.referrals
      set status='verified', invited_user_id=new.id, verified_at=now()
      where invited_email = lower(new.email)
        and referrer_id = (select id from public.profiles where referral_code = upper(new.raw_user_meta_data->>'referral_code') limit 1);

    update public.storage_quota q
      set total_bytes = least(_cap, total_bytes + _bonus), updated_at = now()
      from public.profiles p
      where p.referral_code = upper(new.raw_user_meta_data->>'referral_code')
        and q.user_id = p.id;
  end if;

  return new;
end;
$function$;

-- Recompute existing quotas based on verified referrals so cap is enforced retroactively.
WITH counts AS (
  SELECT referrer_id, COUNT(*) AS verified
  FROM public.referrals
  WHERE status = 'verified'
  GROUP BY referrer_id
)
UPDATE public.storage_quota q
SET total_bytes = LEAST(21474836480, 5368709120 + COALESCE(c.verified, 0) * 1073741824),
    updated_at = now()
FROM counts c
WHERE c.referrer_id = q.user_id;
