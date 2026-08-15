import { NodeViewWrapper } from '@tiptap/react';
import { useEffect, useState } from 'react';

/**
 * @param {number | string | null | undefined} size
 */
function formatSize(size) {
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {{
 *   node: { attrs: { src?: string, name?: string, mime?: string, size?: string | number } },
 *   selected: boolean,
 *   extension: { options: { resolveFileUrl?: (url: string) => Promise<string> } },
 * }} props
 */
export default function TiptapFileView({ node, selected, extension }) {
  const src = node.attrs.src ?? '';
  const name = node.attrs.name || '파일';
  const sizeLabel = formatSize(node.attrs.size);
  const [href, setHref] = useState(src);

  useEffect(() => {
    let cancelled = false;
    const resolve = extension.options.resolveFileUrl;
    if (!resolve || !src) {
      setHref(src);
      return undefined;
    }

    resolve(src).then((url) => {
      if (!cancelled) setHref(url || src);
    });

    return () => {
      cancelled = true;
    };
  }, [extension.options.resolveFileUrl, src]);

  return (
    <NodeViewWrapper className={`tiptap-file-wrap${selected ? ' is-selected' : ''}`}>
      <a
        className="tiptap-file"
        data-type="file-attachment"
        data-asset-src={src || undefined}
        href={href || src || undefined}
        download={name}
        target="_blank"
        rel="noopener noreferrer"
        title="클릭해서 열기 또는 다운로드"
        onClick={(event) => {
          event.preventDefault();
        }}
      >
        <span className="tiptap-file__icon" aria-hidden="true">
          📎
        </span>
        <span className="tiptap-file__meta">
          <span className="tiptap-file__name">{name}</span>
          {(sizeLabel || node.attrs.mime) && (
            <span className="tiptap-file__sub">
              {[sizeLabel, node.attrs.mime].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      </a>
    </NodeViewWrapper>
  );
}
