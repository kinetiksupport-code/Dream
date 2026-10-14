import { validateOfficeArchive, assertBase64 } from './archive.mjs';
import JSZip from 'npm:jszip@3.10.1';
import { getResolvedPDFJS } from 'npm:unpdf@1.8.1';
import { groqProvider } from './groq.mjs';

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
export const MAX_ATTACHMENT_CONTEXT_CHARS = 32000;

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
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function boundedZipText(entry, budget) {
  return new Promise((resolve,reject)=>{
    const stream=entry.internalStream('uint8array');const decoder=new TextDecoder();let bytes=0,text='';
    stream.on('data',chunk=>{bytes+=chunk.length;budget.bytes+=chunk.length;if(bytes>4*1024*1024 || budget.bytes>16*1024*1024){stream.pause();reject(new Error('archive_limits'));return;}text+=decoder.decode(chunk,{stream:true});});
    stream.on('error',reject);stream.on('end',()=>resolve(text+decoder.decode()));stream.resume();
  });
}

async function extractOffice(bytes, ext) {
  validateOfficeArchive(bytes);
  const zip = await JSZip.loadAsync(bytes);
  let paths = [];
  if (ext === 'docx') paths = ['word/document.xml'];
  if (ext === 'pptx') paths = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (ext === 'xlsx') paths = [
    ...Object.keys(zip.files).filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    'xl/sharedStrings.xml',
  ];
  const chunks = [];
  const budget = {bytes:0};
  for (const path of paths.slice(0, 80)) {
    const entry = zip.file(path);
    if (!entry) continue;
    const content = decodeXml(await boundedZipText(entry,budget));
    if (content) chunks.push(`${path}\n${content}`);
    if (chunks.join('\n').length >= MAX_EXTRACTED_CHARS) break;
  }
  const text = chunks.join('\n\n');
  if (!text.trim()) throw new Error('empty_document');
  return text;
}

async function extractPdf(bytes) {
  const {getDocument} = await getResolvedPDFJS();
  const task = getDocument({data:bytes,maxImageSize:16_777_216,isEvalSupported:false,useSystemFonts:true,disableFontFace:true});
  let timer;let disposing;
  const dispose=()=>disposing??=task.destroy();
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{void dispose().catch(()=>{});reject(new Error('pdf_timeout'));},20000);});
  try {
    const pdf=await Promise.race([task.promise,timeout]);
    if(pdf.numPages>80)throw new Error('too_many_pages');
    const extract=async()=>{
      let text='';
      for(let n=1;n<=pdf.numPages&&text.length<MAX_EXTRACTED_CHARS;n++){
        const page=await pdf.getPage(n);
        try{const content=await page.getTextContent();for(const item of content.items){if('str' in item)text+=item.str+' ';if(text.length>=MAX_EXTRACTED_CHARS)break;}text+='\n';}
        finally{page.cleanup();}
      }
      if(!text.trim())throw new Error('empty_pdf');
      return `PDF · ${pdf.numPages} páginas\n${text}`;
    };
    return await Promise.race([extract(),timeout]);
  }finally{clearTimeout(timer);await dispose();}
}

async function analyzeImage(base64, mimeType, signal, admission) {
  let response;
  try { response = await groqProvider.request({ operation: 'image_analysis', signal, beforeAttempt: admission?.beforeAttempt, pause: admission?.pause, timeoutMs: 45000, body: {
      model: Deno.env.get('GROQ_VISION_MODEL')?.trim() || 'qwen/qwen3.8-27b',
      stream: false, temperature: 0.2, max_completion_tokens: 1400,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Analiza esta imagen para usarla como contexto de conversación. Describe con precisión el contenido visual y transcribe todo el texto legible (OCR). No inventes detalles. Responde en español.' },
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

export async function extractAttachment({ fileName, mimeType, base64, signal, admission }) {
  const ext = extensionOf(fileName);
  assertBase64(base64);
  let text;
  if (TEXT_EXTENSIONS.has(ext)) text = decodeBase64ToText(base64);
  else if (IMAGE_EXTENSIONS.has(ext)) text = await analyzeImage(base64, mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`, signal, admission);
  else {
    const bytes = decodeBase64ToBytes(base64);
    if (ext === 'pdf') text = await extractPdf(bytes);
    else if (OFFICE_EXTENSIONS.has(ext)) text = await extractOffice(bytes, ext);
    else throw new Error('unsupported');
  }
  const normalized = String(text || '').replace(/\u0000/g, '').trim();
  if (!normalized) throw new Error('empty');
  return normalized.length > MAX_EXTRACTED_CHARS
    ? normalized.slice(0, MAX_EXTRACTED_CHARS) + '\n[… contenido truncado …]'
    : normalized;
}

