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
export function validateFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (![textExtensions, documents, images].some((s) => s.has(ext)))
    throw new Error("Este formato no es compatible con Dream.");
  const max = textExtensions.has(ext) ? 500 * 1024 : 8 * 1024 * 1024;
  if (file.size > max)
    throw new Error(
      `El archivo supera ${textExtensions.has(ext) ? "500 KB" : "8 MB"}.`,
    );
  if (!file.size) throw new Error("El archivo está vacío.");
}
export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}
