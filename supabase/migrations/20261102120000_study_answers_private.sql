-- Ruta de estudio · Entrega 4: las claves de las lecciones, solo para dream-api.
-- Solo añade restricciones: el alumno ya no puede leer dream_unit_content
-- directamente (guarda las respuestas del test y de las mini-preguntas); la
-- web lo pide todo a dream-api, que devuelve la lectura sin respuestas.
-- Las preguntas del simulacro van en dream_test_questions, cuya clave ya era
-- privada (20261008161950_persistent_exams.sql).
-- Marcha atrás:
--   grant select on public.dream_unit_content to authenticated;
--   create policy dream_unit_content_select_own on public.dream_unit_content
--     for select to authenticated using (student_id = auth.uid());
begin;
drop policy if exists dream_unit_content_select_own on public.dream_unit_content;
revoke select on public.dream_unit_content from authenticated;
commit;
