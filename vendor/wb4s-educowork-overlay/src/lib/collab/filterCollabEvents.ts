import type { DrawingEngine } from '../../engine/drawingEngine.ts';
import { isScenePatchEmpty, type SceneWriteEvent } from './scene-events.ts';

/**
 * 연필·볼펜·형광펜 등 아직 공유되지 않은(deferred) 경로 변경은
 * 「작성 내용 저장」(shareScene) 때만 Y.js에 반영한다.
 */
export function filterDeferredDrawCollabEvents(
  events: SceneWriteEvent[],
  engine: DrawingEngine | null,
): SceneWriteEvent[] {
  if (!engine || events.length === 0) return events;

  const { ids, deletes } = engine.snapshotDeferredDrawState();
  if (ids.size === 0 && deletes.size === 0) return events;

  const filtered: SceneWriteEvent[] = [];

  for (const event of events) {
    if (event.type === 'path-upsert') {
      if (ids.has(event.path.id)) continue;
      filtered.push(event);
      continue;
    }

    if (event.type === 'path-delete') {
      if (deletes.has(event.id)) continue;
      filtered.push(event);
      continue;
    }

    if (event.type === 'scene-patch') {
      const upserts = {
        ...event.upserts,
        paths: event.upserts.paths.filter((path) => !ids.has(path.id)),
      };
      const patchDeletes = {
        ...event.deletes,
        paths: event.deletes.paths.filter((id) => !deletes.has(id)),
      };
      if (isScenePatchEmpty(upserts, patchDeletes)) continue;
      filtered.push({ type: 'scene-patch', upserts, deletes: patchDeletes });
      continue;
    }

    filtered.push(event);
  }

  return filtered;
}
