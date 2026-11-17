-- Arkki Đánh giá học sinh: database schema for Supabase.
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text not null default '',
  role text not null default 'teacher' check (role in ('admin', 'manager', 'teacher')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.semesters (
  id text primary key,
  year text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.schools (
  id text primary key,
  name text not null,
  max_level int not null default 3 check (max_level in (3, 4)),
  comps text[] not null default array['C01','C02','C03','C04','C05'],
  rubric jsonb not null default '{}'::jsonb,
  library jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id text primary key,
  school_id text not null references public.schools on delete restrict,
  semester_id text not null references public.semesters on delete restrict,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists classes_school_sem on public.classes (school_id, semester_id);

create table if not exists public.class_teachers (
  class_id text not null references public.classes on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key (class_id, user_id)
);

create table if not exists public.students (
  id text primary key,
  class_id text not null references public.classes on delete cascade,
  name text not null,
  code text not null default '',
  dob text not null default '',
  sort_order int not null default 0,
  person_id text,
  created_at timestamptz not null default now()
);
create index if not exists students_class on public.students (class_id);

create table if not exists public.lessons (
  id text primary key,
  class_id text not null references public.classes on delete cascade,
  sort_order int not null default 0,
  date text not null default '',
  project text not null default '',
  content text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists lessons_class on public.lessons (class_id);

-- One row per student per class: s = {lessonId: {C01..C05: 1-4, note, absent}}, fin = end-of-term fields.
create table if not exists public.records (
  id text primary key,
  class_id text not null references public.classes on delete cascade,
  student_id text not null references public.students on delete cascade,
  s jsonb not null default '{}'::jsonb,
  fin jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (class_id, student_id)
);
create index if not exists records_class on public.records (class_id);

create table if not exists public.settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  tbl text not null,
  row_id text not null,
  before jsonb,
  after jsonb
);

-- ---------- helpers ----------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin', 'manager'), false)
$$;

create or replace function public.can_class(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (
    select 1 from public.class_teachers ct join public.profiles p on p.id = ct.user_id
    where ct.class_id = cid and ct.user_id = auth.uid() and p.active)
$$;

create or replace function public.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then (
      select coalesce(jsonb_object_agg(k,
        case when a ? k and b ? k then public.jsonb_deep_merge(a -> k, b -> k)
             when b ? k then b -> k else a -> k end), '{}'::jsonb)
      from (select jsonb_object_keys(a) k union select jsonb_object_keys(b)) keys)
    else b end
$$;

-- Nested merge so two teachers editing different lessons of one student never overwrite each other.
create or replace function public.merge_record(p_id text, p_class_id text, p_student_id text, p_patch jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_class(p_class_id) then raise exception 'not allowed'; end if;
  if exists (select 1 from public.students where id = p_student_id and class_id <> p_class_id) then
    raise exception 'student does not belong to class';
  end if;
  insert into public.records (id, class_id, student_id, s, fin, updated_by)
  values (p_id, p_class_id, p_student_id, coalesce(p_patch -> 's', '{}'::jsonb), coalesce(p_patch -> 'fin', '{}'::jsonb), auth.uid())
  on conflict (id) do update set
    s = public.jsonb_deep_merge(records.s, coalesce(p_patch -> 's', '{}'::jsonb)),
    fin = public.jsonb_deep_merge(records.fin, coalesce(p_patch -> 'fin', '{}'::jsonb)),
    updated_at = now(), updated_by = auth.uid();
end $$;

-- New sign-ups become teachers with no classes; the very first account becomes admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''),
          case when exists (select 1 from public.profiles) then 'teacher' else 'admin' end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Only admins change roles or activation; users may edit their own name.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'only admin can change role';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile();

create or replace function public.audit_records() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor, tbl, row_id, before, after)
  values (auth.uid(), 'records', coalesce(new.id, old.id),
          case when tg_op <> 'INSERT' then jsonb_build_object('s', old.s, 'fin', old.fin) end,
          case when tg_op <> 'DELETE' then jsonb_build_object('s', new.s, 'fin', new.fin) end);
  return coalesce(new, old);
end $$;
drop trigger if exists records_audit on public.records;
create trigger records_audit after update or delete on public.records for each row execute function public.audit_records();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.semesters enable row level security;
alter table public.schools enable row level security;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.students enable row level security;
alter table public.lessons enable row level security;
alter table public.records enable row level security;
alter table public.settings enable row level security;
alter table public.audit_log enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.my_role() = 'admin');
create policy profiles_delete on public.profiles for delete to authenticated using (public.my_role() = 'admin' and id <> auth.uid());

-- Catalog: every active user reads, staff writes.
create policy semesters_read on public.semesters for select to authenticated using (public.my_role() is not null);
create policy semesters_write on public.semesters for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy schools_read on public.schools for select to authenticated using (public.my_role() is not null);
create policy schools_write on public.schools for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy settings_read on public.settings for select to authenticated using (public.my_role() is not null);
create policy settings_write on public.settings for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Classes and their contents: teachers see only classes assigned to them.
create policy classes_read on public.classes for select to authenticated using (public.can_class(id));
create policy classes_write on public.classes for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy ct_read on public.class_teachers for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy ct_write on public.class_teachers for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy students_read on public.students for select to authenticated using (public.can_class(class_id));
create policy students_write on public.students for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy lessons_read on public.lessons for select to authenticated using (public.can_class(class_id));
create policy lessons_write on public.lessons for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy records_read on public.records for select to authenticated using (public.can_class(class_id));
create policy records_insert on public.records for insert to authenticated with check (public.can_class(class_id) and exists (select 1 from public.students st where st.id = student_id and st.class_id = records.class_id));
create policy records_update on public.records for update to authenticated using (public.can_class(class_id)) with check (public.can_class(class_id));
create policy records_delete on public.records for delete to authenticated using (public.is_staff());
create policy audit_read on public.audit_log for select to authenticated using (public.is_staff());

-- ---------- realtime ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    declare t text; begin
      foreach t in array array['records','students','lessons','classes','schools','semesters','settings','class_teachers'] loop
        begin execute format('alter publication supabase_realtime add table public.%I', t);
        exception when duplicate_object then null; end;
      end loop;
    end;
  end if;
end $$;
