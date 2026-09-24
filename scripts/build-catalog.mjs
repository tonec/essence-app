#!/usr/bin/env node
// Merge the three BSC5P source files into a single catalog keyed by `i`.
// Edit SOURCES below to change which fields are pulled from each file.
// Run: node scripts/build-catalog.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GALAXY_DIR = resolve(__dirname, '../src/lib/galaxy');
const OUT_FILE = resolve(GALAXY_DIR, 'catalog.json');

// Edit this to change what ends up in the merged catalog.
// `fields: '*'` copies every field (except the join key `i`).
// `rename` remaps a source key to a different name in the output.
const SOURCES = [
  {
    file: 'bsc5p_3d.json',
    fields: ['n', 'x', 'y', 'z', 'p', 'N', 'K'],
    rename: {},
  },
  {
    file: 'bsc5p_names.json',
    fields: ['n'],
    rename: { n: 'names' },
  },
  {
    file: 'bsc5p_spectral_extra.json',
    fields: ['b', 'a', 's', 'g', 'C', 'S'],
    rename: {},
  },
];

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function pick(row, fields, rename) {
  const out = {};
  const keys = fields === '*' ? Object.keys(row).filter((k) => k !== 'i') : fields;
  for (const k of keys) {
    if (row[k] === undefined) continue;
    out[rename[k] ?? k] = row[k];
  }
  return out;
}

async function main() {
  const merged = new Map();

  for (const source of SOURCES) {
    const rows = await loadJson(resolve(GALAXY_DIR, source.file));
    let added = 0;
    let updated = 0;
    for (const row of rows) {
      if (row.i === undefined) throw new Error(`Missing 'i' in ${source.file}`);
      const existing = merged.get(row.i);
      const picked = pick(row, source.fields, source.rename ?? {});
      if (existing) {
        Object.assign(existing, picked);
        updated++;
      } else {
        merged.set(row.i, { i: row.i, ...picked });
        added++;
      }
    }
    console.log(`${source.file}: ${rows.length} rows (added ${added}, updated ${updated})`);
  }

  const out = Array.from(merged.values()).sort((a, b) => {
    if (typeof a.i === 'number' && typeof b.i === 'number') return a.i - b.i;
    return String(a.i).localeCompare(String(b.i));
  });

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out));
  console.log(`Wrote ${out.length} rows to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
