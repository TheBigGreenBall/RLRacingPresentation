#!/usr/bin/env node
// Headless screenshot + console check using the Chrome headless shell that Remotion downloads.
// usage: node scripts/screenshot.mjs URL OUT.png [--wait 3000] [--size 1920x1080] [--key k ...]
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const shell = join(here, "..", "node_modules", ".remotion", "chrome-headless-shell", "mac-arm64", "chrome-headless-shell-mac-arm64", "chrome-headless-shell");
const executablePath = existsSync(shell) ? shell : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const url = args[0], out = args[1];
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const wait = Number(opt("--wait", 3000));
const [w, h] = opt("--size", "1920x1080").split("x").map(Number);
const keys = args.flatMap((a, i) => (a === "--key" ? [args[i + 1]] : []));

const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required", "--no-first-run"],
});
const page = await browser.newPage();
await page.setViewport({ width: w, height: h });
const logs = [];
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => logs.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => { if (r.status() >= 400) logs.push(`http ${r.status()}: ${r.url()}`); });
await page.goto(url, { waitUntil: "load", timeout: 60000 });
for (const k of keys) { await page.keyboard.press(k); await new Promise((r) => setTimeout(r, 300)); }
await new Promise((r) => setTimeout(r, wait));
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
const relevant = logs.filter((l) => !l.includes("GL Driver Message") && !l.includes("Automatic fallback to software WebGL"));
if (relevant.length) { console.log("console:"); for (const l of relevant) console.log("  " + l); }
