---
name: obsidian-vault
description: 로컬 Obsidian Vault에 노트를 기록하거나 조회할 때 사용한다. 사용자가 "옵시디언/Vault에 정리해줘, 노트로 저장해줘, 메모해둬, 기록해줘" 또는 Vault 내 문서를 찾고/읽고/수정하라고 할 때 트리거된다. obsidian-local-mcp 도구를 통해 Obsidian YAML 속성을 갖춘 노트를 일관되게 생성·관리한다.
---

# Obsidian Vault 연동 작업 규칙

이 스킬은 `obsidian-local-mcp` MCP 서버와 연동해 로컬 Obsidian Vault를 읽고 쓴다.
Vault 위치는 사용자가 설정 페이지(`npm run settings`)에서 지정하며, 도구는 항상 그 Vault
범위 안에서만 동작한다.

## 사용 가능한 도구

- `create_note` — 새 노트 생성 (YAML 속성 자동 부여)
- `read_note` — 노트 원문/frontmatter/본문 읽기
- `update_note` — 본문(append/prepend/replace_body) 및 frontmatter 부분 수정
- `list_directory` — 폴더 내 파일/하위 폴더 목록 (recursive 가능)
- `create_directory` — 폴더 생성
- `search_notes` — 파일명/본문/태그 검색
- `get_vault_info` — 현재 Vault 경로·기본 author·노트 수 확인

## 기본 원칙

1. **모든 신규 문서는 `create_note`로 만든다.** 8개 Obsidian 속성이 고정 순서로 부여된다:
   `title → aliases → tags → author → date → source → type → Service URL`.
   값은 문맥에서 추론해 최대한 채운다. 모르는 값은 비워 두면 빈 키만 유지된다.

2. **속성 채우기 가이드**
   - `title`: 문서의 제목. 파일명과 별개로 사람이 읽는 제목.
   - `aliases`: 같은 문서를 가리키는 다른 이름/약어가 있으면 배열로.
   - `tags`: 주제 분류 태그(공백 없이, 예: `project`, `meeting`, `idea`).
   - `author`: 지정하지 않으면 설정의 기본 author가 자동 적용된다. 원문 작성자가
     따로 있으면 명시한다.
   - `date`: 특별한 지시가 없으면 **오늘 날짜**를 `YYYY-MM-DD`로.
   - `source`: 내용의 출처(원문 제목, 책, 대화, 회의 등).
   - `type`: 문서 유형(`note`, `article`, `meeting`, `reference`, `idea` 등).
   - `Service URL`(파라미터명 `serviceUrl`): 관련 웹/서비스 링크가 있으면 채운다.

3. **파일 경로/이름 규칙**
   - 경로는 Vault 기준 상대경로. `.md`는 생략 가능.
   - 주제별 폴더로 정리한다(예: `meetings/2026/...`, `references/...`).
   - 폴더가 필요하면 `create_note`가 자동 생성하므로 별도 `create_directory`는
     빈 폴더가 꼭 필요할 때만 쓴다.

4. **수정할 때는 먼저 읽는다.** `read_note`로 현재 내용을 확인한 뒤 `update_note`를 쓴다.
   `update_note`에 속성을 넘기면 해당 frontmatter 키만 병합되고 나머지는 보존된다.
   본문은 `mode`(append/prepend/replace_body) + `content`로 갱신한다.
   **기존 문서의 속성이 표준 형식이 아닌 경우(8개 키 누락 또는 순서 불일치),
   `update_note` 실행 시 자동으로 표준 속성 순서로 재구성된다.** 응답에
   `[속성 재구성: 표준 8개 키 순서로 정규화됨]`이 포함되면 정규화가 발생한 것이다.

5. **찾을 때는 검색을 먼저.** 위치를 모르면 `search_notes`(파일명/본문/태그) 또는
   `list_directory`로 탐색한 뒤 작업한다. 중복 생성을 피한다.

6. **Vault 미설정 에러가 나면** 사용자에게 터미널에서 `npm run settings`를 실행해
   Vault 폴더를 지정하도록 안내한다.

## 예시 흐름

- "이 회의 내용 옵시디언에 정리해줘" →
  `create_note(path="meetings/2026-06-26-팀회의.md", title="팀 회의 2026-06-26",
  tags=["meeting"], date="2026-06-26", type="meeting", content="...")`
- "어제 만든 결제 노트에 결론 추가해줘" →
  `search_notes(query="결제")` → `read_note(...)` →
  `update_note(path=..., mode="append", content="## 결론\n...")`
