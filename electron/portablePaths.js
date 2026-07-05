import path from 'node:path';
import { app } from 'electron';

/**
 * USB/포터블 exe는 실행 파일 폴더, 개발 모드는 프로젝트 루트를 기준으로 합니다.
 * @param {boolean} isDev
 */
export function resolvePortableRoot(isDev) {
  if (isDev) {
    return app.getAppPath();
  }
  return path.dirname(process.execPath);
}
