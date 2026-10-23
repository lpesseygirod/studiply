import {
  buildSet,
  escapeLike,
  fromBool,
  fromJson,
  mapNote,
  mapProject,
  mapUserSettings,
  newId,
  now,
  toBool,
  toJson,
  type NoteRow,
  type ProjectRow,
  type UserSettingsRow,
} from '../mappers';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

// -------------------------------------------------------------------
// Primitives
// -------------------------------------------------------------------

describe('newId', () => {
  it('returns the UUID from expo-crypto', () => {
    expect(newId()).toBe('00000000-0000-4000-8000-000000000000');
  });
});

describe('now', () => {
  it('returns an ISO-8601 UTC timestamp', () => {
    const value = now();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(value).toISOString()).toBe(value);
  });
});

describe('toBool / fromBool', () => {
  it('maps booleans to 0/1', () => {
    expect(toBool(true)).toBe(1);
    expect(toBool(false)).toBe(0);
  });

  it('maps 1 to true and anything else to false', () => {
    expect(fromBool(1)).toBe(true);
    expect(fromBool(0)).toBe(false);
    expect(fromBool(null)).toBe(false);
  });
});

describe('toJson', () => {
  it('stores null and undefined as SQL NULL', () => {
    expect(toJson(null)).toBeNull();
    expect(toJson(undefined)).toBeNull();
  });

  it('stringifies other values', () => {
    expect(toJson(['a', 'b'])).toBe('["a","b"]');
    expect(toJson({ x: 1 })).toBe('{"x":1}');
    expect(toJson(0)).toBe('0');
    expect(toJson(false)).toBe('false');
  });
});

describe('fromJson', () => {
  it('parses valid JSON', () => {
    expect(fromJson('["a","b"]', [])).toEqual(['a', 'b']);
  });

  it('returns the fallback for null', () => {
    expect(fromJson(null, ['fallback'])).toEqual(['fallback']);
  });

  it('returns the fallback for corrupt JSON instead of throwing', () => {
    expect(fromJson('{not json', [])).toEqual([]);
  });

  it('round-trips with toJson', () => {
    const value = { a: [1, 2], b: null };
    expect(fromJson(toJson(value), null)).toEqual(value);
  });
});

// -------------------------------------------------------------------
// Row -> app type
// -------------------------------------------------------------------

describe('mapProject', () => {
  it('turns INTEGER flags into booleans and keeps other columns', () => {
    const row: ProjectRow = {
      id: 'p1',
      user_id: 'u1',
      name: 'Biology',
      color: 'lavender',
      icon: 'leaf',
      sort_order: 2,
      is_archived: 1,
      is_deleted: 0,
      deleted_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    };
    expect(mapProject(row)).toEqual({ ...row, is_archived: true, is_deleted: false });
  });
});

describe('mapNote', () => {
  const baseRow: NoteRow = {
    id: 'n1',
    user_id: 'u1',
    session_id: 's1',
    title: 'Cell division',
    summary_level: 'standard',
    summary: 'Mitosis has four phases.',
    key_concepts: '["mitosis"]',
    formulas: null,
    definitions: '[{"term":"chromatid"}]',
    tags: '["bio","exam"]',
    unclear_parts: 'corrupt',
    manual_annotations: null,
    is_confirmed: 1,
    is_deleted: 0,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('parses JSON columns, falling back to [] for null or corrupt cells', () => {
    const note = mapNote(baseRow);
    expect(note.key_concepts).toEqual(['mitosis']);
    expect(note.formulas).toEqual([]);
    expect(note.definitions).toEqual([{ term: 'chromatid' }]);
    expect(note.tags).toEqual(['bio', 'exam']);
    expect(note.unclear_parts).toEqual([]);
  });

  it('turns INTEGER flags into booleans', () => {
    const note = mapNote(baseRow);
    expect(note.is_confirmed).toBe(true);
    expect(note.is_deleted).toBe(false);
  });

  it('keeps plain columns unchanged', () => {
    const note = mapNote(baseRow);
    expect(note.title).toBe('Cell division');
    expect(note.summary).toBe('Mitosis has four phases.');
    expect(note.manual_annotations).toBeNull();
  });
});

describe('mapUserSettings', () => {
  it('turns every INTEGER flag into a boolean', () => {
    const row: UserSettingsRow = {
      user_id: 'u1',
      default_recording_mode: 'lecture',
      lecture_mode_default: 1,
      default_summary_level: 'standard',
      auto_title: 0,
      auto_tags: 1,
      include_unclear_parts: 0,
      include_formulas: 1,
      include_definitions: 0,
      default_retention_policy: 'keep',
      default_language: 'en',
      openai_budget: 5,
      anthropic_budget: 10,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    expect(mapUserSettings(row)).toEqual({
      ...row,
      lecture_mode_default: true,
      auto_title: false,
      auto_tags: true,
      include_unclear_parts: false,
      include_formulas: true,
      include_definitions: false,
    });
  });
});

// -------------------------------------------------------------------
// Dynamic UPDATE builder
// -------------------------------------------------------------------

describe('buildSet', () => {
  it('returns null when there is nothing to update', () => {
    expect(buildSet({})).toBeNull();
    expect(buildSet({ name: undefined })).toBeNull();
  });

  it('skips undefined keys but keeps an explicit null', () => {
    expect(buildSet({ name: 'New', color: undefined, deleted_at: null })).toEqual({
      clause: 'name = ?, deleted_at = ?',
      values: ['New', null],
    });
  });

  it('keeps falsy values that are not undefined', () => {
    expect(buildSet({ sort_order: 0, title: '' })).toEqual({
      clause: 'sort_order = ?, title = ?',
      values: [0, ''],
    });
  });
});

describe('escapeLike', () => {
  it('escapes %, _ and backslash', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLike('Cell division')).toBe('Cell division');
  });
});
