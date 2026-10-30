import { showActionSheet, showAlert, type Anchor } from '../dialogs/dialogs';
import { imageSize } from '../../editor/photos.web';
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
      { text: 'Choose files…', onPress: () => chooseFiles(m) },
    ],
    { anchor },
  );
}

/** The browser's file picker, photos only, several at once; each saved at `m`, in order. */
function chooseFiles(m: Moment): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  // In the page while the picker is open (Safari, and the browser's handing over of the files, need that).
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = () => {
    const files = Array.from(input.files ?? []);
    input.remove();
    void saveFiles(m, files);
  };
  input.oncancel = () => input.remove();
  input.click();
}

async function saveFiles(m: Moment, files: File[]): Promise<void> {
  const images = files.filter((f) => f.type.startsWith('image/'));
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
