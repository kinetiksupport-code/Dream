import type { Conversation } from "./types";
import { spanishDate } from "./conversation-title";

export const GROUPS = [
  "Hoy",
  "Ayer",
  "Esta semana",
  "Este mes",
  "Más antiguas",
] as const;
export type GroupLabel = (typeof GROUPS)[number];

export interface HistoryGroup {
  label: GroupLabel;
  items: Conversation[];
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Calendar group for a date. Weeks start on Monday, as in Spain. */
export function groupLabel(iso: string, now: Date): GroupLabel {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Más antiguas";
  const day = startOfDay(date);
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  if (day >= today) return "Hoy";
  if (day >= yesterday) return "Ayer";
  if (day >= monday) return "Esta semana";
  if (
    day.getFullYear() === today.getFullYear() &&
    day.getMonth() === today.getMonth()
  )
    return "Este mes";
  return "Más antiguas";
}

/**
 * Groups conversations into Hoy, Ayer, Esta semana, Este mes and Más antiguas,
 * always in that order, keeping the order of the items inside each group.
 */
export function groupByDay(items: Conversation[], now: Date): HistoryGroup[] {
  const map = new Map<GroupLabel, Conversation[]>();
  for (const item of items) {
    const label = groupLabel(item.updated_at, now);
    map.set(label, [...(map.get(label) ?? []), item]);
  }
  return GROUPS.filter((label) => map.has(label)).map((label) => ({
    label,
    items: map.get(label)!,
  }));
}

/** Second line of a row: the time for Hoy and Ayer, else weekday or date. */
export function rowMeta(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const label = groupLabel(iso, now);
  if (label === "Hoy" || label === "Ayer")
    return date.toLocaleTimeString("es", {
      hour: "2-digit",
      minute: "2-digit",
    });
  if (label === "Esta semana")
    return date.toLocaleDateString("es", { weekday: "long" });
  return spanishDate(date, now);
}
