import { resolveSupabaseUrl } from '../supabaseUrl';

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
