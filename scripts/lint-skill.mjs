#!/usr/bin/env node
// Structural lint for a Claude Code SKILL.md (defaults to the local-advisor skill).
// Asserts: frontmatter parses; required fields present; $ARGUMENTS placeholder
// well-formed; internal links resolve; within size limits; and (optionally) that the
// file contains none of a caller-supplied list of forbidden substrings.
// Exits non-zero on any failure. Node built-ins only — no dependencies.
//
// Usage:
//   node scripts/lint-skill.mjs                 # lint skills/local-advisor/SKILL.md
//   node scripts/lint-skill.mjs <path/to.md>    # lint an arbitrary SKILL.md (e.g. a fixture)
//
// Optional guard: set LINT_SKILL_FORBIDDEN to a comma-separated list of substrings to also
// fail if any appears (case-insensitive). Unset by default (no-op). Use it to keep a skill
// free of source-specific terms when syncing it from another copy, e.g.
//   LINT_SKILL_FORBIDDEN="foo,bar" node scripts/lint-skill.mjs

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILL = resolve(HERE, "..", "skills", "local-advisor", "SKILL.md");
const target = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_SKILL;

const REQUIRED_FIELDS = ["name", "description"];
const FORBIDDEN = (process.env.LINT_SKILL_FORBIDDEN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_BYTES = 50 * 1024; // skills should stay lean
const MAX_DESCRIPTION_CHARS = 1024; // the description is surfaced every session; keep it bounded

const errors = [];
const fail = (msg) => errors.push(msg);

if (!existsSync(target)) {
  console.error(`lint-skill: file not found: ${target}`);
  process.exit(2);
}

const raw = readFileSync(target, "utf8");

// 1. size
const bytes = Buffer.byteLength(raw, "utf8");
if (bytes > MAX_BYTES) fail(`file too large: ${bytes} bytes > ${MAX_BYTES}`);

// 2. frontmatter block
const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
if (!fm) {
  fail("frontmatter block (--- ... ---) missing or malformed");
} else {
  const body = raw.slice(fm[0].length);
  const front = fm[1];

  // crude line-based `key: value` parse — sufficient for flat skill frontmatter
  const fields = {};
  for (const line of front.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s?(.*)$/);
    if (m) fields[m[1]] = m[2];
  }

  // 3. required fields present and non-empty
  for (const key of REQUIRED_FIELDS) {
    if (!(key in fields) || fields[key].trim() === "") {
      fail(`required frontmatter field missing/empty: ${key}`);
    }
  }

  // 4. description length bound
  if (fields.description && fields.description.length > MAX_DESCRIPTION_CHARS) {
    fail(`description too long: ${fields.description.length} chars > ${MAX_DESCRIPTION_CHARS}`);
  }

  // 5. argument-hint declared => body must use the $ARGUMENTS placeholder
  if ("argument-hint" in fields && !body.includes("$ARGUMENTS")) {
    fail("argument-hint declared but $ARGUMENTS placeholder not used in body");
  }

  // 6. internal markdown links must resolve (relative file links only; skip http/anchors/mailto)
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  let lm;
  while ((lm = linkRe.exec(body)) !== null) {
    const href = lm[1].trim();
    if (/^(https?:|#|mailto:)/.test(href)) continue;
    const path = href.split("#")[0];
    if (!path) continue;
    if (!existsSync(join(dirname(target), path))) fail(`internal link does not resolve: ${href}`);
  }
}

// 7. optional forbidden-substring guard (case-insensitive) — see LINT_SKILL_FORBIDDEN above
const haystack = raw.toLowerCase();
for (const token of FORBIDDEN) {
  if (haystack.includes(token.toLowerCase())) fail(`forbidden substring present: "${token}"`);
}

if (errors.length) {
  console.error(`lint-skill: FAIL (${errors.length}) — ${target}`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`lint-skill: PASS — ${target}`);
