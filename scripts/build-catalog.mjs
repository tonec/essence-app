#!/usr/bin/env node
// Merge the three BSC5P source files into a single catalog keyed by `i`.
// Edit SOURCES below to change which fields are pulled from each file.
// Run: node scripts/build-catalog.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GALAXY_DIR = resolve(__dirname, '../src/lib/galaxy');
const OUT_FILE = resolve(__dirname, '../public/catalog.json');

// Edit this to change what ends up in the merged catalog.
// `fields: '*'` copies every field (except the join key `i`).
// `rename` remaps a source key to a different name in the output.
// `transform(row)` returns extra fields to merge (overrides earlier sources).
const SOURCES = [
  {
    file: 'bsc5p_3d.json',
    fields: ['n', 'x', 'y', 'z', 'N', 'K'],
    rename: {},
  },
  {
    // Prefer the first human "NAME <name>" entry from the alt-names list
    // when one exists. Falls back silently to whatever `n` bsc5p_3d gave us
    // if this row has no NAME entries. We deliberately don't ship the full
    // alt-names array — it would inflate the catalog by ~8 MB.
    file: 'bsc5p_names.json',
    fields: [],
    transform: (row) => {
      if (!Array.isArray(row.n)) return {};
      const named = row.n.find(
        (x) => typeof x === 'string' && x.startsWith('NAME '),
      );
      return named ? { n: named.slice('NAME '.length).trim() } : {};
    },
  },
  {
    file: 'bsc5p_spectral_extra.json',
    fields: ['b', 'g'],
    rename: {},
  },
];

// Drop merged rows that don't have all of these fields. Keeps the runtime
// renderer from crashing on incomplete catalog entries (e.g. rows without
// a color vector `K`).
const REQUIRED_FIELDS = ['x', 'y', 'z', 'K'];

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
      const picked = {
        ...pick(row, source.fields ?? [], source.rename ?? {}),
        ...(source.transform ? source.transform(row) : {}),
      };
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

  const allRows = Array.from(merged.values());
  const out = allRows
    .filter((row) => REQUIRED_FIELDS.every((k) => row[k] !== undefined))
    .sort((a, b) => {
      if (typeof a.i === 'number' && typeof b.i === 'number') return a.i - b.i;
      return String(a.i).localeCompare(String(b.i));
    });

  const dropped = allRows.length - out.length;
  if (dropped > 0) {
    console.log(`Dropped ${dropped} rows missing required fields (${REQUIRED_FIELDS.join(', ')})`);
  }

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out));
  console.log(`Wrote ${out.length} rows to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
