import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig, getConfigPath } from "./config.js";
import {
  ensureMarkdownPath,
  pathExists,
  readNoteFile,
  writeNoteFile,
  makeDirectory,
  listDirectory,
  allMarkdownPaths,
  countNotes,
  resolveInVault,
} from "./vault.js";
import {
  composeNote,
  parseNote,
  mergeFrontmatterBlock,
  isStandardFrontmatter,
  NoteProperties,
} from "./frontmatter.js";

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (o: unknown) => text(JSON.stringify(o, null, 2));

/** Shared zod fields for the 8 Obsidian properties (all optional). */
const propertyShape = {
  title: z.string().optional().describe("문서 제목 (title)"),
  aliases: z.array(z.string()).optional().describe("별칭 목록 (aliases)"),
  tags: z.array(z.string()).optional().describe("태그 목록 (tags)"),
  author: z.string().optional().describe("작성자. 미지정 시 설정의 기본 author 사용 (author)"),
  date: z.string().optional().describe("날짜, 예: 2026-06-26 (date)"),
  source: z.string().optional().describe("출처 (source)"),
  type: z.string().optional().describe("문서 유형 (type)"),
  serviceUrl: z.string().optional().describe("관련 서비스 URL (Service URL)"),
};

/** Collect defined property params into a partial YAML-key map for patching. */
function buildPatchMap(p: NoteProperties): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  if (p.title !== undefined) map.title = p.title;
  if (p.aliases !== undefined) map.aliases = p.aliases;
  if (p.tags !== undefined) map.tags = p.tags;
  if (p.author !== undefined) map.author = p.author;
  if (p.date !== undefined) map.date = p.date;
  if (p.source !== undefined) map.source = p.source;
  if (p.type !== undefined) map.type = p.type;
  if (p.serviceUrl !== undefined) map["Service URL"] = p.serviceUrl;
  return map;
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "create_note",
    {
      title: "노트 생성",
      description:
        "Vault 안에 새 노트를 만든다. Obsidian YAML 속성(title, aliases, tags, author, date, source, type, Service URL)이 고정 순서로 기본 부여된다. 값을 채우려면 해당 파라미터를 넘기고, 비우면 빈 키만 유지된다.",
      inputSchema: {
        path: z.string().describe("Vault 기준 상대경로. .md 생략 가능. 부모 폴더는 자동 생성."),
        content: z.string().optional().describe("본문 markdown (frontmatter 제외)"),
        overwrite: z.boolean().optional().describe("이미 있으면 덮어쓸지 여부 (기본 false)"),
        ...propertyShape,
      },
    },
    async (args) => {
      const relPath = ensureMarkdownPath(args.path);
      if (pathExists(relPath) && !args.overwrite) {
        throw new Error(`이미 존재하는 노트입니다: ${relPath} (overwrite=true로 덮어쓸 수 있음)`);
      }
      const config = loadConfig();
      const props: NoteProperties = {
        title: args.title,
        aliases: args.aliases,
        tags: args.tags,
        author: args.author ?? (config.defaultAuthor || undefined),
        date: args.date,
        source: args.source,
        type: args.type,
        serviceUrl: args.serviceUrl,
      };
      const note = composeNote(props, args.content ?? "");
      writeNoteFile(relPath, note);
      return text(`노트를 생성했습니다: ${relPath}\n\n${note}`);
    }
  );

  server.registerTool(
    "read_note",
    {
      title: "노트 읽기",
      description: "Vault 내 노트의 원문, 파싱된 frontmatter, 본문을 반환한다.",
      inputSchema: { path: z.string().describe("Vault 기준 상대경로 (.md 생략 가능)") },
    },
    async (args) => {
      const relPath = ensureMarkdownPath(args.path);
      const raw = readNoteFile(relPath);
      const { frontmatter, body } = parseNote(raw);
      return json({ path: relPath, frontmatter, body, raw });
    }
  );

  server.registerTool(
    "update_note",
    {
      title: "노트 수정",
      description:
        "기존 노트의 본문과 frontmatter를 수정한다. mode로 본문 갱신 방식을 정하고, 속성 파라미터를 넘기면 해당 frontmatter 키만 병합한다(나머지는 보존, 키 순서 유지).",
      inputSchema: {
        path: z.string().describe("Vault 기준 상대경로 (.md 생략 가능)"),
        mode: z
          .enum(["append", "prepend", "replace_body"])
          .optional()
          .describe("본문 갱신 방식. content와 함께 사용."),
        content: z.string().optional().describe("추가/대체할 본문 markdown"),
        ...propertyShape,
      },
    },
    async (args) => {
      const relPath = ensureMarkdownPath(args.path);
      const raw = readNoteFile(relPath);
      const { frontmatter, body } = parseNote(raw);

      const normalized = !isStandardFrontmatter(frontmatter);
      const patch = buildPatchMap(args);
      const block = mergeFrontmatterBlock(frontmatter, patch);

      let newBody = body;
      if (args.content !== undefined && args.mode) {
        if (args.mode === "append") newBody = `${body.replace(/\s*$/, "")}\n\n${args.content}`;
        else if (args.mode === "prepend") newBody = `${args.content}\n\n${body.replace(/^\n+/, "")}`;
        else newBody = args.content; // replace_body
      }

      const composed = `${block}\n\n${newBody.replace(/^\n+/, "").replace(/\s*$/, "")}\n`;
      writeNoteFile(relPath, composed);
      const notice = normalized ? "\n[속성 재구성: 표준 8개 키 순서로 정규화됨]" : "";
      return text(`노트를 수정했습니다: ${relPath}${notice}\n\n${composed}`);
    }
  );

  server.registerTool(
    "list_directory",
    {
      title: "디렉토리 목록",
      description: "Vault 내 디렉토리의 파일/폴더 목록을 반환한다. (.으로 시작하는 항목 제외)",
      inputSchema: {
        path: z.string().optional().describe("Vault 기준 상대경로. 생략 시 루트."),
        recursive: z.boolean().optional().describe("하위 폴더까지 재귀 탐색 (기본 false)"),
      },
    },
    async (args) => {
      const entries = listDirectory(args.path ?? "", args.recursive ?? false);
      return json({ path: args.path ?? "", count: entries.length, entries });
    }
  );

  server.registerTool(
    "create_directory",
    {
      title: "디렉토리 생성",
      description: "Vault 안에 폴더를 (재귀적으로) 생성한다.",
      inputSchema: { path: z.string().describe("Vault 기준 상대경로") },
    },
    async (args) => {
      makeDirectory(args.path);
      return text(`디렉토리를 생성했습니다: ${args.path}`);
    }
  );

  server.registerTool(
    "search_notes",
    {
      title: "노트 검색",
      description:
        "Vault 내 노트를 파일명/본문/태그 기준으로 검색한다. (대소문자 무시, 단순 부분일치)",
      inputSchema: {
        query: z.string().describe("검색어"),
        in: z
          .enum(["filename", "content", "tags"])
          .optional()
          .describe("검색 대상 (기본 content)"),
      },
    },
    async (args) => {
      const target = args.in ?? "content";
      const q = args.query.toLowerCase();
      const results: { path: string; snippet?: string }[] = [];
      for (const relPath of allMarkdownPaths()) {
        if (target === "filename") {
          if (relPath.toLowerCase().includes(q)) results.push({ path: relPath });
          continue;
        }
        const raw = readNoteFile(relPath);
        if (target === "tags") {
          const { frontmatter } = parseNote(raw);
          const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
          if (tags.some((t) => String(t).toLowerCase().includes(q))) results.push({ path: relPath });
        } else {
          const idx = raw.toLowerCase().indexOf(q);
          if (idx >= 0) {
            const start = Math.max(0, idx - 40);
            results.push({ path: relPath, snippet: raw.slice(start, idx + q.length + 40).replace(/\n/g, " ") });
          }
        }
      }
      return json({ query: args.query, in: target, count: results.length, results });
    }
  );

  server.registerTool(
    "get_vault_info",
    {
      title: "Vault 정보",
      description: "현재 설정된 Vault 경로, 기본 author, 노트 수, config 파일 위치를 반환한다.",
      inputSchema: {},
    },
    async () => {
      const config = loadConfig();
      let vaultRoot = "";
      try {
        vaultRoot = resolveInVault("");
      } catch (e) {
        return json({
          configured: false,
          message: (e as Error).message,
          configPath: getConfigPath(),
        });
      }
      return json({
        configured: true,
        vaultPath: vaultRoot,
        defaultAuthor: config.defaultAuthor || null,
        noteCount: countNotes(),
        configPath: getConfigPath(),
      });
    }
  );
}
