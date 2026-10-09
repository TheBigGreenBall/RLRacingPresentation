#!/usr/bin/env node
// Export the deck to PDF through reveal.js print mode (?print-pdf) using the Chrome headless shell Remotion downloads.
// usage: node scripts/export_pdf.mjs [out.pdf] [--url http://localhost:4173]   (run `npm run build && npm run preview` first,
// or let this script start `vite preview` itself when no --url is given).
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const shell = join(root, "node_modules", ".remotion", "chrome-headless-shell", "mac-arm64", "chrome-headless-shell-mac-arm64", "chrome-headless-shell");
const executablePath = existsSync(shell) ? shell : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const out = resolve(root, args.find((a) => !a.startsWith("--")) || "dist/rl-racing-league.pdf");
const urlIdx = args.indexOf("--url");
let base = urlIdx >= 0 ? args[urlIdx + 1] : null;
let server = null;
if (!base) {
  if (!existsSync(join(root, "dist", "index.html"))) { console.error("dist/ missing: run `npm run build` first"); process.exit(1); }
  server = spawn("npx", ["vite", "preview", "--port", "4797", "--strictPort"], { cwd: root, stdio: "ignore" });
  base = "http://localhost:4797";
  await new Promise((r) => setTimeout(r, 2500));
}
mkdirSync(dirname(out), { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-first-run"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(`${base}/?print-pdf`, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector(".reveal.ready", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 4000)); // let fonts, posters and the print layout settle
  await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true, width: "1920px", height: "1080px", margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
  server?.kill();
}
