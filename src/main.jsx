import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { initEducowork } from './lib/initEducowork.js';
import { APP_NAME } from '../shared/constants.js';
import './styles/index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
    {APP_NAME} 연결 중…
  </div>,
);

initEducowork()
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
