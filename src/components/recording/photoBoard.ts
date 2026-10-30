import * as ImagePicker from 'expo-image-picker';

import { showAlert, type Anchor } from '../dialogs/dialogs';
import { requestCameraPermission } from '../../utils/permissions';
import { saveBoardPhoto } from './boardPhoto';
import { recordingMoment } from './markPanelState';

/**
 * The iPhone's Photo (step 5.6): the camera at once (expo-image-picker, the
 * permission text in app.json); the photo is kept on the phone, queued and
 * shown in My notes at the moment Photo was tapped. The laptop's is
 * ./photoBoard.web.
 */
export async function startBoardPhoto(_anchor?: Anchor): Promise<void> {
  // The moment of the tap: the camera may stay open a while.
  const m = recordingMoment();
  if (!m || !(await requestCameraPermission())) return;
  let asset: ImagePicker.ImagePickerAsset;
  try {
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    asset = result.assets[0];
  } catch {
    showAlert('Error', 'Could not take the photo. Please try again.');
    return;
  }
  await saveBoardPhoto(m, {
    uri: asset.uri,
    name: asset.fileName ?? null,
    mimeType: asset.mimeType ?? 'image/jpeg',
    sizeBytes: asset.fileSize ?? null,
    size: { width: asset.width, height: asset.height },
  });
}
