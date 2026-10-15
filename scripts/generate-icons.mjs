// Regenerates the PWA icons from the Dream Orb of the Claude Design canvas
// (same SVG as components/orb.tsx). Run: node scripts/generate-icons.mjs
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const ORB = `<circle cx="32" cy="32" r="30" fill="#155BFF"/><g transform="rotate(-25 32 32)"><ellipse cx="32" cy="32" rx="22" ry="13" fill="none" stroke="#C8F560" stroke-width="5"/></g><ellipse cx="31" cy="33" rx="7.5" ry="6.5" fill="#C8F560"/><circle cx="51.9" cy="22.7" r="4.8" fill="#FFFFFF"/>`;

// scale: share of the canvas the 64-unit Orb box occupies.
const icons = [
  { file: "public/icon-192.png", size: 192, scale: 1, background: null },
  { file: "public/icon-512.png", size: 512, scale: 1, background: null },
  // Maskable: the Orb stays inside the 80 % safe-zone circle.
  { file: "public/icon-maskable.png", size: 512, scale: 0.62, background: "#FFFFFF" },
  // iOS ignores transparency: solid background, comfortable margin.
  { file: "public/apple-touch-icon.png", size: 180, scale: 0.78, background: "#FFFFFF" },
];

function svg({ size, scale, background }) {
  const box = 64 / scale;
  const offset = (box - 64) / 2;
  const bg = background ? `<rect x="${-offset}" y="${-offset}" width="${box}" height="${box}" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-offset} ${-offset} ${box} ${box}">${bg}${ORB}</svg>`;
}

// Optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE points at a preinstalled Chromium.
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const page = await browser.newPage();
for (const icon of icons) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(icon)}</body></html>`);
  await page.locator("svg").screenshot({ path: icon.file, omitBackground: true });
  console.log("wrote", icon.file);
}
await browser.close();
await writeFile(
  "public/icon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${ORB}</svg>\n`,
);
console.log("wrote public/icon.svg");
