# ClawaaS Web

Next.js 기반 프론트엔드. 로그인, 대시보드, 에이전트별 채팅/로그/파일 뷰를 제공합니다.

## 페이지 구조

| 경로 | 설명 |
|------|------|
| `/login` | 로그인 |
| `/signup` | 회원가입 |
| `/dashboard` | 에이전트 목록, 생성, 삭제 |
| `/agents/[id]` | 에이전트 상세 — Chat / Logs / Files 탭 |

## 실행

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 (http://localhost:3000)
npm run build      # 프로덕션 빌드
npm run start      # 프로덕션 서버
```

## API 프록시

`next.config.js`에서 `/api/*` 요청을 `http://127.0.0.1:8000`으로 프록시합니다. 백엔드 서버가 8000번 포트에서 실행 중이어야 합니다.

## 주요 기능

- **Chat 탭**: 에이전트와 대화. 채팅 기록은 localStorage에 보존.
- **Logs 탭**: 게이트웨이 journald 로그를 SSE로 실시간 스트리밍. 로그 레벨별 색상 구분.
- **Files 탭**: 샌드박스 워크스페이스 디렉토리 탐색, 파일 내용 조회 및 편집/저장.
