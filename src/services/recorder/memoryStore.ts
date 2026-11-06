/**
 * A recording store that lives in memory: for tests (the web's is IndexedDB,
 * in ./platform.web). Kept across a simulated crash by creating a new service
 * on the same store.
 */

import type { RecordingMeta, RecordingStore, StoredChunk, StoredPart } from './types';

export function createMemoryRecordingStore(): RecordingStore & {
  recordings: Map<string, RecordingMeta>;
  chunks: StoredChunk[];
  parts: StoredPart[];
} {
  const recordings = new Map<string, RecordingMeta>();
  let chunks: StoredChunk[] = [];
  let parts: StoredPart[] = [];
  const bySeq = <T extends { seq: number }>(list: T[]) => [...list].sort((a, b) => a.seq - b.seq);
  return {
    recordings,
    get chunks() {
      return chunks;
    },
    get parts() {
      return parts;
    },
    async saveRecording(meta) {
      recordings.set(meta.lectureId, { ...meta });
    },
    async getRecording(id) {
      const meta = recordings.get(id);
      return meta ? { ...meta } : null;
    },
    async listRecordings() {
      return [...recordings.values()].map((m) => ({ ...m }));
    },
    async removeRecording(id) {
      recordings.delete(id);
      chunks = chunks.filter((c) => c.lectureId !== id);
      parts = parts.filter((p) => p.lectureId !== id);
    },
    async dropChunks(id, fromSeq) {
      chunks = chunks.filter((c) => c.lectureId !== id || c.seq < fromSeq);
      parts = parts.filter((p) => p.lectureId !== id || p.seq < fromSeq);
    },
    async addPart(part) {
      parts.push({ ...part });
    },
    async listParts(id) {
      return parts.filter((p) => p.lectureId === id).sort((a, b) => a.seq - b.seq || a.index - b.index).map((p) => ({ ...p }));
    },
    async dropParts(id, seq) {
      parts = parts.filter((p) => p.lectureId !== id || p.seq !== seq);
    },
    async finishChunk(chunk) {
      chunks = chunks.filter((c) => c.lectureId !== chunk.lectureId || c.seq !== chunk.seq);
      chunks.push({ ...chunk });
      parts = parts.filter((p) => p.lectureId !== chunk.lectureId || p.seq !== chunk.seq);
    },
    async getChunk(id, seq) {
      const c = chunks.find((x) => x.lectureId === id && x.seq === seq);
      return c ? { ...c } : null;
    },
    async listChunks(id) {
      return bySeq(chunks.filter((c) => c.lectureId === id)).map((c) => ({ ...c }));
    },
    async updateChunk(id, seq, change) {
      const i = chunks.findIndex((x) => x.lectureId === id && x.seq === seq);
      if (i < 0) return null;
      chunks[i] = { ...chunks[i], ...change };
      return { ...chunks[i] };
    },
  };
}
