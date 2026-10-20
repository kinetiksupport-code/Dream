-- Live database regression, entirely rolled back. No permanent accounts or test data.
begin;
do $$
declare
 a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); e uuid := gen_random_uuid(); other_exam uuid := gen_random_uuid();
 c uuid := gen_random_uuid(); attachment uuid := gen_random_uuid(); t uuid := gen_random_uuid(); s uuid := gen_random_uuid(); n integer;
begin
 insert into auth.users(id,email,aud,role) values(a,a::text||'@example.test','authenticated','authenticated'),(b,b::text||'@example.test','authenticated','authenticated');
 insert into public.dream_conversations(id,owner_id,title) values(c,a,'RLS transactional verification');
 insert into public.dream_exams(id,owner_id,title,subject,exam_date,topics,status,conversation_id)
 values(e,a,'RLS verification','Math',current_date+12,array['Equations'],'preparing',c),(other_exam,b,'Other account','Math',current_date+12,array['Equations'],'draft',null);
 perform public.dream_exam_store_plan(e,a,'[{"title":"Equations","topic":"Equations","summary":"Understand factors","estimated_minutes":20}]'::jsonb);
 if (select status from public.dream_exams where id=e) <> 'ready' then raise exception 'Atomic plan storage failed'; end if;
 insert into public.dream_attachments(id,conversation_id,owner_id,file_name,mime_type,status,extracted_text) values(attachment,c,a,'qa.txt','text/plain','processed','Equations');
 insert into public.dream_exam_materials(exam_id,owner_id,attachment_id) values(e,a,attachment);
 insert into public.dream_tests(id,owner_id,title,subject,topic,mode) values(t,a,'RLS simulation','Math','Equations','exam');
 insert into public.dream_exam_sessions(id,exam_id,owner_id,test_id,mode,answers,question_index) values(s,e,a,t,'exam','{"question-1":"saved answer"}',0);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 select count(*) into n from public.dream_exams where id in(e,other_exam);
 if n<>1 then raise exception 'Cross-account exam exposure'; end if;
 if (select answers->>'question-1' from public.dream_exam_sessions where id=s)<>'saved answer' then raise exception 'Saved answers missing'; end if;
 if (select count(*) from public.dream_exam_units where exam_id=e)<>1 then raise exception 'Own units missing'; end if;
 if (select count(*) from public.dream_exam_materials where exam_id=e)<>1 then raise exception 'Own materials missing'; end if;
 if has_table_privilege('authenticated','public.dream_exam_sessions','UPDATE') then raise exception 'Client can overwrite grades'; end if;
 if has_column_privilege('authenticated','public.dream_test_questions','correct_answer','SELECT') then raise exception 'Answer key exposed'; end if;
 if not has_column_privilege('authenticated','public.dream_test_questions','prompt','SELECT') then raise exception 'Public questions unavailable'; end if;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from public.dream_exam_sessions where id=s) then raise exception 'Cross-account answers exposed'; end if;
 if exists(select 1 from public.dream_exam_units where exam_id=e) then raise exception 'Cross-account units exposed'; end if;
 if exists(select 1 from public.dream_exam_materials where exam_id=e) then raise exception 'Cross-account materials exposed'; end if;
 execute 'reset role';
end $$;
rollback;
select 'PASS: ownership, answers, units, materials, write denial, hidden keys and atomic plan; transaction rolled back' as verification;
