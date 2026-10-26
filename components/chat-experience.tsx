"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDream } from "@/components/providers";
import { useConversations } from "@/components/shell";
import { DreamActivity } from "@/components/dream-mark";
import { AiStatus } from "@/components/ai-status";
import { ArrowDown, CircleAlert, RotateCw } from "lucide-react";
import { Composer } from "@/components/composer";
import { MessageView } from "@/components/message";
import { preloadMarkdown } from "@/components/markdown";
import { ChatHome } from "@/components/chat-home";
import { NextStepCard } from "@/components/exams/next-step-card";
import { Recents } from "@/components/recents";
import { FileCard } from "@/components/attachment";
import { ModePicker } from "@/components/mode-picker";
import {
  WARN_PERCENT,
  alternativeMode,
  clockTime,
  formatResetIn,
  messagesLeftText,
  pickMode,
  readStoredMode,
  storeMode,
  type AiModeId,
} from "@/lib/ai-modes";
import { useAiUsage } from "@/lib/use-ai-usage";
import Link from "next/link";
import {
  callDream,
  streamDreamChat,
  errorMessage,
  DreamApiError,
} from "@/lib/dream-api";
import { DreamStreamError } from "@/lib/streaming";
import {
  limitFor,
  shouldRetry,
  waitText,
  dailyText,
  type LimitState,
} from "@/lib/limits";
import { parseDreamContent } from "@/lib/widgets";
import { validateFile, toBase64 } from "@/lib/attachments";
import { takePendingFiles } from "@/lib/pending-files";
import { AI_NOTICE } from "@/lib/consent";
import estilo from "./chat-estilo.module.css";
import type {
  Conversation,
  Message,
  Attachment,
  DreamState,
} from "@/lib/types";
function limitOf(error: unknown): LimitState | null {
  if (error instanceof DreamApiError || error instanceof DreamStreamError)
    return limitFor(error.code, error.retryAfter, Date.now(), error.position);
  return null;
}
function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", stop);
      resolve();
    }
    function stop() {
      clearTimeout(timer);
      reject(new DOMException("Detenido", "AbortError"));
    }
    signal.addEventListener("abort", stop, { once: true });
  });
}
export function ChatExperience({
  study,
}: {
  study?: {
    examId: string;
    unitId: string;
    conversationId: string;
    title: string;
  };
}) {
  const params = useSearchParams();
  const router = useRouter();
  const { serviceReady } = useDream();
  const { refresh, add, setWorkspaceEmpty, autoTitle, setPageTitle } =
    useConversations();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(
    study?.conversationId ?? params.get("c"),
  );
  const [value, setValue] = useState("");
  const [analysisView, setAnalysisView] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [state, setState] = useState<DreamState>("idle");
  const [busy, setBusy] = useState(false);
  const [olderOffset, setOlderOffset] = useState<number | null>(null);
  const [olderLoading, setOlderLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState<{ until: number; position?: number } | null>(
    null,
  );
  const [dailyLimit, setDailyLimit] = useState(false);
  // Modo de la IA: el elegido en este navegador si sigue disponible.
  const { usage, refresh: refreshUsage } = useAiUsage();
  const [preferredMode, setPreferredMode] = useState<string | null>(null);
  useEffect(() => setPreferredMode(readStoredMode()), []);
  const mode = pickMode(usage, preferredMode);
  const chooseMode = useCallback((next: AiModeId) => {
    setPreferredMode(next);
    storeMode(next);
    setModeLimit(null);
  }, []);
  // El servidor ha dicho que el límite está agotado (antes de que llegue el uso).
  const [modeLimit, setModeLimit] = useState<{
    mode: AiModeId;
    resetAt: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [atBottom, setAtBottom] = useState(true);
  // Inicio: text of the first message while the hero fades out (160 ms).
  // The request is already running; only the swap of views waits.
  const [leaving, setLeaving] = useState<string | null>(null);
  // The hero composer had the focus when Inicio handed off: the docked one
  // takes it as soon as it mounts (the hero stays for those 160 ms).
  const handFocus = useRef(false);
  useLayoutEffect(() => {
    if (leaving !== null || !handFocus.current) return;
    handFocus.current = false;
    if (!document.activeElement?.closest(".composer"))
      document
        .querySelector<HTMLTextAreaElement>(".composer textarea")
        ?.focus({ preventScroll: true });
  }, [leaving]);
  // When the current wait started (send): AiStatus shows only after 2 s.
  const [waitSince, setWaitSince] = useState<number | null>(null);
  // How «Reintentar» recovers: resend the same turn, or reload what was saved.
  const [retry, setRetry] = useState<{
    kind: "send";
    prompt: string;
    attachmentIds: string[];
    keepDraft: boolean;
  } | null>(null);
  // Messages created in this session enter with motion; history never does.
  const fresh = useRef(new Set<string>());
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  // True while «Ir al último mensaje» scrolls down smoothly.
  const jumping = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const creation = useRef<Promise<string> | null>(null);
  const idRef = useRef<string | null>(study?.conversationId ?? params.get("c"));
  const filesRef = useRef<Attachment[]>([]);
  const route = useRef("");
  const justCreated = useRef<string | null>(null);
  const uploads = useRef(new Map<string, AbortController>());
  const uploadQueue = useRef<Attachment[]>([]);
  const uploadWorker = useRef(false);
  useEffect(() => {
    if (!wait) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [wait]);
  useEffect(() => {
    // Warm the Markdown chunk so the first streamed answer does not swap from
    // the plain-text fallback to formatted text mid-stream.
    void preloadMarkdown();
  }, []);
  useEffect(() => {
    setWorkspaceEmpty(!messages.length && !loading);
  }, [messages.length, loading, setWorkspaceEmpty]);
  const c = study?.conversationId ?? params.get("c");
  const newKey = study ? null : params.get("new");
  // Optional ?q= pre-fills (never sends) the composer, e.g. from Apuntes.
  const prefill = study ? null : (params.get("q")?.slice(0, 2000) ?? null);
  const clearFiles = useCallback(() => {
    for (const a of filesRef.current)
      if (a.preview) URL.revokeObjectURL(a.preview);
    filesRef.current = [];
    setAttachments([]);
    for (const controller of uploads.current.values()) controller.abort();
    uploads.current.clear();
    uploadQueue.current = [];
  }, []);
  useEffect(() => {
    const key = c ?? newKey ?? "new";
    if (c && justCreated.current === c) {
      justCreated.current = null;
      route.current = key;
      return;
    }
    justCreated.current = null;
    route.current = key;
    abort.current?.abort();
    abort.current = null;
    lock.current = false;
    creation.current = null;
    setLoading(false);
    idRef.current = c;
    setConversationId(c);
    setBusy(false);
    setState("idle");
    setValue(prefill ?? "");
    setAnalysisView(false);
    setLeaving(null);
    handFocus.current = false;
    clearFiles();
    setError("");
    setRetry(null);
    setWaitSince(null);
    fresh.current = new Set();
    setPageTitle(null);
    setMessages([]);
    setOlderOffset(null);
    pinned.current = true;
    followed.current = null;
    setAtBottom(true);
    if (!c) {
      const handed = takePendingFiles();
      if (handed.length) {
        setAnalysisView(true);
        queueMicrotask(() => addFilesRef.current(handed));
      }
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    callDream<{
      items: Message[];
      next_offset?: number | null;
      // Not sent by dream-api today; used if it starts returning the title.
      conversation?: { title?: string };
      title?: string;
    }>("messages", { conversation_id: c }, controller.signal)
      .then((r) => {
        setPageTitle(r.conversation?.title || r.title || null);
        setOlderOffset(r.next_offset ?? null);
        setMessages(
          r.items.filter((m) => m.role === "user" || m.role === "assistant"),
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [c, newKey, prefill, clearFiles, setPageTitle]);
  useEffect(
    () => () => {
      abort.current?.abort();
      clearFiles();
    },
    [clearFiles],
  );
  // scrollTop that auto-scroll last set. If the view is now higher and not at
  // the bottom, the student scrolled up (even if the scroll event has not
  // arrived yet): stop following instead of pulling them back down.
  const followed = useRef<number | null>(null);
  const follow = useCallback(() => {
    const el = scroller.current;
    if (!el || !pinned.current) return;
    if (
      followed.current !== null &&
      el.scrollTop < followed.current - 4 &&
      el.scrollHeight - el.scrollTop - el.clientHeight >= 80
    ) {
      pinned.current = false;
      setAtBottom(false);
      return;
    }
    el.scrollTop = el.scrollHeight;
    followed.current = el.scrollTop;
  }, []);
  useEffect(() => {
    if (!scroller.current) return;
    if (!messages.length && !busy) scroller.current.scrollTop = 0;
    else follow();
  }, [messages, state, loading, busy, follow]);
  // Anything that grows the thread (a streamed paragraph, the AI status that
  // appears at 2 s, a formula) keeps the view at the bottom, but only while
  // the student is there: reading above is never interrupted.
  const thread = useRef<HTMLDivElement>(null);
  const hasThread = messages.length > 0 && !loading;
  useEffect(() => {
    const el = thread.current;
    if (!el || !hasThread) return;
    const observer = new ResizeObserver(follow);
    observer.observe(el);
    // The visible area shrinks too (the composer grows with a long draft).
    if (scroller.current) observer.observe(scroller.current);
    return () => observer.disconnect();
  }, [hasThread, follow]);
  async function ensureConversation() {
    if (idRef.current) return idRef.current;
    if (creation.current) return creation.current;
    const origin = route.current;
    const promise = callDream<{ conversation: Conversation }>(
      "conversation_create",
      { title: "Nueva conversación" },
    )
      .then((r) => {
        if (route.current !== origin)
          throw new DOMException("Navegación cambiada", "AbortError");
        if (!r?.conversation?.id) {
          throw new Error(
            "No se pudo crear la conversación. Inténtalo de nuevo.",
          );
        }
        idRef.current = r.conversation.id;
        setConversationId(r.conversation.id);
        add(r.conversation);
        justCreated.current = r.conversation.id;
        route.current = r.conversation.id;
        router.replace(`/chat?c=${r.conversation.id}`, { scroll: false });
        return r.conversation.id;
      })
      .finally(() => {
        if (creation.current === promise) creation.current = null;
      });
    creation.current = promise;
    return promise;
  }
  function patchAttachment(localId: string, patch: Partial<Attachment>) {
    setAttachments((s) => {
      const next = s.map((a) =>
        a.localId === localId ? { ...a, ...patch } : a,
      );
      filesRef.current = next;
      return next;
    });
  }
  async function upload(a: Attachment) {
    const controller = new AbortController();
    uploads.current.set(a.localId, controller);
    try {
      patchAttachment(a.localId, {
        status: "uploading",
        queued: false,
        error: undefined,
      });
      const content = await toBase64(a.file);
      if (controller.signal.aborted) return;
      const id = await ensureConversation();
      if (controller.signal.aborted) return;
      patchAttachment(a.localId, { status: "processing" });
      const r = await callDream<{ attachment: { id: string } }>(
        "attachment_upload",
        {
          conversation_id: id,
          file_name: a.file.name,
          mime_type: a.file.type,
          content_base64: content,
        },
        controller.signal,
      );
      patchAttachment(a.localId, { id: r.attachment.id, status: "ready" });
    } catch (e) {
      if (!controller.signal.aborted)
        patchAttachment(a.localId, { status: "error", error: errorMessage(e) });
    } finally {
      uploads.current.delete(a.localId);
    }
  }
  function enqueueUpload(file: Attachment) {
    if (
      uploads.current.has(file.localId) ||
      uploadQueue.current.some((f) => f.localId === file.localId)
    )
      return;
    if (uploadQueue.current.length >= 4) return;
    patchAttachment(file.localId, {
      status: "uploading",
      queued: true,
      error: undefined,
    });
    uploadQueue.current.push(file);
    if (uploadWorker.current) return;
    uploadWorker.current = true;
    void (async () => {
      try {
        while (uploadQueue.current.length) {
          const next = uploadQueue.current.shift()!;
          if (filesRef.current.some((f) => f.localId === next.localId))
            await upload(next);
        }
      } finally {
        uploadWorker.current = false;
      }
    })();
  }
  function addFiles(files: File[]) {
    if (lock.current || loading) return;
    const remaining = 4 - filesRef.current.length;
    if (files.length > remaining)
      setError("Puedes adjuntar hasta cuatro archivos por mensaje.");
    const next: Attachment[] = [];
    for (const file of files.slice(0, remaining)) {
      try {
        validateFile(file);
        next.push({
          localId: crypto.randomUUID(),
          file,
          status: "uploading",
          preview: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined,
        });
      } catch (e) {
        setError(errorMessage(e));
      }
    }
    filesRef.current = [...filesRef.current, ...next];
    setAttachments(filesRef.current);
    for (const a of next) enqueueUpload(a);
  }
  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;
  function removeFile(id: string) {
    uploads.current.get(id)?.abort();
    uploadQueue.current = uploadQueue.current.filter((f) => f.localId !== id);
    const a = filesRef.current.find((x) => x.localId === id);
    if (a?.preview) URL.revokeObjectURL(a.preview);
    filesRef.current = filesRef.current.filter((x) => x.localId !== id);
    setAttachments(filesRef.current);
  }
  async function generateTest(
    id: string,
    prompt: string,
    signal: AbortSignal,
    persist = false,
    attachmentIds: string[] = [],
  ) {
    setState("shaping");
    const r = await callDream<{ assistant_message: string }>(
      "test_generate",
      {
        conversation_id: id,
        context: prompt,
        mode: /\b(examen|exam)\b/i.test(prompt) ? "exam" : "practice",
        question_count: 5,
        persist_user_message: persist,
        attachment_ids: attachmentIds,
        ...(study ? { exam_id: study.examId, unit_id: study.unitId } : {}),
      },
      signal,
    );
    const testId = crypto.randomUUID();
    fresh.current.add(testId);
    setMessages((s) => [
      ...s,
      {
        id: testId,
        role: "assistant",
        content: r.assistant_message,
      },
    ]);
  }
  async function send(
    promptOverride?: string,
    retryIds?: string[],
    /** Regenerate: leave the student's draft and its files untouched. */
    keepDraft = false,
  ) {
    if (
      lock.current ||
      loading ||
      (!keepDraft && filesRef.current.some((a) => a.status !== "ready")) ||
      (!(promptOverride || value).trim() && !filesRef.current.length)
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setDailyLimit(false);
    setRetry(null);
    setWaitSince(Date.now());
    setState("thinking");
    pinned.current = true;
    followed.current = null;
    setAtBottom(true);
    const controller = new AbortController();
    abort.current = controller;
    const prompt =
      (promptOverride || value).trim() ||
      "Ayúdame a comprender estos archivos.";
    const selected = keepDraft ? [] : [...filesRef.current];
    const attachmentIds =
      retryIds ?? selected.flatMap((a) => (a.id ? [a.id] : []));
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    fresh.current.add(userId);
    fresh.current.add(assistantId);
    const handOff = !study && !messages.length;
    if (handOff) {
      handFocus.current = !!document.activeElement?.closest(".composer");
      setLeaving(prompt);
      window.setTimeout(() => setLeaving(null), 160);
    }
    // The hero composer becomes the docked one: keep the typing focus there.
    else if (document.activeElement?.closest(".composer"))
      requestAnimationFrame(() => {
        if (!document.activeElement?.closest(".composer"))
          document
            .querySelector<HTMLTextAreaElement>(".composer textarea")
            ?.focus({ preventScroll: true });
      });
    if (!keepDraft) setValue("");
    setMessages((s) => [
      ...s,
      {
        id: userId,
        role: "user",
        content: prompt,
        files: selected.map((a) => a.file.name),
      },
    ]);
    let answer = "";
    let id: string | null = null;
    const firstTurn = !messages.length && !study;
    // Deltas arrive faster than the screen paints: group them so the thread
    // re-renders (and re-parses the Markdown) at most once per frame.
    let frame = 0;
    const flush = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      const content = answer;
      setMessages((s) =>
        s.map((m) => (m.id === assistantId ? { ...m, content } : m)),
      );
    };
    try {
      id = await ensureConversation();
      if (controller.signal.aborted) return;
      // Historial: name a «Nueva conversación» after its first question.
      if (firstTurn) autoTitle(id, prompt);
      if (!keepDraft) clearFiles();
      const directTest =
        /\b(hazme (?:un |una )?(?:test|examen)|quiero practicar|ponme preguntas|pregúntame|genera (?:un )?(?:test|examen))\b/i.test(
          prompt,
        ) && !/imprimir/i.test(prompt);
      if (directTest) {
        await generateTest(id, prompt, controller.signal, true, attachmentIds);
      } else {
        setMessages((s) => [
          ...s,
          { id: assistantId, role: "assistant", content: "" },
        ]);
        const chatPayload = {
          conversation_id: id,
          prompt,
          attachment_ids: attachmentIds,
          mode,
          ...(study ? { exam_id: study.examId, unit_id: study.unitId } : {}),
        };
        // Short limits (busy minute, queue) wait and resend the same message;
        // only when nothing was saved, so the turn is never duplicated.
        for (let attempt = 0, waited = 0; ; attempt++) {
          try {
            await streamOnce();
            break;
          } catch (e) {
            const limit = limitOf(e);
            const resendable =
              e instanceof DreamApiError ||
              (e instanceof DreamStreamError && e.reverted);
            if (
              limit?.kind !== "wait" ||
              answer ||
              !resendable ||
              controller.signal.aborted ||
              !shouldRetry(attempt, waited, limit.seconds)
            )
              throw e;
            const pause = limit.seconds + Math.random();
            setNow(Date.now());
            setState("waiting");
            setWait({
              until: Date.now() + pause * 1000,
              position: limit.position,
            });
            await sleep(pause * 1000, controller.signal);
            waited += pause;
            setWait(null);
            setState("thinking");
          }
        }
        async function streamOnce() {
          await streamDreamChat(
            chatPayload,
            (event) => {
              if (controller.signal.aborted || abort.current !== controller)
                return;
              if (event.type === "delta") {
                answer += event.text;
                setState("composing");
                if (!frame) frame = requestAnimationFrame(flush);
              } else if (event.type === "activity") {
                setState(
                  event.activity === "searching" ? "searching" : "thinking",
                );
              } else if (event.type === "complete") setState("done");
            },
            controller.signal,
          );
        }
        flush();
        if (
          parseDreamContent(answer).requestTest &&
          !parseDreamContent(answer).widgets.length
        )
          await generateTest(id, prompt, controller.signal);
      }
      if (abort.current === controller) setState("idle");
      void refresh();
    } catch (e) {
      setWait(null);
      if (abort.current !== controller) return;
      if (answer) flush();
      else if (frame) cancelAnimationFrame(frame);
      if (controller.signal.aborted && !answer) {
        // Cancelled before any answer (for example while waiting in line):
        // give the text back instead of leaving an empty turn.
        setMessages((list) =>
          list.filter((m) => m.id !== userId && m.id !== assistantId),
        );
        setValue((current) => current || prompt);
        setState("idle");
      } else if (controller.signal.aborted) {
        setMessages((s) =>
          s.map((m) => (m.id === assistantId ? { ...m, stopped: true } : m)),
        );
        setState("idle");
      } else {
        if (!answer) {
          // Nothing arrived: drop the optimistic turn and give the text back
          // to the composer so the draft is never lost (e.g. network drop).
          setMessages((list) =>
            list.filter((m) => m.id !== userId && m.id !== assistantId),
          );
          if (!keepDraft) setValue((current) => current || prompt);
          setRetry({ kind: "send", prompt, attachmentIds, keepDraft });
        }
        const limit = limitOf(e);
        if (limit?.kind === "mode") {
          // Shared limit used up: say when it comes back (every mode waits).
          setModeLimit({ mode, resetAt: limit.resetAt });
          setState("idle");
        } else {
          setDailyLimit(limit?.kind === "daily");
          setError(
            limit?.kind === "daily" ? dailyText(limit) : errorMessage(e),
          );
          setState("error");
        }
      }
    } finally {
      if (abort.current === controller) {
        setWaitSince(null);
        setBusy(false);
        lock.current = false;
        abort.current = null;
      }
      void refreshUsage();
    }
  }
  async function reload() {
    if (!conversationId) return;
    setLoading(true);
    try {
      const r = await callDream<{ items: Message[] }>("messages", {
        conversation_id: conversationId,
      });
      setMessages(
        r.items.filter((m) => m.role === "user" || m.role === "assistant"),
      );
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  async function loadOlder() {
    if (!conversationId || olderOffset === null || olderLoading || busy) return;
    const origin = route.current;
    setOlderLoading(true);
    const height = scroller.current?.scrollHeight ?? 0;
    const top = scroller.current?.scrollTop ?? 0;
    try {
      const r = await callDream<{
        items: Message[];
        next_offset?: number | null;
      }>("messages", { conversation_id: conversationId, offset: olderOffset });
      if (route.current !== origin) return;
      pinned.current = false;
      setMessages((previous) => [
        ...r.items.filter(
          (m) =>
            ["user", "assistant"].includes(m.role) &&
            !previous.some((p) => p.id === m.id),
        ),
        ...previous,
      ]);
      setOlderOffset(r.next_offset ?? null);
      requestAnimationFrame(() => {
        if (scroller.current)
          scroller.current.scrollTop =
            top + scroller.current.scrollHeight - height;
      });
    } catch (e) {
      if (route.current === origin) setError(errorMessage(e));
    } finally {
      setOlderLoading(false);
    }
  }
  const focusComposer = useCallback((text: string) => {
    setValue(text);
    requestAnimationFrame(() => {
      const el =
        document.querySelector<HTMLTextAreaElement>(".composer textarea");
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
      el.scrollTop = el.scrollHeight;
    });
  }, []);
  const view = params.get("view");
  if (view === "recent" || view === "tests") return <Recents />;
  const composer = (variant: "hero" | "dock") => (
    <Composer
      variant={variant}
      value={variant === "hero" && leaving !== null ? leaving : value}
      sending={variant === "hero" && leaving !== null}
      onChange={setValue}
      onSend={() => void send()}
      onStop={() => abort.current?.abort()}
      onFiles={addFiles}
      attachments={attachments}
      onRemove={removeFile}
      onRetry={(id) => {
        const a = filesRef.current.find((x) => x.localId === id);
        if (a) enqueueUpload(a);
      }}
      busy={busy && !(variant === "hero" && leaving !== null)}
      state={state}
      unavailable={loading}
      modes={
        <ModePicker
          usage={usage}
          value={mode}
          onChange={chooseMode}
          disabled={busy}
        />
      }
    />
  );
  const current = usage.modes.find((m) => m.id === mode);
  // Límite conjunto: al agotarse esperan todos los modos. Con un servidor
  // antiguo (límite por modo) puede quedar otro modo libre: se ofrece.
  const spentAt =
    current?.blocked && current.resets_at
      ? Date.parse(current.resets_at)
      : modeLimit?.mode === mode && modeLimit.resetAt > Date.now()
        ? modeLimit.resetAt
        : null;
  const alternative = alternativeMode(usage, mode);
  const modeBanner = spentAt ? (
    <div className="chat-limit" role="alert">
      <p>
        {alternative
          ? `Has usado todo el modo ${current?.label ?? "elegido"} por ahora.`
          : "Has usado toda tu IA por ahora."}{" "}
        Vuelve a estar disponible a las{" "}
        {clockTime(new Date(spentAt).toISOString())}.
      </p>
      {alternative && (
        <button
          type="button"
          className="secondary press"
          onClick={() => chooseMode(alternative.id)}
        >
          Cambiar a {alternative.label}
        </button>
      )}
    </div>
  ) : usage.percent >= WARN_PERCENT && usage.resets_at ? (
    <p className="mode-notice" role="status">
      Has usado el {usage.percent} % de tu IA.{" "}
      {messagesLeftText(usage.messages_left)} Se reinicia en{" "}
      {formatResetIn(Date.parse(usage.resets_at) - Date.now())}.
    </p>
  ) : null;
  // Errors say what happened and offer the way out (apple-design
  // generative-ai.md › «describe what happened… and offer a clear next step»).
  const canRetry = !!error && !dailyLimit && (!!retry || !!conversationId);
  const errorBanner = (!serviceReady || error) && (
    <div className="chat-error" role="alert">
      <CircleAlert className="chat-error-icon" size={20} aria-hidden="true" />
      <div className="chat-error-text">
        <strong>
          {error ? "No se ha podido completar" : "Dream no está disponible"}
        </strong>
        <p>
          {error || "El servicio de IA aún no está configurado en el servidor."}
        </p>
        {dailyLimit && (
          <p>
            Mientras tanto puedes repasar tus <Link href="/notes">apuntes</Link>
            , ver tu <Link href="/progress">progreso</Link> o leer tu{" "}
            <Link href="/chat?view=recent">historial</Link>.
          </p>
        )}
      </div>
      {canRetry && (
        <button
          className="secondary chat-retry press"
          onClick={() => {
            if (retry) {
              if (!retry.keepDraft) setValue("");
              void send(retry.prompt, retry.attachmentIds, retry.keepDraft);
            } else void reload();
          }}
          disabled={busy || loading}
        >
          <RotateCw size={16} aria-hidden="true" />
          Reintentar
        </button>
      )}
    </div>
  );
  const waitBanner = wait && (
    <div className="chat-wait" role="status">
      <p>{waitText(Math.max(1, (wait.until - now) / 1000), wait.position)}</p>
      <button
        type="button"
        className="secondary press"
        onClick={() => abort.current?.abort()}
      >
        Cancelar
      </button>
    </div>
  );
  if (!study && !loading && (!messages.length || leaving !== null))
    return (
      <section className="chat-view is-empty is-home">
        <ChatHome
          leaving={leaving !== null}
          composer={
            <>
              {composer("hero")}
              <p className="ai-notice">{AI_NOTICE}</p>
            </>
          }
          onPrompt={focusComposer}
          onAttach={() => {
            setAnalysisView(true);
            document
              .querySelector<HTMLInputElement>(".composer input[type=file]")
              ?.click();
          }}
        >
          {modeBanner}
          {errorBanner}
          {!analysisView && <NextStepCard />}
          {analysisView && attachments[0] && (
            <FileCard
              attachment={attachments[0]}
              busy={busy}
              onAnalyze={() =>
                void send(
                  "Analiza este archivo y ayúdame a entender sus ideas principales.",
                )
              }
              onRemove={() => removeFile(attachments[0].localId)}
              onRetry={() => enqueueUpload(attachments[0])}
            />
          )}
        </ChatHome>
        <span className="visually-hidden">Nueva conversación</span>
      </section>
    );
  const last = messages.at(-1);
  // «Regenerar» asks the last question again as a new turn. dream-api has no
  // regenerate action yet, so the saved history keeps both answers (honest
  // on reload) instead of a local swap that would disappear.
  const lastQuestion =
    last?.role === "assistant"
      ? messages.findLast((m) => m.role === "user")?.content.trim()
      : undefined;
  const regenerate =
    !busy && lastQuestion ? () => void send(lastQuestion, [], true) : undefined;
  return (
    <section
      className={`chat-view ${estilo.estilo} ${messages.length ? "has-messages" : "is-empty"}`}
    >
      <div
        className="chat-scroll"
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          // The smooth jump passes through «not at the bottom»: not a choice.
          if (!el || jumping.current) return;
          // The event of auto-scroll's own scroll can arrive after the thread
          // grew again (a history answer swapping to formatted Markdown): the
          // view did not go up, so it is not the student leaving the bottom.
          if (
            pinned.current &&
            followed.current !== null &&
            el.scrollTop >= followed.current - 4
          ) {
            follow();
            return;
          }
          pinned.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          followed.current = pinned.current ? el.scrollTop : null;
          setAtBottom(pinned.current);
        }}
      >
        {loading ? (
          <div className="chat-loading">
            <DreamActivity state="thinking" label="Abriendo la conversación" />
          </div>
        ) : messages.length ? (
          <div className="message-thread" ref={thread}>
            {olderOffset !== null && (
              <button
                className="secondary older-button press"
                disabled={olderLoading || busy}
                onClick={() => void loadOlder()}
              >
                {olderLoading
                  ? "Abriendo mensajes…"
                  : "Ver mensajes anteriores"}
              </button>
            )}
            {messages.map((m) => (
              <MessageView
                message={m}
                state={busy && m.id === last?.id ? state : "done"}
                since={busy && m.id === last?.id ? waitSince : null}
                isNew={fresh.current.has(m.id)}
                onContinue={focusComposer}
                onRegenerate={m.id === last?.id ? regenerate : undefined}
                key={m.id}
              />
            ))}
            {busy && last?.role !== "assistant" && (
              <AiStatus state={state} since={waitSince} />
            )}
            {busy && state === "shaping" && (
              <div
                className="quiz-skeleton message-enter"
                aria-hidden="true"
                data-testid="quiz-skeleton"
              >
                <span className="quiz-skeleton-icon" />
                <span className="quiz-skeleton-lines">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}
          </div>
        ) : (
          study && (
            <div className="study-conversation-empty">
              <DreamActivity state="idle" label="Dream" />
              <h2>
                Una <span className="marker">idea</span> cada vez.
              </h2>
              <p>
                Pregunta lo que necesites. Dream tiene tus temas y materiales
                como referencia.
              </p>
              <button
                className="primary press"
                onClick={() =>
                  void send(
                    `Ayúdame a entender ${study.title}. Empieza por una idea y un ejemplo, y después comprueba si lo he entendido.`,
                  )
                }
              >
                Empezar a entender
              </button>
            </div>
          )
        )}
      </div>
      <div className="composer-area">
        {messages.length > 0 && (
          <button
            className="jump-bottom press"
            data-visible={!atBottom}
            aria-hidden={atBottom || undefined}
            tabIndex={atBottom ? -1 : undefined}
            inert={atBottom || undefined}
            onClick={() => {
              const el = scroller.current;
              pinned.current = true;
              followed.current = null;
              setAtBottom(true);
              if (!el) return;
              // If the thread grows during the smooth scroll (a formula, the
              // AI status), finish exactly at the bottom when it ends.
              jumping.current = true;
              let done = false;
              const land = () => {
                if (done) return;
                done = true;
                el.removeEventListener("scrollend", land);
                jumping.current = false;
                follow();
              };
              el.addEventListener("scrollend", land);
              window.setTimeout(land, 700); // no scrollend (older Safari)
              el.scrollTo({
                top: el.scrollHeight,
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "auto"
                  : "smooth",
              });
            }}
          >
            <ArrowDown size={16} aria-hidden="true" />
            Ir al último mensaje
          </button>
        )}
        {waitBanner}
        {modeBanner}
        {errorBanner}
        {composer("dock")}
        <p className="ai-notice">{AI_NOTICE}</p>
        <span className="visually-hidden">
          {conversationId ? "Conversación guardada" : "Nueva conversación"}
        </span>
      </div>
    </section>
  );
}
