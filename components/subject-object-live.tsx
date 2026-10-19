"use client";
// Objeto de la asignatura con modelo 3D real en escritorio (PR 6, §5.8).
// Siempre pinta primero el icono estático (mismo tamaño fijo: no mueve el
// layout). Solo si el equipo lo merece (lib/subject-3d.ts: escritorio con
// puntero fino, sin movimiento reducido, sin ahorro de datos, equipo no justo
// y WebGL 2) pide con import() el trozo de three y monta el lienzo encima; el
// icono se esconde cuando el primer fotograma está pintado. Si la carga
// falla o WebGL se pierde, vuelve al icono. Al desmontar libera todo.
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { hasWebGL2, readDevice, wants3D } from "@/lib/subject-3d";
import { subjectObject } from "@/lib/subject-objects";
import { SubjectObject } from "./subject-object";

type State = "static" | "loading" | "ready" | "failed";

export function LiveSubjectObject(
  props: Omit<ComponentProps<typeof SubjectObject>, "live" | "children">,
) {
  // El modelo se elige dentro del trozo 3D (lib/subject-models.ts).
  const object = props.object ?? subjectObject(props.subject);
  const [state, setState] = useState<State>("static");
  const canvas = useRef<HTMLCanvasElement>(null);

  // 1) ¿Lo merece este equipo? Si no, ni se pide el trozo 3D.
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    setWanted(wants3D(readDevice(window)) && hasWebGL2(document));
  }, []);

  // 2) Con el lienzo ya montado, carga three y pinta el modelo.
  const active = wanted && state !== "failed";
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const fail = () => {
      dispose?.();
      dispose = undefined;
      if (!cancelled) setState("failed");
    };
    setState("loading");
    import("./subject-3d/scene")
      .then(({ mountSubjectModel }) => {
        if (cancelled) return;
        if (!canvas.current) return fail();
        dispose = mountSubjectModel(canvas.current, object, {
          onReady: () => {
            if (!cancelled) setState("ready");
          },
          onFail: fail,
        });
      })
      .catch(fail);
    return () => {
      cancelled = true;
      dispose?.();
      dispose = undefined;
    };
  }, [active, object]);

  return (
    <SubjectObject {...props} live={state}>
      {active && (
        <canvas
          // Un lienzo nuevo por objeto: el anterior perdió su contexto al liberarlo.
          key={object}
          ref={canvas}
          className="subject-object-canvas"
          aria-hidden="true"
        />
      )}
    </SubjectObject>
  );
}
