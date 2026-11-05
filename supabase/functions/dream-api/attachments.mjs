import { validateOfficeArchive, assertBase64 } from './archive.mjs';
import JSZip from 'npm:jszip@3.10.1';
import { getResolvedPDFJS } from 'npm:unpdf@1.8.1';
import { groqProvider } from './groq.mjs';
import {
  UploadError, assertCoherent, decodeUtf8Text, sanitizeExtractedText, assertImageDimensions,
  stripImageMetadata, inspectPdfBytes, hasActiveAnnotation, inspectOfficeNames,
  inspectContentTypes, inspectRelationships, MAX_VISION_BYTES,
} from './file-guard.mjs';
export { UploadError, MAX_MESSAGE_ATTACHMENTS, MAX_VISION_BYTES } from './file-guard.mjs';

export const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'rb', 'php', 'java', 'kt', 'go', 'rs', 'c', 'cpp', 'h', 'cs',
  'css', 'scss', 'html', 'xml', 'yml', 'yaml', 'sql', 'sh', 'env',
]);
export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
export const OFFICE_EXTENSIONS = new Set(['docx', 'pptx', 'xlsx']);
export const SUPPORTED_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS, ...OFFICE_EXTENSIONS, 'pdf',
]);

export const MAX_TEXT_BYTES = 500 * 1024;
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 24000;
// Tope de material por turno (prompt «ahorrar tokens»): antes 32.000 (≈ 9.000
// tokens, un solo archivo podía pasar del límite de Groq y dar 413).
export const MAX_ATTACHMENT_CONTEXT_CHARS = 6000;
/** Tiempo máximo para leer un PDF; después se cancela y se libera. */
export const PDF_TIMEOUT_MS = 8000;
// Código: las etiquetas forman parte del contenido y no se quitan.
const CODE_EXTENSIONS = new Set(['json', 'csv', 'tsv', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'php', 'java', 'kt', 'go', 'rs', 'c', 'cpp', 'h', 'cs', 'css', 'scss', 'yml', 'yaml', 'sql', 'sh', 'env']);

export function familyOf(ext) {
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (OFFICE_EXTENSIONS.has(ext)) return 'office';
  if (ext === 'pdf') return 'pdf';
  return '';
}

export function extensionOf(fileName) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName || '');
  return match ? match[1].toLowerCase() : '';
}

export function isSupportedExtension(fileName) {
  return SUPPORTED_EXTENSIONS.has(extensionOf(fileName));
}

export function maxBytesFor(fileName) {
  const ext = extensionOf(fileName);
  if (IMAGE_EXTENSIONS.has(ext)) return MAX_IMAGE_BYTES;
  if (OFFICE_EXTENSIONS.has(ext) || ext === 'pdf') return MAX_DOCUMENT_BYTES;
  return MAX_TEXT_BYTES;
}

export function decodeBase64ToBytes(base64) {
  assertBase64(base64);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function decodeBase64ToText(base64) {
  return new TextDecoder('utf-8', { fatal: false }).decode(decodeBase64ToBytes(base64));
}

export function base64ByteLength(base64) {
  assertBase64(base64);
  const clean = base64.replace(/=+$/, '');
  return Math.floor((clean.length * 3) / 4);
}

function decodeXml(value) {
  return value
    .replace(/<w:tab\s*\/>|<a:tab\s*\/>/g, '\t')
    .replace(/<w:br\s*\/>|<a:br\s*\/>/g, '\n')
    .replace(/<\/w:p>|<\/a:p>|<\/row>/g, '\n')
    .replace(/<[^<>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d{1,7});|&#x([0-9a-fA-F]{1,6});/g, (_, d, h) => { const n = d ? Number(d) : parseInt(h, 16); return n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : ''; })
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function boundedZipText(entry, budget) {
  return new Promise((resolve,reject)=>{
    const stream=entry.internalStream('uint8array');const decoder=new TextDecoder();let bytes=0,text='';
    stream.on('data',chunk=>{bytes+=chunk.length;budget.bytes+=chunk.length;if(bytes>4*1024*1024 || budget.bytes>16*1024*1024){stream.pause();reject(new UploadError('archive_unsafe'));return;}text+=decoder.decode(chunk,{stream:true});});
    stream.on('error',()=>reject(new UploadError('archive_unsafe')));stream.on('end',()=>resolve(text+decoder.decode()));stream.resume();
  });
}

async function extractOffice(bytes, ext) {
  let names;
  try { names = validateOfficeArchive(bytes).names; }
  catch (error) { throw new UploadError(error?.message === 'encrypted_archive' ? 'encrypted' : 'archive_unsafe'); }
  inspectOfficeNames(names, ext);
  let zip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new UploadError('archive_unsafe'); }
  const budget = {bytes:0};
  // Tipos declarados y relaciones (pequeños, con el mismo presupuesto).
  inspectContentTypes(await boundedZipText(zip.file('[Content_Types].xml'), budget));
  for (const path of names.filter((n) => /(^|\/)_rels\/[^/]*\.rels$/i.test(n)).slice(0, 400)) {
    const entry = zip.file(path);
    if (entry) inspectRelationships(await boundedZipText(entry, budget));
  }
  let paths = [];
  if (ext === 'docx') paths = ['word/document.xml'];
  if (ext === 'pptx') paths = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (ext === 'xlsx') paths = [
    ...Object.keys(zip.files).filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    'xl/sharedStrings.xml',
  ];
  const chunks = [];
  for (const path of paths.slice(0, 80)) {
    const entry = zip.file(path);
    if (!entry) continue;
    const content = decodeXml(await boundedZipText(entry,budget));
    if (content) chunks.push(`${path}\n${content}`);
    if (chunks.join('\n').length >= MAX_EXTRACTED_CHARS) break;
  }
  const text = chunks.join('\n\n');
  if (!text.trim()) throw new UploadError('empty_content');
  return text;
}

async function extractPdf(bytes, timeoutMs = PDF_TIMEOUT_MS) {
  inspectPdfBytes(bytes);
  const {getDocument} = await getResolvedPDFJS();
  // Copia: pdf.js puede transferir el búfer. Sin eval ni XFA: solo se lee texto.
  const task = getDocument({data:bytes.slice(),maxImageSize:16_777_216,isEvalSupported:false,enableXfa:false,useSystemFonts:true,disableFontFace:true});
  // Doble control: temporizador (si el bucle de eventos queda libre) y plazo
  // comprobado entre páginas (pdf.js sin worker puede encadenar microtareas).
  const deadline=Date.now()+timeoutMs;
  const checkDeadline=()=>{if(Date.now()>deadline)throw new UploadError('pdf_timeout');};
  let timer;let disposing;
  const dispose=()=>disposing??=task.destroy();
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{void dispose().catch(()=>{});reject(new UploadError('pdf_timeout'));},timeoutMs);});
  timeout.catch(()=>{});
  try {
    const pdf=await Promise.race([task.promise,timeout]);
    if(pdf.numPages>80)throw new UploadError('pdf_pages');
    checkDeadline();
    const extract=async()=>{
      const [js,files]=await Promise.all([pdf.getJSActions(),pdf.getAttachments()]);
      if((js&&Object.keys(js).length)||(files&&Object.keys(files).length))throw new UploadError('pdf_active');
      let text='';
      for(let n=1;n<=pdf.numPages;n++){
        checkDeadline();
        const page=await pdf.getPage(n);
        try{
          if(hasActiveAnnotation(await page.getAnnotations()))throw new UploadError('pdf_active');
          if(text.length<MAX_EXTRACTED_CHARS){const content=await page.getTextContent();for(const item of content.items){if('str' in item)text+=item.str+' ';if(text.length>=MAX_EXTRACTED_CHARS)break;}text+='\n';}
        }
        finally{page.cleanup();}
      }
      if(!text.trim())throw new UploadError('pdf_empty');
      return `PDF · ${pdf.numPages} páginas\n${text}`;
    };
    return await Promise.race([extract(),timeout]);
  }catch(error){
    if(error instanceof UploadError)throw error;
    if(error?.name==='PasswordException')throw new UploadError('encrypted');
    throw new UploadError('unreadable');
  }finally{clearTimeout(timer);await dispose().catch(()=>{});}
}

async function analyzeImage(base64, mimeType, signal, admission) {
  let response;
  try { response = await groqProvider.request({ operation: 'image_analysis', signal, beforeAttempt: admission?.beforeAttempt, pause: admission?.pause, timeoutMs: 45000, body: {
      model: Deno.env.get('GROQ_VISION_MODEL')?.trim() || 'qwen/qwen3.8-27b',
      stream: false, temperature: 0.2, max_completion_tokens: 1400,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Analiza esta imagen para usarla como contexto de conversación. Describe con precisión el contenido visual y transcribe todo el texto legible (OCR), también la letra a mano, respetando títulos, listas y el orden. Si un trozo no se puede leer, escribe [ilegible] en su lugar en vez de adivinarlo. No inventes detalles. Responde en español.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      ] }],
    }}); }
  catch (error) {
    if (error?.name === 'AdmissionError' || error?.name === 'GroqProviderError') throw error;
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'provider_error';
    throw new Error(`vision_${code}`);
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty_image');
  return `Análisis visual y OCR\n${text.trim()}`;
}

/**
 * Valida y extrae el texto de un archivo subido. Todo ocurre en memoria: el
 * archivo nunca se guarda, ejecuta ni sirve; solo se conserva el texto
 * saneado. Las imágenes viajan a la IA sin metadatos (EXIF, GPS…).
 * `vision` y `pdfTimeoutMs` solo se sustituyen en las pruebas.
 */
export async function extractAttachment({ fileName, mimeType, base64, signal, admission, vision = analyzeImage, pdfTimeoutMs = PDF_TIMEOUT_MS }) {
  const ext = extensionOf(fileName);
  const family = familyOf(ext);
  if (!family) throw new UploadError('unsupported');
  let bytes;
  try { bytes = decodeBase64ToBytes(base64); } catch { throw new UploadError('invalid_data'); }
  if (!bytes.length) throw new UploadError('empty');
  if (bytes.length > maxBytesFor(fileName)) throw new UploadError('too_large');
  const { kind, mime } = assertCoherent({ ext, family, mime: mimeType, bytes });
  let text;
  if (family === 'text') text = decodeUtf8Text(bytes);
  else if (family === 'image') {
    assertImageDimensions(bytes, kind);
    const clean = stripImageMetadata(bytes, kind);
    bytes = undefined;
    // La IA de imágenes (Groq) solo acepta hasta 4 MB por imagen en base64:
    // por encima fallaría sin explicación. La web ya reduce las fotos.
    if (clean.length > MAX_VISION_BYTES) throw new UploadError('image_too_heavy');
    text = await vision(bytesToBase64(clean), mime, signal, admission);
  } else if (family === 'pdf') text = await extractPdf(bytes, pdfTimeoutMs);
  else text = await extractOffice(bytes, ext);
  const normalized = sanitizeExtractedText(text, { keepMarkup: CODE_EXTENSIONS.has(ext), maxChars: MAX_EXTRACTED_CHARS });
  if (!normalized) throw new UploadError('empty_content');
  return normalized;
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
