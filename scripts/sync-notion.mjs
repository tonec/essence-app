#!/usr/bin/env node
// Two-way sync between specs/ and Notion pages under a parent page.
// Directories map to container pages; each .md file maps to a page whose body
// is the file's markdown. .notion-sync.json records each page id, a hash of the
// local file and Notion's markdown from the last sync, so each run can tell
// which side changed:
//   local changed  → push to Notion      Notion changed → pull into specs/
//   both changed   → conflict, skipped (resolve with --prefer=local|notion)
// New files/pages on either side are created on the other. Nothing is ever
// deleted — deletions on one side are reported, not propagated.
// Run: npm run sync-notion [-- --dry-run] [-- --prefer=local|notion]
// Env (.env.local): NOTION_TOKEN, optional NOTION_SPECS_PARENT_ID.

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SPECS_DIR = join(ROOT, "specs");
const STATE_FILE = join(ROOT, ".notion-sync.json");

// Projects → Essence in Notion.
const PARENT_ID = process.env.NOTION_SPECS_PARENT_ID ?? "3e8399fd49a680bba722dcd47d525d85";
const TOKEN = process.env.NOTION_TOKEN;
const NOTION_VERSION = "2026-03-11";
// Notion pages under the parent that aren't specs (e.g. templates).
const IGNORED_TITLES = new Set(["[Feature Name] Spec"]);
const DRY_RUN = process.argv.includes("--dry-run");
const PREFER = process.argv.find((a) => a.startsWith("--prefer="))?.slice("--prefer=".length);

if (!TOKEN) {
  console.error("NOTION_TOKEN is not set (add it to .env.local).");
  process.exit(1);
}
if (PREFER && PREFER !== "local" && PREFER !== "notion") {
  console.error("--prefer must be 'local' or 'notion'.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => createHash("sha256").update(s).digest("hex");

// ── Applying Notion edits to local files ──────────────────────────────────
// Notion re-renders pushed markdown in its own dialect: no blank lines between
// blocks, tab-indented nested lists, `*em*` for `_em_`, escaped `\~`, $`math`$,
// `javascript` on bare code fences, <empty-block/> for empty paragraphs, and no
// leading H1. Rewriting a whole file from that would churn every line, so a
// pull instead diffs Notion's markdown against its snapshot from the last sync
// and applies only the changed lines to the local file. Untouched lines stay
// exactly as written.

const FENCE = /^\s*```/;
const isRunLine = (l) => /^\s*([-*+]|\d+\.)\s|^\s*\||^\s*>/.test(l);

// Loose form of a line, for matching local lines to Notion's rendering of them.
function looseKey(line) {
  const t = line.trim();
  if (t === "" || t === "<empty-block/>") return null;
  if (FENCE.test(t)) return "```";
  return t
    .replace(/\\([\\`*_{}[\]()#+\-.!~|<>$])/g, "$1")
    .replace(/\$`([^`]*)`\$/g, "$$$1$$")
    .replace(/^(\d+\.|[-*+])\s+/, "- ")
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ");
}

// Longest common subsequence of `a` and `b` by `key`; returns index pairs.
// Lines whose key is null never match.
function lcsPairs(a, b, key = (x) => x) {
  const ka = a.map(key);
  const kb = b.map(key);
  const same = (i, j) => ka[i] !== null && ka[i] === kb[j];
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = same(i, j) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (same(i, j)) pairs.push([i++, j++]);
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

// Format lines that are new from Notion in repo style: blank lines between
// blocks (not within list/table/quote runs), spaces for tab indents, code
// blocks verbatim, <empty-block/> dropped.
function formatNotionLines(lines) {
  const out = [];
  let inFence = false;
  for (let line of lines) {
    if (inFence) {
      out.push(line);
      if (FENCE.test(line)) inFence = false;
      continue;
    }
    if (line.trim() === "" || line.trim() === "<empty-block/>") continue;
    line = line.replace(/^\t+/, (t) => "  ".repeat(t.length));
    const prev = out.at(-1);
    if (prev !== undefined && !continuesRun(prev, line)) out.push("");
    out.push(line);
    if (FENCE.test(line)) inFence = true;
  }
  return out;
}

const continuesRun = (prev, line) => isRunLine(prev) && (isRunLine(line) || /^\s+\S/.test(line));

// Apply the edits Notion made since `base` (its markdown at the last sync)
// to `local`, returning the new local file.
function applyNotionEdits(local, base, current) {
  // Keep the file's own trailing whitespace; work on the body only.
  const tail = local.match(/\s*$/)[0];
  const L = local.slice(0, local.length - tail.length).split("\n");
  const B = base.split("\n");
  const C = current.split("\n");
  const toLocal = new Map(lcsPairs(B, L, looseKey));

  // codeAt[i]: whether a line inserted before L[i] lands inside a code block
  // (such lines go in verbatim).
  const codeAt = [false];
  for (const line of L) codeAt.push(FENCE.test(line) ? !codeAt.at(-1) : codeAt.at(-1));

  const deleted = new Set();
  const inserts = new Map(); // local index → lines to insert before it
  const mappedBefore = (b) => {
    for (; b >= 0; b--) if (toLocal.has(b)) return toLocal.get(b) + 1;
  };
  const mappedFrom = (b) => {
    for (; b < B.length; b++) if (toLocal.has(b)) return toLocal.get(b);
  };

  let bi = 0;
  let ci = 0;
  for (const [bj, cj] of [...lcsPairs(B, C), [B.length, C.length]]) {
    if (bj > bi || cj > ci) {
      const gone = [];
      for (let b = bi; b < bj; b++) if (toLocal.has(b)) gone.push(toLocal.get(b));
      gone.forEach((l) => deleted.add(l));
      const added = C.slice(ci, cj);
      if (gone.length > 0 && added.length === 0) {
        // Pure deletion: also drop one blank line so gaps don't pile up.
        for (const l of gone) {
          if (L[l + 1] === "" && !deleted.has(l + 1)) deleted.add(l + 1);
        }
      }
      if (added.some((l) => l.trim() !== "" && l.trim() !== "<empty-block/>")) {
        const at = gone.length
          ? Math.min(...gone)
          : (mappedBefore(bi - 1) ?? mappedFrom(bj) ?? L.length);
        inserts.set(at, [...(inserts.get(at) ?? []), ...added]);
      }
    }
    bi = bj + 1;
    ci = cj + 1;
  }

  const out = [];
  const nextKept = (i) => {
    for (; i < L.length; i++) if (!deleted.has(i)) return L[i];
  };
  for (let i = 0; i <= L.length; i++) {
    const added = inserts.get(i);
    if (added) {
      const code = codeAt[i];
      const lines = code ? added : formatNotionLines(added);
      const prev = out.at(-1);
      const next = nextKept(i);
      if (!code && prev && !continuesRun(prev, lines[0])) out.push("");
      out.push(...lines);
      if (!code && next && !continuesRun(lines.at(-1), next)) out.push("");
    }
    if (i < L.length && !deleted.has(i)) out.push(L[i]);
  }
  const body = out.join("\n").trimEnd();
  return body && body + (local === "" ? "\n" : tail);
}

// A Notion page with no usable local counterpart, formatted from scratch.
function fromNotion(markdown) {
  const body = formatNotionLines(markdown.split("\n")).join("\n").trimEnd();
  return body && `${body}\n`;
}

// ── Notion API ────────────────────────────────────────────────────────────

async function notion(method, path, body) {
  for (;;) {
    const res = await fetch(`https://api.notion.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      await sleep(Number(res.headers.get("retry-after") ?? 1) * 1000);
      continue;
    }
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`${method} ${path} → ${res.status}: ${json.message}`);
    }
    // Large markdown writes may come back as an async task; wait for it.
    if (res.status === 202 && json.object === "async_task") {
      return waitForTask(json);
    }
    return json;
  }
}

async function waitForTask(task) {
  while (["queued", "running", "retrying"].includes(task.status)) {
    await sleep((task.poll_after_seconds ?? 1) * 1000);
    task = await notion("GET", new URL(task.status_url).pathname);
  }
  if (task.status !== "succeeded") {
    throw new Error(`Async task ${task.id} ended with status ${task.status}`);
  }
  // The finished operation's response (a page, page_markdown, …).
  return task.result;
}

// Map of title → page id for the direct child pages of `pageId`.
async function listChildPages(pageId) {
  const pages = new Map();
  let cursor;
  do {
    const qs = new URLSearchParams({ page_size: "100" });
    if (cursor) qs.set("start_cursor", cursor);
    const res = await notion("GET", `/v1/blocks/${pageId}/children?${qs}`);
    for (const block of res.results) {
      if (block.type === "child_page") pages.set(block.child_page.title, block.id);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function createPage(parentId, title, markdown) {
  const page = await notion("POST", "/v1/pages", {
    parent: { page_id: parentId },
    properties: { title: { title: [{ text: { content: title } }] } },
    ...(markdown !== undefined && { markdown, allow_async: true }),
  });
  return page.id;
}

async function getPageMarkdown(pageId) {
  const res = await notion("GET", `/v1/pages/${pageId}/markdown`);
  if (res.truncated) {
    throw new Error(`Notion page ${pageId} is too large to pull (truncated).`);
  }
  return res.markdown;
}

async function replacePageMarkdown(pageId, markdown) {
  await notion("PATCH", `/v1/pages/${pageId}/markdown`, {
    type: "replace_content",
    replace_content: { new_str: markdown, allow_deleting_content: false },
    allow_async: true,
  });
}

// ── State ─────────────────────────────────────────────────────────────────
// files: { "<rel path>.md": { id, localHash, notionMarkdown } }
//   localHash: hash of the local file at the last sync.
//   notionMarkdown: Notion's markdown at the last sync (the base for pulls).
// dirs:  { "<rel path>": id }

const state = existsSync(STATE_FILE)
  ? JSON.parse(await readFile(STATE_FILE, "utf8"))
  : { files: {}, dirs: {} };

async function saveState() {
  if (!DRY_RUN) {
    await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  }
}

const stats = {
  pushed: 0,
  pulled: 0,
  created: 0,
  unchanged: 0,
  conflicts: 0,
  skipped: 0,
};
const log = (action, rel, note = "") =>
  console.log(`${action.padEnd(9)} ${rel}${note && `  (${note})`}`);

// ── Sync ──────────────────────────────────────────────────────────────────

async function push(rel, id, markdown) {
  log("push", rel);
  stats.pushed++;
  if (DRY_RUN) return;
  await replacePageMarkdown(id, markdown);
  // Record Notion's own rendering, which differs from what we sent.
  state.files[rel] = {
    id,
    localHash: hash(markdown),
    notionMarkdown: await getPageMarkdown(id),
  };
  await saveState();
}

// Writes Notion's `current` markdown into specs/: as edits applied to `local`
// when there's a base snapshot to diff against, otherwise as a fresh file.
async function pull(rel, id, current, local, base) {
  log("pull", rel);
  stats.pulled++;
  if (DRY_RUN) return;
  const content =
    local !== undefined && base !== undefined
      ? applyNotionEdits(local, base, current)
      : fromNotion(current);
  await mkdir(dirname(join(SPECS_DIR, rel)), { recursive: true });
  await writeFile(join(SPECS_DIR, rel), content);
  state.files[rel] = { id, localHash: hash(content), notionMarkdown: current };
  await saveState();
}

async function syncFile(rel, title, parentId, children) {
  const local = await readFile(join(SPECS_DIR, rel), "utf8");
  const entry = state.files[rel];

  // New locally (or parent not created yet in a dry run) → create in Notion.
  const id = entry?.id ?? children.get(title);
  if (!id) {
    log("create", rel, "→ Notion");
    stats.created++;
    if (DRY_RUN) return;
    const newId = await createPage(parentId, title, local);
    state.files[rel] = {
      id: newId,
      localHash: hash(local),
      notionMarkdown: await getPageMarkdown(newId),
    };
    return saveState();
  }

  if (![...children.values()].includes(id)) {
    log("skip", rel, "tracked page not found under its parent in Notion");
    stats.skipped++;
    return;
  }

  const remote = await getPageMarkdown(id);
  // A same-titled page we've never synced counts as changed on both sides.
  const localChanged = hash(local) !== entry?.localHash;
  const notionChanged = remote !== entry?.notionMarkdown;

  if (!localChanged && !notionChanged) {
    stats.unchanged++;
  } else if (localChanged && !notionChanged) {
    await push(rel, id, local);
  } else if (!localChanged && notionChanged) {
    await pull(rel, id, remote, local, entry.notionMarkdown);
  } else if (PREFER === "local") {
    await push(rel, id, local);
  } else if (PREFER === "notion") {
    // Take Notion's version whole; it comes back in Notion's markdown style.
    await pull(rel, id, remote);
  } else {
    log("CONFLICT", rel, "changed on both sides; rerun with --prefer");
    stats.conflicts++;
  }
}

// Pull a Notion page with no local counterpart: pages with child pages become
// directories, everything else becomes a .md file.
async function pullNew(rel, id) {
  const grandchildren = await listChildPages(id);
  if (grandchildren.size > 0) {
    log("create", `${rel}/`, "← Notion");
    stats.created++;
    if (!DRY_RUN) {
      await mkdir(join(SPECS_DIR, rel), { recursive: true });
      state.dirs[rel] = id;
      await saveState();
    }
    return syncDir(rel, id);
  }
  await pull(`${rel}.md`, id, await getPageMarkdown(id));
}

// `parentId` is null in a dry run when the parent page doesn't exist yet.
async function syncDir(relDir, parentId) {
  const absDir = join(SPECS_DIR, relDir);
  const entries = existsSync(absDir)
    ? (await readdir(absDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory() || e.name.endsWith(".md"))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const children = parentId ? await listChildPages(parentId) : new Map();
  const matched = new Set();

  for (const entry of entries) {
    const rel = join(relDir, entry.name);
    const title = entry.isDirectory() ? entry.name : entry.name.slice(0, -3);
    matched.add(title);

    if (!entry.isDirectory()) {
      await syncFile(rel, title, parentId, children);
      continue;
    }
    let id = state.dirs[rel] ?? children.get(title);
    if (id && parentId && ![...children.values()].includes(id)) {
      log("skip", `${rel}/`, "tracked page not found under its parent in Notion");
      stats.skipped++;
      continue;
    }
    if (!id) {
      log("create", `${rel}/`, "→ Notion");
      stats.created++;
      if (!DRY_RUN) {
        id = await createPage(parentId, title);
        state.dirs[rel] = id;
        await saveState();
      }
    } else if (!state.dirs[rel] && !DRY_RUN) {
      state.dirs[rel] = id;
      await saveState();
    }
    await syncDir(rel, id ?? null);
  }

  const tracked = new Set([
    ...Object.values(state.dirs),
    ...Object.values(state.files).map((f) => f.id),
  ]);
  for (const [title, id] of children) {
    if (matched.has(title) || IGNORED_TITLES.has(title)) continue;
    const rel = join(relDir, title.replaceAll("/", "-"));
    if (tracked.has(id)) {
      log("skip", rel, "no local file (deleted or renamed); left in Notion");
      stats.skipped++;
    } else {
      await pullNew(rel, id);
    }
  }
}

await syncDir("", PARENT_ID);
console.log(
  `\n${DRY_RUN ? "[dry run] " : ""}` +
    Object.entries(stats)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ")
);
if (stats.conflicts > 0) process.exitCode = 1;
