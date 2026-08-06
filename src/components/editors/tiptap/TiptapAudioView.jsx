import { NodeViewWrapper } from '@tiptap/react';
import { useEffect, useState } from 'react';

/**
 * @param {{
 *   node: { attrs: { src?: string, title?: string, controls?: boolean } },
 *   selected: boolean,
 *   extension: { options: { resolveFileUrl?: (url: string) => Promise<string> } },
 * }} props
 */
export default function TiptapAudioView({ node, selected, extension }) {
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
    <NodeViewWrapper className={`tiptap-audio-wrap${selected ? ' is-selected' : ''}`}>
      {node.attrs.title ? <div className="tiptap-audio-title">{node.attrs.title}</div> : null}
      <audio
        className="tiptap-audio"
        src={displaySrc || undefined}
        title={node.attrs.title || undefined}
        controls={node.attrs.controls !== false}
        preload="metadata"
      />
    </NodeViewWrapper>
  );
}
