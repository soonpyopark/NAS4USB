import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const pasteMarkdownKey = new PluginKey('pasteMarkdown');

/**
 * Heuristic: pasted plain text looks like Markdown source (not already-rich HTML).
 * @param {string} text
 */
export function looksLikeMarkdown(text) {
  const sample = String(text ?? '').trim();
  if (!sample) return false;

  // Single plain URL / short plain line — leave to default paste / autolink.
  if (sample.length < 3) return false;
  if (/^https?:\/\/\S+$/i.test(sample)) return false;

  return (
    /^#{1,6}\s+\S/m.test(sample) ||
    /^ {0,3}(```|~~~)/m.test(sample) ||
    /^ {0,3}>\s+\S/m.test(sample) ||
    /^ {0,3}([-*+]|\d+\.)\s+\S/m.test(sample) ||
    /^ {0,3}[-*_]{3,}\s*$/m.test(sample) ||
    /\[[^\]]+\]\([^)]+\)/.test(sample) ||
    /!\[[^\]]*\]\([^)]+\)/.test(sample) ||
    /(\*\*|__)[^*_\n]+(\*\*|__)/.test(sample) ||
    /(?:^|[^\\])`[^`\n]+`/.test(sample) ||
    /^ {0,3}\|(.+\|)+\s*$/m.test(sample)
  );
}

/**
 * True when clipboard HTML is ProseMirror's own slice (TipTap ↔ TipTap paste).
 * @param {string} html
 */
function isProseMirrorHtml(html) {
  return typeof html === 'string' && html.includes('data-pm-slice');
}

/**
 * Prefer native HTML paste when the HTML is clearly semantic rich content
 * and the plain text does not look like Markdown source.
 * @param {string} html
 * @param {string} text
 */
function shouldPreferNativeHtml(html, text) {
  if (!html || isProseMirrorHtml(html)) return true;
  if (!looksLikeMarkdown(text)) return true;

  // VS Code / browsers often attach a thin HTML wrapper around Markdown copies.
  // If HTML is mostly a single pre/code or plain spans without lists/headings, treat as MD.
  const lowered = html.toLowerCase();
  const hasRichBlocks =
    /<(ul|ol|li|h[1-6]|table|blockquote|pre)\b/.test(lowered) &&
    !/<(pre|code)\b[^>]*>[\s\S]*#{1,6}\s/.test(lowered);

  // If HTML already has rich structure AND plain text also has MD markers,
  // still prefer MD when markers are strong (headings/fences/lists at line starts).
  const strongMarkdown =
    /^#{1,6}\s+\S/m.test(text) ||
    /^ {0,3}(```|~~~)/m.test(text) ||
    /^ {0,3}([-*+]|\d+\.)\s+\S/m.test(text);

  if (strongMarkdown) return false;
  return hasRichBlocks;
}

/**
 * Paste plain Markdown as TipTap JSON via `@tiptap/markdown`.
 * - TipTap/ProseMirror internal HTML (`data-pm-slice`) → native
 * - Inside code block → native / plain
 * - Shift+paste → plain text
 * - Looks like Markdown → `editor.markdown.parse` + insert
 */
export function createPasteMarkdownExtension() {
  return Extension.create({
    name: 'pasteMarkdown',

    addProseMirrorPlugins() {
      const { editor } = this;

      return [
        new Plugin({
          key: pasteMarkdownKey,
          props: {
            handlePaste(view, event) {
              if (!editor.isEditable) return false;
              if (!editor.markdown?.parse) return false;

              const clipboard = event.clipboardData;
              if (!clipboard) return false;
              if (clipboard.files?.length) return false;

              const text = clipboard.getData('text/plain');
              if (!text?.trim()) return false;

              const html = clipboard.getData('text/html') || '';

              // Shift+paste → keep as plain text.
              if (event.shiftKey) return false;

              const { $from } = view.state.selection;
              if ($from.parent.type.name === 'codeBlock') return false;

              if (isProseMirrorHtml(html)) return false;
              if (shouldPreferNativeHtml(html, text)) return false;
              if (!looksLikeMarkdown(text)) return false;

              try {
                editor.commands.insertContent(text, { contentType: 'markdown' });
                return true;
              } catch {
                return false;
              }
            },
          },
        }),
      ];
    },
  });
}
