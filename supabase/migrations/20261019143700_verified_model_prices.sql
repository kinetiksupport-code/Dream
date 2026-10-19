begin;
-- Precios de los modelos de IA comprobados en las páginas oficiales el
-- 19/10/2026 (microdólares por millón de tokens). Sustituye las filas
-- «PENDIENTE DE VERIFICAR» de 20261017090000_ai_modes_windows.sql.
-- Solo actualiza dream_private.model_prices: no toca límites ni funciones.
-- NO APLICADA: la aplica Carlos (docs/MODOS_IA.md §8).

insert into dream_private.model_prices(model, input_microusd_per_million, output_microusd_per_million, source, verified_on)
values
  -- Cloudflare Workers AI («Pensar más» y respaldo): 0,351 $ / 0,555 $ por
  -- millón (31.876 / 50.488 neuronas). Cupo gratis: 10.000 neuronas al día,
  -- se reinicia a las 00:00 UTC.
  ('@cf/mistralai/mistral-small-3.1-24b-instruct', 351000, 555000,
   'https://developers.cloudflare.com/workers-ai/platform/pricing/', '2026-10-19'),
  -- Groq, modo Normal (Preview): 0,80 $ / 4,00 $.
  ('qwen/qwen3.8-27b', 800000, 4000000,
   'https://console.groq.com/docs/model/qwen/qwen3.8-27b', '2026-10-19'),
  -- Groq, sustitutos que Groq recomienda para los Llama retirados.
  ('openai/gpt-oss-20b', 75000, 300000,
   'https://console.groq.com/docs/model/openai/gpt-oss-20b', '2026-10-19'),
  ('openai/gpt-oss-120b', 150000, 600000,
   'https://console.groq.com/docs/model/openai/gpt-oss-120b', '2026-10-19'),
  -- ⚠️ Groq retiró estos dos modelos el 16/08/2026 para los planes gratis y
  -- Developer; ahora solo son Enterprise y sin precio público («Contact
  -- Sales»). Se mantiene el último precio público (0,05/0,08 y 0,59/0,79)
  -- para que la admisión nunca los trate como gratis. Ver docs/MODOS_IA.md §2.
  ('llama-3.1-8b-instant', 50000, 80000,
   'SIN PRECIO PUBLICO (Enterprise, retirado 2026-08-16 en Free/Developer) https://console.groq.com/docs/deprecations', '2026-10-19'),
  ('llama-3.3-70b-versatile', 590000, 790000,
   'SIN PRECIO PUBLICO (Enterprise, retirado 2026-08-16 en Free/Developer) https://console.groq.com/docs/deprecations', '2026-10-19')
on conflict (model) do update set
  input_microusd_per_million = excluded.input_microusd_per_million,
  output_microusd_per_million = excluded.output_microusd_per_million,
  source = excluded.source,
  verified_on = excluded.verified_on;

commit;
