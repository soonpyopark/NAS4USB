import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { initNas4usb } from './lib/initNas4usb.js';
import { APP_ICON_URL, APP_NAME } from '../shared/constants.js';
import './styles/index.css';

const iconSrc = `${import.meta.env.BASE_URL}${APP_ICON_URL.replace(/^\//, '')}`;
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <div className="flex min-h-screen items-center justify-center bg-[#0a1a33] px-6">
    <div className="flex items-center gap-[18px]">
      <img
        className="h-[68px] w-[68px] shrink-0 rounded-[14px] bg-white object-contain"
        src={iconSrc}
        alt=""
      />
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold leading-tight tracking-tight text-white">{APP_NAME}</h1>
        <p className="m-0 text-[11px] text-[#8fa0b8]">연결 중…</p>
      </div>
    </div>
  </div>,
);

initNas4usb()
  .then(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : '서버에 연결할 수 없습니다.';
    root.render(
      <React.StrictMode>
        <App connectionError={message} />
      </React.StrictMode>,
    );
  });
