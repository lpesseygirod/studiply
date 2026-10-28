import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { mediaSrc, providePhoto, type PhotoResolver, type PhotoSource } from '../media/photoSource';
import { Photo } from '../schema/photo';

/**
 * Photos on the iPhone (step 4.5), through TenTap's bridge:
 * - native → WebView: insert photos (by media id), and a photo's source
 *   when the WebView asked for it;
 * - WebView → native: "I need media <id>" (sent by the WebView's photo
 *   resolver, editor-web/Editor.tsx). Native resolves it with the resolver
 *   the editor screen sets (`setNativePhotoResolver`): the photo from the
 *   phone when it has it, else a signed link.
 * The selected photo's width travels in the format state (Small … Full width).
 */

export const PHOTO_INSERT = 'photo-insert';
export const PHOTO_SOURCE = 'photo-source';
export const PHOTO_NEED = 'photo-need';

type PhotoMessage =
  | { type: typeof PHOTO_INSERT; payload: string[] }
  | { type: typeof PHOTO_SOURCE; payload: { id: string; source: PhotoSource } }
  | { type: typeof PHOTO_NEED; payload: string };

export type PhotoBridgeInstance = {
  /** Inserts photos (their media ids) where the cursor is. */
  insertPhotos: (mediaIds: string[]) => void;
  sendPhotoSource: (id: string, source: PhotoSource) => void;
};

let nativeResolver: PhotoResolver | null = null;

/** Native: how the WebView's photos are found (the editor screen sets it). */
export function setNativePhotoResolver(resolver: PhotoResolver | null): void {
  nativeResolver = resolver;
}

export const PhotoBridge = new BridgeExtension<object, PhotoBridgeInstance, PhotoMessage>({
  tiptapExtension: Photo,
  onBridgeMessage: (editor, message) => {
    if (message.type === PHOTO_INSERT) editor.chain().focus().insertPhotos(message.payload.map(mediaSrc)).run();
    if (message.type === PHOTO_SOURCE) providePhoto(message.payload.id, message.payload.source);
    return false;
  },
  onEditorMessage: (message, editorBridge) => {
    if (message.type !== PHOTO_NEED) return false;
    const id = message.payload;
    const bridge = editorBridge as unknown as PhotoBridgeInstance;
    void (nativeResolver?.(id) ?? Promise.resolve<PhotoSource>({ state: 'offline' }))
      .catch((): PhotoSource => ({ state: 'offline' }))
      .then((source) => source && bridge.sendPhotoSource(id, source));
    return true;
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    insertPhotos: (mediaIds) => sendBridgeMessage({ type: PHOTO_INSERT, payload: mediaIds }),
    sendPhotoSource: (id, source) => sendBridgeMessage({ type: PHOTO_SOURCE, payload: { id, source } }),
  }),
  extendEditorState: () => ({}),
});
