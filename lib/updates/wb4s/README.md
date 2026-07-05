# WhiteBoard4Share update package (optional)

USB 오프라인 환경에서 GitHub clone이 불가할 때, 이 폴더에 WhiteBoard4Share v1.0.3 소스 트리를 넣어 두면 **에디터 업데이트**가 이 경로를 사용합니다.

## 준비 방법 (인터넷 가능 PC)

1. `npm run prepare:wb4s-src` 로 `.cache/wb4s-src` 생성
2. `.cache/wb4s-src` 내용을 이 폴더로 복사 (`node_modules`, `dist` 제외)
3. USB에 `lib/updates/wb4s/` 포함하여 배포

## 반영 위치

- 엔진 소스: `.cache/wb4s-src/` (gitignored, 런타임/빌드용)
- EduCowork 패치: `vendor/wb4s-educowork-overlay/` (저장소에 포함)

에디터 업데이트 후 `public/wb4s-editor/` embed 번들도 함께 갱신됩니다.
