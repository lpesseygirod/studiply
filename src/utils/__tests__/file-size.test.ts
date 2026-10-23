import * as FileSystem from 'expo-file-system/legacy';
import { formatFileSize, getLocalFileSize } from '../file-size';

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
}));

const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;

describe('formatFileSize', () => {
  it('formats 0 and small byte counts as B', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1)).toBe('1 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('switches to KB at 1024 bytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('switches to MB at 1024 KB', () => {
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1024.0 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(25.5 * 1024 * 1024)).toBe('25.5 MB');
  });

  it('switches to GB at 1024 MB', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
});

describe('getLocalFileSize', () => {
  beforeEach(() => {
    getInfoAsync.mockReset();
  });

  it('returns the size of an existing file', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, size: 2048 });
    await expect(getLocalFileSize('file:///a.m4a')).resolves.toBe(2048);
    expect(getInfoAsync).toHaveBeenCalledWith('file:///a.m4a');
  });

  it('returns null when the file has no size', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false });
    await expect(getLocalFileSize('file:///a.m4a')).resolves.toBeNull();
  });

  it('returns null for a missing file', async () => {
    getInfoAsync.mockResolvedValue({ exists: false, isDirectory: false });
    await expect(getLocalFileSize('file:///missing.m4a')).resolves.toBeNull();
  });

  it('returns null for a directory', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, isDirectory: true, size: 4096 });
    await expect(getLocalFileSize('file:///dir/')).resolves.toBeNull();
  });

  it('returns null when reading the file info throws', async () => {
    getInfoAsync.mockRejectedValue(new Error('permission denied'));
    await expect(getLocalFileSize('file:///locked.m4a')).resolves.toBeNull();
  });
});
