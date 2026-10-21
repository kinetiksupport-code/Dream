-- Auditoría de seguridad (SEC-03): `revoke select (prompt)` de
-- 20261010120000_admission_pricing_reconcile.sql no tiene efecto mientras
-- authenticated conserve SELECT sobre toda la tabla, y en producción lo
-- conserva. Cualquier alumno con sesión podía leer las instrucciones internas
-- de las skills por /rest/v1/dream_skills. Ni la web ni dream-api leen esta
-- tabla con la sesión del alumno, así que se retira todo y se deja solo la
-- lectura de columnas sin el texto del prompt.
begin;

do $$ begin
  if to_regclass('public.dream_skills') is not null then
    execute 'revoke all on table public.dream_skills from public, anon, authenticated';
    execute 'grant select (key, name, category, subject, priority, enabled, version, created_at, updated_at) on public.dream_skills to authenticated';
  end if;
end $$;

commit;
