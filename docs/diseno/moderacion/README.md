# Moderación, lado del alumno (B6): evidencias

Capturas hechas por `tests/browser/moderacion-alumno.spec.ts` con una cuenta de
prueba y `dream-api` simulado (no hay datos reales ni se llama a Crisp).

| Captura | Qué enseña |
|---|---|
| `baneo-escritorio.png` | Pantalla de baneo: motivo en palabras sencillas, duración, código de apelación, «Hacer una apelación», reclamar por escrito y borrar la cuenta. |
| `baneo-movil-oscuro.png` | La misma pantalla en móvil (390 px), modo oscuro y movimiento reducido. Sin scroll horizontal; objetivos táctiles de al menos 40 px. |
| `baneo-aviso-crisp.png` | Aviso de privacidad antes de cargar el chat de Crisp. |
| `baneo-reclamacion-enviada.png` | Reclamación enviada: plazo de 30 días y código. |
| `avisos-escritorio.png` | Aviso amable y limitación en vigor: qué norma, hasta cuándo, «Entendido» y «Reclamar». |
| `bloqueo-escritorio.png` | Bloqueo por uso anormal (429): mensaje claro y botón «Reclamar». |

Es una pantalla nueva, así que no hay «antes». Colores solo con los tokens del
sistema (`--text`, `--text-secondary`, `--surface`, `--warning-surface`,
`--danger-surface`…), ya comprobados en AA por `npm run design:check`.
