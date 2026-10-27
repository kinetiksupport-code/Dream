const textExtensions = new Set(
  "txt md markdown json csv tsv js jsx ts tsx mjs cjs py rb php java kt go rs c cpp h cs css scss html xml yml yaml sql sh env".split(
    " ",
  ),
);
const documents = new Set(["pdf", "docx", "pptx", "xlsx"]);
const images = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
export const fileAccept = [...textExtensions, ...documents, ...images]
  .map((x) => "." + x)
  .join(",");
/** Archivos por mensaje del chat (y en Apuntes). dream-api acepta los mismos. */
export const MAX_CHAT_FILES = 8;
/** Lo que acepta dream-api por archivo (attachments.mjs). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/**
 * Las fotos se reducen en el dispositivo antes de subirlas (prepareFile), así
 * que aquí se aceptan las del móvil tal cual salen de la cámara (12–48 MP).
 */
export const MAX_RAW_IMAGE_BYTES = 40 * 1024 * 1024;
const extOf = (name: string) => name.split(".").pop()?.toLowerCase() || "";

export function validateFile(file: File) {
  const ext = extOf(file.name);
  if (![textExtensions, documents, images].some((s) => s.has(ext)))
    throw new Error("Este formato no es compatible con Dream.");
  const max = textExtensions.has(ext)
    ? 500 * 1024
    : images.has(ext) && ext !== "gif"
      ? MAX_RAW_IMAGE_BYTES
      : MAX_UPLOAD_BYTES;
  if (file.size > max)
    throw new Error(`El archivo supera ${max < 1024 * 1024 ? "500 KB" : `${max / 1024 / 1024} MB`}.`);
  if (!file.size) throw new Error("El archivo está vacío.");
}

// Fotos: lado mayor de 1.600 px. Basta para leer apuntes (la IA trabaja a esa
// resolución) y deja cada foto en ~0,3–1 MB: sube rápido con datos móviles,
// cabe en lo que acepta la IA de imágenes (4 MB) y gasta menos de su cupo por
// minuto. JPEG sin EXIF: también se quita la ubicación de la foto.
export const PHOTO_MAX_SIDE = 1600;
const PHOTO_KEEP_BYTES = 1.2 * 1024 * 1024;

/** Medidas finales manteniendo la proporción, con el lado mayor ≤ max. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type Decoded = { width: number; height: number; source: CanvasImageSource; close: () => void };
async function decodeImage(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      // «from-image» respeta la orientación EXIF (fotos de móvil giradas).
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
    } catch {
      /* Safari antiguo: se prueba con <img>. */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, source: img, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Deja el archivo listo para subir. Las fotos (no los GIF) grandes se reducen
 * a JPEG de 1.600 px; el resto se sube tal cual. Si el navegador no puede
 * reducir una foto, se sube la original cuando cabe (dream-api la valida).
 */
export async function prepareFile(file: File): Promise<File> {
  const ext = extOf(file.name);
  const photo = images.has(ext) && ext !== "gif";
  if (!photo || typeof document === "undefined") return file;
  let decoded: Decoded | null = null;
  try {
    decoded = await decodeImage(file);
    const size = fitWithin(decoded.width, decoded.height);
    const needsResize = size.width < decoded.width || size.height < decoded.height;
    if (!needsResize && file.size <= PHOTO_KEEP_BYTES) return file;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no_canvas");
    // Fondo blanco: las PNG con transparencia no se vuelven negras en JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(decoded.source, 0, 0, size.width, size.height);
    let blob = await toJpeg(canvas, 0.85);
    if (blob && blob.size > 3 * 1024 * 1024) blob = await toJpeg(canvas, 0.7);
    canvas.width = canvas.height = 0;
    if (!blob || (!needsResize && blob.size >= file.size)) return guardSize(file);
    const name = `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`;
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return guardSize(file);
  } finally {
    decoded?.close();
  }
}

function guardSize(file: File) {
  if (file.size > MAX_UPLOAD_BYTES)
    throw new Error("No se pudo reducir esta foto y pesa más de 8 MB. Hazla con menos resolución o súbela en JPG.");
  return file;
}

/**
 * Reintenta una subida cuando el fallo es pasajero: la IA de imágenes está
 * ocupada (429/503 con su espera), un fallo de red o un 502/504. Como mucho
 * 3 reintentos y 30 s de espera cada uno. `onWait` avisa para enseñar «En cola».
 */
export async function withUploadRetry<T>(
  run: () => Promise<T>,
  { onWait, signal, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) }: {
    onWait?: (seconds: number) => void;
    signal?: AbortSignal;
    sleep?: (ms: number) => Promise<unknown>;
  } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const e = error as { status?: number; retryAfter?: number; name?: string; message?: string };
      const network = error instanceof TypeError && /fetch|network|load failed/i.test(e.message ?? "");
      const transient = network || [429, 502, 503, 504].includes(Number(e.status));
      if (!transient || attempt >= 3 || signal?.aborted || e.name === "AbortError") throw error;
      const seconds = Math.min(30, Math.max(3, Number(e.retryAfter) || 4 * (attempt + 1)));
      onWait?.(seconds);
      await sleep(seconds * 1000);
      if (signal?.aborted) throw error;
    }
  }
}
export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}
