#!/usr/bin/env node
// SQL para cargar las fichas de arranque (supabase/seed/fichas-borrador.json),
// SIEMPRE como «borrador» y sin pisar las que ya existan. No lo ejecuta: imprime
// el SQL para revisarlo y aplicarlo cuando Carlos dé el OK.
//   node scripts/ia/fichas-sql.mjs > /tmp/fichas.sql
import { readFileSync } from 'node:fs';

const FIELDS = ['slug', 'tema', 'curso', 'asignatura', 'regla', 'ejemplo_resuelto', 'errores_frecuentes', 'comprobacion'];
const quote = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;

export function fichasSql(fichas) {
  const rows = fichas.map((f) => `(${FIELDS.map((k) => quote(f[k])).join(', ')}, 'borrador')`);
  return `insert into public.dream_knowledge_cards(${FIELDS.join(', ')}, estado) values\n${rows.join(',\n')}\non conflict (slug) do nothing;\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(readFileSync(new URL('../../supabase/seed/fichas-borrador.json', import.meta.url), 'utf8'));
  process.stdout.write(fichasSql(data.fichas));
}
