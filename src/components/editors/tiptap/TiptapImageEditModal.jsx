import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AppModal,
  AppModalActions,
  AppModalBody,
  AppModalButton,
} from '../../common/AppModal.jsx';
import {
  createWorkingImageUrl,
  cropImageToFile,
  editedImageFormatNote,
  inferEditedImageMime,
} from '../../../lib/tiptap/cropImage.js';
import TiptapImageCropStage from './TiptapImageCropStage.jsx';

const ASPECT_PRESETS = [
  { id: 'free', label: '자유', value: undefined },
  { id: '1', label: '1:1', value: 1 },
  { id: '4-3', label: '4:3', value: 4 / 3 },
  { id: '16-9', label: '16:9', value: 16 / 9 },
];

/**
 * @param {{
 *   open: boolean,
 *   imageSrc: string,
 *   sourceName?: string,
 *   onClose: () => void,
 *   onApply: (file: File) => Promise<void>,
 * }} props
 */
export default function TiptapImageEditModal({
  open,
  imageSrc,
  sourceName = '',
  onClose,
  onApply,
}) {
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [aspectId, setAspectId] = useState('free');
  const [workingSrc, setWorkingSrc] = useState(imageSrc);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setAspectId('free');
    setCroppedAreaPixels(null);
    setSaving(false);
    setError('');
    setWorkingSrc(imageSrc);
    return undefined;
  }, [open, imageSrc]);

  useEffect(() => {
    if (!open || !imageSrc) return undefined;
    let cancelled = false;
    /** @type {() => void} */
    let revoke = () => {};

    createWorkingImageUrl(imageSrc, { flipH, flipV, rotation })
      .then((result) => {
        if (cancelled) {
          result.revoke();
          return;
        }
        revoke = result.revoke;
        setWorkingSrc(result.url);
        setCroppedAreaPixels(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '이미지를 불러오지 못했습니다.');
        }
      });

    return () => {
      cancelled = true;
      revoke();
    };
  }, [open, imageSrc, flipH, flipV, rotation]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || saving) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose, saving]);

  const aspect = ASPECT_PRESETS.find((item) => item.id === aspectId)?.value;
  const formatNote = editedImageFormatNote(imageSrc, sourceName);

  const handleApply = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const mimeType = inferEditedImageMime(imageSrc, sourceName);
      const file = await cropImageToFile(workingSrc, croppedAreaPixels, {
        mimeType,
        fileName: mimeType === 'image/png' ? 'image.png' : 'image.jpg',
      });
      await onApply(file);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지를 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }, [croppedAreaPixels, imageSrc, onApply, onClose, saving, sourceName, workingSrc]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <AppModal
      open
      raised
      title="이미지 자르기"
      className="tiptap-image-edit-dialog"
      onClose={saving ? undefined : onClose}
    >
      <AppModalBody className="tiptap-image-edit-body">
        {workingSrc ? (
          <TiptapImageCropStage
            imageSrc={workingSrc}
            aspect={aspect}
            onCropChange={setCroppedAreaPixels}
          />
        ) : null}

        <p className="tiptap-image-edit-note">
          상자를 끌어 옮기고, 모서리·변을 끌어 크기를 조절하세요.
        </p>

        <div className="tiptap-image-edit-tools" role="toolbar" aria-label="이미지 편집">
          <div className="tiptap-image-edit-tools__group">
            {ASPECT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={aspectId === preset.id ? 'is-active' : undefined}
                onClick={() => setAspectId(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="tiptap-image-edit-tools__group">
            <button type="button" title="왼쪽으로 90°" onClick={() => setRotation((value) => value - 90)}>
              ↺ 90°
            </button>
            <button type="button" title="오른쪽으로 90°" onClick={() => setRotation((value) => value + 90)}>
              ↻ 90°
            </button>
            <button
              type="button"
              title="좌우 반전"
              className={flipH ? 'is-active' : undefined}
              onClick={() => setFlipH((value) => !value)}
            >
              좌우
            </button>
            <button
              type="button"
              title="상하 반전"
              className={flipV ? 'is-active' : undefined}
              onClick={() => setFlipV((value) => !value)}
            >
              상하
            </button>
          </div>
        </div>

        {formatNote ? <p className="tiptap-image-edit-note">{formatNote}</p> : null}
        {error ? <p className="tiptap-image-edit-error">{error}</p> : null}
      </AppModalBody>
      <AppModalActions>
        <AppModalButton variant="primary" disabled={saving} onClick={handleApply}>
          {saving ? '저장 중…' : '적용'}
        </AppModalButton>
        <AppModalButton disabled={saving} onClick={onClose}>
          취소
        </AppModalButton>
      </AppModalActions>
    </AppModal>,
    document.body,
  );
}
