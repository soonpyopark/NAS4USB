import { basicSetup } from 'codemirror';
import { EditorView, getDialog, keymap, scrollPastEnd, placeholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { indentWithTab } from '@codemirror/commands';
import { gotoLine, openSearchPanel, closeSearchPanel, searchPanelOpen } from '@codemirror/search';
import { completeAnyWord } from '@codemirror/autocomplete';
import { lintGutter, linter } from '@codemirror/lint';
import { LanguageDescription } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';

/**
 * Soft diagnostics for general text / markdown editing.
 * @param {import('@codemirror/view').EditorView} view
 * @returns {import('@codemirror/lint').Diagnostic[]}
 */
function textDiagnostics(view) {
  /** @type {import('@codemirror/lint').Diagnostic[]} */
  const diagnostics = [];
  const doc = view.state.doc;
  const maxLine = 200;

  for (let i = 1; i <= doc.lines; i += 1) {
    const line = doc.line(i);
    const text = line.text;
    if (text.length > maxLine) {
      diagnostics.push({
        from: line.from + maxLine,
        to: line.to,
        severity: 'info',
        message: `줄 길이가 ${maxLine}자를 넘습니다 (${text.length}자)`,
      });
    }
    const trail = text.match(/[ \t]+$/);
    if (trail) {
      diagnostics.push({
        from: line.to - trail[0].length,
        to: line.to,
        severity: 'warning',
        message: '줄 끝 공백',
      });
    }
    if (/\t/.test(text) && / {2,}/.test(text)) {
      diagnostics.push({
        from: line.from,
        to: line.to,
        severity: 'info',
        message: '탭과 스페이스가 혼용되어 있습니다',
      });
    }
  }

  return diagnostics;
}

/**
 * @param {string} [fileName]
 * @returns {import('@codemirror/language').LanguageDescription | null}
 */
export function resolveLanguageDescription(fileName) {
  const base = String(fileName ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
  if (!base) return null;
  return LanguageDescription.matchFilename(languages, base) ?? null;
}

/**
 * @param {{ fileName?: string, isMarkdown?: boolean }} [options]
 */
export function getLanguageLabel({ fileName, isMarkdown = false } = {}) {
  if (isMarkdown) return 'Markdown';
  return resolveLanguageDescription(fileName)?.name ?? 'Plain Text';
}

/**
 * Sync markdown support (fenced blocks use language-data for highlighting).
 * @returns {import('@codemirror/state').Extension[]}
 */
export function createMarkdownLanguageExtensions() {
  return [
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
      addKeymap: true,
    }),
  ];
}

/**
 * Resolve CodeMirror language support for a file (markdown or by extension).
 * @param {{ fileName?: string, isMarkdown?: boolean }} [options]
 * @returns {Promise<import('@codemirror/state').Extension[]>}
 */
export async function loadLanguageExtensionsForFile({ fileName, isMarkdown = false } = {}) {
  if (isMarkdown) return createMarkdownLanguageExtensions();

  const desc = resolveLanguageDescription(fileName);
  if (!desc) return [];

  try {
    const support = await desc.load();
    return support ? [support] : [];
  } catch {
    return [];
  }
}

/**
 * Full-featured CodeMirror 6 base stack for NAS4USB text / markdown editors.
 *
 * `basicSetup` enables: line numbers, active line, history, fold gutter, multiple
 * selections, rectangular selection, crosshair cursor, bracket matching, close
 * brackets, autocompletion, search/replace, lint keymap, syntax highlighting,
 * special-char highlight, drop cursor, indent-on-input.
 *
 * This adds lint gutter/diagnostics, scroll-past-end, any-word completion,
 * Tab indent, goto-line / save shortcuts, and placeholder.
 * Language, wrap, tab size, whitespace, theme, and readOnly are supplied by the
 * editor via Compartments so they can be toggled live.
 *
 * @param {{
 *   isMarkdown?: boolean,
 *   onSave?: () => void,
 * }} [options]
 */
export function createFullCodeMirrorExtensions({ isMarkdown = false, onSave } = {}) {
  return [
    basicSetup,
    scrollPastEnd(),
    lintGutter(),
    linter(textDiagnostics, { delay: 500 }),
    EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }]),
    EditorState.allowMultipleSelections.of(true),
    placeholder(isMarkdown ? 'Markdown을 입력하세요…' : '텍스트를 입력하세요…'),
    keymap.of([
      indentWithTab,
      {
        key: 'Mod-s',
        run: () => {
          onSave?.();
          return true;
        },
      },
      {
        // Override basicSetup's Mod-Alt-g (stock gotoLine stacks dialogs).
        key: 'Mod-Alt-g',
        run: openGotoLineOnce,
      },
      {
        key: 'Mod-Shift-o',
        run: openGotoLineOnce,
      },
      {
        key: 'F3',
        run: (view) => {
          openSearchPanel(view);
          return true;
        },
      },
    ]),
    EditorView.theme({
      '&': { height: '100%', fontSize: '14px' },
      '.cm-scroller': {
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        lineHeight: '1.5',
      },
      '.cm-content': { padding: '12px 0' },
      '.cm-gutters': {
        borderRight: '1px solid #e2e8f0',
      },
      '&.cm-focused': { outline: 'none' },
      '.cm-editor.cm-focused': { outline: 'none' },
      '.cm-tooltip-autocomplete': { zIndex: '10050' },
      '.cm-tooltip.cm-tooltip-lint': { zIndex: '10050' },
      '.cm-panels': { zIndex: '20' },
    }),
  ];
}

/**
 * Open the Go-to-line dialog once. If one is already open, focus it instead of
 * stacking another panel (CodeMirror's default `gotoLine` always appends).
 * @param {import('@codemirror/view').EditorView} view
 */
export function openGotoLineOnce(view) {
  const existing = getDialog(view, 'cm-dialog');
  if (existing) {
    const input = existing.dom.querySelector('input');
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
    return true;
  }
  return gotoLine(view);
}

/**
 * Toggle / focus the search panel without stealing focus back to the editor.
 * @param {import('@codemirror/view').EditorView} view
 */
export function openFindPanel(view) {
  if (searchPanelOpen(view.state)) {
    // Already open — focus its query field if present.
    const panel = view.dom.querySelector('.cm-search');
    const input = panel?.querySelector('input');
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
      return true;
    }
  }
  return openSearchPanel(view);
}

export { gotoLine, openSearchPanel, closeSearchPanel, openGotoLineOnce as openGotoLine };
