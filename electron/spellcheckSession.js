import { BrowserWindow, session } from 'electron';

/**
 * @param {boolean} enabled
 */
export function setSessionSpellCheckerEnabled(enabled) {
  const on = enabled === true;
  try {
    session.defaultSession.setSpellCheckerEnabled(on);
  } catch {
    // older Electron
  }
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.session.setSpellCheckerEnabled(on);
    } catch {
      // ignore
    }
  }
}
