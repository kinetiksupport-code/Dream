-- Claim a simulation before invoking AI so reconnects cannot duplicate generations.
alter table public.dream_exam_sessions alter column test_id drop not null;
alter table public.dream_exam_sessions drop constraint dream_exam_sessions_status_check;
alter table public.dream_exam_sessions add constraint dream_exam_sessions_status_check check(status in ('generating','failed','active','grading','completed'));
alter table public.dream_exam_sessions add column generation_started_at timestamptz not null default now();
alter table public.dream_exam_sessions add column generation_error text;
alter table public.dream_exam_sessions add column unit_id uuid references public.dream_exam_units(id) on delete set null;
alter table public.dream_exam_sessions add column source_session_id uuid references public.dream_exam_sessions(id) on delete set null;
alter table public.dream_exam_sessions add constraint exam_session_ready_has_test check(status in ('generating','failed') or test_id is not null);
create index dream_exam_sessions_unit on public.dream_exam_sessions(unit_id);
create index dream_exam_sessions_source on public.dream_exam_sessions(source_session_id);
create function public.dream_exam_link_material(p_exam uuid,p_owner uuid,p_attachment uuid) returns void
 language plpgsql security invoker set search_path = '' as $$
declare v_exam public.dream_exams%rowtype;
begin
 select * into v_exam from public.dream_exams where id=p_exam and owner_id=p_owner for update;
 if not found or v_exam.status not in ('draft','failed') then raise exception 'Exam is not editable'; end if;
 if not exists(select 1 from public.dream_attachments where id=p_attachment and owner_id=p_owner and conversation_id=v_exam.conversation_id and status='processed') then raise exception 'Invalid attachment'; end if;
 if not exists(select 1 from public.dream_exam_materials where exam_id=p_exam and attachment_id=p_attachment)
 and (select count(*) from public.dream_exam_materials where exam_id=p_exam)>=4 then raise exception 'Maximum four materials'; end if;
 insert into public.dream_exam_materials(exam_id,owner_id,attachment_id) values(p_exam,p_owner,p_attachment) on conflict do nothing;
end $$;
revoke all on function public.dream_exam_link_material(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.dream_exam_link_material(uuid,uuid,uuid) to service_role;
