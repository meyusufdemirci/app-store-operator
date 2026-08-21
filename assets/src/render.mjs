import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, "..");   // the PNGs live in assets/, the markup in assets/src/
const TARGET = 1760; // 2x the ~880px README content width

const shots = [
  ["hero.html", 1200, "hero.png"],
  ["output-preview.html", 1000, "output-preview.png"],
  ["how-it-works.html", 1200, "how-it-works.png"],
];

const browser = await chromium.launch();
for (const [file, width, name] of shots) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: TARGET / width,
  });
  await page.goto(pathToFileURL(path.join(here, file)).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const el = page.locator("#shot");
  await el.screenshot({ path: path.join(out, name), omitBackground: true });
  await page.close();
}
await browser.close();
