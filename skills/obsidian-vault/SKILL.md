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

3. **신규 노트 저장 위치는 반드시 사용자에게 확인한다** ← 핵심 규칙
   노트를 생성하기 전에 아래 순서를 따른다:

   **Step 1 — 기존 디렉토리 탐색**
   `list_directory(recursive=false)`로 Vault 루트의 1단계 폴더 목록을 가져온다.
   문서 내용·타입·태그를 기준으로 유사한 문서가 담길 것 같은 기존 폴더를 1~3개 추천 후보로 추린다.

   **Step 2 — 사용자에게 확인 요청**
   `create_note`를 호출하기 전에 반드시 사용자에게 다음을 제시하고 확인을 기다린다:
   - 추천 저장 경로 (후보가 여럿이면 순위 표시)
   - 제안 파일명
   - "다른 위치를 원하시면 말씀해 주세요" 안내

   **Step 3 — 확인 후 생성**
   사용자가 경로를 승인하거나 수정해 주면, 그때 `create_note`를 호출한다.

   > 예외: 사용자가 경로를 직접 명시한 경우("xxx 폴더에 저장해줘")는 확인 절차 생략.

4. **1 요청 = 1 파일, 디렉토리 구조는 함부로 만들지 않는다**
   - 하나의 노트 생성 요청에는 **파일 1개**만 만든다. 목차·섹션이 많더라도 하나의 파일에 담는다.
   - **새 디렉토리를 임의로 생성하지 않는다.** 기존 Vault 폴더 구조를 최대한 유지한다.
   - 기존 폴더가 하나도 맞지 않아 새 폴더가 꼭 필요한 경우에만, 사용자에게 새 폴더 이름을
     제안하고 **명시적 승인**을 받은 뒤 생성한다.
   - `create_directory`는 위 승인이 있을 때만 사용한다.

5. **파일명 규칙**
   - 경로는 Vault 기준 상대경로. `.md`는 생략 가능.
   - 파일명은 내용을 한눈에 알 수 있게 간결하게 (날짜 포함 시 `YYYY-MM-DD-제목` 형식).

6. **수정할 때는 먼저 읽는다.** `read_note`로 현재 내용을 확인한 뒤 `update_note`를 쓴다.
   `update_note`에 속성을 넘기면 해당 frontmatter 키만 병합되고 나머지는 보존된다.
   본문은 `mode`(append/prepend/replace_body) + `content`로 갱신한다.
   **기존 문서의 속성이 표준 형식이 아닌 경우(8개 키 누락 또는 순서 불일치),
   `update_note` 실행 시 자동으로 표준 속성 순서로 재구성된다.** 응답에
   `[속성 재구성: 표준 8개 키 순서로 정규화됨]`이 포함되면 정규화가 발생한 것이다.

7. **찾을 때는 검색을 먼저.** 위치를 모르면 `search_notes`(파일명/본문/태그) 또는
   `list_directory`로 탐색한 뒤 작업한다. 중복 생성을 피한다.

8. **Vault 미설정 에러가 나면** 사용자에게 터미널에서 `npm run settings`를 실행해
   Vault 폴더를 지정하도록 안내한다.

## 예시 흐름

### 신규 노트 — 위치 확인 절차

```
사용자: "MCP 스펙 정리해줘"

1. list_directory(path="", recursive=false) 로 루트 폴더 목록 확인
2. 결과 예: ["projects/", "references/", "meetings/", "dev/"]
3. 사용자에게 제안:
   "다음 위치 중 어디에 저장할까요?
    1. references/MCP-스펙.md  ← 참고 문서 모음 (추천)
    2. dev/MCP-스펙.md         ← 개발 관련 폴더
    직접 경로를 지정하셔도 됩니다."
4. 사용자 확인 후 → create_note(path="references/MCP-스펙.md", ...)
```

### 수정 흐름

```
사용자: "어제 만든 결제 노트에 결론 추가해줘"
→ search_notes(query="결제") → read_note(...) → update_note(path=..., mode="append", content="## 결론\n...")
```
