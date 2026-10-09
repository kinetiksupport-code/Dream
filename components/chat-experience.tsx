"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown } from "lucide-react";
import { useDream } from "@/components/providers";
import { useConversations } from "@/components/shell";
import { DreamActivity } from "@/components/dream-mark";
import { Composer } from "@/components/composer";
import { MessageView } from "@/components/message";
import { ChatHome } from "@/components/chat-home";
import { Recents } from "@/components/recents";
import { FileCard } from "@/components/attachment";
import { callDream, streamDreamChat, errorMessage } from "@/lib/dream-api";
import { parseDreamContent } from "@/lib/widgets";
import { validateFile, toBase64 } from "@/lib/attachments";
import type {
  Conversation,
  Message,
  Attachment,
  DreamState,
} from "@/lib/types";
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
  const { refresh, add, setWorkspaceEmpty } = useConversations();
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
    setWorkspaceEmpty(!messages.length && !loading);
  }, [messages.length, loading, setWorkspaceEmpty]);
  const c = study?.conversationId ?? params.get("c");
  const fresh = study ? null : params.get("new");
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
    setValue("");
    setAnalysisView(false);
    clearFiles();
    setError("");
    setMessages([]);
    setOlderOffset(null);
    pinned.current = true;
    setAtBottom(true);
    if (!c) return;
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
  }, [c, fresh, clearFiles]);
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
  async function send(promptOverride?: string) {
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
    try {
      id = await ensureConversation();
      if (controller.signal.aborted) return;
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
        await streamDreamChat(
          {
            conversation_id: id,
            prompt,
            attachment_ids: attachmentIds,
            ...(study ? { exam_id: study.examId, unit_id: study.unitId } : {}),
          },
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
        if (
          parseDreamContent(answer).requestTest &&
          !parseDreamContent(answer).widgets.length
        )
          await generateTest(id, prompt, controller.signal);
      }
      if (abort.current === controller) setState("idle");
      void refresh();
    } catch (e) {
      if (abort.current !== controller) return;
      if (controller.signal.aborted) {
        setMessages((s) =>
          s.map((m) => (m.id === assistantId ? { ...m, stopped: true } : m)),
        );
        setState("idle");
      } else {
        setError(errorMessage(e));
        setState("error");
      }
    } finally {
      if (abort.current === controller) {
        setBusy(false);
        lock.current = false;
        abort.current = null;
      }
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
    document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
  }, []);
  const view = params.get("view");
  if (view === "recent" || view === "tests")
    return <Recents tests={view === "tests"} />;
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
            <DreamActivity state="thinking" />
          </div>
        ) : messages.length ? (
          <div className="message-thread">
            {olderOffset !== null && (
              <button
                className="secondary"
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
                state={busy && m.id === messages.at(-1)?.id ? state : "done"}
                onContinue={focusComposer}
                key={m.id}
              />
            ))}
            {busy && messages.at(-1)?.role !== "assistant" && (
              <DreamActivity state={state} />
            )}
            {busy && (
              <button
                className="secondary stop-response"
                onClick={() => abort.current?.abort()}
              >
                Detener
              </button>
            )}
          </div>
        ) : (
          <>
            {study ? (
              <div className="study-conversation-empty">
                <DreamActivity state="idle" />
                <h2>Una idea cada vez.</h2>
                <p>
                  Pregunta lo que necesites. Dream tiene tus temas y materiales
                  como referencia.
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    void send(
                      `Ayúdame a entender ${study.title}. Empieza por una idea y un ejemplo, y después comprueba si lo he entendido.`,
                    )
                  }
                >
                  Empezar a entender
                </button>
              </div>
            ) : (
              <ChatHome
                onPrompt={focusComposer}
                onAttach={() => {
                  setAnalysisView(true);
                  document
                    .querySelector<HTMLInputElement>(
                      ".composer input[type=file]",
                    )
                    ?.click();
                }}
              />
            )}
            {analysisView && attachments[0] && (
              <div className="home-file">
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
              </div>
            )}
          </>
        )}
      </div>
      <div className="composer-area">
        {!atBottom && messages.length > 0 && (
          <button
            className="jump-bottom"
            onClick={() => {
              pinned.current = true;
              setAtBottom(true);
              scroller.current?.scrollTo({
                top: scroller.current.scrollHeight,
                behavior: "smooth",
              });
            }}
          >
            <ArrowDown size={15} />
            Volver al final
          </button>
        )}
        {(!serviceReady || error) && (
          <div className="chat-error" role="alert">
            <div>
              <DreamActivity state="error" />
              <p>
                {error ||
                  "El servicio de IA aún no está configurado en el servidor."}
              </p>
            </div>
            {error && conversationId && (
              <button onClick={() => void reload()} disabled={busy}>
                Reintentar
              </button>
            )}
          </div>
        )}
        <Composer
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
        />
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
