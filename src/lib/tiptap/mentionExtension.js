import Mention from '@tiptap/extension-mention';
import { createSuggestionRenderer } from './suggestionUi.js';

const DEFAULT_MENTIONS = [
  { id: 'user', label: '사용자' },
  { id: 'admin', label: '관리자' },
  { id: 'guest', label: '게스트' },
  { id: 'team', label: '팀' },
];

/**
 * @param {{
 *   mentions?: { id: string, label: string }[],
 *   enableSuggestionUi?: boolean,
 * }} [options]
 */
export function createTiptapMentionExtension(options = {}) {
  const mentions = options.mentions?.length ? options.mentions : DEFAULT_MENTIONS;
  const enableSuggestionUi = options.enableSuggestionUi !== false;

  return Mention.configure({
    HTMLAttributes: {
      class: 'tiptap-mention',
    },
    suggestion: {
      char: '@',
      allowSpaces: false,
      allowedPrefixes: null,
      items: ({ query }) => {
        const q = String(query ?? '').toLowerCase();
        return mentions
          .filter(
            (item) =>
              item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q),
          )
          .slice(0, 10)
          .map((item) => ({
            id: item.id,
            group: '멘션',
            title: item.label,
            description: `@${item.id}`,
            keywords: [item.id, item.label, 'mention', '멘션'],
            icon: '@',
            command: ({ editor, range }) => {
              editor
                .chain()
                .focus()
                .insertContentAt(range, [
                  {
                    type: 'mention',
                    attrs: { id: item.id, label: item.label },
                  },
                  { type: 'text', text: ' ' },
                ])
                .run();
            },
          }));
      },
      command: ({ editor, range, props }) => {
        props.command({ editor, range });
      },
      render: enableSuggestionUi ? createSuggestionRenderer({ theme: 'tiptap-slash' }) : undefined,
    },
  });
}
