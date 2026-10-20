// Escena del objeto 3D (PR 6, §5.8). Este módulo y three viven en un trozo
// aparte que solo se pide con `import()` desde components/subject-object-live.tsx
// cuando el equipo lo merece (lib/subject-3d.ts). Gira despacio, se inclina
// hacia el puntero y se para con la pestaña oculta o fuera de pantalla. Al
// salir libera geometrías, materiales y el contexto WebGL.
import {
  DirectionalLight,
  HemisphereLight,
  NeutralToneMapping,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Object3D,
} from "three";
import type { SubjectObjectKey } from "@/lib/subject-objects";
import { MODEL_FOR_OBJECT, pointerTilt } from "@/lib/subject-models";
import {
  FALLBACK_PALETTE,
  buildModel,
  disposeTree,
  type ModelPalette,
} from "./models";

/** Vuelta completa en ~22 s: despacio, que no distraiga. */
const SPIN = 0.28;
/** Ángulo de partida: tres cuartos, se ve mejor el volumen. */
const START = -0.5;

function readPalette(el: Element): ModelPalette {
  const css = getComputedStyle(el);
  const read = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    blue: read("--pop-blue", FALLBACK_PALETTE.blue),
    yellow: read("--pop-yellow", FALLBACK_PALETTE.yellow),
    orange: read("--pop-orange", FALLBACK_PALETTE.orange),
    red: read("--pop-red", FALLBACK_PALETTE.red),
    purple: read("--pop-purple", FALLBACK_PALETTE.purple),
    green: read("--pop-green", FALLBACK_PALETTE.green),
    lime: read("--pop-lime", FALLBACK_PALETTE.lime),
  };
}

export interface MountOptions {
  /** Primer fotograma pintado: ya se puede esconder el icono. */
  onReady: () => void;
  /** WebGL se ha perdido: vuelve al icono. */
  onFail: () => void;
}

/** Monta el modelo en el lienzo y devuelve la función que lo desmonta. */
export function mountSubjectModel(
  canvas: HTMLCanvasElement,
  object: SubjectObjectKey,
  { onReady, onFail }: MountOptions,
): () => void {
  const key = MODEL_FOR_OBJECT[object];
  canvas.dataset.model = key;
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  const size = Math.max(canvas.clientWidth, canvas.clientHeight, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(size, size, false);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0, 4.2);
  camera.lookAt(0, 0, 0);

  scene.add(new HemisphereLight(0xffffff, 0xffe2c4, 1.5));
  const key1 = new DirectionalLight(0xffffff, 2.6);
  key1.position.set(-2, 3, 4);
  const rim = new DirectionalLight(0xc8d8ff, 1.4);
  rim.position.set(3, 1, -2);
  const fill = new DirectionalLight(0xffffff, 0.6);
  fill.position.set(2, -2, 3);
  scene.add(key1, rim, fill);

  const pivot: Object3D = buildModel(key, readPalette(canvas));
  scene.add(pivot);

  let raf = 0;
  let last = 0;
  let spin = START;
  let tiltX = 0;
  let tiltY = 0;
  let target = { x: 0, y: 0 };
  let onScreen = true;
  let lost = false;
  let first = true;

  const frame = (t: number) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    spin += dt * SPIN;
    const k = 1 - Math.exp(-dt * 4);
    tiltX += (target.x - tiltX) * k;
    tiltY += (target.y - tiltY) * k;
    pivot.rotation.set(0.12 + tiltX, spin + tiltY, 0);
    renderer.render(scene, camera);
    if (first) {
      first = false;
      onReady();
    }
    schedule();
  };
  const running = () => !document.hidden && onScreen && !lost;
  function schedule() {
    if (running()) {
      if (!raf) raf = requestAnimationFrame(frame);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }
  }

  const onPointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    target = pointerTilt(
      e.clientX - (r.left + r.width / 2),
      e.clientY - (r.top + r.height / 2),
      window.innerWidth,
      window.innerHeight,
    );
  };
  const onLeave = () => {
    target = { x: 0, y: 0 };
  };
  const onLost = () => {
    lost = true;
    schedule();
    onFail();
  };
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    schedule();
  });
  io.observe(canvas);
  window.addEventListener("pointermove", onPointer, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  document.addEventListener("visibilitychange", schedule);
  canvas.addEventListener("webglcontextlost", onLost);
  schedule();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    io.disconnect();
    window.removeEventListener("pointermove", onPointer);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    document.removeEventListener("visibilitychange", schedule);
    canvas.removeEventListener("webglcontextlost", onLost);
    disposeTree(scene);
    renderer.dispose();
    // Suelta ya el contexto: el navegador limita cuántos hay vivos.
    renderer.forceContextLoss();
  };
}
