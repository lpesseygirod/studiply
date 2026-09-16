import type { Note, Session, Transcript } from '../types/database';

// -------------------------------------------------------------------
// Safe JSON-column parser — handles both pre-parsed arrays and strings
// -------------------------------------------------------------------
function parseCol<T>(col: unknown): T[] {
  if (!col) return [];
  if (typeof col === 'string') {
    try { return JSON.parse(col) as T[]; } catch { return []; }
  }
  if (Array.isArray(col)) return col as T[];
  return [];
}

function esc(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cap(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// -------------------------------------------------------------------
// Section renderers
// -------------------------------------------------------------------

function renderKeyConcepts(col: unknown): string {
  const items = parseCol<{ term: string; explanation?: string }>(col);
  if (!items.length) return '';
  return `
    <div class="section">
      <div class="section-title">Key Concepts</div>
      <div>
        ${items.map(k => `<span class="concept-item">${esc(k.term)}</span>`).join('')}
      </div>
      <table style="width:100%;margin-top:12px;border-collapse:collapse;">
        ${items.map(k => `
          <tr>
            <td style="padding:6px 8px 6px 0;font-weight:bold;font-size:11pt;width:35%;vertical-align:top;">${esc(k.term)}</td>
            <td style="padding:6px 0;font-size:11pt;color:#444;">${esc(k.explanation ?? '')}</td>
          </tr>
        `).join('')}
      </table>
    </div>`;
}

function renderFormulas(col: unknown): string {
  const items = parseCol<{ name: string; expression: string; description?: string }>(col);
  if (!items.length) return '';
  return `
    <div class="section">
      <div class="section-title">Formulas</div>
      ${items.map(f => `
        <div style="margin-bottom:10px;">
          <div style="font-weight:bold;font-size:11pt;">${esc(f.name)}</div>
          <div class="formula">${esc(f.expression)}</div>
          ${f.description ? `<div style="font-size:10pt;color:#666;">${esc(f.description)}</div>` : ''}
        </div>
      `).join('')}
    </div>`;
}

function renderDefinitions(col: unknown): string {
  const items = parseCol<{ term: string; definition: string }>(col);
  if (!items.length) return '';
  return `
    <div class="section">
      <div class="section-title">Definitions</div>
      ${items.map(d => `
        <div class="definition">
          <div class="def-term">${esc(d.term)}</div>
          <div class="def-body">${esc(d.definition)}</div>
        </div>
      `).join('')}
    </div>`;
}

function renderTags(tags: string[]): string {
  if (!tags?.length) return '';
  return `
    <div class="section">
      <div class="section-title">Tags</div>
      <div>${tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    </div>`;
}

function renderUnclearParts(col: unknown): string {
  const items = parseCol<{ excerpt: string; reason?: string }>(col);
  if (!items.length) return '';
  return `
    <div class="section">
      <div class="section-title">Unclear Parts</div>
      ${items.map(u => `
        <div class="unclear">
          <em>"${esc(u.excerpt)}"</em>
          ${u.reason ? `<div style="margin-top:4px;">${esc(u.reason)}</div>` : ''}
        </div>
      `).join('')}
    </div>`;
}

function renderTranscript(transcript: Transcript): string {
  return `
    <div class="section transcript-section">
      <div class="section-title">Full Transcript</div>
      <div class="transcript">${esc(transcript.full_text)}</div>
    </div>`;
}

// -------------------------------------------------------------------
// Main HTML generator
// -------------------------------------------------------------------
export function generateNoteHTML(
  note: Note,
  session: Session,
  transcript: Transcript | null | undefined,
  projectName?: string,
): string {
  const dateStr = new Date(session.created_at).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const mins = Math.floor((session.duration_seconds ?? 0) / 60);
  const secs = (session.duration_seconds ?? 0) % 60;
  const durationStr = session.duration_seconds
    ? `${mins}:${String(secs).padStart(2, '0')}`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #1a1a1a;
      padding: 40px;
      max-width: 100%;
    }
    .header {
      border-bottom: 2px solid #E8B4A0;
      padding-bottom: 16px;
      margin-bottom: 28px;
    }
    .app-name {
      font-size: 9pt;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: #aaa;
      margin-bottom: 8px;
    }
    .title {
      font-size: 22pt;
      font-weight: bold;
      color: #1a1a1a;
      margin-bottom: 8px;
    }
    .meta { font-size: 10pt; color: #666; }
    .meta span { margin-right: 16px; }
    .section { margin-bottom: 24px; page-break-inside: avoid; }
    .section-title {
      font-size: 13pt;
      font-weight: bold;
      color: #333;
      margin-bottom: 10px;
      padding-bottom: 4px;
      border-bottom: 1px solid #eee;
    }
    .summary { font-size: 12pt; line-height: 1.7; color: #333; }
    .concept-item {
      display: inline-block;
      background: #FFF0EB;
      color: #333;
      padding: 4px 12px;
      border-radius: 12px;
      margin: 4px 4px 4px 0;
      font-size: 10pt;
    }
    .formula {
      background: #f5f5f5;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      margin: 6px 0;
      font-size: 11pt;
    }
    .definition {
      margin-bottom: 12px;
      padding-left: 12px;
      border-left: 3px solid #E8B4A0;
    }
    .def-term { font-weight: bold; font-size: 11pt; }
    .def-body { font-size: 11pt; color: #444; }
    .tag {
      display: inline-block;
      background: #F5E0D8;
      color: #666;
      padding: 2px 10px;
      border-radius: 10px;
      margin: 2px 4px 2px 0;
      font-size: 9pt;
    }
    .unclear {
      background: #FFF8E1;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 8px;
      font-size: 10pt;
      color: #665500;
      border-left: 3px solid #FFD54F;
    }
    .transcript { font-size: 10pt; line-height: 1.5; color: #555; white-space: pre-wrap; background: #fafafa; padding: 12px; border-radius: 4px; }
    .transcript-section { page-break-before: always; }
    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #eee; font-size: 9pt; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="app-name">STUDIPLY</div>
    <div class="title">${esc(note.title)}</div>
    <div class="meta">
      ${projectName ? `<span>📁 ${esc(projectName)}</span>` : ''}
      <span>📅 ${dateStr}</span>
      ${durationStr ? `<span>⏱ ${durationStr}</span>` : ''}
      <span>📝 ${cap(note.summary_level ?? 'standard')} summary</span>
      <span>🌐 ${(session.language ?? 'en').toUpperCase()}</span>
    </div>
  </div>

  ${note.summary ? `
  <div class="section">
    <div class="section-title">Summary</div>
    <div class="summary">${esc(note.summary)}</div>
  </div>` : ''}

  ${renderKeyConcepts(note.key_concepts)}
  ${renderFormulas(note.formulas)}
  ${renderDefinitions(note.definitions)}
  ${renderTags(note.tags ?? [])}
  ${renderUnclearParts(note.unclear_parts)}
  ${transcript ? renderTranscript(transcript) : ''}

  <div class="footer">Generated by Studiply &mdash; ${dateStr}</div>
</body>
</html>`;
}
