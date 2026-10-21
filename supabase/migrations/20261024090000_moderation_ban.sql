-- Moderación B5b: baneo comprobado en cada petición. APLICAR SOLO CON EL OK DE CARLOS.
--
-- El baneo es un dato (`mod_sanctions` con kind = 'baneo', status = 'activa' y
-- `until`; null = permanente). dream-api lo consulta en CADA petición con
-- `mod_ban_state`, así que funciona igual si Carlos lo escribe a mano desde el
-- editor de tablas de Supabase. Un baneado no puede usar ninguna acción, ni
-- con la sesión abierta, salvo ver su pantalla, apelar y borrar su cuenta.

begin;

create or replace function public.mod_ban_state(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.mod_sanctions;
begin
  select * into s from public.mod_sanctions
    where user_id = p_user and kind = 'baneo' and status = 'activa' and (until is null or until > clock_timestamp())
    order by (until is null) desc, until desc limit 1;
  if not found then return jsonb_build_object('banned', false); end if;
  return jsonb_build_object('banned', true, 'id', s.id, 'rule', s.rule, 'until', s.until, 'permanent', s.until is null);
end $$;

-- Banear a mano (panel o tareas de mantenimiento). Cierra las sesiones.
create or replace function public.mod_ban_set(p_user uuid, p_until timestamptz, p_rule text, p_by text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_by not in ('sistema', 'ia', 'admin') then raise exception 'decided_by_invalid'; end if;
  v_id := public.mod_sanction_add(p_user, 'baneo', p_until, p_rule, 'activa', p_by);
  perform public.mod_event_add(p_user, p_rule, 'manual', 'alta', null, 'ban:' || v_id, 30);
  perform public.mod_close_sessions(p_user);
  return v_id;
end $$;

-- Levantar el baneo: todos los activos de la cuenta y su observación.
create or replace function public.mod_ban_lift(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  update public.mod_sanctions set status = 'levantada', updated_at = clock_timestamp()
    where user_id = p_user and kind = 'baneo' and status in ('activa', 'revision_pendiente');
  get diagnostics v_n = row_count;
  update dream_private.mod_observations set status = 'levantada', resolved_at = clock_timestamp()
    where new_user = p_user and status <> 'levantada';
  perform public.mod_event_add(p_user, 'LEVANTADO', 'manual', 'baja', null, 'lift', 30);
  return v_n;
end $$;

-- Resolver una sanción propuesta o vigente desde el panel.
--   confirmar:    revision_pendiente -> activa (si es baneo, cierra sesiones)
--   bajar_a_aviso: pasa a aviso activo, sin fecha
--   levantar:     levantada
create or replace function public.mod_sanction_resolve(p_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.mod_sanctions;
begin
  select * into s from public.mod_sanctions where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_encontrada'); end if;
  if p_action = 'confirmar' then
    if s.status <> 'revision_pendiente' then return jsonb_build_object('ok', false, 'code', 'estado_no_valido'); end if;
    update public.mod_sanctions set status = 'activa', decided_by = 'admin', updated_at = clock_timestamp() where id = p_id;
    if s.kind = 'baneo' then perform public.mod_close_sessions(s.user_id); end if;
  elsif p_action = 'bajar_a_aviso' then
    update public.mod_sanctions set kind = 'aviso', status = 'activa', until = null, decided_by = 'admin', updated_at = clock_timestamp() where id = p_id;
  elsif p_action = 'levantar' then
    update public.mod_sanctions set status = 'levantada', decided_by = 'admin', updated_at = clock_timestamp() where id = p_id;
  else
    return jsonb_build_object('ok', false, 'code', 'accion_no_valida');
  end if;
  perform public.mod_event_add(s.user_id, s.rule, 'manual', 'baja', null, 'sancion:' || p_action, 30);
  return jsonb_build_object('ok', true, 'user_id', s.user_id, 'kind', s.kind);
end $$;

revoke all on function public.mod_ban_state(uuid) from public, anon, authenticated;
revoke all on function public.mod_ban_set(uuid, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.mod_ban_lift(uuid) from public, anon, authenticated;
revoke all on function public.mod_sanction_resolve(uuid, text) from public, anon, authenticated;
grant execute on function public.mod_ban_state(uuid) to service_role;
grant execute on function public.mod_ban_set(uuid, timestamptz, text, text) to service_role;
grant execute on function public.mod_ban_lift(uuid) to service_role;
grant execute on function public.mod_sanction_resolve(uuid, text) to service_role;

commit;
