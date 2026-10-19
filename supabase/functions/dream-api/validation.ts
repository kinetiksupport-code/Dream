export type Body = Record<string, unknown>;
export class ExamError extends Error { constructor(message:string,public status=400){super(message);} }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function id(value:unknown){if(typeof value !== 'string'||!uuid.test(value))throw new ExamError('Identificador no válido.');return value;}
export function text(value:unknown,max:number,required=false){if(typeof value!=='string'||value.length>max||required&&!value.trim())throw new ExamError('Revisa los datos del examen.');return value.trim();}
export function examFields(b:Body){
 const date=text(b.exam_date,10,true);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new ExamError('Indica una fecha válida.');
 if(!Array.isArray(b.topics)||b.topics.length>30)throw new ExamError('Añade como máximo 30 temas.');
 const daily=Number(b.daily_minutes);if(!Number.isInteger(daily)||daily<5||daily>120)throw new ExamError('Elige entre 5 y 120 minutos al día.');
 return {title:text(b.title,160,true),subject:text(b.subject,80,true),exam_date:date,topics:b.topics.map(t=>text(t,160,true)),difficulties:text(b.difficulties??'',4000),goal:text(b.goal??'',1000),daily_minutes:daily};
}
/** Pasos del asistente que se guardan en el borrador (retomar donde iba). */
export const WIZARD_STEPS = ['upload','date','grade','identify'] as const;
/** Minutos al día por defecto: el asistente ya no los pregunta (§9.2). */
export const DEFAULT_DAILY_MINUTES = 45;
function isoDate(value:unknown){const date=text(value,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new ExamError('Indica una fecha válida.');return date;}
/**
 * Cambios parciales de un borrador desde el asistente: solo los campos que
 * llegan. La fecha no puede ser pasada (con un día de margen por la zona
 * horaria) y la nota va de 0 a 10 en saltos de 0,5.
 */
export function draftFields(b:Body,today=new Date()){
 const out:Record<string,unknown>={};
 if(b.exam_date!==undefined){const date=isoDate(b.exam_date);const yesterday=new Date(today.getTime()-86400000).toISOString().slice(0,10);if(date<yesterday)throw new ExamError('Elige hoy o un día futuro.');out.exam_date=date;}
 if(b.target_grade!==undefined){const g=Number(b.target_grade);if(!Number.isFinite(g)||g<0||g>10||g*2!==Math.floor(g*2))throw new ExamError('Elige una nota de 0 a 10.');out.target_grade=g;out.goal=`Sacar un ${String(g).replace('.',',')} sobre 10.`;}
 if(b.wizard_step!==undefined){if(!(WIZARD_STEPS as readonly unknown[]).includes(b.wizard_step))throw new ExamError('Paso no válido.');out.wizard_step=b.wizard_step;}
 if(b.few_notes_ack!==undefined){if(b.few_notes_ack!==true)throw new ExamError('Revisa los datos del examen.');out.few_notes_ack=true;}
 if(b.title!==undefined)out.title=text(b.title,160,true).replace(/\s+/g,' ');
 if(b.subject!==undefined)out.subject=text(b.subject,80,true).replace(/\s+/g,' ');
 if(b.topics!==undefined){if(!Array.isArray(b.topics)||b.topics.length>30)throw new ExamError('Añade como máximo 30 temas.');out.topics=b.topics.map(t=>text(t,160,true));}
 if(!Object.keys(out).length)throw new ExamError('No hay nada que guardar.');
 return out;
}
/** Closed list of chat shortcuts; prompts.mjs holds one short instruction per id. */
export const CHAT_SHORTCUTS = ['explain','review_last','weak_points','study_style','exam_date','teach','eli5','key_concepts','connect','test_understanding'] as const;
export type ChatShortcut = typeof CHAT_SHORTCUTS[number];
/** Optional `shortcut` of the chat action: absent → null, unknown → 400. */
export function chatShortcut(value:unknown):ChatShortcut|null{
 if(value===undefined||value===null)return null;
 if(typeof value!=='string'||!(CHAT_SHORTCUTS as readonly string[]).includes(value))throw new ExamError('Atajo no válido.');
 return value as ChatShortcut;
}
