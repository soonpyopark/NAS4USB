import { NodeViewWrapper } from '@tiptap/react';
import { useEffect, useState } from 'react';

/**
 * Resolves package-relative `assets/...` (or stream URLs) for display without mutating the doc.
 * @param {{
 *   node: { attrs: { src?: string, alt?: string, title?: string } },
 *   selected: boolean,
 *   extension: { options: { resolveFileUrl?: (url: string) => Promise<string> } },
 * }} props
 */
export default function TiptapImageView({ node, selected, extension }) {
  const src = node.attrs.src ?? '';
  const [displaySrc, setDisplaySrc] = useState(src);

  useEffect(() => {
    let cancelled = false;
    const resolve = extension.options.resolveFileUrl;
    if (!resolve || !src) {
      setDisplaySrc(src);
      return undefined;
    }

    resolve(src).then((url) => {
      if (!cancelled) setDisplaySrc(url || src);
    });

    return () => {
      cancelled = true;
    };
  }, [extension.options.resolveFileUrl, src]);

  return (
    <NodeViewWrapper className={`tiptap-image-wrap${selected ? ' is-selected' : ''}`}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt from attrs */}
      <img
        className="tiptap-image"
        src={displaySrc}
        alt={node.attrs.alt || ''}
        title={node.attrs.title || undefined}
        draggable={false}
      />
    </NodeViewWrapper>
  );
}
