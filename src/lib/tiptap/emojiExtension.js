import Emoji, { gitHubEmojis } from '@tiptap/extension-emoji';
import { createSuggestionRenderer } from './suggestionUi.js';

/**
 * @param {{ enableSuggestionUi?: boolean }} [options]
 */
export function createTiptapEmojiExtension(options = {}) {
  const enableSuggestionUi = options.enableSuggestionUi !== false;

  return Emoji.configure({
    emojis: gitHubEmojis,
    enableEmoticons: true,
    HTMLAttributes: {
      class: 'tiptap-emoji',
    },
    suggestion: {
      char: ':',
      items: ({ editor, query }) => {
        const q = String(query ?? '').toLowerCase();
        const list = editor.storage.emoji?.emojis ?? gitHubEmojis;
        return list
          .filter((item) => {
            if (!q) return Boolean(item.emoji);
            const hay = [
              item.name,
              ...(item.shortcodes || []),
              ...(item.tags || []),
            ]
              .join(' ')
              .toLowerCase();
            return hay.includes(q);
          })
          .filter((item) => item.emoji)
          .slice(0, 40)
          .map((item) => ({
            id: item.name,
            group: item.group || '이모지',
            title: `${item.emoji}  :${item.shortcodes?.[0] || item.name}:`,
            description: item.name,
            keywords: [item.name, ...(item.shortcodes || []), ...(item.tags || [])],
            icon: item.emoji,
            command: ({ editor: ed, range }) => {
              ed.chain()
                .focus()
                .insertContentAt(range, [
                  {
                    type: 'emoji',
                    attrs: { name: item.name },
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
