#!/usr/bin/env node
// Lightweight secret guard run locally and in CI (pnpm check:secrets).
// Fails on: committed .env files, values in .env.example files, secret-looking
// NEXT_PUBLIC_/VITE_ names, and common credential patterns in tracked files.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const problems = [];
const PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "GitHub token"],
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/, "model provider key"],
  [/\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/, "billing live key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
];
const PUBLIC_SECRET_NAME = /\b(?:NEXT_PUBLIC|VITE)_[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)\b/;

for (const f of files) {
  const base = f.split("/").pop();
  if (/^\.env(\..+)?$/.test(base) && base !== ".env.example")
    problems.push(`${f}: .env files must not be committed`);
  if (/\.(png|ico|icns|jpg|jpeg|gif|webp|woff2?|lock)$/.test(f) || f === "pnpm-lock.yaml") continue;
  if (f === "scripts/check-secrets.mjs") continue;

  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  if (base === ".env.example") {
    text.split("\n").forEach((line, i) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && m[2].trim() !== "")
        problems.push(`${f}:${i + 1}: ${m[1]} must have no value in .env.example`);
    });
  }
  for (const [re, label] of PATTERNS)
    if (re.test(text)) problems.push(`${f}: looks like a ${label}`);
  const pub = text.match(PUBLIC_SECRET_NAME);
  if (pub) problems.push(`${f}: ${pub[0]} would expose a secret to client code`);
}

if (problems.length) {
  console.error("Secret check failed:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`Secret check passed (${files.length} files scanned).`);
