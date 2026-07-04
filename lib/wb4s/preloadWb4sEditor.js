/** @type {Promise<void> | null} */
let preloadPromise = null;

function getEditorBaseUrl() {
  return new URL('wb4s-editor/', window.location.href);
}

async function discoverPrefetchPaths() {
  const base = getEditorBaseUrl();
  const embedUrl = new URL('embed.html?embed=1', base);

  try {
    const html = await fetch(embedUrl).then((response) => response.text());
    const paths = new Set(['embed.html?embed=1']);

    for (const match of html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)) {
      paths.add(match[1].replace(/^\.\//, ''));
    }

    return [...paths];
  } catch {
    return ['embed.html?embed=1'];
  }
}

/** WhiteBoard4Share embed 정적 리소스를 미리 받아 첫 .wb4s 열기 지연을 줄입니다. */
export function preloadWb4sEditor() {
  if (!preloadPromise) {
    preloadPromise = warmEditorBundle().catch(() => {
      preloadPromise = null;
    });
  }
  return preloadPromise;
}

async function warmEditorBundle() {
  const base = getEditorBaseUrl();
  const paths = await discoverPrefetchPaths();

  await Promise.all(
    paths.map(async (relativePath) => {
      try {
        await fetch(new URL(relativePath, base), { cache: 'force-cache' });
      } catch {
        // Best-effort warm-up.
      }
    }),
  );
}
