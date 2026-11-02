"use client";
// Archivos del paso «Primero, sube tus apuntes» (§5.3): los ya guardados, los
// que se suben desde este dispositivo y los que llegan del móvil por QR.
// Las subidas van por la ruta normal (exam_upload_start → attachment_upload,
// con el file-guard de #31 → exam_material_add), una detrás de otra.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callDream, errorMessage } from "@/lib/dream-api";
import { prepareFile, toBase64, validateFile, withUploadRetry } from "@/lib/attachments";
import {
  MAX_EXAM_MATERIALS,
  getExam,
  updateExam,
  type DreamExam,
} from "@/lib/exam-plans";
import { findDuplicate } from "@/lib/exam-wizard";
import type { UploadSessionFile } from "@/lib/upload-session";

export type RowStatus = "uploading" | "processing" | "ready" | "error";
export interface FileRow {
  key: string;
  name: string;
  size: number;
  mime: string;
  status: RowStatus;
  source: "saved" | "device" | "qr";
  error?: string;
  attachmentId?: string;
  preview?: string;
  /** Retry is possible (device files keep the File). */
  retry?: () => void;
}
interface LocalFile {
  key: string;
  file: File;
  hash?: string;
  status: RowStatus;
  error?: string;
  attachmentId?: string;
  preview?: string;
}
export interface Duplicate {
  key: string;
  file: File;
  hash?: string;
  of: string;
}

async function sha256(file: File) {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

export function useUploads(
  exam: DreamExam | null,
  setExam: (e: DreamExam) => void,
) {
  const [local, setLocal] = useState<LocalFile[]>([]);
  const [qr, setQr] = useState<UploadSessionFile[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [error, setError] = useState("");
  const localRef = useRef(local);
  localRef.current = local;
  const examRef = useRef(exam);
  examRef.current = exam;
  const queue = useRef(Promise.resolve());
  const conversation = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const f of localRef.current) if (f.preview) URL.revokeObjectURL(f.preview);
    };
  }, []);

  const patch = useCallback((key: string, change: Partial<LocalFile>) => {
    if (!mounted.current) return;
    setLocal((list) => list.map((f) => (f.key === key ? { ...f, ...change } : f)));
  }, []);

  const upload = useCallback(
    (item: LocalFile) => {
      queue.current = queue.current.then(async () => {
        const examNow = examRef.current;
        if (!examNow) return;
        try {
          patch(item.key, { status: "uploading", error: undefined });
          conversation.current ??= examNow.conversation_id;
          if (!conversation.current)
            conversation.current = (
              await callDream<{ conversation_id: string }>("exam_upload_start", {
                exam_id: examNow.id,
              })
            ).conversation_id;
          // Las fotos del móvil se reducen antes de subirlas (lib/attachments.ts).
          const ready = await prepareFile(item.file);
          const content_base64 = await toBase64(ready);
          patch(item.key, { status: "processing" });
          const conversationId = conversation.current;
          const { attachment } = await withUploadRetry(() =>
            callDream<{ attachment: { id: string } }>("attachment_upload", {
              conversation_id: conversationId,
              file_name: ready.name,
              mime_type: ready.type,
              content_base64,
            }),
          );
          const updated = await updateExam("exam_material_add", examNow.id, {
            attachment_id: attachment.id,
          });
          if (mounted.current) setExam(updated);
          patch(item.key, { status: "ready", attachmentId: attachment.id });
        } catch (e) {
          patch(item.key, { status: "error", error: errorMessage(e) });
        }
      });
    },
    [patch, setExam],
  );

  const rows: FileRow[] = useMemo(() => {
    const materials = exam?.materials ?? [];
    const taken = new Set([
      ...local.map((f) => f.attachmentId).filter(Boolean),
      ...qr.map((f) => f.attachment_id).filter(Boolean),
    ]);
    const saved: FileRow[] = materials
      .filter((m) => !taken.has(m.id) && !removed.includes(m.id))
      .map((m) => ({
        key: `m-${m.id}`,
        name: m.file_name,
        size: m.size_bytes,
        mime: m.mime_type,
        status: "ready",
        source: "saved",
        attachmentId: m.id,
      }));
    const fromPhone: FileRow[] = qr
      .filter((f) => !(f.attachment_id && removed.includes(f.attachment_id)))
      .map((f) => ({
        key: `qr-${f.id}`,
        name: f.file_name,
        size: f.size_bytes,
        mime: "",
        status: f.status === "processed" ? "ready" : f.status === "failed" ? "error" : "processing",
        error: f.status === "failed" ? "No se ha podido leer este archivo. Súbelo otra vez." : undefined,
        source: "qr",
        attachmentId: f.attachment_id ?? undefined,
      }));
    const mine: FileRow[] = local
      .filter((f) => !(f.attachmentId && removed.includes(f.attachmentId)))
      .map((f) => ({
        key: f.key,
        name: f.file.name,
        size: f.file.size,
        mime: f.file.type,
        status: f.status,
        error: f.error,
        source: "device",
        attachmentId: f.attachmentId,
        preview: f.preview,
        retry: f.status === "error" ? () => upload(f) : undefined,
      }));
    return [...saved, ...fromPhone, ...mine];
  }, [exam, local, qr, removed, upload]);

  const active = rows.filter((r) => r.status !== "error").length;

  function enqueue(files: File[], hashes: (string | undefined)[]) {
    const added: LocalFile[] = files.map((file, i) => ({
      key: crypto.randomUUID(),
      file,
      hash: hashes[i],
      status: "uploading",
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setLocal((list) => [...list, ...added]);
    for (const item of added) upload(item);
  }

  /** Validates, finds duplicates (asks) and queues the rest. */
  async function addFiles(list: File[]) {
    setError("");
    const accepted: File[] = [];
    const hashes: (string | undefined)[] = [];
    const known = [
      ...rows.filter((r) => r.status !== "error").map((r) => ({
        name: r.name,
        size: r.size,
        hash: local.find((f) => f.key === r.key)?.hash,
      })),
    ];
    const dupes: Duplicate[] = [];
    for (const file of list) {
      try {
        validateFile(file);
      } catch (e) {
        setError(errorMessage(e));
        continue;
      }
      const hash = await sha256(file);
      const dup = findDuplicate({ name: file.name, size: file.size, hash }, known);
      if (dup) {
        dupes.push({ key: crypto.randomUUID(), file, hash, of: dup.name });
        continue;
      }
      known.push({ name: file.name, size: file.size, hash });
      accepted.push(file);
      hashes.push(hash);
    }
    const room = MAX_EXAM_MATERIALS - active;
    if (accepted.length > room) {
      setError(
        `Puedes subir hasta ${MAX_EXAM_MATERIALS} archivos por examen. ${
          room > 0 ? `Caben ${room} más.` : "Quita alguno para subir otro."
        }`,
      );
      accepted.splice(Math.max(0, room));
    }
    if (accepted.length) enqueue(accepted, hashes.slice(0, accepted.length));
    if (dupes.length) setDuplicates((d) => [...d, ...dupes]);
  }

  function resolveDuplicate(key: string, keep: boolean) {
    const dup = duplicates.find((d) => d.key === key);
    setDuplicates((d) => d.filter((x) => x.key !== key));
    if (!dup || !keep) return;
    if (active >= MAX_EXAM_MATERIALS) {
      setError(`Puedes subir hasta ${MAX_EXAM_MATERIALS} archivos por examen.`);
      return;
    }
    enqueue([dup.file], [dup.hash]);
  }

  async function remove(row: FileRow) {
    setError("");
    try {
      if (row.attachmentId && examRef.current) {
        setExam(
          await updateExam("exam_material_remove", examRef.current.id, {
            attachment_id: row.attachmentId,
          }),
        );
        setRemoved((r) => [...r, row.attachmentId!]);
      }
      if (row.source === "device") {
        const f = localRef.current.find((x) => x.key === row.key);
        if (f?.preview) URL.revokeObjectURL(f.preview);
        setLocal((list) => list.filter((x) => x.key !== row.key));
      }
      if (row.source === "qr" && !row.attachmentId)
        setQr((list) => list.filter((x) => `qr-${x.id}` !== row.key));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  /** Files from the phone (QrPanel). Processed ones refresh the exam. */
  const refreshing = useRef(false);
  const onQrFiles = useCallback(
    (files: UploadSessionFile[]) => {
      setQr(files);
      const current = examRef.current;
      if (!current || refreshing.current) return;
      const missing = files.some(
        (f) =>
          f.status === "processed" &&
          f.attachment_id &&
          !current.materials.some((m) => m.id === f.attachment_id),
      );
      if (!missing) return;
      refreshing.current = true;
      getExam(current.id)
        .then((e) => mounted.current && setExam(e))
        .catch(() => {})
        .finally(() => (refreshing.current = false));
    },
    [setExam],
  );

  const busy = rows.some((r) => r.status === "uploading" || r.status === "processing");
  const ready = rows.filter((r) => r.status === "ready").length;
  return {
    rows,
    busy,
    ready,
    duplicates,
    error,
    setError,
    addFiles,
    resolveDuplicate,
    remove,
    onQrFiles,
  };
}
