import type { Conversation } from "./types";

export interface HistoryGroup {
  label: string;
  items: Conversation[];
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Groups conversations (already sorted newest first) into Hoy/Ayer/... */
export function groupByDay(items: Conversation[], now: Date): HistoryGroup[] {
  const today = startOfDay(now).getTime();
  const day = 24 * 60 * 60 * 1000;
  const label = (iso: string) => {
    const time = startOfDay(new Date(iso)).getTime();
    if (Number.isNaN(time)) return "Anteriores";
    if (time >= today) return "Hoy";
    if (time >= today - day) return "Ayer";
    if (time >= today - 6 * day) return "Esta semana";
    return "Anteriores";
  };
  const groups: HistoryGroup[] = [];
  for (const item of items) {
    const name = label(item.updated_at);
    const group = groups.find((g) => g.label === name);
    if (group) group.items.push(item);
    else groups.push({ label: name, items: [item] });
  }
  return groups;
}
