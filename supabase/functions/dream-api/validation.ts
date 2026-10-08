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
