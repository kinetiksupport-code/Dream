-- Ruta de estudio con IA (Parte B.3). NO APLICADA: pendiente del OK de Carlos.
-- Aditiva y reversible: columnas nuevas con valor nulo; nada cambia hasta encender
-- DREAM_AI_ROUTE_ENABLED en dream-api.
alter table public.dream_exams
  add column if not exists route jsonb,
  add column if not exists route_source text,
  add column if not exists route_updated_at timestamptz,
  add column if not exists route_regenerated_on date;

-- Forma mínima garantizada por la base de datos (el resto lo valida dream-api).
alter table public.dream_exams
  add constraint dream_exams_route_source_check
    check (route_source is null or route_source in ('ai', 'auto')),
  add constraint dream_exams_route_shape_check
    check (
      route is null or (
        jsonb_typeof(route) = 'object'
        and jsonb_typeof(route -> 'nodes') = 'array'
        and jsonb_array_length(route -> 'nodes') between 1 and 120
        and pg_column_size(route) <= 65536
      )
    ),
  add constraint dream_exams_route_pair_check
    check ((route is null) = (route_source is null));

-- RLS coherente con la existente: la tabla ya tiene RLS activado, el alumno solo
-- lee sus filas (exams_read_own) y no tiene permisos de escritura; solo service_role
-- (dream-api) escribe. Las columnas nuevas heredan el grant de select de tabla.
-- Lo reafirmamos para que una migración futura no lo relaje por accidente.
revoke insert, update, delete on public.dream_exams from anon, authenticated;
grant select on public.dream_exams to authenticated;
grant all on public.dream_exams to service_role;

comment on column public.dream_exams.route is
  'Ruta de estudio: {version:1, nodes:[{id,type,unit_id?,planned_date,minutes,reason}], changes?, trigger?}. Sin datos personales.';
comment on column public.dream_exams.route_regenerated_on is
  'Fecha (Europe/Madrid) de la última regeneración: máximo una por examen y día.';

-- Reversión manual (si hiciera falta):
-- alter table public.dream_exams drop constraint dream_exams_route_pair_check,
--   drop constraint dream_exams_route_shape_check, drop constraint dream_exams_route_source_check,
--   drop column route_regenerated_on, drop column route_updated_at, drop column route_source, drop column route;
