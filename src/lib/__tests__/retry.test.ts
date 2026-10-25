import { backoffMs, MAX_RETRIES, nextStep, withRetries, type HttpResult } from '../retry';

const ok: HttpResult = { status: 200, body: '{}' };
const noSleep = () => Promise.resolve();

/** An attempt function that answers with each item in turn (an Error is thrown). */
function answers(...items: (HttpResult | Error)[]) {
  const attempt = jest.fn(async () => {
    const next = items.shift();
    if (!next) throw new Error('no more answers');
    if (next instanceof Error) throw next;
    return next;
  });
  return attempt;
}

describe('nextStep', () => {
  it.each([200, 201, 204])('%i is done', (s) => expect(nextStep(s)).toBe('done'));
  it.each([0, 408, 429, 500, 502, 503, 504])('%i is retried', (s) => expect(nextStep(s)).toBe('retry'));
  it.each([400, 403, 404, 409, 413, 415])('%i fails at once', (s) => expect(nextStep(s)).toBe('fail'));
  it('401 refreshes the session', () => expect(nextStep(401)).toBe('refresh'));
});

describe('backoffMs', () => {
  it('waits 1 s, 2 s, 4 s without jitter', () => {
    expect([1, 2, 3].map((r) => backoffMs(r, () => 0))).toEqual([1000, 2000, 4000]);
  });

  it('adds at most 250 ms of jitter', () => {
    expect(backoffMs(1, () => 1)).toBe(1250);
  });
});

describe('withRetries', () => {
  const refresh = jest.fn(async () => true);

  beforeEach(() => refresh.mockClear());

  it('returns the first success without retrying', async () => {
    const attempt = answers(ok);
    const onRetry = jest.fn();
    await expect(withRetries(attempt, { refresh, onRetry, sleep: noSleep })).resolves.toBe(ok);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retries network errors and server errors, then succeeds', async () => {
    const attempt = answers(new Error('offline'), { status: 503, body: '' }, ok);
    const onRetry = jest.fn();
    const sleep = jest.fn(noSleep);
    await expect(withRetries(attempt, { refresh, onRetry, sleep, random: () => 0 })).resolves.toBe(ok);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls).toEqual([
      [1, MAX_RETRIES],
      [2, MAX_RETRIES],
    ]);
    expect(sleep.mock.calls).toEqual([[1000], [2000]]);
  });

  it('gives up after three retries and rethrows the network error', async () => {
    const offline = new Error('offline');
    const attempt = answers(offline, offline, offline, offline);
    await expect(withRetries(attempt, { refresh, sleep: noSleep })).rejects.toBe(offline);
    expect(attempt).toHaveBeenCalledTimes(1 + MAX_RETRIES);
  });

  it('returns the last server error after three retries', async () => {
    const down = { status: 500, body: 'down' };
    const attempt = answers(down, down, down, down);
    await expect(withRetries(attempt, { refresh, sleep: noSleep })).resolves.toEqual(down);
    expect(attempt).toHaveBeenCalledTimes(4);
  });

  it('does not retry an error that retrying cannot fix', async () => {
    const tooLarge = { status: 413, body: '' };
    const attempt = answers(tooLarge);
    await expect(withRetries(attempt, { refresh, sleep: noSleep })).resolves.toBe(tooLarge);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('refreshes the session once on 401 and tries again', async () => {
    const attempt = answers({ status: 401, body: '' }, ok);
    const onRetry = jest.fn();
    await expect(withRetries(attempt, { refresh, onRetry, sleep: noSleep })).resolves.toBe(ok);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('stops on a second 401', async () => {
    const expired = { status: 401, body: '' };
    const attempt = answers(expired, expired);
    await expect(withRetries(attempt, { refresh, sleep: noSleep })).resolves.toBe(expired);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('stops when the session cannot be refreshed', async () => {
    const expired = { status: 401, body: '' };
    const attempt = answers(expired);
    const failedRefresh = jest.fn(async () => false);
    await expect(withRetries(attempt, { refresh: failedRefresh, sleep: noSleep })).resolves.toBe(expired);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
