"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon } from "./icons";
import { fileAccept } from "@/lib/attachments";
import { setPendingFiles } from "@/lib/pending-files";

/**
 * "Hacer foto" / "Subir archivo": picks files here and hands them (in memory)
 * to a new chat, where the existing upload flow validates and sends them.
 */
export function UploadButtons({
  camera = true,
  uploadLabel = "Subir archivo",
  uploadClassName = "secondary",
}: {
  camera?: boolean;
  uploadLabel?: string;
  uploadClassName?: string;
}) {
  const router = useRouter();
  const photo = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  function handOff(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setPendingFiles(list);
    router.push(`/chat?new=${Date.now()}`);
  }
  return (
    <div className="button-row">
      {camera && (
        <>
          <button
            type="button"
            className="primary press"
            onClick={() => photo.current?.click()}
          >
            <CameraIcon />
            Hacer foto
          </button>
          <input
            ref={photo}
            className="visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => handOff(e.target.files)}
          />
        </>
      )}
      <button
        type="button"
        className={`${uploadClassName} press`}
        onClick={() => file.current?.click()}
      >
        {uploadLabel}
      </button>
      <input
        ref={file}
        className="visually-hidden"
        type="file"
        accept={fileAccept}
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => handOff(e.target.files)}
      />
    </div>
  );
}
