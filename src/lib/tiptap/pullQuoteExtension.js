import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Centered pull-quote: decorative “, no left bar. Citation like `[렘9:23-24]`
 * is just the first line the user types.
 */
export const PullQuote = Node.create({
  name: 'pullQuote',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  content: 'block+',
  group: 'block',
  defining: true,

  parseHTML() {
    return [
      { tag: 'blockquote[data-type="pullQuote"]', priority: 60 },
      { tag: 'blockquote.tiptap-pull-quote', priority: 60 },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'blockquote',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'pullQuote',
        class: 'tiptap-pull-quote',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setPullQuote:
        () =>
        ({ editor, commands }) => {
          if (editor.isActive(this.name)) return true;
          if (editor.isActive('blockquote')) {
            return commands.lift('blockquote') && commands.wrapIn(this.name);
          }
          return commands.wrapIn(this.name);
        },
      togglePullQuote:
        () =>
        ({ editor, commands }) => {
          if (editor.isActive(this.name)) return commands.lift(this.name);
          if (editor.isActive('blockquote')) {
            return commands.lift('blockquote') && commands.wrapIn(this.name);
          }
          return commands.wrapIn(this.name);
        },
      unsetPullQuote:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  renderMarkdown: (node, helpers) => {
    if (!node.content) return '';
    const prefix = '>';
    const result = [];
    node.content.forEach((child, index) => {
      const childContent =
        helpers.renderChild?.(child, index) ?? helpers.renderChildren([child]);
      result.push(
        childContent
          .split('\n')
          .map((line) => (line.trim() === '' ? prefix : `${prefix} ${line}`))
          .join('\n'),
      );
    });
    return result.join(`\n${prefix}\n`);
  },
});
