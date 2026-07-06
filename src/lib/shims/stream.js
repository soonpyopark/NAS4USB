/**
 * xlsx-js-style 초기화가 stream.Readable 존재 여부만 확인합니다.
 * Node 파일 I/O 경로는 브라우저에서 사용하지 않으므로 최소 stub으로 충분합니다.
 */
export class Readable {
  pipe(destination) {
    return destination;
  }

  on() {
    return this;
  }

  read() {
    return null;
  }
}

export default { Readable };
