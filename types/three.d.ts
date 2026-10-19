// Tipos mínimos de `three` 0.170 para lo que usa components/subject-3d.
// three no trae tipos propios y @types/three no está aprobado como
// dependencia (PR 6): si se aprueba, borra este archivo e instala
// `npm install --save-exact --save-dev @types/three@0.170.0`.
// Solo declara lo que usamos; si necesitas algo más de three, añádelo aquí
// copiando la firma de la documentación oficial.
declare module "three" {
  export class Vector2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
  }
  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    clone(): Vector3;
    normalize(): this;
    multiplyScalar(s: number): this;
    sub(v: Vector3): this;
  }
  export class Euler {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
  }
  export class Color {
    constructor(color?: string | number);
    set(color: string | number): this;
    multiplyScalar(s: number): this;
    lerp(color: Color, alpha: number): this;
    clone(): Color;
  }
  export type ColorRepresentation = Color | string | number;

  export class BufferGeometry {
    center(): this;
    dispose(): void;
  }
  export class SphereGeometry extends BufferGeometry {
    constructor(
      radius?: number,
      widthSegments?: number,
      heightSegments?: number,
      phiStart?: number,
      phiLength?: number,
      thetaStart?: number,
      thetaLength?: number,
    );
  }
  export class CylinderGeometry extends BufferGeometry {
    constructor(
      radiusTop?: number,
      radiusBottom?: number,
      height?: number,
      radialSegments?: number,
      heightSegments?: number,
      openEnded?: boolean,
    );
  }
  export class ConeGeometry extends BufferGeometry {
    constructor(radius?: number, height?: number, radialSegments?: number);
  }
  export class CapsuleGeometry extends BufferGeometry {
    constructor(
      radius?: number,
      length?: number,
      capSegments?: number,
      radialSegments?: number,
    );
  }
  export class TorusGeometry extends BufferGeometry {
    constructor(
      radius?: number,
      tube?: number,
      radialSegments?: number,
      tubularSegments?: number,
      arc?: number,
    );
  }
  export class LatheGeometry extends BufferGeometry {
    constructor(points?: Vector2[], segments?: number);
  }
  export class Shape {
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    quadraticCurveTo(cpX: number, cpY: number, x: number, y: number): this;
  }
  export interface ExtrudeGeometryOptions {
    depth?: number;
    bevelEnabled?: boolean;
    bevelThickness?: number;
    bevelSize?: number;
    bevelOffset?: number;
    bevelSegments?: number;
    curveSegments?: number;
  }
  export class ExtrudeGeometry extends BufferGeometry {
    constructor(shapes?: Shape | Shape[], options?: ExtrudeGeometryOptions);
  }

  export const FrontSide: 0;
  export const DoubleSide: 2;
  export type Side = 0 | 1 | 2;

  export class Material {
    transparent: boolean;
    opacity: number;
    depthWrite: boolean;
    side: Side;
    dispose(): void;
  }
  export interface MeshPhysicalMaterialParameters {
    color?: ColorRepresentation;
    emissive?: ColorRepresentation;
    emissiveIntensity?: number;
    roughness?: number;
    metalness?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
    sheen?: number;
    transparent?: boolean;
    opacity?: number;
    depthWrite?: boolean;
    side?: Side;
    flatShading?: boolean;
  }
  export class MeshPhysicalMaterial extends Material {
    constructor(parameters?: MeshPhysicalMaterialParameters);
    color: Color;
  }

  export class Object3D {
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    children: Object3D[];
    add(...objects: Object3D[]): this;
    lookAt(x: number | Vector3, y?: number, z?: number): void;
    traverse(callback: (object: Object3D) => void): void;
    updateMatrixWorld(force?: boolean): void;
  }
  export class Group extends Object3D {}
  export class Scene extends Object3D {}
  export class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material);
    readonly isMesh: true;
    geometry: BufferGeometry;
    material: Material;
  }
  export class Light extends Object3D {
    intensity: number;
  }
  export class HemisphereLight extends Light {
    constructor(
      skyColor?: ColorRepresentation,
      groundColor?: ColorRepresentation,
      intensity?: number,
    );
  }
  export class DirectionalLight extends Light {
    constructor(color?: ColorRepresentation, intensity?: number);
  }
  export class PerspectiveCamera extends Object3D {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    aspect: number;
    updateProjectionMatrix(): void;
  }

  export class Box3 {
    setFromObject(object: Object3D): this;
    getSize(target: Vector3): Vector3;
    getCenter(target: Vector3): Vector3;
  }

  export const NoToneMapping: 0;
  export const ACESFilmicToneMapping: 4;
  export const NeutralToneMapping: 7;
  export type ToneMapping = 0 | 4 | 7;

  export interface WebGLRendererParameters {
    canvas?: HTMLCanvasElement;
    alpha?: boolean;
    antialias?: boolean;
    powerPreference?: "default" | "high-performance" | "low-power";
    failIfMajorPerformanceCaveat?: boolean;
  }
  export class WebGLRenderer {
    constructor(parameters?: WebGLRendererParameters);
    toneMapping: ToneMapping;
    toneMappingExposure: number;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    setClearColor(color: ColorRepresentation, alpha?: number): void;
    render(scene: Object3D, camera: PerspectiveCamera): void;
    dispose(): void;
    forceContextLoss(): void;
  }
}
