import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { createSuggestionRenderer } from './suggestionUi.js';

/**
 * Notion / tiptap.dev style "/" slash command menu.
 * @param {{
 *   onUploadImage?: () => void,
 *   onUploadVideo?: () => void,
 *   onUploadAudio?: () => void,
 *   onUploadFile?: () => void,
 *   onOpenEmojiPicker?: () => void,
 * }} [options]
 */
export function createSlashCommandExtension(options = {}) {
  return Extension.create({
    name: 'slashCommand',

    addOptions() {
      return {
        suggestion: {
          char: '/',
          allowSpaces: false,
          startOfLine: false,
          command: ({ editor, range, props }) => {
            props.command({ editor, range });
          },
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
          items: ({ query, editor }) => {
            const items = buildSlashItems(options, editor);
            const q = String(query ?? '').toLowerCase();
            if (!q) return items;
            return items.filter(
              (item) =>
                item.title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                item.group.toLowerCase().includes(q) ||
                item.keywords.some((k) => String(k).toLowerCase().includes(q)),
            );
          },
          render: createSuggestionRenderer({ theme: 'tiptap-slash' }),
        }),
      ];
    },
  });
}

/**
 * @param {import('@tiptap/core').Editor} editor
 * @param {{ from: number, to: number }} range
 */
function clearSlash(editor, range) {
  return editor.chain().focus().deleteRange(range);
}

/**
 * @param {{
 *   onUploadImage?: () => void,
 *   onUploadVideo?: () => void,
 *   onUploadAudio?: () => void,
 *   onUploadFile?: () => void,
 *   onOpenEmojiPicker?: () => void,
 * }} options
 * @param {import('@tiptap/core').Editor} editor
 */
function buildSlashItems(options, editor) {
  /** @type {Array<{
   *   group: string,
   *   title: string,
   *   description: string,
   *   keywords: string[],
   *   icon: string,
   *   command: (args: { editor: import('@tiptap/core').Editor, range: { from: number, to: number } }) => void,
   * }>} */
  const items = [
    {
      group: '스타일',
      title: '텍스트',
      description: '일반 문단으로 시작',
      keywords: ['paragraph', 'text', '텍스트', '본문', 'p'],
      icon: 'T',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).setParagraph().run();
      },
    },
    {
      group: '스타일',
      title: '제목 1',
      description: '큰 섹션 제목',
      keywords: ['h1', 'heading', '제목', 'heading1'],
      icon: 'H1',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).setHeading({ level: 1 }).run();
      },
    },
    {
      group: '스타일',
      title: '제목 2',
      description: '중간 섹션 제목',
      keywords: ['h2', 'heading', '제목', 'heading2'],
      icon: 'H2',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).setHeading({ level: 2 }).run();
      },
    },
    {
      group: '스타일',
      title: '제목 3',
      description: '작은 섹션 제목',
      keywords: ['h3', 'heading', '제목', 'heading3'],
      icon: 'H3',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).setHeading({ level: 3 }).run();
      },
    },
    {
      group: '스타일',
      title: '제목 4',
      description: '세부 제목',
      keywords: ['h4', 'heading', '제목'],
      icon: 'H4',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).setHeading({ level: 4 }).run();
      },
    },
    {
      group: '스타일',
      title: '제목 5',
      description: '더 작은 제목',
      keywords: ['h5', 'heading', '제목'],
      icon: 'H5',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).setHeading({ level: 5 }).run();
      },
    },
    {
      group: '스타일',
      title: '제목 6',
      description: '가장 작은 제목',
      keywords: ['h6', 'heading', '제목'],
      icon: 'H6',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).setHeading({ level: 6 }).run();
      },
    },
    {
      group: '목록',
      title: '글머리 기호 목록',
      description: '간단한 불릿 목록',
      keywords: ['bullet', 'list', '목록', 'ul', 'unordered'],
      icon: '•',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).toggleBulletList().run();
      },
    },
    {
      group: '목록',
      title: '번호 목록',
      description: '순서 있는 목록',
      keywords: ['ordered', 'number', '목록', 'ol', 'numbered'],
      icon: '1.',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).toggleOrderedList().run();
      },
    },
    {
      group: '목록',
      title: '할 일 목록',
      description: '체크박스가 있는 목록',
      keywords: ['todo', 'task', '체크', 'checkbox', 'tasklist'],
      icon: '☑',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).toggleTaskList().run();
      },
    },
    {
      group: '블록',
      title: '인용',
      description: '인용문 블록',
      keywords: ['quote', 'blockquote', '인용'],
      icon: '❝',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).toggleBlockquote().run();
      },
    },
    {
      group: '블록',
      title: '코드 블록',
      description: '여러 줄 코드',
      keywords: ['code', '코드', 'pre', 'codeblock'],
      icon: '</>',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).toggleCodeBlock().run();
      },
    },
    {
      group: '블록',
      title: '구분선',
      description: '가로 구분선',
      keywords: ['hr', 'divider', '구분', '선', 'horizontal'],
      icon: '—',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).setHorizontalRule().run();
      },
    },
    {
      group: '블록',
      title: '토글',
      description: '접을 수 있는 세부 정보',
      keywords: ['details', 'toggle', '토글', '접기', 'summary'],
      icon: '▸',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).setDetails().run();
      },
    },
    {
      group: '미디어',
      title: '이미지',
      description: '이미지 업로드',
      keywords: ['image', 'img', '이미지', '사진', 'picture', 'photo'],
      icon: '🖼',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).run();
        options.onUploadImage?.();
      },
    },
    {
      group: '미디어',
      title: 'YouTube',
      description: 'YouTube 영상 삽입',
      keywords: ['youtube', '유튜브', 'yt', 'embed', '영상'],
      icon: '▶',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).run();
        const src = window.prompt('YouTube URL', 'https://www.youtube.com/watch?v=');
        if (!src) return;
        ed.chain().focus().setYoutubeVideo({ src }).run();
      },
    },
    {
      group: '블록',
      title: '인라인 수식',
      description: 'LaTeX 인라인 수식 ($…$)',
      keywords: ['math', 'latex', '수식', 'katex', 'formula', 'inline'],
      icon: '∑',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).run();
        const latex = window.prompt('인라인 수식 (LaTeX)', 'E = mc^2');
        if (latex == null || !String(latex).trim()) return;
        ed.chain().focus().insertInlineMath({ latex: String(latex).trim() }).run();
      },
    },
    {
      group: '블록',
      title: '블록 수식',
      description: 'LaTeX 블록 수식',
      keywords: ['math', 'latex', '수식', 'katex', 'formula', 'block', 'equation'],
      icon: '∑',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).run();
        const latex = window.prompt('블록 수식 (LaTeX)', '\\int_0^1 x^2\\,dx');
        if (latex == null || !String(latex).trim()) return;
        ed.chain().focus().insertBlockMath({ latex: String(latex).trim() }).run();
      },
    },
    {
      group: '블록',
      title: '목차 목록 삽입',
      description: '현재 제목으로 목록 만들기',
      keywords: ['toc', '목차', 'contents', 'outline'],
      icon: '☰',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).run();
        const toc = ed.storage.tableOfContents?.content ?? [];
        if (toc.length === 0) {
          window.alert('문서에 제목이 없습니다. 제목을 먼저 추가하세요.');
          return;
        }
        const content = toc.map((item) => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: item.textContent || '(제목 없음)' }],
            },
          ],
        }));
        ed.chain().focus().insertContent({ type: 'bulletList', content }).run();
      },
    },
    {
      group: '미디어',
      title: '영상',
      description: '동영상 파일 첨부',
      keywords: ['video', '영상', '동영상', 'mp4', 'movie'],
      icon: '▶',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).run();
        options.onUploadVideo?.();
      },
    },
    {
      group: '미디어',
      title: '오디오',
      description: '오디오 파일 첨부',
      keywords: ['audio', '오디오', '음악', 'mp3', 'wav', 'sound'],
      icon: '♪',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).run();
        options.onUploadAudio?.();
      },
    },
    {
      group: '미디어',
      title: '파일',
      description: '파일 첨부',
      keywords: ['file', '파일', '첨부', 'attachment', 'pdf', 'zip'],
      icon: '📎',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).run();
        options.onUploadFile?.();
      },
    },
    {
      group: '표',
      title: '표',
      description: '3×3 표 삽입',
      keywords: ['table', '표', 'grid'],
      icon: '▦',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
    },
    {
      group: '표',
      title: '표 (큰 표)',
      description: '5×5 표 삽입',
      keywords: ['table', '표', 'large'],
      icon: '▦',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).insertTable({ rows: 5, cols: 5, withHeaderRow: true }).run();
      },
    },
    {
      group: '멘션',
      title: '멘션',
      description: '사람 또는 대상 멘션',
      keywords: ['mention', '멘션', 'at', '@', 'user'],
      icon: '@',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).insertContent('@').run();
      },
    },
    {
      group: '멘션',
      title: '이모지',
      description: '이모지 피커 열기',
      keywords: ['emoji', '이모지', 'smile', '이모티콘'],
      icon: '☺',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).run();
        if (options.onOpenEmojiPicker) options.onOpenEmojiPicker();
        else ed.chain().focus().insertContent(':').run();
      },
    },
    {
      group: '서식',
      title: '인라인 코드',
      description: '인라인 코드 서식',
      keywords: ['inline', 'code', '인라인'],
      icon: '`',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).toggleCode().run();
      },
    },
    {
      group: '서식',
      title: '하이라이트',
      description: '형광펜 강조',
      keywords: ['highlight', 'marker', '형광', '강조'],
      icon: '🖍',
      command: ({ editor: ed, range }) => {
        clearSlash(ed, range).toggleHighlight().run();
      },
    },
  ];

  if (editor?.isActive('table')) {
    items.push(
      {
        group: '표 편집',
        title: '열 추가 (뒤)',
        description: '현재 표에 열 추가',
        keywords: ['table', 'column', '열'],
        icon: '⊞',
        command: ({ editor: ed, range }) => {
          clearSlash(ed, range).addColumnAfter().run();
        },
      },
      {
        group: '표 편집',
        title: '행 추가 (아래)',
        description: '현재 표에 행 추가',
        keywords: ['table', 'row', '행'],
        icon: '⊞',
        command: ({ editor: ed, range }) => {
          clearSlash(ed, range).addRowAfter().run();
        },
      },
      {
        group: '표 편집',
        title: '셀 병합',
        description: '선택한 셀 병합',
        keywords: ['table', 'merge', '병합'],
        icon: '⧉',
        command: ({ editor: ed, range }) => {
          clearSlash(ed, range).mergeCells().run();
        },
      },
      {
        group: '표 편집',
        title: '셀 분할',
        description: '병합된 셀 분할',
        keywords: ['table', 'split', '분할'],
        icon: '⧉',
        command: ({ editor: ed, range }) => {
          clearSlash(ed, range).splitCell().run();
        },
      },
      {
        group: '표 편집',
        title: '헤더 행 토글',
        description: '첫 행을 헤더로',
        keywords: ['table', 'header', '헤더'],
        icon: '▤',
        command: ({ editor: ed, range }) => {
          clearSlash(ed, range).toggleHeaderRow().run();
        },
      },
      {
        group: '표 편집',
        title: '표 삭제',
        description: '현재 표 전체 삭제',
        keywords: ['table', 'delete', '삭제'],
        icon: '✕',
        command: ({ editor: ed, range }) => {
          clearSlash(ed, range).deleteTable().run();
        },
      },
    );
  }

  return items;
}
