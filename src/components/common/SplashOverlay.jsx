import {
  APP_BLOG_URL,
  APP_ICON_URL,
  APP_NAME,
  APP_VERSION,
} from '../../../shared/constants.js';
import { openExternalUrl } from '../../lib/openExternal.js';

const iconSrc = `${import.meta.env.BASE_URL}${APP_ICON_URL.replace(/^\//, '')}`;

export default function SplashOverlay({ open, onClose }) {
  if (!open) return null;

  return (
    <div
      className="splash-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${APP_NAME} 소개`}
      onClick={onClose}
    >
      <div className="splash-overlay__panel" onClick={onClose}>
        <img className="splash-overlay__logo" src={iconSrc} alt="" />
        <div className="splash-overlay__content">
          <h2 className="splash-overlay__title">
            {APP_NAME}{' '}
            <span className="splash-overlay__version">v{APP_VERSION}</span>
          </h2>
          <a
            className="splash-overlay__url"
            href={APP_BLOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              void openExternalUrl(APP_BLOG_URL);
            }}
          >
            {APP_BLOG_URL}
          </a>
        </div>
      </div>
    </div>
  );
}
