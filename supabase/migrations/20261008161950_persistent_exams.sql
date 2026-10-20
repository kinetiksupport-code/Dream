-- Additive exam preparation. Existing chat/test tables remain the source of truth.
create table public.dream_exams (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 160), subject text not null check(length(subject) between 1 and 80),
 exam_date date not null, topics text[] not null default '{}', difficulties text not null default '', goal text not null default '',
 daily_minutes integer not null default 20 check(daily_minutes between 5 and 120),
 status text not null default 'draft' check(status in ('draft','preparing','ready','failed','completed')),
 conversation_id uuid references public.dream_conversations(id) on delete set null,
 plan_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,owner_id)
);
create table public.dream_exam_materials (
 exam_id uuid not null, owner_id uuid not null references auth.users(id) on delete cascade,
 attachment_id uuid not null references public.dream_attachments(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(exam_id,attachment_id),
 foreign key(exam_id,owner_id) references public.dream_exams(id,owner_id) on delete cascade
);
create table public.dream_exam_units (
 id uuid primary key default gen_random_uuid(), exam_id uuid not null, owner_id uuid not null references auth.users(id) on delete cascade,
 position integer not null check(position >= 0), title text not null, topic text not null, summary text not null,
 estimated_minutes integer not null check(estimated_minutes between 5 and 120),
 status text not null default 'pending' check(status in ('pending','in_progress','completed')),
 conversation_id uuid references public.dream_conversations(id) on delete set null, completed_at timestamptz,
 unique(exam_id,position), unique(id,exam_id,owner_id),
 foreign key(exam_id,owner_id) references public.dream_exams(id,owner_id) on delete cascade
);
create table public.dream_exam_sessions (
 id uuid primary key default gen_random_uuid(), exam_id uuid not null, owner_id uuid not null references auth.users(id) on delete cascade,
 test_id uuid not null unique references public.dream_tests(id) on delete cascade,
 mode text not null check(mode in ('practice','exam')), status text not null default 'active' check(status in ('active','grading','completed')),
 answers jsonb not null default '{}', question_index integer not null default 0 check(question_index >= 0), revision integer not null default 0,
 started_at timestamptz not null default now(), time_limit_seconds integer check(time_limit_seconds between 60 and 14400),
 submitted_at timestamptz, result jsonb, grading_started_at timestamptz,
 foreign key(exam_id,owner_id) references public.dream_exams(id,owner_id) on delete cascade,
 check((status = 'completed') = (result is not null))
);
create index dream_exams_owner_date on public.dream_exams(owner_id,exam_date);
create index dream_exams_conversation on public.dream_exams(conversation_id);
create index dream_exam_materials_owner on public.dream_exam_materials(owner_id);
create index dream_exam_materials_attachment on public.dream_exam_materials(attachment_id);
create index dream_exam_units_owner on public.dream_exam_units(owner_id);
create index dream_exam_units_conversation on public.dream_exam_units(conversation_id);
create index dream_exam_sessions_exam on public.dream_exam_sessions(exam_id);
create index dream_exam_sessions_owner on public.dream_exam_sessions(owner_id);
alter table public.dream_exams enable row level security;
alter table public.dream_exam_materials enable row level security;
alter table public.dream_exam_units enable row level security;
alter table public.dream_exam_sessions enable row level security;
create policy exams_read_own on public.dream_exams for select to authenticated using ((select auth.uid()) = owner_id);
create policy materials_read_own on public.dream_exam_materials for select to authenticated using ((select auth.uid()) = owner_id);
create policy units_read_own on public.dream_exam_units for select to authenticated using ((select auth.uid()) = owner_id);
create policy sessions_read_own on public.dream_exam_sessions for select to authenticated using ((select auth.uid()) = owner_id);
revoke all on public.dream_exams,public.dream_exam_materials,public.dream_exam_units,public.dream_exam_sessions from anon,authenticated;
grant select on public.dream_exams,public.dream_exam_materials,public.dream_exam_units,public.dream_exam_sessions to authenticated;
grant all on public.dream_exams,public.dream_exam_materials,public.dream_exam_units,public.dream_exam_sessions to service_role;
-- Answer keys were selectable via REST. Public question columns suffice for existing UI;
-- all grading remains inside the authenticated Edge Function.
revoke select on public.dream_test_questions from anon,authenticated;
grant select(id,test_id,position,type,prompt,options,metadata) on public.dream_test_questions to authenticated;
create function public.dream_exam_store_plan(p_exam uuid,p_owner uuid,p_units jsonb) returns void
 language plpgsql security invoker set search_path = '' as $$
begin
 if not exists(select 1 from public.dream_exams where id=p_exam and owner_id=p_owner and status='preparing') then
 raise exception 'Exam is not preparing'; end if;
 if jsonb_array_length(p_units) not between 1 and 20 then raise exception 'Invalid plan'; end if;
 insert into public.dream_exam_units(exam_id,owner_id,position,title,topic,summary,estimated_minutes)
 select p_exam,p_owner,ordinality-1,unit->>'title',unit->>'topic',unit->>'summary',(unit->>'estimated_minutes')::integer
 from jsonb_array_elements(p_units) with ordinality as items(unit,ordinality);
 update public.dream_exams set status='ready',plan_error=null,updated_at=now() where id=p_exam and owner_id=p_owner;
end $$;
revoke all on function public.dream_exam_store_plan(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.dream_exam_store_plan(uuid,uuid,jsonb) to service_role;
