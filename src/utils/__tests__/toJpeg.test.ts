// toJpeg on the iPhone: a picture that can be transparent is
// drawn on white (the editor bundle's WebView, through the flattener) before
// it becomes a JPEG; a camera photo goes straight to the JPEG.
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator } from 'expo-image-manipulator';

import { flattenOnWhiteNative } from '../../lib/pictureFlattener';
import { toJpeg } from '../toJpeg';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));
const mockSaveAsync = jest.fn(async () => ({ uri: 'file:///cache/out.jpg' }));
const mockResize = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn(() => ({ resize: mockResize, renderAsync: async () => ({ saveAsync: mockSaveAsync }) })) },
}));
const saveAsync = mockSaveAsync;
const resize = mockResize;
jest.mock('../../lib/pictureFlattener', () => ({ flattenOnWhiteNative: jest.fn(async () => 'data:image/png;base64,V0hJVEU=') }));

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
/** An RGBA PNG's first bytes (colour type 6). */
const RGBA_PNG = [0x89, ...ascii('PNG'), 13, 10, 26, 10, 0, 0, 0, 13, ...ascii('IHDR'), 0, 0, 0, 4, 0, 0, 0, 4, 8, 6, 0, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 16, ...ascii('JFIF'), 0];

beforeEach(() => jest.clearAllMocks());

it('a transparent PNG: drawn on white, the JPEG made from that, the white copy removed', async () => {
  jest.mocked(FileSystem.readAsStringAsync).mockImplementation(async (_uri, options) => (options?.length ? b64(RGBA_PNG) : 'UE5HIEZJTEU='));
  const out = await toJpeg('file:///picked/logo.png', { width: 400, height: 200 });
  expect(jest.mocked(flattenOnWhiteNative)).toHaveBeenCalledWith('data:image/png;base64,UE5HIEZJTEU=');
  const white = jest.mocked(FileSystem.writeAsStringAsync).mock.calls[0];
  expect(white[0]).toMatch(/^file:\/\/\/cache\/on-white-.*\.png$/);
  expect(white[1]).toBe('V0hJVEU=');
  expect(jest.mocked(ImageManipulator.manipulate)).toHaveBeenCalledWith(white[0]);
  expect(saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8 });
  expect(jest.mocked(FileSystem.deleteAsync)).toHaveBeenCalledWith(white[0], { idempotent: true });
  expect(out).toEqual({ uri: 'file:///cache/out.jpg', mimeType: 'image/jpeg' });
});

it('a camera JPEG: straight to the JPEG, no WebView', async () => {
  jest.mocked(FileSystem.readAsStringAsync).mockResolvedValue(b64(JPEG));
  await toJpeg('file:///picked/board.jpg', { width: 4032, height: 3024 });
  expect(jest.mocked(flattenOnWhiteNative)).not.toHaveBeenCalled();
  expect(jest.mocked(ImageManipulator.manipulate)).toHaveBeenCalledWith('file:///picked/board.jpg');
  expect(resize).toHaveBeenCalledWith({ width: 2048 });
});

it('a file whose first bytes can’t be read here is converted as before', async () => {
  jest.mocked(FileSystem.readAsStringAsync).mockRejectedValue(new Error('no access'));
  await toJpeg('ph://asset/1');
  expect(jest.mocked(flattenOnWhiteNative)).not.toHaveBeenCalled();
  expect(jest.mocked(ImageManipulator.manipulate)).toHaveBeenCalledWith('ph://asset/1');
});

it('a transparent picture the WebView can’t draw is refused, never saved black', async () => {
  jest.mocked(FileSystem.readAsStringAsync).mockResolvedValue(b64(RGBA_PNG));
  jest.mocked(flattenOnWhiteNative).mockRejectedValueOnce(new Error("This image can't be read."));
  await expect(toJpeg('file:///picked/logo.png')).rejects.toThrow("can't be read");
  expect(jest.mocked(ImageManipulator.manipulate)).not.toHaveBeenCalled();
});
