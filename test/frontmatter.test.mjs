/**
 * Frontmatter serialization regression tests.
 * Run with: npm test
 *
 * Covers:
 *  - Korean / multibyte Unicode preservation in arrays (regression: was corrupted by old YAML bug)
 *  - Block-list indentation for all array keys (regression: custom keys were emitted inline)
 *  - Standard 8-key ordering and normalization
 *  - round-trip: write → read with gray-matter → values unchanged
 *  - Edge cases: empty arrays, null, Date objects, ISO dates, wiki links
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import {
  buildFrontmatterBlock,
  composeNote,
  parseNote,
  mergeFrontmatterBlock,
  isStandardFrontmatter,
  normalizeFrontmatter,
  PROPERTY_ORDER,
} from "../dist/frontmatter.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseBlock(block) {
  const inner = block.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return yaml.load(inner);
}

function roundTrip(note) {
  const tmp = join(tmpdir(), `obs-test-${Date.now()}.md`);
  writeFileSync(tmp, note, "utf8");
  const raw = readFileSync(tmp, "utf8");
  rmSync(tmp, { force: true });
  return parseNote(raw);
}

// ─── 1. Korean / multibyte Unicode in standard array keys ─────────────────────

test("Korean text in aliases array: no corruption", () => {
  const aliases = ["맥북 AI 서버 구축", "OpenClaw 세팅", "Ollama 로컬 구축"];
  const block = buildFrontmatterBlock({ aliases, tags: undefined, title: "T",
    author: undefined, date: undefined, source: undefined, type: undefined, "Service URL": undefined });
  const parsed = parseBlock(block);
  assert.deepEqual(parsed.aliases, aliases, "aliases must round-trip unchanged");
});

test("Korean text in tags array: no corruption", () => {
  const tags = ["맥북", "AI서버", "로컬환경", "한글태그"];
  const block = buildFrontmatterBlock({ tags, title: undefined, aliases: undefined,
    author: undefined, date: undefined, source: undefined, type: undefined, "Service URL": undefined });
  const parsed = parseBlock(block);
  assert.deepEqual(parsed.tags, tags);
});

test("Korean text in custom array key (related_notes): no corruption", () => {
  const fm = {
    title: "테스트", aliases: undefined, tags: ["mcp"], author: "홍길동",
    date: "2026-06-27", source: "", type: "note", "Service URL": "",
    related_notes: ["[[OpenClaw 로컬 AI 서버 완벽 구축 매뉴얼]]", "[[맥북 AI 서버 구축]]", "[[로컬 개발 환경]]"],
  };
  const block = buildFrontmatterBlock(fm);
  // Must use block-list format, not inline
  assert.match(block, /related_notes:\n  - /, "block-list format for custom array key");
  const parsed = parseBlock(block);
  assert.deepEqual(parsed.related_notes, fm.related_notes);
});

// ─── 2. Emoji and mixed Unicode ───────────────────────────────────────────────

test("Emoji and mixed Unicode preserved in array", () => {
  const values = ["한글🎉테스트", "English text", "日本語テスト", "한글+emoji🌸+漢字"];
  const block = buildFrontmatterBlock({ title: undefined, aliases: undefined,
    tags: undefined, author: undefined, date: undefined, source: undefined,
    type: undefined, "Service URL": undefined, mixed: values });
  const parsed = parseBlock(block);
  assert.deepEqual(parsed.mixed, values);
});

// ─── 3. Block-list indentation for ALL array keys ────────────────────────────

test("Standard array keys (aliases, tags) use block-list format", () => {
  const block = buildFrontmatterBlock({
    title: "T", aliases: ["alpha", "beta"], tags: ["mcp", "obsidian"],
    author: undefined, date: undefined, source: undefined, type: undefined, "Service URL": undefined,
  });
  // Verify block-list indentation format
  assert.match(block, /aliases:\n  - alpha\n  - beta/);
  assert.match(block, /tags:\n  - mcp\n  - obsidian/);
  // Verify semantic correctness via round-trip
  const parsed = parseBlock(block);
  assert.deepEqual(parsed.aliases, ["alpha", "beta"]);
  assert.deepEqual(parsed.tags, ["mcp", "obsidian"]);
});

test("Custom array key uses block-list format (regression: was inline)", () => {
  const block = buildFrontmatterBlock({
    title: "T", aliases: undefined, tags: undefined, author: undefined,
    date: undefined, source: undefined, type: undefined, "Service URL": undefined,
    core_tools: ["create_note", "update_note", "list_directory"],
  });
  assert.match(block, /core_tools:\n  - create_note/);
  assert.doesNotMatch(block, /core_tools: -/); // old broken format
});

// ─── 4. YAML validity — js-yaml.load must parse cleanly ──────────────────────

test("buildFrontmatterBlock output is valid YAML for complex frontmatter", () => {
  const fm = {
    title: "복잡한 노트", aliases: ["별명1", "별명2"], tags: ["mcp", "obsidian"],
    author: "Leslie JIN", date: "2026-06-27", source: "https://example.com",
    type: "reference", "Service URL": "https://github.com/chs2147/obsidian-local-mcp",
    related_notes: ["[[노트A]]", "[[노트B]]", "[[한글 노트C]]"],
    models: ["claude-sonnet-4-6", "claude-opus-4-8"],
  };
  const block = buildFrontmatterBlock(fm);
  const inner = block.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  let parsed;
  assert.doesNotThrow(() => { parsed = yaml.load(inner); }, "must be valid YAML");
  assert.deepEqual(parsed.related_notes, fm.related_notes);
  assert.deepEqual(parsed.models, fm.models);
  assert.deepEqual(parsed.aliases, fm.aliases);
});

// ─── 5. Round-trip: composeNote → disk → parseNote ───────────────────────────

test("Korean text survives write-to-disk round-trip", () => {
  const note = composeNote(
    { title: "로컬 AI 서버 구축", tags: ["맥북", "서버", "로컬"], aliases: ["맥북 AI", "OpenClaw 세팅"], date: "2026-06-27", type: "note" },
    "본문 내용: 맥북 AI 서버 구축 방법"
  );
  const { frontmatter, body } = roundTrip(note);
  assert.equal(frontmatter.title, "로컬 AI 서버 구축");
  assert.deepEqual(frontmatter.tags, ["맥북", "서버", "로컬"]);
  assert.deepEqual(frontmatter.aliases, ["맥북 AI", "OpenClaw 세팅"]);
  assert.match(body, /맥북 AI 서버 구축 방법/);
});

test("update_note flow: mergeFrontmatterBlock preserves Korean custom arrays", () => {
  const initial = composeNote({ title: "기존 노트", tags: ["test"], date: "2026-06-27", type: "note" }, "본문");
  const { frontmatter } = roundTrip(initial);
  const patch = {
    source: "업데이트된 출처",
    related_notes: ["[[맥북 AI 서버]]", "[[로컬 개발 환경]]", "[[OpenClaw 세팅 가이드]]"],
  };
  const block = mergeFrontmatterBlock(frontmatter, patch);
  const note2 = `${block}\n\n본문\n`;
  const { frontmatter: fm2 } = roundTrip(note2);

  assert.equal(fm2.source, "업데이트된 출처");
  assert.deepEqual(fm2.related_notes, patch.related_notes, "Korean wiki links must survive round-trip");
  assert.deepEqual(fm2.tags, ["test"], "existing tags preserved");
});

// ─── 6. Standard 8-key normalization regression ──────────────────────────────

test("PROPERTY_ORDER: 8 standard keys in correct order", () => {
  assert.deepEqual([...PROPERTY_ORDER],
    ["title", "aliases", "tags", "author", "date", "source", "type", "Service URL"]);
});

test("isStandardFrontmatter: correct detection", () => {
  const standard = { title:"T", aliases:undefined, tags:["a"], author:"X",
    date:"2026-06-27", source:"", type:"note", "Service URL":"" };
  assert.equal(isStandardFrontmatter(standard), true);

  const missingKey = { title:"T", tags:["a"], date:"2026-06-27" };
  assert.equal(isStandardFrontmatter(missingKey), false);

  const wrongOrder = { date:"2026-06-27", title:"T", tags:[], author:"", aliases:[], source:"", type:"", "Service URL":"" };
  assert.equal(isStandardFrontmatter(wrongOrder), false);
});

test("normalizeFrontmatter: adds missing standard keys, preserves custom keys in order", () => {
  const existing = { title: "노트", tags: ["mcp"], date: "2026-06-27", myCustom: ["a", "b"] };
  const normalized = normalizeFrontmatter(existing);
  const keys = Object.keys(normalized);
  // All PROPERTY_ORDER keys must appear first
  for (let i = 0; i < PROPERTY_ORDER.length; i++) {
    assert.equal(keys[i], PROPERTY_ORDER[i]);
  }
  // Custom key at the end
  assert.equal(keys[keys.length - 1], "myCustom");
  // Original values preserved
  assert.equal(normalized.title, "노트");
  assert.deepEqual(normalized.tags, ["mcp"]);
  assert.deepEqual(normalized.myCustom, ["a", "b"]);
});

test("mergeFrontmatterBlock: normalizes non-standard frontmatter before patching", () => {
  const nonStandard = { date: "2026-06-27", title: "순서 이상", tags: ["old"] }; // wrong order + missing keys
  const block = mergeFrontmatterBlock(nonStandard, { source: "패치됨" });
  const keys = Object.keys(parseBlock(block) ?? {}).filter(k => PROPERTY_ORDER.includes(k));
  // Verify standard key ordering in output
  let cursor = -1;
  for (const key of PROPERTY_ORDER) {
    const idx = block.indexOf(`\n${key}:`);
    if (idx > cursor) cursor = idx;
    else if (idx !== -1) assert.fail(`Key ${key} is out of order in output`);
  }
  assert.equal(parseBlock(block).source, "패치됨");
});

// ─── 7. Edge cases ───────────────────────────────────────────────────────────

test("Empty array emits bare key", () => {
  const block = buildFrontmatterBlock({ title: undefined, aliases: [], tags: [],
    author: undefined, date: undefined, source: undefined, type: undefined, "Service URL": undefined });
  assert.match(block, /^aliases:$/m);
  assert.match(block, /^tags:$/m);
});

test("null value emits bare key", () => {
  const block = buildFrontmatterBlock({ title: null, aliases: null, tags: null,
    author: null, date: null, source: null, type: null, "Service URL": null });
  for (const key of PROPERTY_ORDER) {
    assert.match(block, new RegExp(`^${key.replace(" ", " ")}:$`, "m"));
  }
});

test("Date object renders as YYYY-MM-DD", () => {
  const d = new Date("2026-06-27T00:00:00.000Z");
  const block = buildFrontmatterBlock({ title: undefined, aliases: undefined, tags: undefined,
    author: undefined, date: d, source: undefined, type: undefined, "Service URL": undefined });
  assert.match(block, /^date: 2026-06-27$/m);
});

test("ISO date string emits unquoted", () => {
  const block = buildFrontmatterBlock({ title: undefined, aliases: undefined, tags: undefined,
    author: undefined, date: "2026-06-27", source: undefined, type: undefined, "Service URL": undefined });
  assert.match(block, /^date: 2026-06-27$/m);
  assert.doesNotMatch(block, /date: '2026-06-27'/);
});

test("parseNote throws with helpful message on broken YAML", () => {
  const broken = "---\ntitle: test\nbroken: - item1\n- item2\n---\n\nbody\n";
  assert.throws(
    () => parseNote(broken),
    (err) => err.message.includes("frontmatter가 깨졌을 수 있음") || err.message.includes("YAML"),
    "should throw with helpful message"
  );
});
