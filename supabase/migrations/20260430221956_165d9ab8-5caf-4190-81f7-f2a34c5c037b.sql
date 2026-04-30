
-- ============ EXTENSIONS ============
create extension if not exists "pgcrypto";

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  avatar_url text,
  referral_code text not null unique,
  referred_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_idx on public.profiles (lower(email));

alter table public.profiles enable row level security;

create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- ============ STORAGE QUOTA ============
create table public.storage_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_bytes bigint not null default 5368709120, -- 5GB
  used_bytes bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.storage_quota enable row level security;
create policy "quota_select_own" on public.storage_quota
  for select to authenticated using (user_id = auth.uid());

-- ============ CONTACTS ============
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, contact_user_id)
);
create index contacts_owner_idx on public.contacts(owner_id);

alter table public.contacts enable row level security;
create policy "contacts_select_own" on public.contacts
  for select to authenticated using (owner_id = auth.uid());
create policy "contacts_insert_own" on public.contacts
  for insert to authenticated with check (owner_id = auth.uid() and contact_user_id <> auth.uid());
create policy "contacts_delete_own" on public.contacts
  for delete to authenticated using (owner_id = auth.uid());

-- ============ CHANNELS ============
create type public.channel_visibility as enum ('public','private');

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  visibility public.channel_visibility not null default 'public',
  owner_id uuid not null references auth.users(id) on delete cascade,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index channels_visibility_idx on public.channels(visibility);

alter table public.channels enable row level security;

-- ============ CONVERSATIONS ============
create type public.conversation_kind as enum ('direct','channel');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null,
  channel_id uuid references public.channels(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index conversations_last_message_idx on public.conversations(last_message_at desc);

alter table public.conversations enable row level security;

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conv_members_user_idx on public.conversation_members(user_id);

alter table public.conversation_members enable row level security;

-- Helper function to avoid recursive RLS
create or replace function public.is_conversation_member(_conv uuid, _user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.conversation_members where conversation_id = _conv and user_id = _user);
$$;

create or replace function public.is_channel_member(_channel uuid, _user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    where c.channel_id = _channel and cm.user_id = _user
  );
$$;

create policy "conversations_select_member" on public.conversations
  for select to authenticated
  using (public.is_conversation_member(id, auth.uid()));
create policy "conversations_insert_auth" on public.conversations
  for insert to authenticated with check (true);
create policy "conversations_update_member" on public.conversations
  for update to authenticated using (public.is_conversation_member(id, auth.uid()));

create policy "conv_members_select_self_or_peer" on public.conversation_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id, auth.uid()));
create policy "conv_members_insert_self" on public.conversation_members
  for insert to authenticated with check (user_id = auth.uid() or
    exists(select 1 from public.conversations c where c.id = conversation_id and c.kind='direct'));
create policy "conv_members_delete_self" on public.conversation_members
  for delete to authenticated using (user_id = auth.uid());

-- Channel policies (after helper fn)
create policy "channels_select_visible" on public.channels
  for select to authenticated
  using (visibility = 'public' or owner_id = auth.uid() or public.is_channel_member(id, auth.uid()));
create policy "channels_insert_own" on public.channels
  for insert to authenticated with check (owner_id = auth.uid());
create policy "channels_update_own" on public.channels
  for update to authenticated using (owner_id = auth.uid());
create policy "channels_delete_own" on public.channels
  for delete to authenticated using (owner_id = auth.uid());

-- ============ MESSAGES ============
create type public.message_status as enum ('sent','delivered','read');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text,
  file_id uuid,
  status public.message_status not null default 'sent',
  created_at timestamptz not null default now()
);
create index messages_conv_idx on public.messages(conversation_id, created_at desc);

alter table public.messages enable row level security;
create policy "messages_select_member" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id, auth.uid()));
create policy "messages_insert_member" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid())
  );
create policy "messages_update_own" on public.messages
  for update to authenticated using (sender_id = auth.uid());

-- bump conversation last_message_at
create or replace function public.bump_conversation_ts()
returns trigger language plpgsql as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end; $$;
create trigger messages_bump_conv after insert on public.messages
  for each row execute function public.bump_conversation_ts();

-- ============ CHANNEL JOIN REQUESTS ============
create type public.join_request_status as enum ('pending','approved','rejected');

create table public.channel_join_requests (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.join_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (channel_id, user_id)
);
alter table public.channel_join_requests enable row level security;
create policy "jr_select_self_or_owner" on public.channel_join_requests
  for select to authenticated using (
    user_id = auth.uid() or
    exists(select 1 from public.channels c where c.id = channel_id and c.owner_id = auth.uid())
  );
create policy "jr_insert_self" on public.channel_join_requests
  for insert to authenticated with check (user_id = auth.uid());
create policy "jr_update_owner" on public.channel_join_requests
  for update to authenticated using (
    exists(select 1 from public.channels c where c.id = channel_id and c.owner_id = auth.uid())
  );

-- ============ FOLDERS & FILES ============
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.folders(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index folders_owner_idx on public.folders(owner_id);
alter table public.folders enable row level security;
create policy "folders_all_own" on public.folders
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete set null,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
create index files_owner_idx on public.files(owner_id);
create index files_folder_idx on public.files(folder_id);
alter table public.files enable row level security;
create policy "files_all_own" on public.files
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- update quota when files change
create or replace function public.update_quota_on_file()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.storage_quota set used_bytes = used_bytes + new.size_bytes, updated_at = now()
      where user_id = new.owner_id;
  elsif tg_op = 'DELETE' then
    update public.storage_quota set used_bytes = greatest(0, used_bytes - old.size_bytes), updated_at = now()
      where user_id = old.owner_id;
  end if;
  return null;
end; $$;
create trigger files_quota_ins after insert on public.files for each row execute function public.update_quota_on_file();
create trigger files_quota_del after delete on public.files for each row execute function public.update_quota_on_file();

-- ============ REFERRALS ============
create type public.referral_status as enum ('pending','verified');

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  invited_email text not null,
  invited_user_id uuid references auth.users(id) on delete set null,
  status public.referral_status not null default 'pending',
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (referrer_id, invited_email)
);
alter table public.referrals enable row level security;
create policy "ref_select_own" on public.referrals
  for select to authenticated using (referrer_id = auth.uid());
create policy "ref_insert_own" on public.referrals
  for insert to authenticated with check (referrer_id = auth.uid());

-- ============ NEW USER HANDLER ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _name text;
  _code text;
begin
  _name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1));
  _code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.profiles (id, email, display_name, referral_code)
  values (new.id, new.email, _name, _code);

  insert into public.storage_quota (user_id) values (new.id);

  -- handle referral if metadata contains code
  if new.raw_user_meta_data ? 'referral_code' then
    update public.profiles set referred_by = (
      select id from public.profiles where referral_code = upper(new.raw_user_meta_data->>'referral_code') limit 1
    ) where id = new.id;

    update public.referrals
      set status='verified', invited_user_id=new.id, verified_at=now()
      where invited_email = lower(new.email)
        and referrer_id = (select id from public.profiles where referral_code = upper(new.raw_user_meta_data->>'referral_code') limit 1);

    -- +1GB to referrer
    update public.storage_quota q
      set total_bytes = total_bytes + 1073741824, updated_at = now()
      from public.profiles p
      where p.referral_code = upper(new.raw_user_meta_data->>'referral_code')
        and q.user_id = p.id;
  end if;

  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ REALTIME ============
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.conversation_members;

-- ============ STORAGE BUCKETS ============
insert into storage.buckets (id, name, public) values ('files','files', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('avatars','avatars', true)
  on conflict (id) do nothing;

create policy "files_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "files_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "files_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_public_read" on storage.objects for select to public
  using (bucket_id = 'avatars');
create policy "avatars_owner_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
