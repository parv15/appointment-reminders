import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'data', 'package-lock.json', 'next-env.d.ts']);
const TEXT = new Set(['.md', '.html', '.js', '.ts', '.json', '.yml', '.yaml']);

const WORDS = [
  'seamless', 'seamlessly', 'effortless', 'effortlessly', 'leverage', 'leveraging', 'robust', 'powerful', 'delve', 'elevate',
  'supercharge', 'cutting-edge', 'game-changer', 'game changer', 'revolutionize', 'unleash', 'streamline', 'next-level',
  'state-of-the-art', 'best-in-class', 'blazing', 'lightning-fast', 'world-class', 'holistic', 'synergy', 'tapestry', 'testament to',
];

const PHRASES: [RegExp, string][] = [
  [/\u2014|\u2013/, 'em or en dash'],
  [/\bnot just\b[^.\n]{0,60}\bbut\b/i, '"not just X but Y" pattern'],
  [/\bin today'?s\b/i, '"in today\'s" opener'],
  [/\b(ever-evolving|fast-paced world|digital landscape)\b/i, 'stock opener'],
  [/\bwhether you'?re\b/i, '"whether you\'re" opener'],
  [/\b(dive into|deep dive|let'?s dive)\b/i, '"dive into" phrase'],
  [/\b(acme|lorem ipsum|foo bar|john doe|jane doe)\b/i, 'placeholder name'],
  [/\b(TODO|FIXME|XXX)\b/, 'unfinished marker'],
  [/\u2728|\u{1F680}|\u{1F525}|\u{1F4A1}|\u{1F389}/u, 'decorative emoji'],
  [/^#{1,6}\s.*\?\s*$/m, 'question as a heading'],
  [/^\s*[-*]\s+\*\*[^*]+\*\*\s*[:\u2013\u2014-]/m, 'bold label bullet'],
  [/\b(easy|simple|simply|just)\s+(to|as)\b.*\b(click|run)\b/i, 'filler instruction'],
];

const IGNORE_LINE = /lint-prose: ignore/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (TEXT.has(extname(name))) out.push(path);
  }
  return out;
}

let problems = 0;
const self = relative(ROOT, new URL(import.meta.url).pathname);

for (const file of walk(ROOT)) {
  const name = relative(ROOT, file);
  if (name === self || name.startsWith('docs/templates')) continue;
  const lines = readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, index) => {
    if (IGNORE_LINE.test(line)) return;
    const report = (reason: string) => {
      problems++;
      console.log(`${name}:${index + 1}  ${reason}\n    ${line.trim().slice(0, 140)}`);
    };

    const lower = line.toLowerCase();
    for (const word of WORDS) {
      if (new RegExp(`\\b${word.replace(/[-]/g, '[- ]')}\\b`, 'i').test(lower)) report(`overused marketing word "${word}"`);
    }
    for (const [pattern, reason] of PHRASES) {
      if (name.endsWith('.ts') || name.endsWith('.js')) {
        if (!/dash|placeholder|unfinished|emoji/.test(reason)) continue;
        if (!/['"`]/.test(line) && !/\/\//.test(line)) continue;
      }
      if (pattern.test(line)) report(reason);
    }
  });
}

if (problems > 0) {
  console.error(`\n${problems} writing problem${problems === 1 ? '' : 's'} found. Rewrite the text in plain full sentences, or add "lint-prose: ignore" to a line that must stay.`);
  process.exit(1);
}
console.log('Prose check passed: no dashes, stock phrases, placeholder names or marketing words found.');
