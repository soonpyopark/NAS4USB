export function BoxedDotsIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <circle cx="10" cy="5" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="10" cy="15" r="1.5" />
    </svg>
  );
}

/**
 * Explicit control that opens the entry context menu (touch-friendly).
 * @param {{
 *   label: string,
 *   onOpen: (event: { clientX: number, clientY: number, preventDefault: () => void, stopPropagation: () => void }) => void,
 *   className?: string,
 *   children?: import('react').ReactNode,
 * }} props
 */
export default function EntryMenuButton({ label, onOpen, className, children }) {
  const open = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpen(event);
  };

  return (
    <button
      type="button"
      className={className}
      aria-label={`${label} 메뉴`}
      title="메뉴"
      onClick={open}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={open}
    >
      {children ?? <BoxedDotsIcon className="h-4 w-4" />}
    </button>
  );
}
