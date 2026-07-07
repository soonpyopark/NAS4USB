# Editor cores

코어는 npm 패키지로 설치됩니다 (`npm install`).

| 코어 | GitHub | npm |
|------|--------|-----|
| HWPX (rhwp) | https://github.com/edwardkim/rhwp | `@rhwp/core`, `@rhwp/editor` |
| Spreadsheet (FortuneSheet) | https://github.com/ruilisi/fortune-sheet | `@fortune-sheet/react` |
| Whiteboard (wb4s) | https://github.com/soonpyopark/WhiteBoard4Share | (git / `lib/updates/wb4s`) |
| HTML (TipTap) | https://github.com/ueberdosis/tiptap | `@tiptap/react` 등 |

어댑터 코드: `lib/rhwp/`, `src/lib/xlsx/`, `src/lib/tiptap/`

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

오프라인 USB용 로컬 패키지: `lib/updates/<core>/` (README 참고)
