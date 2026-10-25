// Runs before every test file (package.json → jest.setupFiles).
//
// Jest has no SQLite, so services see the cache as the web build does:
// switched off, every read going to the (mocked) Supabase client. Tests of
// the cache itself mock ../lib/cache/store with their own fake.
jest.mock('../lib/cache/store', () => jest.requireActual('../lib/cache/store.web'));

// Likewise the sync queue: services send changes straight to Supabase, as
// on the web. The queue's rules are tested in src/lib/sync/__tests__.
jest.mock('../lib/sync', () => jest.requireActual('../lib/sync/index.web'));
