import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { loadConfig, saveConfig, getConfigPath } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(__dirname, "ui", "settings.html");
const START_PORT = 4567;

function send(res: http.ServerResponse, status: number, body: string, type = "application/json") {
  res.writeHead(status, { "Content-Type": `${type}; charset=utf-8` });
  res.end(body);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** Open a native macOS folder-picker and resolve to an absolute POSIX path. */
function pickFolder(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (process.platform !== "darwin") {
      reject(new Error("네이티브 폴더 선택은 macOS에서만 지원됩니다. 경로를 직접 입력하세요."));
      return;
    }
    const script = [
      'tell application "System Events" to activate',
      'set chosen to POSIX path of (choose folder with prompt "Obsidian Vault 폴더를 선택하세요")',
      "return chosen",
    ].join("\n");
    execFile("osascript", ["-e", script], (err, stdout) => {
      if (err) {
        // User cancelled the dialog => not an error, just no selection.
        if (/User canceled|-128/.test(err.message)) return resolve(null);
        return reject(err);
      }
      resolve(stdout.trim().replace(/\/$/, ""));
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      send(res, 200, readFileSync(HTML_PATH, "utf8"), "text/html");
      return;
    }

    if (req.method === "GET" && req.url === "/api/config") {
      const cfg = loadConfig();
      send(res, 200, JSON.stringify({ ...cfg, configPath: getConfigPath() }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/pick-folder") {
      const path = await pickFolder();
      send(res, 200, JSON.stringify({ path }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/config") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const vaultPath = String(body.vaultPath ?? "").trim();
      const defaultAuthor = String(body.defaultAuthor ?? "");
      if (vaultPath && (!existsSync(vaultPath) || !statSync(vaultPath).isDirectory())) {
        send(res, 400, JSON.stringify({ error: `폴더가 존재하지 않습니다: ${vaultPath}` }));
        return;
      }
      const saved = saveConfig({ vaultPath, defaultAuthor });
      send(res, 200, JSON.stringify({ ...saved, configPath: getConfigPath() }));
      return;
    }

    send(res, 404, JSON.stringify({ error: "Not found" }));
  } catch (e) {
    send(res, 500, JSON.stringify({ error: (e as Error).message }));
  }
});

function listen(port: number, attemptsLeft: number) {
  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error("설정 서버를 시작할 수 없습니다:", err.message);
      process.exit(1);
    }
  });
  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.error(`설정 페이지: ${url}`);
    if (process.platform === "darwin") {
      execFile("open", [url], () => {});
    }
  });
}

listen(START_PORT, 10);
