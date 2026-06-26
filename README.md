# obsidian-local-mcp

로컬 디스크의 특정 디렉토리를 **Obsidian Vault**로 다루는 MCP 서버입니다.
Claude(Desktop / Code)가 Vault 안에서 노트를 **생성·읽기·수정**하고 **폴더를 읽고
생성**할 수 있게 합니다. Claude가 만드는 모든 신규 노트에는 Obsidian Properties
(YAML frontmatter)가 고정 순서로 기본 부여됩니다:

```yaml
---
title:
aliases:
tags:
author:
date:
source:
type:
Service URL:
---
```

Vault 위치와 기본 author는 **로컬 웹 설정 페이지(GUI)** 에서 변경합니다.

## 구성 요소

| 항목 | 설명 |
| --- | --- |
| MCP 서버 (`dist/index.js`) | 7개 도구 제공 (아래) |
| 설정 페이지 (`npm run settings`) | localhost 웹 UI — Vault 폴더 선택(네이티브 다이얼로그) + 기본 author |
| 스킬 (`skills/obsidian-vault`) | Vault 연동 작업 규칙을 담은 Claude Skill |

### MCP 도구

- `create_note` — 새 노트 생성(YAML 속성 자동 부여)
- `read_note` — 노트 원문/frontmatter/본문 읽기
- `update_note` — 본문(append/prepend/replace_body)·frontmatter 부분 수정
- `list_directory` — 폴더 목록(recursive 옵션)
- `create_directory` — 폴더 생성
- `search_notes` — 파일명/본문/태그 검색
- `get_vault_info` — Vault 경로·기본 author·노트 수 확인

## 설치

```bash
npm install
npm run build
```

## 1) Vault 지정 (GUI)

```bash
npm run settings
```

브라우저에 설정 페이지가 열립니다. **‘폴더 선택…’** 으로 macOS 폴더 다이얼로그를 띄워
Vault 폴더를 고르고(직접 입력도 가능), 기본 `author`를 입력한 뒤 **저장**합니다.
설정은 다음 위치에 저장되며, 실행 중인 MCP 서버에 다음 도구 호출부터 반영됩니다:

```
~/Library/Application Support/obsidian-local-mcp/config.json
```

> 참고: 설정 파일이 없으면 환경변수 `OBSIDIAN_VAULT_PATH`가 폴백으로 사용됩니다.

## 2) Claude에 등록

### Claude Code (CLI)

```bash
claude mcp add obsidian -- node /ABSOLUTE/PATH/TO/obsidian-local-mcp/dist/index.js
```

또는 프로젝트 루트에 `examples/mcp.json` 내용을 참고해 `.mcp.json`을 둡니다.

스킬은 다음 중 한 곳에 복사합니다:

```bash
# 전역 사용
cp -r skills/obsidian-vault ~/.claude/skills/
# 또는 특정 프로젝트에서만
cp -r skills/obsidian-vault /your/project/.claude/skills/
```

### Claude Desktop

`claude_desktop_config.json`에 다음을 추가합니다 (`examples/claude_desktop_config.json` 참고):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/obsidian-local-mcp/dist/index.js"]
    }
  }
}
```

설정 파일 위치: `~/Library/Application Support/Claude/claude_desktop_config.json`.
변경 후 Claude Desktop을 재시작합니다. 스킬은 Claude Desktop의 Skills(Capabilities)
설정에서 `skills/obsidian-vault` 폴더를 추가/활성화합니다.

## 동작 방식 / 안전성

- 모든 경로는 **Vault 루트 기준 상대경로**만 허용합니다. 절대경로와 `..` 탈출은 거부되어
  Vault 밖 파일에 접근할 수 없습니다.
- frontmatter는 항상 고정된 8개 키 순서로 직렬화됩니다(`aliases`/`tags`는 리스트,
  `date`는 Obsidian date 형식으로 비따옴표 출력).
- `.obsidian`, `.trash` 등 점(`.`)으로 시작하는 항목은 목록/검색에서 제외됩니다.

## 검증 (MCP Inspector)

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Inspector에서 `get_vault_info` → `create_note` → `read_note` → `list_directory`
순으로 호출해 동작을 확인할 수 있습니다.
