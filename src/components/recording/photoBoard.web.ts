import { showActionSheet, showAlert, type Anchor } from '../dialogs/dialogs';
import { imageSize } from '../../editor/photos.web';
import { isImageFile } from '../../utils/heif';
import { openWebcam, saveBoardPhoto } from './boardPhoto';
import { recordingMoment, type Moment } from './markPanelState';

/**
 * The laptop's Photo board (step 5.6; also the web below 1024 px): a small
 * menu with Take a photo (webcam; its panel under the strip, or a sheet
 * below 1024 px) and Choose files… (several). All at the moment Photo board
 * was pressed. Online only (./boardPhoto: greyed out offline). The iPhone's
 * is ./photoBoard.
 */
export async function startBoardPhoto(anchor?: Anchor): Promise<void> {
  const m = recordingMoment();
  if (!m) return;
  showActionSheet(
    undefined,
    [
      { text: 'Take a photo (webcam)', onPress: () => openWebcam(m) },
      { text: 'Choose files…', onPress: () => void chooseFiles(m) },
    ],
    { anchor },
  );
}

/** Stop & summarize's + Photos (step 7.3): the same file picker, at `m` (during or after the recording). */
export function choosePhotos(m: Moment): Promise<void> {
  return chooseFiles(m);
}

/** The browser's file picker, photos only, several at once; each saved at `m`, in order. Resolves once saved (or cancelled). */
function chooseFiles(m: Moment): Promise<void> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.heic,.heif';
    input.multiple = true;
    // In the page while the picker is open (Safari, and the browser's handing over of the files, need that).
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      void saveFiles(m, files).finally(resolve);
    };
    input.oncancel = () => {
      input.remove();
      resolve();
    };
    input.click();
  });
}

async function saveFiles(m: Moment, files: File[]): Promise<void> {
  // A HEIC can come without a type (toJpeg decodes it, Lea 6 Nov).
  const images = files.filter(isImageFile);
  if (images.length < files.length) showAlert('Only photos here', 'Images (JPEG, PNG, HEIC…) can go into your notes; other files go in the library.');
  for (const file of images) {
    const url = URL.createObjectURL(file);
    try {
      if (!(await saveBoardPhoto(m, { uri: url, name: file.name, mimeType: file.type, sizeBytes: file.size, size: await imageSize(url) }))) return;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** The webcam panel's picture (a JPEG of the frame shown). */
export async function saveWebcamPhoto(m: Moment, jpeg: Blob, size: { width: number; height: number }): Promise<void> {
  const url = URL.createObjectURL(jpeg);
  try {
    await saveBoardPhoto(m, { uri: url, name: 'board.jpg', mimeType: 'image/jpeg', sizeBytes: jpeg.size, size });
  } finally {
    URL.revokeObjectURL(url);
  }
}
