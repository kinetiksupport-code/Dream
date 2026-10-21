-- Retención de las observaciones (B3). APLICAR SOLO CON EL OK DE CARLOS.
-- mod_purge borraba las filas de IP a los 30 días pero no las entradas de las
-- observaciones, que también llevan una huella. Ahora las observaciones ya
-- resueltas (descartadas, confirmadas o levantadas) y sus entradas se borran a
-- los 30 días; las que siguen abiertas se conservan hasta que se resuelvan.
create or replace function public.mod_purge() returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from dream_private.mod_ip_hits where bucket < clock_timestamp() - interval '2 hours';
  delete from dream_private.mod_ip_signals where last_seen < clock_timestamp() - interval '30 days';
  delete from dream_private.mod_ip_blocks where until < clock_timestamp() - interval '30 days';
  delete from dream_private.mod_observation_entries where at < clock_timestamp() - interval '30 days'
    and observation_id in (select id from dream_private.mod_observations where status in ('descartada', 'confirmada', 'levantada'));
  delete from dream_private.mod_observations
    where status in ('descartada', 'confirmada', 'levantada') and coalesce(resolved_at, started_at) < clock_timestamp() - interval '30 days';
end $$;
revoke all on function public.mod_purge() from public, anon, authenticated;
grant execute on function public.mod_purge() to service_role;
