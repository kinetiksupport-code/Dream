-- ISOLATED TEST DATABASE ONLY. No student data or production credentials.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table public.dream_profiles(id uuid primary key,display_name text,avatar_url text,academic_level text,pref_step_by_step boolean,pref_practice_suggestions boolean,pref_calm_tone boolean,role text,email_domain text);
grant select,update on public.dream_profiles to authenticated;
create table public.dream_tests(id uuid primary key default gen_random_uuid(),owner_id uuid,subject text,topic text,status text);
create table public.dream_test_questions(id uuid primary key default gen_random_uuid(),test_id uuid,type text,expected_concepts jsonb default '[]');
create table public.dream_test_attempts(id uuid primary key default gen_random_uuid(),test_id uuid,student_id uuid,status text,score integer,total integer,completed_at timestamptz);
create table public.dream_test_answers(id uuid primary key default gen_random_uuid(),attempt_id uuid,question_id uuid,student_id uuid,answer jsonb,is_correct boolean,feedback text);
create table public.dream_learning_topics(id uuid primary key default gen_random_uuid(),student_id uuid,subject text,topic text,concept text,status text,evidence_count integer,correct_count integer,last_evidence_at timestamptz,updated_at timestamptz,unique(student_id,subject,topic,concept));
create table public.dream_learning_events(id uuid primary key default gen_random_uuid(),student_id uuid,test_attempt_id uuid,subject text,topic text,concept text,outcome text,evidence text);
