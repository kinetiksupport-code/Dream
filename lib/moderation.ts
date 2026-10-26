// Moderación, lado del alumno (B6). Todo pasa por dream-api; el navegador no
// escribe en las tablas de moderación. Textos en palabras sencillas y sin culpar.
import { callDream } from "./dream-api";

export const APPEAL_MAX_CHARS = 2000;
export const APPEAL_DEADLINE_DAYS = 30;

export interface AppealRow {
  id: string;
  status: "abierta" | "aceptada" | "rechazada";
  code: string | null;
  created_at: string;
  due_at: string;
  resolution: string | null;
}
export interface BanInfo {
  ban: { rule: string; reason: string; until: string | null; permanent: boolean } | null;
  code: string | null;
  appeals: AppealRow[];
  deadline_days: number;
}
export interface Notice {
  id: string;
  kind: "aviso" | "limitacion";
  rule: string;
  reason: string;
  until: string | null;
  created_at: string;
}

export const getBanInfo = (signal?: AbortSignal) => callDream<BanInfo>("mod_ban_info", {}, signal);
export const getNotices = (signal?: AbortSignal) => callDream<{ items: Notice[] }>("mod_notices", {}, signal);
export const ackNotice = (id: string) => callDream<{ ok: boolean }>("mod_ack", { id });
export const sendAppeal = (body: string, sanctionId?: string) =>
  callDream<{ ok: boolean; code: string; due_at: string; deadline_days: number }>("mod_appeal_create", {
    body,
    ...(sanctionId ? { sanction_id: sanctionId } : {}),
  });

const dateFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** «hasta el 12 de noviembre de 2026» o «de forma permanente». */
export function untilText(until: string | null, permanent: boolean): string {
  if (permanent || !until) return "de forma permanente";
  return `hasta el ${dateFormat.format(new Date(until))}`;
}
/** Límite corto de una limitación: «hasta el 22 de octubre, 11:30». */
export function limitText(until: string | null): string {
  return until ? `hasta el ${dateTimeFormat.format(new Date(until))}` : "durante un tiempo";
}
export const isModerationBlock = (code: string) => code === "mod_ip_blocked" || code === "mod_user_limited";

/** ¿Es un código de apelación con el formato de Dream? */
export const isAppealCode = (value: string) => /^DREAM-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(value);
