# Editor cores

코어는 npm 패키지로 설치됩니다 (`npm install`).

| 코어 | GitHub | npm |
|------|--------|-----|
| HWPX (rhwp) | https://github.com/edwardkim/rhwp | `@rhwp/core`, `@rhwp/editor` |
| Spreadsheet (FortuneSheet) | https://github.com/ruilisi/fortune-sheet | `@fortune-sheet/react` |
| Whiteboard (wb4s) | https://github.com/soonpyopark/WhiteBoard4Share | (git / `lib/updates/wb4s`) |
| TipTap | https://github.com/ueberdosis/tiptap | `@tiptap/react`, `@tiptap/starter-kit` |
| Comic Reader | (NAS4USB shell; Yomikiru-inspired) | `epubjs`, `7zip-min` |

어댑터 코드: `lib/rhwp/`, `src/lib/xlsx/`, `src/lib/tiptap/`, `src/lib/comicReader/`

## 일괄 업데이트

인터넷 가능 PC에서 소스 트리 루트:

```bat
update_all.bat
```

또는 업데이트 후 Windows portable exe 빌드:

```bat
npm run build:update_all
```

옵션: `build` `force` `skip-git` `skip-npm` `skip-cores`

npm 단계는 실행 중인 NAS4USB를 먼저 종료한 뒤, 범위 안 `npm update`와 **Electron / electron-builder latest**를 받습니다. `allowScripts`를 새 버전에 맞춘 다음 바이너리가 실제로 뜨는지 확인하고, 실패하면 업데이트를 중단합니다. `skip-npm`이면 이 단계도 건너뜁니다.

오프라인 USB용 로컬 패키지: `lib/updates/<core>/` (README 참고)
