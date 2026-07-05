import { APP_ICON_URL, APP_NAME } from '../../../shared/constants.js';

/**
 * @param {{
 *   size?: number,
 *   className?: string,
 *   title?: string,
 * }} props
 */
export default function AppLogo({ size = 32, className = '', title = APP_NAME }) {
  return (
    <img
      src={APP_ICON_URL}
      alt={title}
      width={size}
      height={size}
      className={`shrink-0 rounded-md object-cover ${className}`}
      draggable={false}
    />
  );
}
