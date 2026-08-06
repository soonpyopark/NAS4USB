import { NodeViewWrapper } from '@tiptap/react';
import { useEffect, useState } from 'react';

/**
 * @param {{
 *   node: { attrs: { src?: string, title?: string, controls?: boolean } },
 *   selected: boolean,
 *   extension: { options: { resolveFileUrl?: (url: string) => Promise<string> } },
 * }} props
 */
export default function TiptapVideoView({ node, selected, extension }) {
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
    <NodeViewWrapper className={`tiptap-video-wrap${selected ? ' is-selected' : ''}`}>
      <video
        className="tiptap-video"
        src={displaySrc || undefined}
        title={node.attrs.title || undefined}
        controls={node.attrs.controls !== false}
        preload="metadata"
        playsInline
      />
      {node.attrs.title ? <div className="tiptap-video-caption">{node.attrs.title}</div> : null}
    </NodeViewWrapper>
  );
}
