// Local preview of the dashboard page with sample data and a stand-in for the artifact db, so the
// page can be screenshotted in a headless browser: `node scripts/preview-dashboard.mjs <out.html>`.
// Mirrors the publish skeleton (doctype, charset, viewport, small reset) the Artifact tool adds.
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
const day = (n) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('sv-SE');
const card = (name, lastTalk, extra = {}) => ({ name, active: true, left: null, evalStage: null, lastTalk, ...extra });
const sample = {
  'meta/cycle': { name: 'מחזור הצהובים', start: day(30), setup: 'done' },
  'commander/settings': { name: 'רז', talk: { target: 10, yellow: 10, red: 14 } },
  trainees: {
    't-1': card('נועה', day(2)), 't-2': card('דני', day(12), { evalStage: 'רף מקס' }), 't-3': card('מאיה', null),
    't-4': card('אור', day(22)), 't-5': card('אביגיל', day(6)), 't-6': card('עידו', day(16)),
    't-7': card('יואב', day(40), { active: false, left: { date: day(10), reason: 'העברה' } }),
  },
};
const mock = `<script>
const SAMPLE = ${JSON.stringify(sample)};
const snap = (id, data) => ({ id, exists: data !== undefined, data: () => data, metadata: {} });
const db = {
  doc: (p) => ({ onSnapshot: (next) => { setTimeout(() => next(snap(p.split('/').pop(), SAMPLE[p])), 30); return () => {}; } }),
  collection: (p) => ({ onSnapshot: (next) => {
    const docs = Object.entries(SAMPLE[p] ?? Object.fromEntries(Object.entries(SAMPLE).filter(([k]) => k.startsWith(p + '/')).map(([k, v]) => [k.slice(p.length + 1), v]))).map(([id, d]) => snap(id, d));
    setTimeout(() => next({ docs, size: docs.length, empty: !docs.length }), 30); return () => {}; } }),
};
window.claude = { use: async (n) => (n === 'db' ? db : null) };
</script>`;
const skeleton = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>${mock}</head><body>${page}</body></html>`;
fs.writeFileSync(process.argv[2], skeleton);
