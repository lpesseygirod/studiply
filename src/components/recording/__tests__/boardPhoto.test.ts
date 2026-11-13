// When Photo can be used (while recording; on the laptop only
// online, Lea's advisor: A), and a board photo saved at its moment: its row
// with the lecture and time, then its line in My notes.
import { photoBoardUsable, saveBoardPhoto, PHOTO_OFFLINE_NOTE } from '../boardPhoto';
import { addDocPhoto } from '../../../services/doc-photo.service';
import { placeAtMoment } from '../../../services/moment-placement';
import { showAlert } from '../../dialogs/dialogs';

jest.mock('../../../services/doc-photo.service', () => ({ addDocPhoto: jest.fn(async () => 'm1') }));
jest.mock('../../../services/moment-placement', () => ({ placeAtMoment: jest.fn(async () => {}) }));
jest.mock('../../dialogs/dialogs', () => ({ showAlert: jest.fn() }));

const picked = { uri: 'blob:1', name: 'board.jpg', mimeType: 'image/jpeg', sizeBytes: 10, size: { width: 640, height: 480 } };

describe('Photo board', () => {
  it('usable while recording; on the laptop only online (the iPhone keeps photos and sends them later)', () => {
    expect(photoBoardUsable({ web: true, online: true, recording: true })).toBe(true);
    expect(photoBoardUsable({ web: true, online: false, recording: true })).toBe(false);
    expect(photoBoardUsable({ web: false, online: false, recording: true })).toBe(true);
    expect(photoBoardUsable({ web: false, online: true, recording: false })).toBe(false);
    expect(PHOTO_OFFLINE_NOTE).toBe('Photos need a connection on the laptop');
  });

  it('a photo at its moment: the media row with the lecture and time, then its line in My notes', async () => {
    expect(await saveBoardPhoto({ lectureId: 'lec-1', ms: 42_000 }, picked)).toBe(true);
    expect(addDocPhoto).toHaveBeenCalledWith('lec-1', picked, { moment: { tMs: 42_000 } });
    expect(placeAtMoment).toHaveBeenCalledWith('lec-1', { kind: 'photo', mediaId: 'm1', ms: 42_000 });
  });

  it('one that can’t be saved: the student is told, nothing placed', async () => {
    jest.mocked(placeAtMoment).mockClear();
    jest.mocked(addDocPhoto).mockRejectedValueOnce(new Error("This image can't be read. Try a JPEG or PNG."));
    expect(await saveBoardPhoto({ lectureId: 'lec-1', ms: 1 }, picked)).toBe(false);
    expect(showAlert).toHaveBeenCalledWith('The photo wasn’t saved', "This image can't be read. Try a JPEG or PNG.");
    expect(placeAtMoment).not.toHaveBeenCalled();
  });
});
