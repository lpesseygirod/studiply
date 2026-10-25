import {
  PROBE_INTERVAL_MS,
  configureProbe,
  getConnection,
  isSimulatedOffline,
  onBackOnline,
  probe,
  reportFailure,
  reportReachable,
  resetConnectivityForTests,
  setSimulatedOffline,
  waitUntilKnown,
} from '../connectivity';

beforeEach(() => {
  jest.useFakeTimers();
  resetConnectivityForTests();
});

afterEach(() => jest.useRealTimers());

describe('connectivity', () => {
  it('starts unknown and follows what requests report', () => {
    expect(getConnection()).toBe('unknown');
    reportReachable();
    expect(getConnection()).toBe('online');
    reportFailure();
    expect(getConnection()).toBe('offline');
  });

  it('calls onBackOnline once per offline → online change, not at startup', () => {
    const back = jest.fn();
    onBackOnline(back);
    reportReachable();
    expect(back).not.toHaveBeenCalled();
    reportFailure();
    reportFailure();
    reportReachable();
    reportReachable();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('probes every interval while offline until the backend answers', async () => {
    const health = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    configureProbe(health);
    reportFailure();

    await jest.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    expect(health).toHaveBeenCalledTimes(1);
    expect(getConnection()).toBe('offline');

    await jest.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    expect(health).toHaveBeenCalledTimes(2);
    expect(getConnection()).toBe('online');

    await jest.advanceTimersByTimeAsync(PROBE_INTERVAL_MS * 3);
    expect(health).toHaveBeenCalledTimes(2);
  });

  it('treats a probe that throws as offline', async () => {
    configureProbe(jest.fn().mockRejectedValue(new TypeError('Network request failed')));
    await probe();
    expect(getConnection()).toBe('offline');
  });

  it('shares one probe between overlapping calls', async () => {
    const health = jest.fn().mockResolvedValue(true);
    configureProbe(health);
    await Promise.all([probe(), probe(), probe()]);
    expect(health).toHaveBeenCalledTimes(1);
  });

  it('waitUntilKnown resolves on the first answer or after the limit', async () => {
    const known = waitUntilKnown(4000);
    reportReachable();
    await expect(known).resolves.toBe('online');

    resetConnectivityForTests();
    const timedOut = waitUntilKnown(4000);
    await jest.advanceTimersByTimeAsync(4000);
    await expect(timedOut).resolves.toBe('unknown');
  });

  it('simulated offline ignores successes until it is switched off', async () => {
    const health = jest.fn().mockResolvedValue(true);
    configureProbe(health);
    setSimulatedOffline(true);
    expect(isSimulatedOffline()).toBe(true);
    expect(getConnection()).toBe('offline');
    reportReachable();
    await probe();
    expect(getConnection()).toBe('offline');

    setSimulatedOffline(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(getConnection()).toBe('online');
  });
});
