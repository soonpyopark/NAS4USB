<p align="center">
  <img src="public/icon.png" alt="NAS4USB" width="128">
</p>

# NAS4USB

USB(또는 단일 폴더)만으로 **오프라인 LAN NAS**와 **실시간 공동 편집**을 제공하는 Windows/macOS Electron 앱입니다.

- **Electron + Vite + React** — 로컬 파일 탐색기 UI
- **Y.js** — HWPX·XLSX·화이트보드 실시간 동기화 (기본 포트 `3008`)
- **에디터 코어** — rhwp(HWPX), FortuneSheet(XLSX), WhiteBoard4Share(.wb4s), TipTap(.tiptap)

> **용도:** USB 이동·교실/회의실 LAN 협업. 인터넷 없이 동작하도록 설계되었습니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| USB 포터블 | `NAS4USB.exe` + `data/` 폴더를 USB에 복사해 실행 |
| LAN 동기화 | Y.js WebSocket — 같은 방(room)에 접속한 클라이언트 간 CRDT 동기화 |
| HWPX 편집 | rhwp-studio 기반 `.hwpx` 브라우저 에디터 |
| Markdown / TXT | textarea 편집 · MD 미리보기 |
| TipTap 문서 | `.tiptap` — Notion-like TipTap 에디터 (ZIP+첨부, 슬래시 메뉴, 실시간 협업) |
| 스프레드시트 | FortuneSheet — `.xlsx` / `.xls` |
| 화이트보드 | `.wb4s` — WhiteBoard4Share 엔진 |
| 파일 접근 제어 | 비공개·열람제한·공유 링크 (총괄관리자) |
| 휴지통 | 총괄관리자 전용 |
| 에디터 코어 업데이트 | `update_all.bat` — rhwp / wb4s / npm 코어 일괄 갱신 |

---

## 빠른 시작 (개발)

### 1) 저장소 · 의존성

```bat
git clone https://github.com/soonpyopark/NAS4USB.git
cd NAS4USB
npm install
```

### 2) 환경 (선택)

```bat
copy .env.example .env
notepad .env
```

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `3008` | HTTP + Y.js WebSocket 포트 |
| `HOSTNAME` | `0.0.0.0` | LAN 접속 허용 (`127.0.0.1` = 로컬만) |
| `DATA_ROOT` | `data` | 문서 저장 루트 (상대·절대 경로) |
| `ADMIN_ID` / `ADMIN_PW` | `admin` / `admin1234` | 총괄관리자 (변경 권장) |

### 3) 실행

```bat
npm run dev
```

- **로컬:** http://127.0.0.1:3008  
- Electron 창이 자동으로 열립니다.

재시작: `npm run dev:restart` · 중지: `npm run dev:stop`

---

## Windows USB 빌드

```bat
npm run build:dist:exe
```

출력: `exe/NAS4USB_<버전>_<타임스탬프>/`

1. 폴더 전체를 USB에 복사  
2. `NAS4USB.exe` 실행  
3. LAN 사용 시 `.env.example` → `.env` 복사 후 `HOSTNAME=0.0.0.0` 확인  
4. 방화벽: `allow-firewall-inbound.bat` (관리자)  
5. 서버 중지: `stop_server.bat`

자세한 안내는 빌드 폴더의 `README-USB.txt`를 참고하세요.

### macOS 빌드 (macOS에서만)

```bat
npm run build:dist:mac
```

---

## 에디터 코어 업데이트

인터넷 가능 PC에서 프로젝트 루트:

```bat
update_all.bat
```

업데이트 후 portable exe까지 빌드:

```bat
npm run build:update_all
```

또는:

```bat
npm run update:all
npm run build:dist:exe
```

옵션: `build` `force` `skip-git` `skip-npm` `skip-cores`  
로그: `.cache/logs/update-all.log`  
상세: [`lib/updates/README.md`](lib/updates/README.md)

---

## npm 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 아이콘·wb4s 준비 후 Electron 개발 실행 |
| `npm run build` | rhwp-studio · wb4s · Vite 프로덕션 빌드 |
| `npm run build:dist:exe` | Windows portable 폴더 생성 |
| `npm run build:dist:mac` | macOS `.app` portable 폴더 생성 |
| `npm run update:all` | 에디터 코어 + npm 의존성 업데이트 |
| `npm run build:update_all` | 업데이트 + Windows exe 빌드 |

---

## 폴더 구조 (요약)

```
NAS4USB/
├── main.js                 Electron 진입점
├── electron/               메인 프로세스 (서버, IPC, 파일 API)
├── src/                    React UI (Vite root)
├── shared/                 공유 상수·유틸
├── lib/rhwp/               rhwp 어댑터 (파싱은 @rhwp/core WASM)
├── lib/updates/            오프라인 USB용 코어 업데이트 패키지
├── public/rhwp-studio/     HWPX 에디터 번들 (빌드 산출)
├── public/wb4s-editor/     화이트보드 embed 번들
├── scripts/                빌드·배포·update_all 스크립트
├── update_all.bat          코어 일괄 업데이트 (Windows)
├── data/                   기본 문서 저장소 (0000001/ …)
├── build/                  앱 아이콘 (prepare:icons)
└── exe/                    build:dist:exe 출력
```

---

## 에디터 코어 (현재 기준)

| 코어 | 패키지 / 경로 |
|------|----------------|
| HWPX (rhwp) | `@rhwp/core`, `@rhwp/editor` |
| Spreadsheet | `@fortune-sheet/react` |
| Whiteboard | `lib/updates/wb4s` / upstream WhiteBoard4Share |
| TipTap | `@tiptap/react`, `@tiptap/starter-kit` ([ueberdosis/tiptap](https://github.com/ueberdosis/tiptap)) |

버전 기록: `lib/cores-manifest.json`

---

## 라이선스

이 프로젝트는 [MIT License](LICENSE)입니다.

번들된 rhwp, Electron, Chromium, npm 패키지 등 서드파티는 각 라이선스를 따릅니다.  
`LICENSE` 하단 **Third-Party Components** 표를 참고하세요.

---

## 링크

- 블로그: https://note4all.tistory.com
- 저장소: https://github.com/soonpyopark/NAS4USB
