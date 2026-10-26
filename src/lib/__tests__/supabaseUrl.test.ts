import { describeBackend, pickSupabaseEnv, resolveSupabaseUrl } from '../supabaseUrl';

const LOCAL = 'http://127.0.0.1:54321';

describe('resolveSupabaseUrl', () => {
  it('swaps loopback for the Mac LAN address on a phone in development', () => {
    expect(
      resolveSupabaseUrl({ envUrl: LOCAL, hostUri: '192.168.1.23:8081', isDev: true, platform: 'ios' }),
    ).toBe('http://192.168.1.23:54321');
  });

  it('also swaps localhost', () => {
    expect(
      resolveSupabaseUrl({
        envUrl: 'http://localhost:54321',
        hostUri: '10.0.0.5:8081',
        isDev: true,
        platform: 'ios',
      }),
    ).toBe('http://10.0.0.5:54321');
  });

  it('leaves the URL alone on web', () => {
    expect(
      resolveSupabaseUrl({ envUrl: LOCAL, hostUri: '192.168.1.23:8081', isDev: true, platform: 'web' }),
    ).toBe(LOCAL);
  });

  it('leaves a production URL alone', () => {
    const remote = 'https://abc.supabase.co';
    expect(
      resolveSupabaseUrl({ envUrl: remote, hostUri: '192.168.1.23:8081', isDev: true, platform: 'ios' }),
    ).toBe(remote);
    expect(
      resolveSupabaseUrl({ envUrl: LOCAL, hostUri: '192.168.1.23:8081', isDev: false, platform: 'ios' }),
    ).toBe(LOCAL);
  });

  it('falls back to the env URL without a usable Metro host', () => {
    expect(resolveSupabaseUrl({ envUrl: LOCAL, hostUri: undefined, isDev: true, platform: 'ios' })).toBe(
      LOCAL,
    );
    expect(
      resolveSupabaseUrl({ envUrl: LOCAL, hostUri: '127.0.0.1:8081', isDev: true, platform: 'ios' }),
    ).toBe(LOCAL);
    expect(resolveSupabaseUrl({ envUrl: 'not a url', hostUri: '1.2.3.4:8081', isDev: true, platform: 'ios' })).toBe(
      'not a url',
    );
  });
});

describe('describeBackend (the development badge)', () => {
  it('a hosted project is REMOTE, with its ref', () => {
    expect(describeBackend('https://xmymneartjmdsawlwzyl.supabase.co')).toEqual({
      kind: 'remote',
      ref: 'xmymneartjmdsawlwzyl',
      label: 'REMOTE (xmym…)',
    });
  });

  it('127.0.0.1, localhost or the Mac on the Wi-Fi is LOCAL', () => {
    expect(describeBackend('http://127.0.0.1:54321').label).toBe('LOCAL');
    expect(describeBackend('http://localhost:54321').kind).toBe('local');
    expect(describeBackend('http://192.168.1.23:54321')).toEqual({ kind: 'local', ref: null, label: 'LOCAL' });
  });

  it('a look-alike address is not taken for a hosted project', () => {
    expect(describeBackend('https://xmymneartjmdsawlwzyl.supabase.co.evil.dev').kind).toBe('local');
    expect(describeBackend('http://xmymneartjmdsawlwzyl.supabase.co').kind).toBe('local');
  });
});

describe('pickSupabaseEnv', () => {
  const REMOTE = 'https://xmymneartjmdsawlwzyl.supabase.co';

  it('start:remote wins over .env (whose values Expo merges over the script\'s in development)', () => {
    expect(pickSupabaseEnv({ url: LOCAL, anonKey: 'local', remoteUrl: REMOTE, remoteAnonKey: 'remote' })).toEqual({
      url: REMOTE,
      anonKey: 'remote',
    });
  });

  it('otherwise .env (local), and never half of each', () => {
    expect(pickSupabaseEnv({ url: LOCAL, anonKey: 'local', remoteUrl: undefined, remoteAnonKey: undefined })).toEqual({ url: LOCAL, anonKey: 'local' });
    expect(pickSupabaseEnv({ url: LOCAL, anonKey: 'local', remoteUrl: REMOTE, remoteAnonKey: '' })).toEqual({ url: LOCAL, anonKey: 'local' });
    expect(pickSupabaseEnv({ url: undefined, anonKey: undefined, remoteUrl: undefined, remoteAnonKey: undefined })).toEqual({ url: '', anonKey: '' });
  });
});
