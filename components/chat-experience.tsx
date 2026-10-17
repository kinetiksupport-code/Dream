"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDream } from "@/components/providers";
import { useConversations } from "@/components/shell";
import { DreamActivity } from "@/components/dream-mark";
import { BackIcon } from "@/components/icons";
import { Composer } from "@/components/composer";
import { MessageView } from "@/components/message";
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
import { shortcutPrompt, type ChatShortcutId } from "@/lib/chat-shortcuts";
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
  const { refresh, add, setWorkspaceEmpty, autoTitle } = useConversations();
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
  // El servidor ha dicho que el modo está agotado (antes de que llegue el uso).
  const [modeLimit, setModeLimit] = useState<{
    mode: AiModeId;
    resetAt: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [atBottom, setAtBottom] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
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
    setWorkspaceEmpty(!messages.length && !loading);
  }, [messages.length, loading, setWorkspaceEmpty]);
  const c = study?.conversationId ?? params.get("c");
  const fresh = study ? null : params.get("new");
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
    const key = c ?? fresh ?? "new";
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
    clearFiles();
    setError("");
    setMessages([]);
    setOlderOffset(null);
    pinned.current = true;
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
    callDream<{ items: Message[]; next_offset?: number | null }>(
      "messages",
      { conversation_id: c },
      controller.signal,
    )
      .then((r) => {
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
  }, [c, fresh, prefill, clearFiles]);
  useEffect(
    () => () => {
      abort.current?.abort();
      clearFiles();
    },
    [clearFiles],
  );
  useEffect(() => {
    if (!scroller.current) return;
    if (!messages.length && !busy) scroller.current.scrollTop = 0;
    else if (pinned.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages, state, loading, busy]);
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
    setMessages((s) => [
      ...s,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: r.assistant_message,
      },
    ]);
  }
  async function send(promptOverride?: string, shortcut?: ChatShortcutId) {
    if (
      lock.current ||
      loading ||
      filesRef.current.some((a) => a.status !== "ready") ||
      (!(promptOverride || value).trim() && !filesRef.current.length)
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setDailyLimit(false);
    setState("thinking");
    pinned.current = true;
    setAtBottom(true);
    const controller = new AbortController();
    abort.current = controller;
    const prompt =
      (promptOverride || value).trim() ||
      "Ayúdame a comprender estos archivos.";
    const selected = [...filesRef.current];
    const attachmentIds = selected.flatMap((a) => (a.id ? [a.id] : []));
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    setValue("");
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
    try {
      id = await ensureConversation();
      if (controller.signal.aborted) return;
      // Historial: name a «Nueva conversación» after its first question.
      if (firstTurn) autoTitle(id, prompt);
      clearFiles();
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
          ...(shortcut ? { shortcut } : {}),
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
                setMessages((s) =>
                  s.map((m) =>
                    m.id === assistantId ? { ...m, content: answer } : m,
                  ),
                );
              } else if (event.type === "activity") {
                setState(
                  event.activity === "searching" ? "searching" : "thinking",
                );
              } else if (event.type === "complete") setState("done");
            },
            controller.signal,
          );
        }
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
          setValue((current) => current || prompt);
        }
        const limit = limitOf(e);
        if (limit?.kind === "mode") {
          // Mode used up: say when it comes back and offer another mode.
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
      el?.focus();
      el?.setSelectionRange(text.length, text.length);
    });
  }, []);
  const view = params.get("view");
  if (view === "recent" || view === "tests") return <Recents />;
  const composer = (variant: "hero" | "dock") => (
    <Composer
      variant={variant}
      value={value}
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
      busy={busy}
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
        Has usado todo el modo {current?.label ?? "elegido"} por ahora. Vuelve a
        estar disponible a las {clockTime(new Date(spentAt).toISOString())}.
        {!alternative && " Los demás modos también están agotados."}
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
  ) : current && current.percent >= WARN_PERCENT && current.resets_at ? (
    <p className="mode-notice" role="status">
      Has usado el {current.percent} % del modo {current.label}. Se reinicia en{" "}
      {formatResetIn(Date.parse(current.resets_at) - Date.now())}.
    </p>
  ) : null;
  const errorBanner = (!serviceReady || error) && (
    <div className="chat-error" role="alert">
      <p>
        {error || "El servicio de IA aún no está configurado en el servidor."}
      </p>
      {dailyLimit && (
        <p>
          Mientras tanto puedes repasar tus <Link href="/notes">apuntes</Link>,
          ver tu <Link href="/progress">progreso</Link> o leer tu{" "}
          <Link href="/chat?view=recent">historial</Link>.
        </p>
      )}
      {error && !dailyLimit && conversationId && (
        <button
          className="secondary press"
          onClick={() => void reload()}
          disabled={busy}
        >
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
  if (!study && !loading && !messages.length)
    return (
      <section className="chat-view is-empty is-home">
        <ChatHome
          composer={composer("hero")}
          disabled={busy || loading}
          onShortcut={(s, detail) =>
            void send(shortcutPrompt(s.label, value.trim() || detail), s.id)
          }
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
  return (
    <section
      className={`chat-view ${messages.length ? "has-messages" : "is-empty"}`}
    >
      <div
        className="chat-scroll"
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (el) {
            pinned.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            setAtBottom(pinned.current);
          }
        }}
      >
        {loading ? (
          <div className="chat-loading">
            <DreamActivity state="thinking" label="Abriendo la conversación" />
          </div>
        ) : messages.length ? (
          <div className="message-thread">
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
                onContinue={focusComposer}
                key={m.id}
              />
            ))}
            {busy && last?.role !== "assistant" && (
              <DreamActivity state={state} />
            )}
          </div>
        ) : (
          study && (
            <div className="study-conversation-empty">
              <DreamActivity state="idle" label="Dream" />
              <h2>Una idea cada vez.</h2>
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
        {!atBottom && messages.length > 0 && (
          <button
            className="jump-bottom press"
            onClick={() => {
              pinned.current = true;
              setAtBottom(true);
              scroller.current?.scrollTo({
                top: scroller.current.scrollHeight,
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "auto"
                  : "smooth",
              });
            }}
          >
            <span className="jump-icon" aria-hidden="true">
              <BackIcon size={16} />
            </span>
            Volver al final
          </button>
        )}
        {waitBanner}
        {modeBanner}
        {errorBanner}
        {composer("dock")}
        <p className="composer-footnote">
          Dream puede equivocarse. Pregunta, compara y comprende.
        </p>
        <span className="visually-hidden">
          {conversationId ? "Conversación guardada" : "Nueva conversación"}
        </span>
      </div>
    </section>
  );
}
