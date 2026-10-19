-- Tope de materiales por examen: de 4 a 20 (decisión de Carlos, 17/10/2026).
-- NO APLICAR sin el OK de Carlos. Redefine dream_exam_link_material
-- (20261008163525_exam_generation_recovery.sql) con la misma firma, la misma
-- lógica y los mismos permisos; solo cambia el número. El contexto que se
-- envía a la IA ya está acotado por caracteres en dream-api (examContext).
create or replace function public.dream_exam_link_material(p_exam uuid,p_owner uuid,p_attachment uuid) returns void
 language plpgsql security invoker set search_path = '' as $$
declare v_exam public.dream_exams%rowtype;
begin
 select * into v_exam from public.dream_exams where id=p_exam and owner_id=p_owner for update;
 if not found or v_exam.status not in ('draft','failed') then raise exception 'Exam is not editable'; end if;
 if not exists(select 1 from public.dream_attachments where id=p_attachment and owner_id=p_owner and conversation_id=v_exam.conversation_id and status='processed') then raise exception 'Invalid attachment'; end if;
 if not exists(select 1 from public.dream_exam_materials where exam_id=p_exam and attachment_id=p_attachment)
 and (select count(*) from public.dream_exam_materials where exam_id=p_exam)>=20 then raise exception 'Maximum twenty materials'; end if;
 insert into public.dream_exam_materials(exam_id,owner_id,attachment_id) values(p_exam,p_owner,p_attachment) on conflict do nothing;
end $$;
revoke all on function public.dream_exam_link_material(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.dream_exam_link_material(uuid,uuid,uuid) to service_role;
