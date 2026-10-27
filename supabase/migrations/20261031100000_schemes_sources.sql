-- Esquemas, tanda 1: de qué apuntes salió cada esquema, para «Pedir a la IA»
-- (ampliar o simplificar una tarjeta con la misma fuente, nunca de memoria).
-- Solo los identificadores de dream_attachments del propio alumno; si borra
-- la conversación, los apuntes se van y la IA ya no puede ampliar.
begin;
alter table public.dream_schemes add column if not exists attachment_ids uuid[] not null default '{}';
alter table public.dream_schemes drop constraint if exists dream_schemes_attachment_ids_max;
alter table public.dream_schemes add constraint dream_schemes_attachment_ids_max check (cardinality(attachment_ids) <= 20);
commit;
