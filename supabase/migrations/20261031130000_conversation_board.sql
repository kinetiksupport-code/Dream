-- Pizarra de la conversación (docs/MEMORIA-CHAT.md, Bloque 2): estado pequeño
-- que lleva dream-api (primera petición, pendiente, archivos activos, Dreams
-- entregados). Va con la conversación, así que se borra con ella. Tope de
-- tamaño para que nunca crezca. Los archivos de la conversación ya están en
-- dream_attachments (texto extraído, RLS por alumno, borrado en cascada y
-- índice por conversación): no se duplican.
--
-- Contabilidad de la memoria (Bloque 4): totales por día, solo contadores y
-- tamaños (nunca texto ni quién). La lee el panel interno (admin_memory_stats).

begin;

alter table public.dream_conversations add column if not exists board jsonb not null default '{}'::jsonb;
alter table public.dream_conversations drop constraint if exists dream_conversations_board_shape;
alter table public.dream_conversations add constraint dream_conversations_board_shape
  check (jsonb_typeof(board) = 'object' and pg_column_size(board) <= 4096);

create table if not exists dream_private.chat_memory_daily (
  day date primary key,
  turns integer not null default 0,
  with_files integer not null default 0,
  material integer not null default 0,
  reupload_retries integer not null default 0,
  routes integer not null default 0,
  router_llm integer not null default 0,
  router_asks integer not null default 0,
  dreams integer not null default 0,
  index_tokens bigint not null default 0,
  board_tokens bigint not null default 0,
  router_tokens bigint not null default 0
);
alter table dream_private.chat_memory_daily enable row level security;
revoke all on table dream_private.chat_memory_daily from public, anon, authenticated;

-- Suma un turno (o una decisión del router) al día de hoy (Madrid). Solo números acotados.
create or replace function public.dream_memory_count(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'Europe/Madrid')::date;
  n jsonb := coalesce(p, '{}'::jsonb);
  f text;
  v int[] := '{}';
begin
  foreach f in array array['turns','with_files','material','reupload_retries','routes','router_llm','router_asks','dreams','index_tokens','board_tokens','router_tokens'] loop
    v := v || least(greatest(coalesce((n ->> f)::int, 0), 0), 100000);
  end loop;
  insert into dream_private.chat_memory_daily as d (day, turns, with_files, material, reupload_retries, routes, router_llm, router_asks, dreams, index_tokens, board_tokens, router_tokens)
  values (v_day, v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], v[11])
  on conflict (day) do update set
    turns = d.turns + excluded.turns, with_files = d.with_files + excluded.with_files, material = d.material + excluded.material,
    reupload_retries = d.reupload_retries + excluded.reupload_retries, routes = d.routes + excluded.routes,
    router_llm = d.router_llm + excluded.router_llm, router_asks = d.router_asks + excluded.router_asks, dreams = d.dreams + excluded.dreams,
    index_tokens = d.index_tokens + excluded.index_tokens, board_tokens = d.board_tokens + excluded.board_tokens, router_tokens = d.router_tokens + excluded.router_tokens;
exception when others then
  return; -- la contabilidad nunca rompe un turno
end $$;

-- Panel interno: los últimos 14 días.
create or replace function public.admin_memory_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(d) order by d.day desc), '[]'::jsonb)
  from (select * from dream_private.chat_memory_daily where day > (now() at time zone 'Europe/Madrid')::date - 14) d;
$$;

revoke all on function public.dream_memory_count(jsonb) from public, anon, authenticated;
revoke all on function public.admin_memory_stats() from public, anon, authenticated;
grant execute on function public.dream_memory_count(jsonb) to service_role;
grant execute on function public.admin_memory_stats() to service_role;

commit;
