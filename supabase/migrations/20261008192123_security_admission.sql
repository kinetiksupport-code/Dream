begin;
-- REVIEW REQUIRED: never apply automatically to production.
create schema if not exists dream_private;
revoke all on schema dream_private from public, anon, authenticated;
create table dream_private.limits (
 id boolean primary key default true check(id), enabled boolean not null default false,
 rpm integer not null default 6 check(rpm between 1 and 1000), daily integer not null default 50 check(daily between 1 and 10000),
 exams_daily integer not null default 5 check(exams_daily between 1 and 1000), searches_daily integer not null default 15 check(searches_daily between 1 and 10000),
 global_concurrency integer not null default 8 check(global_concurrency between 1 and 1000), user_concurrency integer not null default 1 check(user_concurrency between 1 and 10),
 user_tokens bigint not null default 500000 check(user_tokens>0), global_tokens bigint not null default 2000000 check(global_tokens>0),
 user_microusd bigint not null default 1000000 check(user_microusd>0), global_microusd bigint not null default 10000000 check(global_microusd>0),
 -- Operator must set a verified upper bound including input, output and vision pricing.
 token_microusd numeric not null default 0 check(token_microusd>=0), search_microusd bigint not null default 0 check(search_microusd>=0)
);
insert into dream_private.limits(id) values(true);
create table dream_private.counters(scope text not null, bucket timestamptz not null, requests bigint not null default 0, exams bigint not null default 0, searches bigint not null default 0, tokens bigint not null default 0, microusd bigint not null default 0, primary key(scope,bucket));
create table dream_private.leases(owner_id uuid not null, request_id uuid not null, operation text not null, expires_at timestamptz not null, finished boolean not null default false, primary key(owner_id,request_id));
create table dream_private.provider_state(provider text primary key check(provider in ('groq','tavily')), blocked_until timestamptz not null);
-- Shared rate-limit state across every credential in a provider account.
create function public.dream_provider_pause(p_provider text,p_seconds integer) returns void language sql security definer set search_path='' as $$
 insert into dream_private.provider_state(provider,blocked_until) values(p_provider,clock_timestamp()+make_interval(secs=>greatest(1,least(p_seconds,2147483647))))
 on conflict(provider) do update set blocked_until=greatest(dream_private.provider_state.blocked_until,excluded.blocked_until);
$$;
create function public.dream_admit(p_owner uuid,p_request uuid,p_operation text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c dream_private.limits; u dream_private.counters; m dream_private.counters; t timestamptz:=clock_timestamp(); d timestamptz:=date_trunc('day',t at time zone 'UTC') at time zone 'UTC'; w timestamptz:=date_trunc('minute',t); n bigint;
begin
 if not pg_try_advisory_xact_lock(174493828) then return jsonb_build_object('ok',false,'status',429,'code','dream_admission_busy','retry_after',1); end if;
 if p_owner is null or p_request is null or p_operation not in ('chat','attachment_upload','test_generate','test_check_answer','test_submit','exam_prepare','exam_session_create','exam_session_submit') then raise exception 'invalid_admission'; end if;
 select * into c from dream_private.limits where id;
 if not c.enabled or c.token_microusd<=0 or c.search_microusd<=0 then return jsonb_build_object('ok',false,'status',503,'code','budget_unconfigured','retry_after',60); end if;
 -- Consistent global lock also serializes lease admission. Transactions are short, never hold locks during AI.
 insert into dream_private.counters(scope,bucket) values('global',d) on conflict do nothing;
 perform 1 from dream_private.counters where scope='global' and bucket=d for update;
 if exists(select 1 from dream_private.leases where owner_id=p_owner and request_id=p_request and expires_at>t) then return jsonb_build_object('ok',false,'status',409,'code','duplicate_request','retry_after',5); end if;
 insert into dream_private.counters(scope,bucket) values(p_owner::text,d),(p_owner::text||':minute',w) on conflict do nothing;
 select * into u from dream_private.counters where scope=p_owner::text and bucket=d for update;
 select * into m from dream_private.counters where scope=p_owner::text||':minute' and bucket=w for update;
 if m.requests>=c.rpm then return jsonb_build_object('ok',false,'status',429,'code','dream_rpm','retry_after',greatest(1,ceil(extract(epoch from(w+interval '1 minute'-t))))); end if;
 if u.requests>=c.daily or (p_operation in ('test_generate','exam_prepare','exam_session_create') and u.exams>=c.exams_daily) then return jsonb_build_object('ok',false,'status',429,'code','dream_daily','retry_after',greatest(1,ceil(extract(epoch from(d+interval '1 day'-t))))); end if;
 select count(*) into n from dream_private.leases where not finished and expires_at>t;
 if n>=c.global_concurrency or (select count(*) from dream_private.leases where owner_id=p_owner and not finished and expires_at>t)>=c.user_concurrency then return jsonb_build_object('ok',false,'status',429,'code','dream_concurrency','retry_after',5); end if;
 insert into dream_private.leases values(p_owner,p_request,p_operation,t+interval '3 minutes',false) on conflict(owner_id,request_id) do update set expires_at=excluded.expires_at,finished=false,operation=excluded.operation;
 update dream_private.counters set requests=requests+1,exams=exams+case when p_operation in ('test_generate','exam_prepare','exam_session_create') then 1 else 0 end where scope=p_owner::text and bucket=d;
 update dream_private.counters set requests=requests+1 where scope=p_owner::text||':minute' and bucket=w;
 return jsonb_build_object('ok',true);
end $$;
create function public.dream_reserve(p_owner uuid,p_request uuid,p_provider text,p_tokens integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c dream_private.limits; u dream_private.counters; g dream_private.counters; t timestamptz:=clock_timestamp(); d timestamptz:=date_trunc('day',t at time zone 'UTC') at time zone 'UTC'; cost bigint; pause timestamptz;
begin
 if not pg_try_advisory_xact_lock(174493828) then return jsonb_build_object('ok',false,'status',429,'code','dream_admission_busy','retry_after',1); end if;
 if p_provider not in ('groq','tavily') or p_tokens<0 or p_tokens>400000 then raise exception 'invalid_reservation'; end if;
 select * into c from dream_private.limits where id;
 if not c.enabled or c.token_microusd<=0 or c.search_microusd<=0 then return jsonb_build_object('ok',false,'status',503,'code','budget_unconfigured','retry_after',60); end if;
 insert into dream_private.counters(scope,bucket) values('global',d),(p_owner::text,d) on conflict do nothing;
 select * into g from dream_private.counters where scope='global' and bucket=d for update;
 select * into u from dream_private.counters where scope=p_owner::text and bucket=d for update;
 if not exists(select 1 from dream_private.leases where owner_id=p_owner and request_id=p_request and not finished and expires_at>t) then return jsonb_build_object('ok',false,'status',503,'code','lease_expired','retry_after',5); end if;
 select blocked_until into pause from dream_private.provider_state where provider=p_provider;
 if pause>t then return jsonb_build_object('ok',false,'status',429,'code','provider_rate_limit','retry_after',greatest(1,ceil(extract(epoch from(pause-t))))); end if;
 cost:=case when p_provider='tavily' then c.search_microusd else ceil(p_tokens*c.token_microusd) end;
 if g.tokens+p_tokens>c.global_tokens or u.tokens+p_tokens>c.user_tokens or g.microusd+cost>c.global_microusd or u.microusd+cost>c.user_microusd or (p_provider='tavily' and u.searches>=c.searches_daily) then return jsonb_build_object('ok',false,'status',429,'code','dream_budget','retry_after',greatest(1,ceil(extract(epoch from(d+interval '1 day'-t))))); end if;
 update dream_private.counters set tokens=tokens+p_tokens,microusd=microusd+cost,searches=searches+case when p_provider='tavily' then 1 else 0 end where bucket=d and scope in ('global',p_owner::text);
 return jsonb_build_object('ok',true);
end $$;
create function public.dream_release(p_owner uuid,p_request uuid) returns void language sql security definer set search_path='' as $$
 update dream_private.leases set finished=true,expires_at=clock_timestamp()+interval '1 day' where owner_id=p_owner and request_id=p_request;
$$;
-- Bounded maintenance; schedule at least daily before activation. No user academic records affected.
create function public.dream_admission_cleanup() returns void language sql security definer set search_path='' as $$
 delete from dream_private.leases where expires_at<clock_timestamp();
 delete from dream_private.counters where bucket<clock_timestamp()-interval '2 days';
$$;
revoke all on all tables in schema dream_private from public,anon,authenticated;
revoke all on function public.dream_admit(uuid,uuid,text),public.dream_reserve(uuid,uuid,text,integer),public.dream_release(uuid,uuid),public.dream_provider_pause(text,integer),public.dream_admission_cleanup() from public,anon,authenticated;
grant execute on function public.dream_admit(uuid,uuid,text),public.dream_reserve(uuid,uuid,text,integer),public.dream_release(uuid,uuid),public.dream_provider_pause(text,integer),public.dream_admission_cleanup() to service_role;
-- Atomic grading prevents partial attempts and read-modify-write evidence races.
create function public.dream_test_commit(p_owner uuid,p_test uuid,p_items jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare test_row record; question_row record; item jsonb; attempt_id uuid; v_concept text; score integer; total integer; good boolean;
begin
 select * into test_row from public.dream_tests where id=p_test and owner_id=p_owner for update;
 if not found then raise exception 'test_not_owned'; end if;
 if exists(select 1 from public.dream_test_attempts where test_id=p_test and student_id=p_owner and status='completed') then raise exception 'already_submitted'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>10 then raise exception 'invalid_grading'; end if;
 total:=jsonb_array_length(p_items);
 if total<>(select count(*) from public.dream_test_questions where test_id=p_test) or total<>(select count(distinct value->>'question_id') from jsonb_array_elements(p_items)) then raise exception 'incomplete_grading'; end if;
 score:=(select count(*) from jsonb_array_elements(p_items) where value->'is_correct'='true'::jsonb);
 insert into public.dream_test_attempts(test_id,student_id,status,score,total,completed_at) values(p_test,p_owner,'completed',score,total,clock_timestamp()) returning id into attempt_id;
 for item in select value from jsonb_array_elements(p_items) loop
   select * into question_row from public.dream_test_questions where id=(item->>'question_id')::uuid and test_id=p_test;
   if not found or jsonb_typeof(item->'is_correct')<>'boolean' then raise exception 'invalid_question'; end if;
   good:=(item->>'is_correct')::boolean;
   insert into public.dream_test_answers(attempt_id,question_id,student_id,answer,is_correct,feedback) values(attempt_id,question_row.id,p_owner,item->'answer',good,left(item->>'feedback',3000));
   for v_concept in select value from jsonb_array_elements_text(to_jsonb(question_row.expected_concepts)) limit 8 loop
     insert into public.dream_learning_topics(student_id,subject,topic,concept,status,evidence_count,correct_count,last_evidence_at,updated_at)
       values(p_owner,test_row.subject,test_row.topic,v_concept,'practicing',1,case when good then 1 else 0 end,clock_timestamp(),clock_timestamp())
       on conflict(student_id,subject,topic,concept) do update set
         evidence_count=dream_learning_topics.evidence_count+1,
         correct_count=dream_learning_topics.correct_count+excluded.correct_count,
         status=case when dream_learning_topics.evidence_count+1>=5 and (dream_learning_topics.correct_count+excluded.correct_count)::numeric/(dream_learning_topics.evidence_count+1)>=.85 then 'mastered' when dream_learning_topics.evidence_count+1>=3 and (dream_learning_topics.correct_count+excluded.correct_count)::numeric/(dream_learning_topics.evidence_count+1)>=.75 then 'almost_mastered' when dream_learning_topics.evidence_count+1>=2 and (dream_learning_topics.correct_count+excluded.correct_count)::numeric/(dream_learning_topics.evidence_count+1)>=.55 then 'improving' else 'practicing' end,
         last_evidence_at=clock_timestamp(),updated_at=clock_timestamp();
     insert into public.dream_learning_events(student_id,test_attempt_id,subject,topic,concept,outcome,evidence) values(p_owner,attempt_id,test_row.subject,test_row.topic,v_concept,case when good then 'correct' else 'incorrect' end,left(item->>'feedback',1000));
   end loop;
 end loop;
 update public.dream_tests set status='completed' where id=p_test and owner_id=p_owner;
 return attempt_id;
end $$;
revoke all on function public.dream_test_commit(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.dream_test_commit(uuid,uuid,jsonb) to service_role;
-- Own-row RLS is insufficient for protected profile fields: prevent direct privilege/domain edits.
revoke update on public.dream_profiles from authenticated;
grant update(display_name,avatar_url,academic_level,pref_step_by_step,pref_practice_suggestions,pref_calm_tone) on public.dream_profiles to authenticated;

commit;
