import StarterKit from '@tiptap/starter-kit';
import Blockquote from '@tiptap/extension-blockquote';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import CharacterCount from '@tiptap/extension-character-count';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Collaboration, { isChangeOrigin } from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import Mathematics from '@tiptap/extension-mathematics';
import Youtube from '@tiptap/extension-youtube';
import UniqueID from '@tiptap/extension-unique-id';
import InvisibleCharacters from '@tiptap/extension-invisible-characters';
import { TableOfContents, getHierarchicalIndexes } from '@tiptap/extension-table-of-contents';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Markdown } from '@tiptap/markdown';
import { common, createLowlight } from 'lowlight';
import { TIPTAP_FRAGMENT } from './constants.js';
import { createTiptapImageExtension } from './imageExtension.js';
import { createTiptapVideoExtension } from './videoExtension.js';
import { createTiptapAudioExtension } from './audioExtension.js';
import { createTiptapFileExtension } from './fileExtension.js';
import { createTiptapTableExtensions } from './tableExtension.js';
import { createTiptapEmojiExtension } from './emojiExtension.js';
import { createTiptapMentionExtension } from './mentionExtension.js';
import { createPasteMarkdownExtension } from './pasteMarkdown.js';
import { Indent } from './indentExtension.js';
import { PullQuote } from './pullQuoteExtension.js';
import { createCollabStabilityExtension } from './collabStabilityExtension.js';

const lowlight = createLowlight(common);

/**
 * Full open-source TipTap extension set (Notion / tiptap.dev-like).
 * @see https://github.com/ueberdosis/tiptap
 *
 * @param {{
 *   collaboration?: {
 *     doc: import('yjs').Doc,
 *     provider: import('y-websocket').WebsocketProvider,
 *     user: { name: string, color: string },
 *   } | null,
 *   placeholder?: string,
 *   resolveFileUrl?: (url: string) => Promise<string>,
 *   uploadFile?: (file: File) => Promise<string>,
 *   includeImageNodeView?: boolean,
 *   includeMediaNodeView?: boolean,
 *   enableSuggestionUi?: boolean,
   *   mentions?: { id: string, label: string }[],
 *   documentPath?: string,
 * }} [options]
 */
export function createTiptapExtensions(options = {}) {
  const {
    collaboration = null,
    placeholder = "명령을 입력하려면 '/' 를 누르세요…",
    resolveFileUrl,
    uploadFile,
    includeImageNodeView = true,
    includeMediaNodeView = includeImageNodeView,
    enableSuggestionUi = true,
    mentions,
    documentPath = '',
  } = options;

  /** @type {import('@tiptap/core').Extensions} */
  const extensions = [
    StarterKit.configure({
      // Collaboration provides its own undo/redo via Yjs.
      undoRedo: collaboration ? false : undefined,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        openOnClick: false,
        enableClickSelection: true,
        autolink: true,
        defaultProtocol: 'https',
        protocols: [{ scheme: 'nas4usb', optionalSlashes: true }],
        isAllowedUri: (url, ctx) => {
          const raw = String(url ?? '').trim();
          if (!raw) return false;
          if (raw.startsWith('#')) return true;
          if (/^nas4usb:/i.test(raw)) return true;
          return Boolean(ctx.defaultValidate(raw));
        },
        HTMLAttributes: {
          class: 'tiptap-link',
          rel: 'noopener noreferrer',
          target: '_blank',
          title: '열기 · 이 문서 위치는 클릭, 다른 파일·웹은 편집 중 Ctrl(⌘)+클릭',
        },
      },
      // Replaced by CodeBlockLowlight for syntax highlighting.
      codeBlock: false,
      // Replaced so pull-quote HTML is not parsed as a normal blockquote.
      blockquote: false,
    }),
    Blockquote.extend({
      parseHTML() {
        return [
          {
            tag: 'blockquote',
            getAttrs: (node) => {
              if (!(node instanceof HTMLElement)) return {};
              if (node.getAttribute('data-type') === 'pullQuote') return false;
              if (node.classList.contains('tiptap-pull-quote')) return false;
              return {};
            },
          },
        ];
      },
      addCommands() {
        return {
          ...this.parent?.(),
          setBlockquote:
            () =>
            ({ editor, commands }) => {
              if (editor.isActive('pullQuote')) {
                return commands.lift('pullQuote') && commands.wrapIn(this.name);
              }
              return commands.wrapIn(this.name);
            },
          toggleBlockquote:
            () =>
            ({ editor, commands }) => {
              if (editor.isActive('pullQuote')) {
                return commands.lift('pullQuote') && commands.wrapIn(this.name);
              }
              return commands.toggleWrap(this.name);
            },
        };
      },
    }),
    CodeBlockLowlight.configure({
      lowlight,
      HTMLAttributes: { class: 'tiptap-code-block' },
    }),
    Placeholder.configure({
      placeholder,
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    createTiptapImageExtension({
      resolveFileUrl,
      uploadFile,
      includeNodeView: includeImageNodeView,
      documentPath,
    }),
    createTiptapVideoExtension({
      resolveFileUrl,
      includeNodeView: includeMediaNodeView,
    }),
    createTiptapAudioExtension({
      resolveFileUrl,
      includeNodeView: includeMediaNodeView,
    }),
    createTiptapFileExtension({
      resolveFileUrl,
      includeNodeView: includeMediaNodeView,
    }),
    Youtube.configure({
      controls: true,
      nocookie: true,
      modestBranding: true,
      width: '100%',
      height: 360,
      HTMLAttributes: { class: 'tiptap-youtube' },
    }),
    Mathematics.configure({
      katexOptions: { throwOnError: false },
    }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Indent,
    PullQuote,
    TextStyleKit.configure({
      backgroundColor: {},
      // OneNote / Word often color the whole paragraph, not a span.
      color: {
        types: ['textStyle', 'paragraph', 'heading'],
      },
      fontFamily: {},
      fontSize: {},
      lineHeight: {},
      textStyle: {},
    }),
    Subscript,
    Superscript,
    Typography,
    CharacterCount,
    Details.configure({
      persist: true,
      HTMLAttributes: { class: 'tiptap-details' },
    }),
    DetailsSummary.configure({
      HTMLAttributes: { class: 'tiptap-details-summary' },
    }),
    DetailsContent.configure({
      HTMLAttributes: { class: 'tiptap-details-content' },
    }),
    UniqueID.configure({
      types: ['heading', 'paragraph', 'blockquote', 'pullQuote', 'codeBlock', 'listItem', 'taskItem', 'details', 'image'],
      filterTransaction: collaboration
        ? (transaction) => !isChangeOrigin(transaction)
        : null,
    }),
    TableOfContents.configure({
      anchorTypes: ['heading'],
      getIndex: getHierarchicalIndexes,
    }),
    InvisibleCharacters.configure({
      visible: false,
    }),
    Markdown,
    createPasteMarkdownExtension(),
    createTiptapEmojiExtension({ enableSuggestionUi }),
    createTiptapMentionExtension({ enableSuggestionUi, mentions }),
    ...createTiptapTableExtensions(),
  ];

  if (collaboration?.doc) {
    extensions.push(
      Collaboration.configure({
        document: collaboration.doc,
        field: TIPTAP_FRAGMENT,
      }),
      CollaborationCaret.configure({
        provider: collaboration.provider,
        user: {
          name: collaboration.user.name,
          color: collaboration.user.color,
        },
      }),
      createCollabStabilityExtension(),
    );
  }

  return extensions;
}
