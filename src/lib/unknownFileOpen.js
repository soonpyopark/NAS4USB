import { downloadFileEntry } from './downloadEntries.js';
import { isInternetShortcutExtension, openInternetShortcutEntry } from './internetShortcut.js';
import { showAppAlert, showAppChoice } from './nativeDialog.js';
import { isElectronRenderer } from './runtime.js';

/**
 * Ask how to open a file type that has no dedicated in-app viewer.
 * - Electron: text editor vs external program
 * - Web / browser client: text editor vs download
 * - URL shortcuts also offer opening in the browser
 *
 * @param {{ relativePath: string, name?: string, extension?: string | null }} entry
 * @returns {Promise<'text' | 'browser' | 'external' | 'download' | null>}
 */
export async function promptUnknownFileOpen(entry) {
  const fileName = entry.name || entry.relativePath.split('/').pop() || '파일';
  const ext = String(entry.extension ?? '').trim();
  const formatLabel = ext ? `.${ext}` : '알 수 없는 형식';
  const electron = isElectronRenderer();
  const canOpenInBrowser = isInternetShortcutExtension(ext);

  const choice = await showAppChoice({
    title: '파일 열기',
    body: `'${fileName}' (${formatLabel})은(는) 앱에서 바로 볼 수 있는 형식이 아닙니다.\n어떻게 여시겠습니까?`,
    primaryLabel: '텍스트로 열기',
    extraLabel: canOpenInBrowser ? '브라우저로 열기' : '',
    secondaryLabel: electron ? '외부 프로그램으로 열기' : '다운로드',
    cancelLabel: '취소',
  });

  if (choice === 'primary') return 'text';
  if (choice === 'extra') return 'browser';
  if (choice === 'secondary') return electron ? 'external' : 'download';
  return null;
}

/**
 * @param {{ relativePath: string, name?: string, isDirectory?: boolean }} entry
 */
export async function openUnknownFileExternally(entry) {
  if (!window.nas4usb?.fs?.openPath) {
    throw new Error('시스템으로 열기를 사용할 수 없습니다.');
  }
  await window.nas4usb.fs.openPath(entry.relativePath);
}

/**
 * @param {{ relativePath: string, name?: string, isDirectory?: boolean }} entry
 */
export async function downloadUnknownFile(entry) {
  await downloadFileEntry(entry);
}

/**
 * @param {{ relativePath: string, name?: string, extension?: string | null, isDirectory?: boolean }} entry
 * @returns {Promise<'text' | null>}
 */
export async function resolveUnknownFileOpenAction(entry) {
  const action = await promptUnknownFileOpen(entry);
  if (!action) return null;

  if (action === 'text') return 'text';

  try {
    if (action === 'browser') {
      await openInternetShortcutEntry(entry);
    } else if (action === 'external') {
      await openUnknownFileExternally(entry);
    } else if (action === 'download') {
      await downloadUnknownFile(entry);
    }
  } catch (err) {
    await showAppAlert({
      title: '파일 열기',
      body: err instanceof Error ? err.message : '파일을 처리할 수 없습니다.',
    });
  }

  return null;
}
