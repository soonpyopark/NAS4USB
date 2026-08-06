import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';

/**
 * Slash / mention / emoji suggestion popup list.
 */
const SlashCommandList = forwardRef(function SlashCommandList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((index) => (index + items.length - 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((index) => (index + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  const groups = useMemo(() => {
    /** @type {{ group: string, items: { item: any, index: number }[] }[]} */
    const ordered = [];
    const map = new Map();
    items.forEach((item, index) => {
      const group = item.group || '기타';
      if (!map.has(group)) {
        const entry = { group, items: [] };
        map.set(group, entry);
        ordered.push(entry);
      }
      map.get(group).items.push({ item, index });
    });
    return ordered;
  }, [items]);

  if (!items.length) {
    return (
      <div className="tiptap-slash-menu">
        <div className="tiptap-slash-menu__empty">결과 없음</div>
      </div>
    );
  }

  return (
    <div className="tiptap-slash-menu">
      {groups.map((group) => (
        <div key={group.group} className="tiptap-slash-menu__group">
          <div className="tiptap-slash-menu__group-label">{group.group}</div>
          {group.items.map(({ item, index }) => (
            <button
              key={`${item.group}-${item.title}-${item.id || index}`}
              type="button"
              className={`tiptap-slash-menu__item${index === selectedIndex ? ' is-selected' : ''}`}
              onClick={() => command(item)}
            >
              <span className="tiptap-slash-menu__icon" aria-hidden="true">
                {item.icon || '•'}
              </span>
              <span className="tiptap-slash-menu__text">
                <span className="tiptap-slash-menu__title">{item.title}</span>
                {item.description ? (
                  <span className="tiptap-slash-menu__desc">{item.description}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
});

export default SlashCommandList;
