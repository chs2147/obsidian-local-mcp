import { resolve, relative, isAbsolute, join, dirname, sep } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  readdirSync,
} from "node:fs";
import { requireVaultPath } from "./config.js";

/**
 * Resolve a vault-relative path to an absolute path, rejecting absolute inputs
 * and any `..` traversal that would escape the vault root.
 */
export function resolveInVault(relPath: string): string {
  const vaultRoot = requireVaultPath();
  const cleaned = (relPath ?? "").trim().replace(/^[/\\]+/, "");
  if (isAbsolute(relPath ?? "")) {
    throw new Error(`절대경로는 허용되지 않습니다. Vault 기준 상대경로를 사용하세요: ${relPath}`);
  }
  const abs = resolve(vaultRoot, cleaned);
  const rel = relative(vaultRoot, abs);
  if (rel === "" ) return abs; // the vault root itself
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Vault 범위를 벗어난 경로입니다: ${relPath}`);
  }
  return abs;
}

/** Normalize a note path: ensure it ends with `.md`. */
export function ensureMarkdownPath(relPath: string): string {
  const trimmed = (relPath ?? "").trim();
  return /\.md$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

export function vaultRelative(absPath: string): string {
  const vaultRoot = requireVaultPath();
  return relative(vaultRoot, absPath).split(sep).join("/");
}

export function pathExists(relPath: string): boolean {
  return existsSync(resolveInVault(relPath));
}

export function readNoteFile(relPath: string): string {
  const abs = resolveInVault(relPath);
  if (!existsSync(abs)) throw new Error(`노트를 찾을 수 없습니다: ${relPath}`);
  return readFileSync(abs, "utf8");
}

export function writeNoteFile(relPath: string, content: string): void {
  const abs = resolveInVault(relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

export function makeDirectory(relPath: string): void {
  const abs = resolveInVault(relPath);
  mkdirSync(abs, { recursive: true });
}

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

export function listDirectory(relPath: string, recursive: boolean): DirEntry[] {
  const abs = resolveInVault(relPath || "");
  if (!existsSync(abs)) throw new Error(`디렉토리를 찾을 수 없습니다: ${relPath || "/"}`);
  if (!statSync(abs).isDirectory()) throw new Error(`디렉토리가 아닙니다: ${relPath}`);

  const out: DirEntry[] = [];
  const walk = (dir: string) => {
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      if (dirent.name.startsWith(".")) continue; // skip dotfiles (e.g. .obsidian, .trash)
      const childAbs = join(dir, dirent.name);
      const type = dirent.isDirectory() ? "directory" : "file";
      out.push({ name: dirent.name, path: vaultRelative(childAbs), type });
      if (recursive && dirent.isDirectory()) walk(childAbs);
    }
  };
  walk(abs);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Recursively collect all `.md` note paths under the vault root. */
export function allMarkdownPaths(): string[] {
  const vaultRoot = requireVaultPath();
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      if (dirent.name.startsWith(".")) continue;
      const childAbs = join(dir, dirent.name);
      if (dirent.isDirectory()) walk(childAbs);
      else if (/\.md$/i.test(dirent.name)) out.push(vaultRelative(childAbs));
    }
  };
  walk(vaultRoot);
  return out.sort();
}

export function countNotes(): number {
  try {
    return allMarkdownPaths().length;
  } catch {
    return 0;
  }
}
