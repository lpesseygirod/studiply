// chart-photo.mjs — the synthetic-chart fixture's photo (Lea, 6 Nov: graphs in photos redrawn as
// charts): a bar chart as drawn on a whiteboard, photographed a little crooked, made in headless Chrome
// and saved as a JPEG. Its values are the fixture's own (scripts/fixtures/synthetic-chart-lecture.ts,
// CHART_EXPECTED: 2019–2023, 12 15 9 18 21), with gridlines every 5, so most bars end between two lines
// (read as approximate). No dev server, no Supabase, no network.
//
//   node .claude/skills/web-check/scripts/chart-photo.mjs tests/fixtures/lectures/synthetic-chart/media/chart.jpg
//
// Also leaves the PNG it was made from in the screenshots folder (chart-photo.png).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch } = await import(new URL('cdp.mjs', scripts).href);
const repo = join(fileURLToPath(scripts), '../../../../');
// Node 22.18+ reads TypeScript without a flag (its types are stripped): the values have one home.
const { CHART_EXPECTED: E } = await import(pathToFileURL(join(repo, 'scripts/fixtures/synthetic-chart-lecture.ts')).href);

const out = resolve(process.argv[2] ?? join(repo, `tests/fixtures/lectures/synthetic-chart/media/${E.file}`));
const W = 1400;
const H = 1000;
const STEP = 5;
const top = Math.ceil(Math.max(...E.values.map((v) => v.y)) / STEP) * STEP + STEP;

/** The chart as an SVG: axes, gridlines every STEP with their numbers, one bar per year (no value written on it). */
function chartSvg() {
  const x0 = 170;
  const y0 = 760;
  const plotW = 1000;
  const plotH = 560;
  const y = (v) => y0 - (v / top) * plotH;
  const ink = '#1f3b8a';
  const lines = [];
  for (let v = 0; v <= top; v += STEP) {
    lines.push(`<line x1="${x0}" y1="${y(v)}" x2="${x0 + plotW}" y2="${y(v)}" stroke="#9aa3b5" stroke-width="2" stroke-dasharray="${v ? '10 8' : ''}"/>`);
    lines.push(`<text x="${x0 - 22}" y="${y(v) + 12}" text-anchor="end" font-size="34">${v}</text>`);
  }
  const slot = plotW / E.values.length;
  const bars = E.values.map((v, i) => {
    const bx = x0 + i * slot + slot * 0.2;
    return `<rect x="${bx}" y="${y(v.y)}" width="${slot * 0.6}" height="${y0 - y(v.y)}" fill="#4f7bd9" fill-opacity="0.55" stroke="${ink}" stroke-width="4"/>` + `<text x="${bx + slot * 0.3}" y="${y0 + 50}" text-anchor="middle" font-size="34">${v.x}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="900" font-family="'Marker Felt', 'Chalkboard SE', 'Comic Sans MS', sans-serif" fill="${ink}">
    <text x="650" y="90" text-anchor="middle" font-size="48">${E.title}</text>
    ${lines.join('')}
    <line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y(top) - 20}" stroke="${ink}" stroke-width="5"/>
    <line x1="${x0}" y1="${y0}" x2="${x0 + plotW + 20}" y2="${y0}" stroke="${ink}" stroke-width="5"/>
    ${bars.join('')}
    <text x="${x0 + plotW / 2}" y="${y0 + 110}" text-anchor="middle" font-size="36">${E.xLabel}</text>
    <text x="60" y="${y0 - plotH / 2}" text-anchor="middle" font-size="36" transform="rotate(-90 60 ${y0 - plotH / 2})">${E.yLabel}</text>
  </svg>`;
}

// A whiteboard in a room: the board slightly turned, its light uneven, the wall around it.
const html = `<body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;background:radial-gradient(circle at 30% 20%, #8d8a84, #4c4a46)">
  <div style="position:absolute;left:40px;top:40px;width:1320px;height:920px;background:radial-gradient(ellipse at 35% 30%, #ffffff, #e9ebe6 70%, #d6d8d2);border:14px solid #b9bcc2;border-radius:6px;box-shadow:0 18px 40px rgba(0,0,0,.45);transform:rotate(-2.2deg) skewX(1deg)">
    ${chartSvg()}
  </div>
</body>`;

const b = await launch({ width: W, height: H });
try {
  await b.resize(W, H);
  await b.evaluate(`(() => { document.open(); document.write(${JSON.stringify(html)}); document.close(); })()`);
  await b.sleep(600);
  const png = await b.shot('chart-photo');
  mkdirSync(dirname(out), { recursive: true });
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', png, '--out', out], { stdio: 'ignore' });
  console.log(`chart photo: ${out} (values ${E.values.map((v) => `${v.x} ${v.y}`).join(', ')}; gridlines every ${STEP})`);
} finally {
  await b.close();
}
