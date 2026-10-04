// Renders the bib logo to PNG app icons. Run: node apps/web/scripts/make-icons.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const svg = readFileSync(join(here, "icons", "bib.svg"), "utf8");
const targets = [
  [180, join(web, "app", "apple-icon.png")],
  [192, join(web, "public", "icon-192.png")],
  [512, join(web, "public", "icon-512.png")],
];

const browser = await chromium.launch();
for (const [size, out] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: out, omitBackground: false });
  await page.close();
}
await browser.close();
console.log("icons written");
