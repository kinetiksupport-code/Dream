// Objeto 3D real de escritorio (PROMPT_EXAMEN_ESTILO.md §5.8, PR 6): ¿debe
// este equipo pintar el modelo 3D o quedarse con el icono estático? Lógica
// pura, probada en tests/subject-3d.test.ts. Va en el JS inicial de las
// pantallas con objeto, así que aquí solo está lo imprescindible para
// decidir; el mapa de modelos (lib/subject-models.ts) viaja en el trozo 3D.

/** Escritorio con ratón o trackpad (§5.8). */
export const DESKTOP_QUERY = "(min-width: 1024px) and (pointer: fine)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Equipo «justo»: con 4 núcleos lógicos o menos, o 4 GB o menos (cuando el
 * navegador lo dice; Safari y Firefox no dan la memoria). Umbrales del encargo.
 */
export const MIN_CORES = 4;
export const MIN_MEMORY_GB = 4;

export interface Device3D {
  /** `DESKTOP_QUERY` se cumple. */
  desktop: boolean;
  /** El usuario pide movimiento reducido. */
  reducedMotion: boolean;
  /** navigator.hardwareConcurrency (puede faltar). */
  cores?: number;
  /** navigator.deviceMemory en GB (solo Chromium). */
  memoryGb?: number;
  /** El usuario ha activado el ahorro de datos. */
  saveData?: boolean;
}

export function weakDevice(cores?: number, memoryGb?: number): boolean {
  if (typeof cores === "number" && cores > 0 && cores <= MIN_CORES) return true;
  if (typeof memoryGb === "number" && memoryGb > 0 && memoryGb <= MIN_MEMORY_GB)
    return true;
  return false;
}

/**
 * ¿Merece la pena pedir el trozo 3D? Se decide antes de la carga diferida,
 * así que en móvil, con movimiento reducido o en equipos justos el chunk ni
 * se descarga. WebGL se comprueba después (crear un contexto cuesta).
 */
export function wants3D(d: Device3D): boolean {
  return (
    d.desktop &&
    !d.reducedMotion &&
    !d.saveData &&
    !weakDevice(d.cores, d.memoryGb)
  );
}

/** Lee el equipo actual (solo en el navegador). */
export function readDevice(win: Window): Device3D {
  const nav = win.navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return {
    desktop: win.matchMedia(DESKTOP_QUERY).matches,
    reducedMotion: win.matchMedia(REDUCED_MOTION_QUERY).matches,
    cores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
    saveData: nav.connection?.saveData === true,
  };
}

/** three 0.170 solo funciona con WebGL 2. */
export function hasWebGL2(doc: Document): boolean {
  try {
    const canvas = doc.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
