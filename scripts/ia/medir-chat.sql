-- Forma de las respuestas reales del chat (P1, docs/HABLA_NATURAL.md).
-- Solo números: nunca devuelve el texto de un mensaje. Se ejecuta en
-- Supabase → SQL Editor (o con el MCP de Supabase) para comparar antes y
-- después. Cambia el intervalo para mirar otro periodo.

-- 1) Longitud, listas, negritas, frases de robot, caracteres raros.
with a as (
  select
    array_length(regexp_split_to_array(trim(regexp_replace(content, '<!--[\s\S]*?-->', '', 'g')), '\s+'), 1) as w,
    content ~ '(^|\n)\s*\d+[.)]\s' as numbered,
    content ~ '(^|\n)\s*[-*•]\s' as bullets,
    content ~ '(^|\n)#{1,6}\s' as heading,
    content ~ '\*\*[^*]+\*\*' as bold,
    content ~* '(^\s*¡?claro[!,]|aquí tienes|(gran|excelente|buena) pregunta|espero que te (ayude|sirva)|¿te queda claro|¿lo entiendes|como (una )?ia)' as robot,
    content ~ '[Ѐ-ӿ぀-ヿ㐀-鿿가-힯]' as foreign_script,
    (length(content) - length(replace(content, '?', ''))) as qmarks,
    content like '%¿Sigo?%' as cut
  from public.dream_messages
  where role = 'assistant' and created_at > now() - interval '30 days'
)
select count(*) as respuestas,
  round(avg(w)) as palabras_media,
  percentile_cont(0.5) within group (order by w) as palabras_mediana,
  percentile_cont(0.9) within group (order by w) as palabras_p90,
  round(100.0 * avg((w > 120)::int), 1) as pct_mas_de_120,
  round(100.0 * avg(numbered::int), 1) as pct_lista_numerada,
  round(100.0 * avg(bullets::int), 1) as pct_vinetas,
  round(100.0 * avg(heading::int), 1) as pct_titulos,
  round(100.0 * avg(bold::int), 1) as pct_negritas,
  round(100.0 * avg(robot::int), 1) as pct_frases_robot,
  round(100.0 * avg((qmarks > 1)::int), 1) as pct_mas_de_una_pregunta,
  sum(foreign_script::int) as con_otra_escritura,
  round(100.0 * avg(cut::int), 1) as pct_cortadas_con_sigo
from a;

-- 2) Legibilidad de Fernández-Huerta (sílabas aproximadas por grupos de vocales).
with a as (
  select regexp_replace(regexp_replace(content, '<!--[\s\S]*?-->|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$]*\$', ' ', 'g'), '[*_#`>]', ' ', 'g') as t
  from public.dream_messages
  where role = 'assistant' and created_at > now() - interval '30 days'
), b as (
  select (select count(*) from regexp_matches(t, '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+', 'g')) as w,
         (select count(*) from regexp_matches(lower(t), '[aeiouáéíóúü]+', 'g')) as syl,
         greatest(1, (select count(*) from regexp_matches(t, '[.!?…]+(\s|$)', 'g'))) as sen
  from a
)
select w > 120 as larga, count(*) as respuestas,
  round(avg(206.84 - 0.6 * (100.0 * syl / w) - 1.02 * (100.0 * sen / w))::numeric, 1) as fernandez_huerta,
  round(avg(1.0 * w / sen)::numeric, 1) as palabras_por_frase
from b where w >= 5 group by 1;
