#!/usr/bin/env node
/**
 * Security guard: blocks the known obfuscated "init" backdoor (Ethereum C2 loader)
 * from ever coming back into this repository.
 * Runs on: pre-commit hook, predev/prebuild/prestart, and CI.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.tmp']);
const EXTS = new Set(['.js', '.cjs', '.mjs', '.ts', '.json', '']);
const SELF = path.resolve(__filename);

// Signatures of the injected payload
const SIGNATURES = [
  /var\s+NX\s*,\s*SX\s*,\s*spin\s*,\s*splitLane\s*,\s*peel/,
  /splitLane\s*=\s*f\(/,
  /0x1eEf0849EDa15d87f64e51C73C8442Cf3c8bCEF3/i,
  /NX\s*=\s*\[\s*6912847/,
  /SX\s*=\s*\[\s*5283741/,
  /\\u0063\\u005E\\u006D\\u0065\\u006A/,
  /\/0x\/cls|\/0x\/ls['"`]/,
];
const MAX_LINE = 5000; // extremely long single lines are suspicious in source

const problems = [];

if (fs.existsSync(path.join(ROOT, 'init'))) {
  problems.push('init: root "init" file is forbidden (known backdoor carrier)');
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
  if (/node\s+init\b/.test(cmd)) problems.push(`package.json: script "${name}" runs "node init"`);
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (full === SELF || !EXTS.has(path.extname(entry.name))) continue;
    if (entry.name === 'package-lock.json') continue;
    let text;
    try {
      if (fs.statSync(full).size > 2 * 1024 * 1024) continue;
      text = fs.readFileSync(full, 'utf8');
    } catch { continue; }
    const rel = path.relative(ROOT, full);
    for (const sig of SIGNATURES) {
      if (sig.test(text)) { problems.push(`${rel}: matches malware signature ${sig}`); break; }
    }
    if (/\.(c|m)?js$/.test(entry.name) || path.extname(entry.name) === '') {
      if (text.split('\n').some((l) => l.length > MAX_LINE && /\beval\b|Function|require/.test(l))) {
        problems.push(`${rel}: suspicious obfuscated long line (>${MAX_LINE} chars)`);
      }
    }
  }
}
walk(ROOT);

if (problems.length) {
  console.error('\n\u274C SECURITY GUARD: possible malicious code detected!\n');
  for (const p of problems) console.error('  - ' + p);
  console.error('\nRemove it before continuing. Do NOT run the project.\n');
  process.exit(1);
}
console.log('\u2705 security-guard: clean');

