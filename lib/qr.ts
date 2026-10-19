/**
 * Small QR Code generator (ISO/IEC 18004) for Dream's upload link: byte mode,
 * error correction level M, versions 1 to 10 (up to 213 bytes). No
 * dependencies; loaded with a dynamic import only where the QR is shown.
 * Structure follows Project Nayuki's reference implementation (MIT), reduced
 * to the subset Dream needs. Verified against reference matrices in
 * tests/qr.test.ts.
 */
export interface QrCode {
  version: number;
  size: number;
  mask: number;
  /** modules[y][x]: true = dark. */
  modules: boolean[][];
}

const MAX_VERSION = 10;
// Level M, index = version.
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const FORMAT_LEVEL_M = 0;

function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

export function dataCodewords(version: number): number {
  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_PER_BLOCK[version] * BLOCKS[version]
  );
}

/** Largest UTF-8 payload in bytes that fits a version at level M. */
export function byteCapacity(version: number): number {
  const countBits = version < 10 ? 8 : 16;
  return Math.floor((dataCodewords(version) * 8 - 4 - countBits) / 8);
}

// ---- Reed–Solomon over GF(2^8), polynomial 0x11D
function multiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function divisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = multiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = multiply(root, 0x02);
  }
  return result;
}

function remainder(data: number[], div: number[]): number[] {
  const result = div.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    div.forEach((coef, i) => (result[i] ^= multiply(coef, factor)));
  }
  return result;
}

function bit(value: number, i: number): boolean {
  return ((value >>> i) & 1) !== 0;
}

function alignmentPositions(version: number, size: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step)
    result.splice(1, 0, pos);
  return result;
}

function codewords(bytes: Uint8Array, version: number): number[] {
  const capacityBits = dataCodewords(version) * 8;
  const bits: number[] = [];
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  append(0b0100, 4);
  append(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => append(b, 8));
  append(0, Math.min(4, capacityBits - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11)
    append(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8)
    data.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));

  // Split into blocks, add ECC and interleave.
  const blockCount = BLOCKS[version];
  const eccLength = ECC_PER_BLOCK[version];
  const raw = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blockCount - (raw % blockCount);
  const shortLength = Math.floor(raw / blockCount);
  const div = divisor(eccLength);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < blockCount; i++) {
    const length = shortLength - eccLength + (i < shortBlocks ? 0 : 1);
    const chunk = data.slice(k, k + length);
    k += length;
    const ecc = remainder(chunk, div);
    if (i < shortBlocks) chunk.push(0);
    blocks.push([...chunk, ...ecc]);
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++)
    blocks.forEach((block, j) => {
      if (i !== shortLength - eccLength || j >= shortBlocks)
        result.push(block[i]);
    });
  return result;
}

class Matrix {
  modules: boolean[][];
  reserved: boolean[][];
  constructor(
    readonly version: number,
    readonly size: number,
  ) {
    this.modules = Array.from({ length: size }, () =>
      new Array<boolean>(size).fill(false),
    );
    this.reserved = Array.from({ length: size }, () =>
      new Array<boolean>(size).fill(false),
    );
  }
  set(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.reserved[y][x] = true;
  }
  finder(cx: number, cy: number) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < this.size && y >= 0 && y < this.size)
          this.set(x, y, d !== 2 && d !== 4);
      }
  }
  alignment(cx: number, cy: number) {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  format(mask: number) {
    const data = (FORMAT_LEVEL_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(bits, i));
    this.set(8, 7, bit(bits, 6));
    this.set(8, 8, bit(bits, 7));
    this.set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this.set(this.size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.set(8, this.size - 15 + i, bit(bits, i));
    this.set(8, this.size - 8, true);
  }
  versionInfo() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, bit(bits, i));
      this.set(b, a, bit(bits, i));
    }
  }
  functionPatterns() {
    for (let i = 0; i < this.size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    this.finder(3, 3);
    this.finder(this.size - 4, 3);
    this.finder(3, this.size - 4);
    const align = alignmentPositions(this.version, this.size);
    const last = align.length - 1;
    align.forEach((x, i) =>
      align.forEach((y, j) => {
        if (
          !(i === 0 && j === 0) &&
          !(i === 0 && j === last) &&
          !(i === last && j === 0)
        )
          this.alignment(x, y);
      }),
    );
    this.format(0);
    this.versionInfo();
  }
  place(data: number[]) {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++)
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.reserved[y][x] && i < data.length * 8) {
            this.modules[y][x] = bit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
    }
  }
  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) {
        if (this.reserved[y][x]) continue;
        let invert: boolean;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          default:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (invert) this.modules[y][x] = !this.modules[y][x];
      }
  }
  penalty(): number {
    const size = this.size;
    const m = this.modules;
    let result = 0;
    const addHistory = (run: number, history: number[]) => {
      if (history[0] === 0) run += size;
      history.pop();
      history.unshift(run);
    };
    const countPatterns = (h: number[]) => {
      const n = h[1];
      const core =
        n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (
        (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) +
        (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0)
      );
    };
    const terminate = (color: boolean, run: number, history: number[]) => {
      if (color) {
        addHistory(run, history);
        run = 0;
      }
      run += size;
      addHistory(run, history);
      return countPatterns(history);
    };
    for (let pass = 0; pass < 2; pass++)
      for (let a = 0; a < size; a++) {
        let color = false;
        let run = 0;
        const history = [0, 0, 0, 0, 0, 0, 0];
        for (let b = 0; b < size; b++) {
          const cell = pass === 0 ? m[a][b] : m[b][a];
          if (cell === color) {
            run++;
            if (run === 5) result += 3;
            else if (run > 5) result++;
          } else {
            addHistory(run, history);
            if (!color) result += countPatterns(history) * 40;
            color = cell;
            run = 1;
          }
        }
        result += terminate(color, run, history) * 40;
      }
    for (let y = 0; y < size - 1; y++)
      for (let x = 0; x < size - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1])
          result += 3;
      }
    const dark = m.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return result + k * 10;
  }
}

/** Encodes `text` (UTF-8, byte mode, level M). `mask` forces a mask (tests). */
export function encodeQr(
  text: string,
  options: { mask?: number } = {},
): QrCode {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (version <= MAX_VERSION && byteCapacity(version) < bytes.length)
    version++;
  if (version > MAX_VERSION)
    throw new Error("El enlace es demasiado largo para el código QR.");
  const size = version * 4 + 17;
  const matrix = new Matrix(version, size);
  matrix.functionPatterns();
  matrix.place(codewords(bytes, version));
  let mask = options.mask ?? -1;
  if (mask < 0) {
    let best = Infinity;
    for (let candidate = 0; candidate < 8; candidate++) {
      matrix.applyMask(candidate);
      matrix.format(candidate);
      const score = matrix.penalty();
      if (score < best) {
        best = score;
        mask = candidate;
      }
      matrix.applyMask(candidate); // undo (XOR)
    }
  }
  matrix.applyMask(mask);
  matrix.format(mask);
  return { version, size, mask, modules: matrix.modules };
}

/** SVG path (one unit per module) with a quiet zone of `margin` modules. */
export function qrPath(code: QrCode, margin = 4): string {
  const parts: string[] = [];
  code.modules.forEach((row, y) => {
    let x = 0;
    while (x < code.size) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < code.size && row[x]) x++;
      parts.push(
        `M${start + margin} ${y + margin}h${x - start}v1h${start - x}z`,
      );
    }
  });
  return parts.join("");
}
