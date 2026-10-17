// lib/qr.ts against reference matrices. The vectors were produced with segno
// 1.6.6 (Python, BSD) using byte mode, level M, UTF-8 and each forced mask,
// with one change so it follows ISO/IEC 18004 7.4.10 exactly: no extra zero
// codeword when the bit stream already ends on a codeword boundary (segno adds
// one; both scan, but the strict form is what Dream emits). Each hash is the
// first 16 hex digits of SHA-256 over the rows ("1" = dark) joined by "\n".
// The automatic mask choice uses the standard penalty rules; segno weighs
// rule 3 differently, so only forced masks are compared module by module.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { byteCapacity, encodeQr, qrPath } from "../lib/qr";

const rows = (modules: boolean[][]) =>
  modules.map((row) => row.map((dark) => (dark ? "1" : "0")).join(""));
const digest = (modules: boolean[][]) =>
  createHash("sha256")
    .update(rows(modules).join("\n"))
    .digest("hex")
    .slice(0, 16);

const VECTORS: [string, number, string[]][] = [
  [
    "https://www.edudream.es/subir/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    5,
    [
      "56459c79137b509a",
      "881ab970b973bbdf",
      "0493f916bae46f77",
      "d4d82e080d0d5d7e",
      "c942332820a768c1",
      "64ade2f7f226420c",
      "989bf4c99d07d244",
      "f065b123e40bcbfd",
    ],
  ],
  [
    "https://www.edudream.es/subir/q3Zr-9_xK2mPa7LbV0cT1uWnE8sYdHjF4gOiR6kXyQe",
    5,
    [
      "01da9c76bb7a1625",
      "974d4486d24b54d4",
      "39e46d87182e0a7d",
      "1728eea85beb2e5e",
      "0447cac498a5d822",
      "c43d865ee4b1f1f4",
      "0f85a89f24402fca",
      "43519c5cd0da9a12",
    ],
  ],
  [
    "http://localhost:3000/subir/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
    5,
    [
      "26c8c9545cb4b795",
      "dbcbdb28560ddc40",
      "b633c3065a3520f7",
      "8b293b9f3445cc07",
      "535ec1b5349c5322",
      "6eacd62b2d8a1b01",
      "31586c1433b2c9a7",
      "f49041754508417d",
    ],
  ],
  [
    "https://dream-git-feat-subida-qr-kinetik1.vercel.app/subir/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
    6,
    [
      "241a51e39ac9dc55",
      "7629ce783054194b",
      "90f0b2a64d29ad6b",
      "c3f28f0d69486652",
      "c058fe3ff78d145f",
      "451e485fdb18315d",
      "60929ccd0e7bc893",
      "99bf50b84efd8532",
    ],
  ],
  [
    "Dream",
    1,
    [
      "d51749186578eafc",
      "7929c48e1f6bf0bf",
      "77e736f3cff0783c",
      "c934888da70122a3",
      "a4f9dc7a61986487",
      "37d2ce5fa404f636",
      "c4e54f38de598ddb",
      "ef802cc8470a84d2",
    ],
  ],
  [
    "¡Hola, cómo estás! ñ",
    2,
    [
      "e95ffd137da45b40",
      "2818af019db4a71a",
      "215d16901cd34764",
      "a40ebea24c843451",
      "b77e49793a3cb276",
      "addcb62ddc23abe5",
      "a4e2450aa1f91669",
      "1a0ca2007d874882",
    ],
  ],
  [
    "x".repeat(120),
    7,
    [
      "94b9cf7559b2e47b",
      "65fb2cd454b982e5",
      "b91b7e904d3e58a9",
      "9d91b4ffcfbc6439",
      "a5f46beb6c4f4bf8",
      "beffcff7596298ba",
      "72579d773290ffd8",
      "1e0c1f3ff143ddd4",
    ],
  ],
  [
    "y".repeat(150),
    8,
    [
      "06d9fc6248b7ed53",
      "230adb2b282df71c",
      "e7d99ad988dd6759",
      "eeed497bb347a6ac",
      "c43de0e036fc8ce6",
      "a3f5b5498d0f1d36",
      "f4781ea7683b40fc",
      "86f143fbbe3bbb8b",
    ],
  ],
  [
    "z".repeat(180),
    9,
    [
      "fcb9a912d7b2c80e",
      "b5b8a6ef7916e3ed",
      "7487eb49d2e1d3f1",
      "3bf5950859676935",
      "be41c23c167ed061",
      "9d6df1129ead80ee",
      "90f868d23949c6fd",
      "e0334b8e1fa73701",
    ],
  ],
  [
    "w".repeat(213),
    10,
    [
      "8d981abcff6c5025",
      "09884cf13c720c73",
      "e752bad44952bd36",
      "bd0d8e2a8547849a",
      "9018344b2b099d5a",
      "5988c6696426e683",
      "8b26bac8f5400ff3",
      "12f82bef48dba186",
    ],
  ],
];

test("matches the reference matrices for every mask (versions 1 to 10)", () => {
  for (const [text, version, hashes] of VECTORS) {
    hashes.forEach((expected, mask) => {
      const code = encodeQr(text, { mask });
      assert.equal(code.version, version, text);
      assert.equal(code.size, version * 4 + 17);
      assert.equal(
        digest(code.modules),
        expected,
        `${text.slice(0, 24)} mask ${mask}`,
      );
    });
  }
});

test('small reference matrix, module by module ("Dream", version 1, mask 0)', () => {
  assert.deepEqual(rows(encodeQr("Dream", { mask: 0 }).modules), [
    "111111100001101111111",
    "100000101000001000001",
    "101110100101001011101",
    "101110100000101011101",
    "101110101000101011101",
    "100000100000101000001",
    "111111101010101111111",
    "000000000111100000000",
    "101010100101000010010",
    "000101011010001001001",
    "100001100100100010011",
    "001111000010001000010",
    "101011110110101010011",
    "000000001101010100010",
    "111111100101011101111",
    "100000100001110110000",
    "101110101111011100011",
    "101110100000001101010",
    "101110101010100011101",
    "100000100100001000010",
    "111111101000101100011",
  ]);
});

test("automatic mask is one of the eight and stays deterministic", () => {
  const url =
    "https://www.edudream.es/subir/q3Zr-9_xK2mPa7LbV0cT1uWnE8sYdHjF4gOiR6kXyQe";
  const a = encodeQr(url);
  const b = encodeQr(url);
  assert.ok(a.mask >= 0 && a.mask < 8);
  assert.deepEqual(a, b);
  assert.equal(digest(a.modules), VECTORS[1][2][a.mask]);
});

test("capacity per version at level M and the version limit", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(byteCapacity),
    [14, 26, 42, 62, 84, 106, 122, 152, 180, 213],
  );
  assert.equal(encodeQr("a".repeat(14)).version, 1);
  assert.equal(encodeQr("a".repeat(15)).version, 2);
  // Dream's real link (30 + 43 characters) fits version 5.
  assert.equal(
    encodeQr("https://www.edudream.es/subir/" + "A".repeat(43)).version,
    5,
  );
  assert.throws(() => encodeQr("a".repeat(214)), /demasiado largo/);
});

test("SVG path covers exactly the dark modules with a quiet zone", () => {
  const code = encodeQr("Dream", { mask: 0 });
  const path = qrPath(code);
  let dark = 0;
  for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const [x, y, w] = [Number(m[1]), Number(m[2]), Number(m[3])];
    assert.ok(x >= 4 && y >= 4 && x + w <= code.size + 4);
    for (let i = 0; i < w; i++)
      assert.equal(code.modules[y - 4][x - 4 + i], true);
    dark += w;
  }
  assert.equal(dark, code.modules.flat().filter(Boolean).length);
});
