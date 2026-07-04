# rhwp adapter (offline)

[HWPX 에디터 rhwp](https://github.com/edwardkim/rhwp) — npm `@rhwp/editor` + **로컬 `public/rhwp-studio/`**

```bash
npm run build:rhwp-studio   # rhwp-studio 오프라인 번들 생성
npm run build               # rhwp-studio + EduCowork UI
```

`lib/rhwp/mountRhwp.js`는 `./rhwp-studio/` iframe만 사용합니다 (외부 CDN 없음).
