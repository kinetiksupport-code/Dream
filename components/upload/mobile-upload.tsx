"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DrawnTick } from "../drawn-tick";
import { Orb } from "@/components/orb";
import { AlertIcon, CameraIcon, UploadIcon } from "@/components/icons";
import { fileAccept } from "@/lib/attachments";
import {
  UploadQrError,
  isInvalidLink,
  qrConnect,
  qrUploadFile,
  readDeviceKey,
  saveDeviceKey,
  takeTokenFromLocation,
  tokenLooksValid,
} from "@/lib/upload-qr";
import styles from "./upload.module.css";

type Phase = "connecting" | "ready" | "invalid" | "offline";
interface Item {
  id: number;
  name: string;
  file: File;
  status: "queued" | "processing" | "done" | "error";
  message?: string;
}

const countText = (n: number, max: number) =>
  n === 1
    ? `Has subido 1 archivo de ${max}`
    : `Has subido ${n} archivos de ${max}`;

/**
 * /subir#<token>: the phone side of "upload from your phone". No menu, no
 * account data, no analytics. It only connects and uploads to the exam
 * the computer opened; any problem with the code shows one friendly page.
 */
export function MobileUpload() {
  // null until read from the fragment on the phone (never sent to a server).
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [items, setItems] = useState<Item[]>([]);
  const [uploads, setUploads] = useState(0);
  const [maxUploads, setMaxUploads] = useState(10);
  const [notice, setNotice] = useState("");
  const device = useRef<string | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const nextId = useRef(1);
  const photo = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const read = () => setToken(takeTokenFromLocation());
    read();
    // Scanning another code in the same tab only changes the fragment.
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const connect = useCallback(async () => {
    if (token === null) return;
    setPhase("connecting");
    setItems([]); // a new code starts a new list
    setUploads(0);
    if (!tokenLooksValid(token)) return setPhase("invalid");
    try {
      const c = await qrConnect(token, readDeviceKey(token));
      device.current = c.deviceKey;
      saveDeviceKey(token, c.deviceKey);
      setUploads(c.uploads);
      setMaxUploads(c.maxUploads);
      setPhase("ready");
    } catch (error) {
      if (isInvalidLink(error)) setPhase("invalid");
      else {
        setNotice(
          error instanceof UploadQrError && error.message
            ? error.message
            : "No se pudo conectar. Vuelve a probar.",
        );
        setPhase("offline");
      }
    }
  }, [token]);

  useEffect(() => {
    void connect();
  }, [connect]);
  useEffect(() => {
    if (phase !== "connecting") title.current?.focus();
  }, [phase]);

  const patch = (id: number, change: Partial<Item>) =>
    setItems((list) =>
      list.map((i) => (i.id === id ? { ...i, ...change } : i)),
    );

  const upload = useCallback(
    (item: Item) => {
      // One file at a time: photos taken in a row wait their turn.
      queue.current = queue.current.then(async () => {
        if (!device.current || !token) return;
        patch(item.id, { status: "processing" });
        try {
          const r = await qrUploadFile(token, device.current, item.file);
          setUploads(r.uploads);
          setMaxUploads(r.maxUploads);
          patch(item.id, { status: "done", message: undefined });
        } catch (error) {
          if (isInvalidLink(error)) return setPhase("invalid");
          patch(item.id, {
            status: "error",
            message:
              error instanceof Error && error.message
                ? error.message
                : "No se pudo subir. Inténtalo de nuevo.",
          });
        }
      });
    },
    [token],
  );

  function add(files: FileList | null) {
    const list = Array.from(files ?? []);
    const fresh = list.map<Item>((file) => ({
      id: nextId.current++,
      name: file.name || "Foto",
      file,
      status: "queued",
    }));
    if (!fresh.length) return;
    const newestFirst = [...fresh].reverse();
    setItems((current) => [...newestFirst, ...current]);
    fresh.forEach(upload);
  }

  if (phase === "invalid")
    return (
      <main className={styles.page}>
        <div className={styles.center}>
          <Orb size={56} />
          <h1 ref={title} tabIndex={-1} className={styles.title}>
            Este código ya no vale
          </h1>
          <p className={styles.lead}>
            Vuelve a tu ordenador y escanea el código que aparece allí. Si ya
            has terminado, puedes cerrar esta página.
          </p>
        </div>
      </main>
    );

  if (phase === "connecting")
    return (
      <main className={styles.page} aria-busy="true">
        <div className={styles.center} role="status">
          <Orb size={56} pulsing />
          <p className={styles.lead}>Conectando con tu ordenador…</p>
        </div>
      </main>
    );

  if (phase === "offline")
    return (
      <main className={styles.page}>
        <div className={styles.center}>
          <Orb size={56} />
          <h1 ref={title} tabIndex={-1} className={styles.title}>
            No hay conexión
          </h1>
          <p className={styles.lead} role="alert">
            {notice}
          </p>
          <button
            type="button"
            className={`primary press ${styles.wide}`}
            onClick={() => void connect()}
          >
            Volver a probar
          </button>
        </div>
      </main>
    );

  const done = items.filter((i) => i.status === "done").length;
  const full = uploads >= maxUploads;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.badge} aria-hidden="true">
          <Orb size={48} />
          <DrawnTick className={styles.badgeTick} delay={220} />
        </span>
        <h1 ref={title} tabIndex={-1} className={`${styles.title} rise`}>
          Conectado con tu ordenador
        </h1>
        <p className={`${styles.lead} rise rise-1`}>
          Lo que subas aparece en tu ordenador al momento.
        </p>
      </header>

      <div className={`${styles.actions} rise rise-2`}>
        <button
          type="button"
          className={`primary press ${styles.big}`}
          disabled={full}
          onClick={() => photo.current?.click()}
        >
          <CameraIcon />
          Hacer foto
        </button>
        <button
          type="button"
          className={`secondary press ${styles.big}`}
          disabled={full}
          onClick={() => picker.current?.click()}
        >
          <UploadIcon />
          {done ? "Subir otro" : "Subir archivo"}
        </button>
        <input
          ref={photo}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={picker}
          className="visually-hidden"
          type="file"
          accept={fileAccept}
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <p className={styles.count} role="status" aria-live="polite">
        {full
          ? "Has llegado al máximo de archivos. Sigue en tu ordenador."
          : uploads
            ? countText(uploads, maxUploads)
            : ""}
      </p>

      {items.length > 0 && (
        <ul className={styles.list} aria-label="Archivos de esta sesión">
          {items.map((item) => (
            <li key={item.id} className={styles.row} data-status={item.status}>
              <span className={styles.rowIcon} aria-hidden="true">
                {item.status === "processing" || item.status === "queued" ? (
                  <Orb size={24} pulsing={item.status === "processing"} />
                ) : item.status === "done" ? (
                  <DrawnTick className={styles.tick} />
                ) : (
                  <AlertIcon />
                )}
              </span>
              <span className={styles.rowText}>
                <strong>{item.name}</strong>
                <small>
                  {item.status === "processing"
                    ? "Procesando archivo…"
                    : item.status === "queued"
                      ? "En espera…"
                      : item.status === "done"
                        ? "Listo. Ya está en tu ordenador."
                        : item.message}
                </small>
              </span>
              {item.status === "error" && !full && (
                <button
                  type="button"
                  className="text-button press"
                  onClick={() => {
                    patch(item.id, { status: "queued" });
                    upload(item);
                  }}
                >
                  Reintentar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className={styles.private}>
        Este código es solo para ti y caduca. No lo compartas y no subas datos
        de otras personas.
      </p>
    </main>
  );
}
