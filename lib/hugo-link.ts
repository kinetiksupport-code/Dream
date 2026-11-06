import { callDream } from "./dream-api";

/** Al cerrar sesión, el chat de soporte deja de ver la cuenta (mejor esfuerzo). */
export async function unlinkSupportChat() {
  try {
    await callDream("crisp_unlink");
  } catch {
    /* sin red o sin enlace: no impide cerrar sesión */
  }
}
