// «Lo que Dream recuerda» (memoria entre chats e importación de otra IA).
// Todo lo decide dream-api (memory-actions.mjs); aquí solo tipos, la lectura
// tolerante de lo que llega y cómo se agrupa para enseñarlo.
import { callDream } from "./dream-api";

export type MemoryKind =
  | "dificultad"
  | "dominio"
  | "preferencia"
  | "objetivo"
  | "progreso";
export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  content: string;
  subject: string | null;
  pinned: boolean;
  source: "chat" | "import";
  source_conversation_id: string | null;
}
export interface MemoryState {
  memory_enabled: boolean;
  items: MemoryItem[];
  export_prompt: string;
  imports_left: number;
  import_available: boolean;
}
export interface ImportPreview {
  nickname: string | null;
  interests: string[];
  level: string | null;
  memories: { kind: MemoryKind; content: string; subject: string | null; expires_at: string | null }[];
  discarded: number;
}

export const KIND_LABELS: Record<MemoryKind, string> = {
  dificultad: "Le cuesta",
  dominio: "Domina",
  preferencia: "Cómo le gusta aprender",
  objetivo: "Objetivos",
  progreso: "En qué se quedó",
};
const KINDS = Object.keys(KIND_LABELS) as MemoryKind[];

const isKind = (k: unknown): k is MemoryKind =>
  typeof k === "string" && (KINDS as string[]).includes(k);
const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.slice(0, max) : "";

/** Lo que manda dream-api, sin fiarse de su forma. */
export function parseMemory(data: unknown): MemoryState {
  const d = (data ?? {}) as Record<string, unknown>;
  const items = Array.isArray(d.items)
    ? d.items.flatMap((raw): MemoryItem[] => {
        const m = (raw ?? {}) as Record<string, unknown>;
        if (typeof m.id !== "string" || !isKind(m.kind) || !str(m.content, 160))
          return [];
        return [
          {
            id: m.id,
            kind: m.kind,
            content: str(m.content, 160),
            subject: str(m.subject, 40) || null,
            pinned: m.pinned === true,
            source: m.source === "import" ? "import" : "chat",
            source_conversation_id:
              typeof m.source_conversation_id === "string"
                ? m.source_conversation_id
                : null,
          },
        ];
      })
    : [];
  return {
    memory_enabled: d.memory_enabled === true,
    items,
    export_prompt: str(d.export_prompt, 2000),
    imports_left:
      typeof d.imports_left === "number" ? Math.max(0, d.imports_left) : 0,
    import_available: d.import_available === true,
  };
}

/** Agrupados por tipo y, dentro, por asignatura; los fijados primero. */
export function groupMemories(items: MemoryItem[]) {
  return KINDS.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    items: items
      .filter((m) => m.kind === kind)
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          (a.subject ?? "").localeCompare(b.subject ?? "", "es"),
      ),
  })).filter((g) => g.items.length);
}

export const loadMemory = async (signal?: AbortSignal) =>
  parseMemory(await callDream("memory_list", {}, signal));
export const setMemoryEnabled = (enabled: boolean) =>
  callDream("memory_toggle", { enabled });
export const deleteMemory = (id: string) => callDream("memory_delete", { id });
export const deleteAllMemory = () =>
  callDream("memory_delete_all", { confirm: "BORRAR" });
export const pinMemory = (id: string, pinned: boolean) =>
  callDream("memory_pin", { id, pinned });
export async function previewImport(text: string) {
  const data = await callDream<{
    preview: ImportPreview;
    has_nickname: boolean;
    has_interests: boolean;
  }>("memory_import_preview", { text });
  return data;
}
export const commitImport = (
  preview: ImportPreview,
  options: { useNickname: boolean; interestsMode: "replace" | "add" },
) =>
  callDream<{ added: number; discarded: number }>("memory_import_commit", {
    preview,
    use_nickname: options.useNickname,
    interests_mode: options.interestsMode,
  });
