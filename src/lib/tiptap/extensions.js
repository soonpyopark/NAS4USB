import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import CharacterCount from '@tiptap/extension-character-count';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Underline from '@tiptap/extension-underline';
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
 *   includeImageNodeView?: boolean,
 *   includeMediaNodeView?: boolean,
 *   enableSuggestionUi?: boolean,
 *   mentions?: { id: string, label: string }[],
 * }} [options]
 */
export function createTiptapExtensions(options = {}) {
  const {
    collaboration = null,
    placeholder = "명령을 입력하려면 '/' 를 누르세요…",
    resolveFileUrl,
    includeImageNodeView = true,
    includeMediaNodeView = includeImageNodeView,
    enableSuggestionUi = true,
    mentions,
  } = options;

  /** @type {import('@tiptap/core').Extensions} */
  const extensions = [
    StarterKit.configure({
      // Collaboration provides its own undo/redo via Yjs.
      undoRedo: collaboration ? false : undefined,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          class: 'tiptap-link',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      },
      // Replaced by CodeBlockLowlight for syntax highlighting.
      codeBlock: false,
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
    includeImageNodeView
      ? createTiptapImageExtension({ resolveFileUrl })
      : Image.configure({
          allowBase64: false,
          HTMLAttributes: { class: 'tiptap-image' },
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
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
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
      types: ['heading'],
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
    );
  }

  return extensions;
}
