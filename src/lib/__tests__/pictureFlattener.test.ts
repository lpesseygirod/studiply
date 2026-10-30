// The queue between toJpeg and the iPhone's flattening WebView (step 4.8b).
import { flattenOnWhiteNative, hasFlattenJobs, nextFlattenJob, registerFlattener } from '../pictureFlattener';

afterEach(() => jest.useRealTimers());

it('a picture waits for the host, which is woken and answers it', async () => {
  const wake = jest.fn();
  const stop = registerFlattener(wake);
  const done = flattenOnWhiteNative('data:image/png;base64,QQ==');
  expect(wake).toHaveBeenCalledTimes(1);
  expect(hasFlattenJobs()).toBe(true);
  const job = nextFlattenJob()!;
  expect(job.dataUrl).toBe('data:image/png;base64,QQ==');
  expect(hasFlattenJobs()).toBe(false);
  job.resolve('data:image/png;base64,V0g=');
  await expect(done).resolves.toBe('data:image/png;base64,V0g=');
  stop();
});

it('a host that registers later is woken for what is already waiting', () => {
  const pending = flattenOnWhiteNative('data:image/gif;base64,R0k=');
  const wake = jest.fn();
  const stop = registerFlattener(wake);
  expect(wake).toHaveBeenCalledTimes(1);
  nextFlattenJob()!.reject(new Error('x'));
  stop();
  return expect(pending).rejects.toThrow('x');
});

it('no host (the WebView never came): the picture is refused after a while, not left waiting', async () => {
  jest.useFakeTimers();
  const pending = flattenOnWhiteNative('data:image/png;base64,QQ==');
  jest.advanceTimersByTime(30_000);
  await expect(pending).rejects.toThrow("can't be read");
  expect(hasFlattenJobs()).toBe(false);
});
