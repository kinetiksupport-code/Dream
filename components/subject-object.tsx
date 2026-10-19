// Objeto 3D de la asignatura (PROMPT_EXAMEN_ESTILO.md §5.8), en esta tanda
// como icono 3D estático: Microsoft Fluent Emoji 3D (MIT), WebP de 96 y
// 192 px con tamaño fijo para no mover el layout. Flota despacio (solo
// transform); con movimiento reducido se queda quieto. En escritorio, el
// asistente y el detalle usan <LiveSubjectObject> (subject-object-live.tsx),
// que pinta encima el modelo 3D real cuando está listo (PR 6).
import type { CSSProperties, ReactNode } from "react";
import {
  OBJECT_LABEL,
  objectSrc,
  subjectObject,
  type SubjectObjectKey,
} from "@/lib/subject-objects";

export function SubjectObject({
  subject,
  object,
  size = 48,
  float = true,
  label = false,
  className,
  style,
  live,
  children,
}: {
  subject?: string | null;
  /** Fuerza un objeto concreto (decoración). */
  object?: SubjectObjectKey;
  /** Lado en px CSS. */
  size?: number;
  float?: boolean;
  /** Con texto alternativo; por defecto es decorativo (el nombre ya se lee). */
  label?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Estado del modelo 3D (solo LiveSubjectObject); con «ready» se oculta el icono. */
  live?: "static" | "loading" | "ready" | "failed";
  /** El lienzo 3D, encima del icono. */
  children?: ReactNode;
}) {
  const key = object ?? subjectObject(subject);
  return (
    <span
      className={["subject-object", float && "subject-object-float", className]
        .filter(Boolean)
        .join(" ")}
      style={{ width: size, height: size, ...style }}
      data-object={key}
      data-3d={live}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static WebP with fixed sizes; next/image would add JS for nothing */}
      <img
        src={objectSrc(key, size <= 48 ? 96 : 192)}
        srcSet={`${objectSrc(key, 96)} 96w, ${objectSrc(key, 192)} 192w`}
        sizes={`${size}px`}
        width={size}
        height={size}
        alt={label ? OBJECT_LABEL[key] : ""}
        decoding="async"
        draggable={false}
      />
      {children}
    </span>
  );
}
