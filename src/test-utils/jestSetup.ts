// Runs before every test file (package.json → jest.setupFiles).
//
// Jest has no SQLite, so services see the cache as the web build does:
// switched off, every read going to the (mocked) Supabase client. Tests of
// the cache itself mock ../lib/cache/store with their own fake.
jest.mock('../lib/cache/store', () => jest.requireActual('../lib/cache/store.web'));
