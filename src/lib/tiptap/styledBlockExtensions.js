import Paragraph from '@tiptap/extension-paragraph';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';

const styleAttribute = {
  default: null,
  parseHTML: (element) => element.getAttribute('style') || null,
  renderHTML: (attributes) => {
    if (!attributes.style) return {};
    return { style: attributes.style };
  },
};

/** @param {import('@tiptap/core').Extension} Base */
function withStyleAttribute(Base) {
  return Base.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        style: styleAttribute,
      };
    },
  });
}

export const StyledParagraph = withStyleAttribute(Paragraph);

/** 셀 안에 블록 표(중첩 표) 삽입을 허용하는 TableCell */
export const NestedTableCell = withStyleAttribute(TableCell).extend({
  content: '(block | table)+',
});

export const NestedTableHeader = withStyleAttribute(TableHeader).extend({
  content: '(block | table)+',
});

export const NestedTable = Table.extend({
  resizable: true,
  allowTableNodeSelection: true,
});

export const nestedTableExtensions = [
  NestedTable.configure({ resizable: true }),
  TableRow,
  NestedTableHeader,
  NestedTableCell,
];
