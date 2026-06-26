import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";

export interface AppConfig {
  /** Absolute path to the Obsidian vault root. Empty string when unset. */
  vaultPath: string;
  /** Default `author` value injected into new-note frontmatter when none is supplied. */
  defaultAuthor: string;
}

const DEFAULT_CONFIG: AppConfig = { vaultPath: "", defaultAuthor: "" };

/**
 * Directory that holds config.json. Uses the macOS Application Support convention;
 * falls back to ~/.config on other platforms.
 */
export function getConfigDir(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "obsidian-local-mcp");
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "obsidian-local-mcp");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

/**
 * Load config from disk. Missing/invalid file => defaults. The `OBSIDIAN_VAULT_PATH`
 * env var acts as a fallback only when the stored vaultPath is empty.
 */
export function loadConfig(): AppConfig {
  let stored: Partial<AppConfig> = {};
  const path = getConfigPath();
  if (existsSync(path)) {
    try {
      stored = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      stored = {};
    }
  }
  const config: AppConfig = {
    vaultPath: stored.vaultPath || process.env.OBSIDIAN_VAULT_PATH || "",
    defaultAuthor: stored.defaultAuthor ?? "",
  };
  return config;
}

/** Merge and persist a partial config update. Returns the full saved config. */
export function saveConfig(update: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const next: AppConfig = { ...DEFAULT_CONFIG, ...current, ...update };
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

/**
 * Resolve the active vault path or throw a user-facing error pointing to the
 * settings UI. Validates that the path exists and is a directory.
 */
export function requireVaultPath(): string {
  const { vaultPath } = loadConfig();
  if (!vaultPath) {
    throw new Error(
      "Obsidian Vault가 설정되지 않았습니다. `npm run settings`로 설정 페이지를 열어 Vault 폴더를 지정하세요."
    );
  }
  if (!existsSync(vaultPath) || !statSync(vaultPath).isDirectory()) {
    throw new Error(
      `설정된 Vault 경로가 존재하지 않거나 폴더가 아닙니다: ${vaultPath}. \`npm run settings\`에서 다시 지정하세요.`
    );
  }
  return vaultPath;
}
