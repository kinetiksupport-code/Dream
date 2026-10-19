-- Prueba manual del límite conjunto (20261019180000_ai_shared_window.sql).
-- En un PostgreSQL de usar y tirar, NUNCA en producción:
--   1. roles anon, authenticated y service_role; esquemas auth (auth.users) y dream_private;
--   2. secciones 1 y 2 de 20261017090000_ai_modes_windows.sql;
--   3. 20261019180000_ai_shared_window.sql;
--   4. psql -v ON_ERROR_STOP=1 -At -f supabase/tests/ai_shared_window.sql
-- Cada línea imprime lo que se espera tras los dos puntos.
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@x'),('22222222-2222-2222-2222-222222222222','b@x'),('33333333-3333-3333-3333-333333333333','c@x');
-- A ya gastó todo en Normal.
select public.dream_ai_window_charge('11111111-1111-1111-1111-111111111111','normal','mode','groq',40000,40000,gen_random_uuid())->>'ok';
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
-- user A already has normal=40000 (old rows). Now every mode is blocked (shared).
select 'A fast blocked (shared): ' || (public.dream_ai_window_charge(:A,'fast','mode','groq',10,40000,gen_random_uuid())->>'code');
select 'A think blocked: ' || (public.dream_ai_window_charge(:A,'think','mode','cloudflare',10,40000,gen_random_uuid())->>'code');
select 'A fallback still recorded: ' || (public.dream_ai_window_charge(:A,'fast','fallback','cloudflare',500,40000,gen_random_uuid())->>'ok');
-- user B: shared sum across modes, weighted tokens sent by new API
select 'B fast 0.5x: ' || (public.dream_ai_window_charge(:B,'fast','mode','groq',10000,40000,gen_random_uuid())->>'ok');
select 'B think 2x: ' || (public.dream_ai_window_charge(:B,'think','mode','cloudflare',20000,40000,gen_random_uuid())->>'ok');
select 'B fallback big not counted: ' || (public.dream_ai_window_charge(:B,'normal','fallback','cloudflare',300000,40000,gen_random_uuid())->>'ok');
select 'B normal (sum 30000 < 40000) ok: ' || (public.dream_ai_window_charge(:B,'normal','mode','groq',9000,40000,gen_random_uuid())->>'ok');
select 'B normal (sum 39000) last msg may overshoot: ' || (public.dream_ai_window_charge(:B,'normal','mode','groq',5000,40000,gen_random_uuid())->>'ok');
select 'B fast now blocked: ' || (public.dream_ai_window_charge(:B,'fast','mode','groq',1,40000,gen_random_uuid())->>'code');
select 'B rows per mode: ' || string_agg(mode||'/'||kind||'='||tokens, ', ' order by mode, kind) from dream_private.ai_usage where owner_id=:B;
-- v27 compatibility: per-mode budget, unweighted. Fresh user C.
\set C '''33333333-3333-3333-3333-333333333333'''
select 'C v27 normal 10000/40000: ' || (public.dream_ai_window_charge(:C,'normal','mode','groq',10000,40000,gen_random_uuid())->>'ok');
select 'C v27 think budget 12000, sum 10000 -> ok: ' || (public.dream_ai_window_charge(:C,'think','mode','cloudflare',3000,12000,gen_random_uuid())->>'ok');
select 'C v27 think now sum 13000 >= 12000 -> stricter: ' || (public.dream_ai_window_charge(:C,'think','mode','cloudflare',1,12000,gen_random_uuid())->>'code');
select 'C v27 normal still ok (13000<40000): ' || (public.dream_ai_window_charge(:C,'normal','mode','groq',1,40000,gen_random_uuid())->>'ok');
-- settle unchanged & idempotent
select 'settle: ' || (public.dream_ai_window_settle(:C, (select attempt_id from dream_private.ai_usage_attempts where owner_id=:C and mode='think' order by created_at limit 1), 0)->>'status');
select 'settle again: ' || (public.dream_ai_window_settle(:C, (select attempt_id from dream_private.ai_usage_attempts where owner_id=:C and mode='think' order by created_at limit 1), 0)->>'idempotent');
select 'C think ok after refund (sum 10001 < 12000): ' || (public.dream_ai_window_charge(:C,'think','mode','cloudflare',1,12000,gen_random_uuid())->>'ok');
-- idempotent attempt id
select 'idempotent: ' || (public.dream_ai_window_charge(:C,'normal','mode','groq',1,40000,(select attempt_id from dream_private.ai_usage_attempts where owner_id=:C limit 1))->>'idempotent');
-- expiry: move B's window back 6h -> new window, unblocked
update dream_private.ai_windows set started_at = started_at - interval '6 hours', ends_at = ends_at - interval '6 hours' where owner_id=:B;
select 'B new window ok: ' || (public.dream_ai_window_charge(:B,'fast','mode','groq',1,40000,gen_random_uuid())->>'ok');
-- dream_ai_usage still returns per-mode rows
select 'usage B: ' || (public.dream_ai_usage(:B)->'usage')::text;
-- validation
do $$ begin perform public.dream_ai_window_charge('11111111-1111-1111-1111-111111111111','turbo','mode','groq',1,40000,gen_random_uuid()); raise exception 'no validation'; exception when others then if sqlerrm <> 'invalid_window_charge' then raise; end if; end $$;
select 'validation ok';
-- permissions
select 'grants: ' || string_agg(grantee||':'||privilege_type, ', ') from information_schema.routine_privileges where routine_name='dream_ai_window_charge' and grantee in ('anon','authenticated','service_role','PUBLIC');
set role authenticated;
do $$ begin perform public.dream_ai_window_charge('11111111-1111-1111-1111-111111111111','fast','mode','groq',1,40000,gen_random_uuid()); raise exception 'authenticated could call'; exception when insufficient_privilege then null; end $$;
reset role;
select 'authenticated denied';
set role service_role;
select 'service_role can call: ' || (public.dream_ai_window_charge(:A,'fast','fallback','groq',1,40000,gen_random_uuid())->>'ok');
reset role;
select 'signature: ' || pg_get_function_identity_arguments('public.dream_ai_window_charge'::regproc);
