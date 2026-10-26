-- Panel: buscar una apelación por su código (B6 + B5). APLICAR SOLO CON EL OK DE CARLOS.
-- Como no se envía a Crisp ningún dato de la cuenta, el alumno pega en el chat el
-- código de apelación (DREAM-XXXX-XXXX, aleatorio, sin datos personales) y el
-- administrador lo busca aquí.
create or replace function public.admin_appeal_by_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.mod_appeals;
begin
  select * into a from public.mod_appeals where code = upper(btrim(p_code));
  if not found then return null; end if;
  return jsonb_build_object('id', a.id, 'user_id', a.user_id, 'status', a.status, 'created_at', a.created_at,
                            'due_at', a.created_at + interval '30 days', 'body', left(a.body, 600));
end $$;
revoke all on function public.admin_appeal_by_code(text) from public, anon, authenticated;
grant execute on function public.admin_appeal_by_code(text) to service_role;
