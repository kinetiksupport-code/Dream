// Modelos 3D de las asignaturas, construidos por código (PR 6, §5.8).
// Sin archivos descargados: formas redondeadas de three con un plástico
// brillante (clearcoat). Los colores salen de los tokens de app/globals.css
// (--pop-*), leídos en el navegador; aquí solo hay neutros y valores de
// reserva por si un token falta. Licencia: código propio del proyecto
// (docs/ASSETS_LICENCIAS.md).
import {
  Box3,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  type BufferGeometry,
  type Material,
  type Object3D,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import type { SubjectModelKey } from "@/lib/subject-models";

export interface ModelPalette {
  blue: string;
  yellow: string;
  orange: string;
  red: string;
  purple: string;
  green: string;
  lime: string;
}

/** Valores de reserva: los mismos que los tokens --pop-* en modo claro. */
export const FALLBACK_PALETTE: ModelPalette = {
  blue: "#1e40d8",
  yellow: "#ffc21a",
  orange: "#f05a1e",
  red: "#d42a1f",
  purple: "#6d3ae0",
  green: "#17803f",
  lime: "#c8f560",
};

// Neutros del plástico (no son colores de interfaz, no llevan token).
const WHITE = "#f4f6fb";
const CREAM = "#fff1cf";
const GREY = "#c4cbd8";
const INK = "#1c2236";
const SEA = "#2f9bff";

const PI = Math.PI;

type Paint = (color: string) => Material;

function makePaint(): Paint {
  const cache = new Map<string, Material>();
  return (color) => {
    let m = cache.get(color);
    if (!m) {
      m = new MeshPhysicalMaterial({
        color,
        roughness: 0.34,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.14,
      });
      cache.set(color, m);
    }
    return m;
  };
}

function glass(color: string): Material {
  return new MeshPhysicalMaterial({
    color,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: DoubleSide,
  });
}

function mesh(
  geometry: BufferGeometry,
  material: Material,
  x = 0,
  y = 0,
  z = 0,
): Mesh {
  const m = new Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

/** Caja con todas las aristas redondeadas (extrusión con bisel). */
function roundedBox(
  w: number,
  h: number,
  d: number,
  material: Material,
  bevel = Math.min(w, h, d) * 0.3,
  corner = bevel,
): Mesh {
  const iw = Math.max(w - 2 * bevel, 0.001);
  const ih = Math.max(h - 2 * bevel, 0.001);
  const r = Math.min(corner, iw / 2, ih / 2);
  const x = -iw / 2;
  const y = -ih / 2;
  const s = new Shape()
    .moveTo(x + r, y)
    .lineTo(x + iw - r, y)
    .quadraticCurveTo(x + iw, y, x + iw, y + r)
    .lineTo(x + iw, y + ih - r)
    .quadraticCurveTo(x + iw, y + ih, x + iw - r, y + ih)
    .lineTo(x + r, y + ih)
    .quadraticCurveTo(x, y + ih, x, y + ih - r)
    .lineTo(x, y + r)
    .quadraticCurveTo(x, y, x + r, y);
  const g = new ExtrudeGeometry(s, {
    depth: Math.max(d - 2 * bevel, 0.001),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 6,
  }).center();
  return new Mesh(g, material);
}

const sphere = (r: number) => new SphereGeometry(r, 32, 20);
const cylinder = (rt: number, rb: number, h: number) =>
  new CylinderGeometry(rt, rb, h, 32);

function at<T extends Object3D>(o: T, x: number, y: number, z = 0): T {
  o.position.set(x, y, z);
  return o;
}
function turn<T extends Object3D>(o: T, x: number, y: number, z: number): T {
  o.rotation.set(x, y, z);
  return o;
}

type Builder = (p: ModelPalette, paint: Paint) => Object3D;

const BUILDERS: Record<SubjectModelKey, Builder> = {
  calculator(p, paint) {
    const g = new Group();
    // Naranja: destaca sobre el azul de la pantalla del asistente.
    g.add(roundedBox(1.3, 1.8, 0.32, paint(p.orange), 0.1, 0.12));
    g.add(at(roundedBox(1.02, 0.42, 0.06, paint(p.lime), 0.025), 0, 0.56, 0.16));
    const cols = [-0.36, -0.12, 0.12, 0.36];
    const rows = [0.1, -0.15, -0.4, -0.65];
    rows.forEach((y, r) =>
      cols.forEach((x, c) => {
        const color =
          r === 3 && c === 3
            ? p.red
            : c === 3
              ? p.blue
              : r === 0
                ? p.yellow
                : WHITE;
        g.add(at(roundedBox(0.19, 0.17, 0.09, paint(color), 0.035), x, y, 0.17));
      }),
    );
    return turn(g, -0.12, 0, 0);
  },

  globe(p, paint) {
    const g = new Group();
    const earth = new Group();
    // Mar azul cielo: el azul de marca se fundiría con el fondo del asistente.
    const sea = paint(SEA);
    earth.add(mesh(sphere(0.75), sea));
    const land = paint(p.green);
    const spots: [number, number, number, number][] = [
      [0.3, 0.5, 0.8, 0.3],
      [-0.5, 0.2, 0.7, 0.26],
      [0.6, -0.3, 0.5, 0.24],
      [-0.2, -0.55, 0.7, 0.22],
      [0.1, 0.1, -1, 0.3],
      [-0.7, 0.4, -0.4, 0.2],
      [0.6, 0.6, -0.4, 0.18],
    ];
    for (const [x, y, z, s] of spots) {
      const dir = new Vector3(x, y, z).normalize();
      const blob = mesh(sphere(1), land);
      blob.scale.set(s, s * 0.72, 0.09);
      blob.position.set(dir.x * 0.71, dir.y * 0.71, dir.z * 0.71);
      blob.lookAt(dir.clone().multiplyScalar(2));
      earth.add(blob);
    }
    earth.rotation.set(0, 0, 0.35);
    g.add(earth);
    g.add(turn(mesh(new TorusGeometry(0.88, 0.04, 16, 64, PI * 1.25), paint(p.yellow)), 0, PI / 2, PI / 2 + 0.35 - PI * 0.125));
    g.add(at(mesh(cylinder(0.06, 0.08, 0.3), paint(p.yellow)), 0, -0.98));
    g.add(at(mesh(cylinder(0.42, 0.48, 0.14), paint(p.orange)), 0, -1.15));
    return g;
  },

  book(p, paint) {
    const g = new Group();
    const cover = paint(p.red);
    g.add(at(roundedBox(1.2, 1.6, 0.09, cover, 0.035), 0.02, 0, 0.17));
    g.add(at(roundedBox(1.2, 1.6, 0.09, cover, 0.035), 0.02, 0, -0.17));
    g.add(at(roundedBox(0.16, 1.6, 0.43, cover, 0.06), -0.56, 0));
    g.add(at(roundedBox(1.08, 1.48, 0.27, paint(CREAM), 0.03), 0.06, 0));
    g.add(at(roundedBox(0.66, 0.26, 0.03, paint(p.yellow), 0.012), 0.06, 0.32, 0.225));
    g.add(at(roundedBox(0.1, 0.4, 0.02, paint(p.yellow), 0.01), 0.3, -0.95, 0.05));
    return turn(g, 0.1, -0.35, 0.08);
  },

  brush(p, paint) {
    const g = new Group();
    g.add(at(mesh(new CapsuleGeometry(0.09, 1.2, 8, 24), paint(p.yellow)), 0, -0.3));
    g.add(at(mesh(cylinder(0.12, 0.1, 0.32), paint(GREY)), 0, 0.42));
    const tip = [
      new Vector2(0, 0),
      new Vector2(0.13, 0),
      new Vector2(0.17, 0.14),
      new Vector2(0.15, 0.34),
      new Vector2(0.08, 0.52),
      new Vector2(0, 0.6),
    ];
    g.add(at(mesh(new LatheGeometry(tip, 32), paint(p.purple)), 0, 0.57));
    return turn(g, 0, 0, -0.7);
  },

  scroll(p, paint) {
    const g = new Group();
    const paper = paint(CREAM);
    g.add(turn(mesh(cylinder(0.26, 0.26, 1.3), paper), 0, 0, PI / 2));
    g.add(at(turn(roundedBox(1.18, 0.95, 0.05, paper, 0.02), -0.12, 0, 0), 0, -0.5, 0.2));
    for (const x of [-0.75, 0.75]) {
      g.add(at(turn(mesh(cylinder(0.11, 0.11, 0.2), paint(p.orange)), 0, 0, PI / 2), x, 0));
      g.add(at(mesh(sphere(0.12), paint(p.orange)), x * 1.17, 0));
    }
    g.add(turn(mesh(new TorusGeometry(0.28, 0.05, 16, 48), paint(p.red)), 0, PI / 2, 0));
    return turn(g, 0.15, 0, 0);
  },

  atom(p, paint) {
    const g = new Group();
    const nucleus: [number, number, number, string][] = [
      [0, 0, 0.12, p.orange],
      [0.15, 0.08, 0, p.red],
      [-0.14, 0.07, 0.02, p.red],
      [0.02, -0.15, 0.02, p.orange],
      [0, 0.04, -0.15, p.orange],
    ];
    for (const [x, y, z, c] of nucleus) g.add(at(mesh(sphere(0.16), paint(c)), x, y, z));
    for (let i = 0; i < 3; i++) {
      const orbit = new Group();
      const ring = mesh(new TorusGeometry(0.9, 0.035, 12, 96), paint(p.blue));
      ring.scale.set(1, 0.36, 1);
      orbit.add(ring);
      const t = 0.6 + i * 2.1;
      orbit.add(at(mesh(sphere(0.09), paint(p.yellow)), 0.9 * Math.cos(t), 0.9 * 0.36 * Math.sin(t)));
      orbit.rotation.set(0, 0, (i * PI) / 3);
      g.add(orbit);
    }
    return turn(g, 0.35, 0, 0);
  },

  flask(p, paint) {
    const g = new Group();
    const outer = [
      new Vector2(0, -0.8),
      new Vector2(0.62, -0.8),
      new Vector2(0.72, -0.74),
      new Vector2(0.72, -0.62),
      new Vector2(0.26, 0.3),
      new Vector2(0.21, 0.42),
      new Vector2(0.21, 0.82),
    ];
    g.add(mesh(new LatheGeometry(outer, 48), glass(WHITE)));
    const liquid = [
      new Vector2(0, -0.76),
      new Vector2(0.6, -0.76),
      new Vector2(0.68, -0.7),
      new Vector2(0.68, -0.6),
      new Vector2(0.43, -0.08),
      new Vector2(0, -0.08),
    ];
    g.add(mesh(new LatheGeometry(liquid, 48), paint(p.purple)));
    g.add(at(turn(mesh(new TorusGeometry(0.23, 0.045, 12, 48), paint(GREY)), PI / 2, 0, 0), 0, 0.82));
    g.add(at(mesh(sphere(0.07), paint(p.lime)), 0.12, 0.08, 0.05));
    g.add(at(mesh(sphere(0.05), paint(p.lime)), -0.06, 0.24, 0.02));
    return g;
  },

  microscope(p, paint) {
    const g = new Group();
    const body = paint(p.purple);
    g.add(at(roundedBox(1.15, 0.18, 0.75, body, 0.06), 0.05, -0.92));
    g.add(at(roundedBox(0.22, 0.75, 0.26, body, 0.07), -0.38, -0.5));
    g.add(at(turn(mesh(new TorusGeometry(0.42, 0.11, 16, 48, PI * 0.75), body), 0, 0, -PI * 0.15), -0.12, -0.1));
    g.add(at(roundedBox(0.72, 0.08, 0.6, paint(INK), 0.03), 0.15, -0.38));
    const tube = new Group();
    tube.add(mesh(cylinder(0.14, 0.14, 0.95), paint(WHITE)));
    tube.add(at(mesh(cylinder(0.1, 0.1, 0.22), paint(INK)), 0, 0.56));
    tube.add(at(mesh(cylinder(0.07, 0.09, 0.2), paint(GREY)), 0, -0.56));
    g.add(at(turn(tube, 0, 0, -0.4), 0.18, 0.28));
    g.add(at(turn(mesh(cylinder(0.15, 0.15, 0.12), paint(p.yellow)), PI / 2, 0, 0), -0.38, -0.35, 0.18));
    return turn(g, 0, 0.5, 0);
  },

  speech(p, paint) {
    const g = new Group();
    g.add(roundedBox(1.7, 1.15, 0.34, paint(WHITE), 0.12, 0.42));
    g.add(at(turn(mesh(new ConeGeometry(0.2, 0.5, 32), paint(WHITE)), 0, 0, PI - 0.5), -0.42, -0.7));
    for (const x of [-0.42, 0, 0.42]) g.add(at(mesh(sphere(0.11), paint(p.blue)), x, 0, 0.19));
    return g;
  },

  bulb(p, paint) {
    const g = new Group();
    g.add(
      at(
        mesh(
          sphere(0.6),
          new MeshPhysicalMaterial({
            color: p.yellow,
            emissive: p.yellow,
            emissiveIntensity: 0.28,
            roughness: 0.2,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
          }),
        ),
        0,
        0.28,
      ),
    );
    g.add(at(mesh(cylinder(0.36, 0.27, 0.36), paint(p.yellow)), 0, -0.3));
    g.add(at(mesh(cylinder(0.27, 0.25, 0.36), paint(GREY)), 0, -0.62));
    for (const y of [-0.5, -0.61, -0.72])
      g.add(at(turn(mesh(new TorusGeometry(0.265, 0.035, 12, 48), paint(GREY)), PI / 2, 0, 0), 0, y));
    g.add(at(mesh(sphere(0.11), paint(INK)), 0, -0.83));
    return g;
  },

  note(p, paint) {
    const g = new Group();
    const ink = paint(p.purple);
    for (const [x, y] of [
      [-0.45, -0.6],
      [0.45, -0.45],
    ] as const) {
      const head = at(mesh(sphere(0.27), ink), x, y);
      head.scale.set(1.25, 0.9, 0.75);
      head.rotation.set(0, 0, 0.4);
      g.add(head);
    }
    g.add(at(mesh(cylinder(0.055, 0.055, 1.15), ink), -0.17, 0.02));
    g.add(at(mesh(cylinder(0.055, 0.055, 1.15), ink), 0.73, 0.17));
    g.add(at(turn(roundedBox(1.02, 0.2, 0.14, ink, 0.05), 0, 0, 0.165), 0.28, 0.62));
    return g;
  },

  laptop(p, paint) {
    const g = new Group();
    const shell = paint(GREY);
    g.add(at(roundedBox(1.7, 0.1, 1.15, shell, 0.04), 0, -0.45));
    g.add(at(roundedBox(1.42, 0.03, 0.55, paint(INK), 0.012), 0, -0.39, -0.12));
    g.add(at(roundedBox(0.48, 0.03, 0.26, paint(WHITE), 0.012), 0, -0.39, 0.33));
    const lid = new Group();
    lid.add(at(roundedBox(1.7, 1.1, 0.07, shell, 0.03), 0, 0.55));
    lid.add(at(roundedBox(1.52, 0.92, 0.02, paint(p.blue), 0.008), 0, 0.56, 0.04));
    lid.add(at(roundedBox(0.7, 0.1, 0.02, paint(p.lime), 0.01), -0.2, 0.7, 0.055));
    lid.add(at(roundedBox(0.45, 0.1, 0.02, paint(p.yellow), 0.01), -0.32, 0.5, 0.055));
    g.add(at(turn(lid, -0.22, 0, 0), 0, -0.42, -0.55));
    return turn(g, 0.25, -0.3, 0);
  },

  coin(p, paint) {
    const g = new Group();
    const gold = paint(p.yellow);
    const rim = paint(p.orange);
    const face = new Group();
    face.add(turn(mesh(cylinder(0.62, 0.62, 0.14), gold), PI / 2, 0, 0));
    face.add(mesh(new TorusGeometry(0.6, 0.06, 16, 64), rim));
    face.add(at(turn(mesh(cylinder(0.36, 0.36, 0.04), rim), PI / 2, 0, 0), 0, 0, 0.07));
    g.add(at(face, 0.2, 0.18, 0.1));
    for (const [y, x] of [
      [-0.72, -0.35],
      [-0.58, -0.32],
      [-0.44, -0.38],
    ] as const) {
      g.add(at(mesh(cylinder(0.5, 0.5, 0.13), gold), x, y, -0.2));
      g.add(at(turn(mesh(new TorusGeometry(0.5, 0.05, 12, 64), rim), PI / 2, 0, 0), x, y, -0.2));
    }
    return turn(g, 0.05, -0.25, 0);
  },

  ball(_p, paint) {
    const g = new Group();
    g.add(mesh(sphere(0.8), paint(WHITE)));
    const patch = paint(INK);
    const phi = (1 + Math.sqrt(5)) / 2;
    const dirs: [number, number, number][] = [];
    for (const a of [-1, 1])
      for (const b of [-phi, phi]) dirs.push([0, a, b], [a, b, 0], [b, 0, a]);
    for (const [x, y, z] of dirs) {
      const d = new Vector3(x, y, z).normalize();
      const holder = new Group();
      // Casquete pentagonal pegado a la esfera (5 segmentos = pentágono).
      holder.add(turn(mesh(new SphereGeometry(0.826, 5, 3, 0, PI * 2, 0, 0.34), patch), PI / 2, 0, 0));
      holder.lookAt(d.clone().multiplyScalar(2));
      g.add(holder);
    }
    return g;
  },

  cap(p, paint) {
    const g = new Group();
    const cloth = paint(INK);
    g.add(at(mesh(cylinder(0.52, 0.58, 0.45), cloth), 0, -0.26));
    const board = new Group();
    board.add(roundedBox(1.7, 0.1, 1.7, cloth, 0.035));
    board.add(at(mesh(sphere(0.08), paint(p.yellow)), 0, 0.07));
    board.rotation.set(0, PI / 4, 0);
    g.add(board);
    g.add(at(turn(mesh(cylinder(0.025, 0.025, 0.86), paint(p.yellow)), 0, 0, PI / 2), 0.43, 0.075));
    g.add(at(mesh(cylinder(0.025, 0.025, 0.5), paint(p.yellow)), 0.86, -0.17));
    g.add(at(mesh(new CapsuleGeometry(0.07, 0.18, 6, 16), paint(p.yellow)), 0.86, -0.52));
    return turn(g, 0.3, 0, 0);
  },
};

/**
 * Construye el modelo, centrado y escalado para caber en una esfera de
 * radio ~0,9 (así todos ocupan lo mismo en el lienzo).
 */
export function buildModel(key: SubjectModelKey, palette: ModelPalette): Object3D {
  const inner = BUILDERS[key](palette, makePaint());
  const holder = new Group();
  holder.add(inner);
  holder.updateMatrixWorld(true);
  const box = new Box3().setFromObject(holder);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const scale = 1.75 / Math.max(size.x, size.y, size.z, 0.001);
  inner.position.set(
    inner.position.x - center.x,
    inner.position.y - center.y,
    inner.position.z - center.z,
  );
  holder.scale.set(scale, scale, scale);
  return holder;
}

/** Libera geometrías y materiales (cada material una sola vez). */
export function disposeTree(root: Object3D): void {
  const materials = new Set<Material>();
  root.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      materials.add(o.material);
    }
  });
  materials.forEach((m) => m.dispose());
}
