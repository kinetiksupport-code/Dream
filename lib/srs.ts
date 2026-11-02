// Repaso espaciado (Bloque 4): la misma función FSRS que usa dream-api, para
// enseñar debajo de cada botón cuándo volverá la tarjeta. La programación que
// cuenta es la del servidor.
export {
  AGAIN_MINUTES,
  FSRS_W,
  clampRetention,
  humanInterval,
  intervalDays,
  previewIntervals,
  retrievability,
  schedule,
} from "@/supabase/functions/dream-api/srs.mjs";
