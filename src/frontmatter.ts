import matter from "gray-matter";
import yaml from "js-yaml";

/**
 * The Obsidian Properties, in the exact order they appear in the vault's
 * property panel. Note `Service URL` is a literal key with a space.
 */
export const PROPERTY_ORDER = [
  "title",
  "aliases",
  "tags",
  "author",
  "date",
  "source",
  "type",
  "Service URL",
] as const;

/** Values accepted from tools, keyed by tool-parameter name. */
export interface NoteProperties {
  title?: string;
  aliases?: string[];
  tags?: string[];
  author?: string;
  date?: string;
  source?: string;
  type?: string;
  serviceUrl?: string;
}

/** Map tool-parameter names to the literal YAML property keys. */
function toPropertyMap(props: NoteProperties): Record<string, unknown> {
  return {
    title: props.title,
    aliases: props.aliases,
    tags: props.tags,
    author: props.author,
    date: props.date,
    source: props.source,
    type: props.type,
    "Service URL": props.serviceUrl,
  };
}

/** ISO date (YYYY-MM-DD) or datetime — Obsidian date/datetime property format. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/;

function dumpScalar(value: unknown): string {
  // YAML parsing turns unquoted ISO dates into Date objects; render them back to
  // a clean date (or datetime) string instead of a full timestamp.
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof value === "string") {
    // ISO dates: emit unquoted so Obsidian recognizes them as date-type properties.
    if (ISO_DATE.test(value)) return value;
    // yaml.dump serializes the string and appends \n; trimEnd removes only that trailing newline.
    // Using trimEnd (not trim) so any intentional leading whitespace is not silently stripped.
    return yaml.dump(value, { lineWidth: -1, flowLevel: -1 }).trimEnd();
  }
  return yaml.dump(value, { lineWidth: -1, flowLevel: -1 }).trimEnd();
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Serialize one `key: value` line (or block for lists). Empty => bare `key:`. */
function serializeEntry(key: string, value: unknown): string {
  if (isEmpty(value)) return `${key}:`;
  // All arrays — standard (aliases, tags) and custom — get block list format.
  if (Array.isArray(value)) {
    const items = value.map((v) => `  - ${dumpScalar(v)}`).join("\n");
    return `${key}:\n${items}`;
  }
  return `${key}: ${dumpScalar(value)}`;
}

/**
 * Build a frontmatter block (`---\n...\n---`) with all default properties
 * present in fixed order, plus any extra keys appended afterward in their
 * original order.
 */
export function buildFrontmatterBlock(map: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const key of PROPERTY_ORDER) {
    lines.push(serializeEntry(key, map[key]));
  }
  for (const key of Object.keys(map)) {
    if (!(PROPERTY_ORDER as readonly string[]).includes(key)) {
      lines.push(serializeEntry(key, map[key]));
    }
  }
  return `---\n${lines.join("\n")}\n---`;
}

/** Compose a full note: frontmatter block + body. */
export function composeNote(props: NoteProperties, body: string): string {
  const block = buildFrontmatterBlock(toPropertyMap(props));
  const trimmedBody = (body ?? "").replace(/^\n+/, "");
  return `${block}\n\n${trimmedBody}`.replace(/\s*$/, "") + "\n";
}

export interface ParsedNote {
  frontmatter: Record<string, unknown>;
  body: string;
}

/** Parse an existing note into frontmatter object + body. */
export function parseNote(raw: string): ParsedNote {
  try {
    const parsed = matter(raw);
    return { frontmatter: parsed.data ?? {}, body: parsed.content ?? "" };
  } catch (e) {
    throw new Error(
      `YAML frontmatter 파싱 실패: ${(e as Error).message}\n` +
      `이 노트의 frontmatter가 깨졌을 수 있습니다. 파일을 직접 열어 YAML 블록(--- ~ ---)을 확인하고 수동으로 복구하세요.`
    );
  }
}

/**
 * Return true if the frontmatter already contains all 8 standard keys
 * in the correct order (i.e. no normalisation needed).
 */
export function isStandardFrontmatter(fm: Record<string, unknown>): boolean {
  const keys = Object.keys(fm);
  let cursor = 0;
  for (const key of PROPERTY_ORDER) {
    const idx = keys.indexOf(key);
    if (idx === -1) return false;       // missing key
    if (idx < cursor) return false;     // wrong order
    cursor = idx;
  }
  return true;
}

/**
 * Ensure every standard key is present (adds missing ones as empty/null)
 * and reorder so canonical keys come first in PROPERTY_ORDER sequence,
 * followed by any extra keys in their original order.
 * Existing values are preserved as-is.
 */
export function normalizeFrontmatter(
  existing: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PROPERTY_ORDER) {
    out[key] = key in existing ? existing[key] : undefined;
  }
  for (const key of Object.keys(existing)) {
    if (!(PROPERTY_ORDER as readonly string[]).includes(key)) {
      out[key] = existing[key];
    }
  }
  return out;
}

/**
 * Merge a partial frontmatter patch into existing data.
 * If the existing frontmatter is non-standard (missing keys or wrong order),
 * it is normalized to the canonical form first, then the patch is applied.
 */
export function mergeFrontmatterBlock(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): string {
  const base = isStandardFrontmatter(existing)
    ? { ...existing }
    : normalizeFrontmatter(existing);

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) base[key] = value;
  }
  return buildFrontmatterBlock(base);
}
