-- «Si no lo sabes, búscalo» (Bloque 2 bis). SIN APLICAR hasta el OK de Carlos.
--
-- Tope diario GLOBAL de búsquedas que lanza el servidor para comprobar datos.
-- Tavily gratis da 1.000 créditos al mes por clave; con 2 claves son unos
-- 66 al día. Las búsquedas que pide el alumno siguen con su tope por alumno
-- (limits.searches_daily en dream_reserve). Cuando se llega a este tope, la IA
-- no busca y dice que no puede comprobarlo ahora; dream-api avisa en los logs
-- al pasar del 80 %.

begin;

alter table dream_private.limits
  add column if not exists forced_searches_daily integer not null default 60
    check (forced_searches_daily >= 0);

comment on column dream_private.limits.forced_searches_daily is
  'Búsquedas al día (todas las cuentas) que dream-api puede lanzar por su cuenta para comprobar datos. 0 = ninguna.';

-- Cuántas búsquedas van hoy (todas, del contador global de dream_reserve) y el tope.
create or replace function public.dream_forced_search_budget()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d timestamptz := date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  v_used integer;
  v_cap integer;
begin
  select coalesce(searches, 0) into v_used from dream_private.counters where scope = 'global' and bucket = d;
  select forced_searches_daily into v_cap from dream_private.limits where id;
  return jsonb_build_object('used', coalesce(v_used, 0), 'cap', coalesce(v_cap, 0));
end $$;

revoke all on function public.dream_forced_search_budget() from public, anon, authenticated;
grant execute on function public.dream_forced_search_budget() to service_role;

commit;
