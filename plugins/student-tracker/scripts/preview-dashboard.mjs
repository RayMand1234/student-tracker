// Local preview of the dashboard page with sample data and a stand-in for the artifact db, so the
// page can be screenshotted in a headless browser: `node scripts/preview-dashboard.mjs <out.html>`.
// Mirrors the publish skeleton (doctype, charset, viewport, small reset) the Artifact tool adds.
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
const data = (f) => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const day = (n) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('sv-SE');
const at = (n) => `${day(n)}T10:00:00+02:00`;
const card = (name, lastTalk, extra = {}) => ({
  name, active: true, left: null, status: null, evalStage: null, lastTalk, snapshot: null, items: [], followups: [], nextTalk: null, skills: {}, ...extra,
});
const MARK = '[פרט אישי — בתיק]';
// A Skill's counting Assessments: [[days ago, score, author?], …] → {a, n}.
const sk = (list, n = list.length) => ({ a: list.map(([d, s, by = 'agent']) => [day(d), s, by]), n });
const SKILL_IDS = data('skills.json').groups.flatMap((g) => g.skills.map((k) => k.id));
// Deterministic filler Assessments for the other Trainees, so the team line has something to show.
const filler = (seed, base) => Object.fromEntries(SKILL_IDS.filter((_, i) => (i * 7 + seed) % 3 !== 0).map((id, i) => {
  const s = Math.max(1, Math.min(5, base + ((i + seed) % 3) - 1));
  return [id, sk([[55 - ((i * 5 + seed) % 20), Math.max(1, s - 1)], [20 - ((i + seed) % 15), s]])];
}));
const sample = {
  'meta/cycle': { name: 'מחזור הצהובים', start: day(62), setup: 'done' },
  'meta/skills': data('skills.json'),
  'meta/preset': data('preset.json'),
  'commander/settings': { name: 'רז', talk: { target: 10, yellow: 10, red: 14 } },
  trainees: {
    't-1': card('נועה', day(2), {
      status: { value: 'good', by: 'agent', reason: 'מתקדמת יפה בדיבאג ובעבודת צוות', at: at(2) },
      snapshot: { text: `מוצאת באגים לבד יותר ויותר ומובילה בצוות. ${MARK} — כדאי לשאול איך היא מסתדרת.`, at: at(2) },
      skills: {
        'learn.independence': sk([[54, 2], [40, 2], [5, 4]], 3),
        'learn.motivation': sk([[50, 4]], 1),
        'learn.depth': sk([[45, 3], [25, 3], [12, 4]], 4),
        'problem.requirement': sk([[48, 2], [20, 3]], 2),
        'problem.edge-case-identification': sk([[38, 2], [16, 3], [6, 4]], 3),
        'plan.many-ideas': sk([[30, 3], [9, 2]], 2),
        'impl.debugging': sk([[52, 1], [35, 2], [3, 3]], 4),
        'impl.readability': sk([[33, 3], [10, 5, 'commander']], 2),
        'impl.functions': sk([[44, 3], [24, 3]], 2),
        'inter.teamwork': sk([[50, 4], [30, 4], [4, 3]], 3),
        'inter.communication': sk([[41, 3], [14, 4]], 2),
      },
      items: [
        { id: 'i-1', kind: 'improve', text: 'לכתוב תכנון על דף לפני שפותחת IDE', by: 'commander', date: day(20) },
        { id: 'i-2', kind: 'keep', text: 'שואלת שאלות מדויקות', by: 'agent', date: day(14) },
        { id: 'i-3', kind: 'improve', text: MARK, by: 'agent', date: day(9) },
      ],
      followups: [{ id: 'f-1', text: 'סיכמנו שתשב עם דני על הדיבאג', date: day(9) }, { id: 'f-2', text: MARK, date: day(2) }],
      nextTalk: { questions: ['מה עזר לך למצוא את הבאג האחרון לבד?', 'איך הולך לך בצוות של פאדנס?'], at: at(2) },
    }),
    't-2': card('דני', day(12), {
      evalStage: 'רף מקס', status: { value: 'concern', by: 'commander', reason: 'נכנס לרף מקס', at: at(12) },
      snapshot: { text: 'לא מגיש בזמן ונתקע לבד בלי לבקש עזרה.', at: at(12) },
      skills: { 'learn.diligence': { a: [[day(12), 1, 'agent']], n: 2 }, 'inter.communication': { a: [[day(12), 2, 'agent']], n: 1 } },
    }),
    't-3': card('מאיה', null), 't-4': card('אור', day(22), { status: { value: 'watch', by: 'agent', reason: 'ירידה בשקדנות', at: at(22) }, skills: filler(2, 3) }),
    't-5': card('אביגיל', day(6), { status: { value: 'good', by: 'agent', reason: 'יציבה', at: at(6) }, skills: filler(1, 4) }),
    't-6': card('עידו', day(16), { skills: filler(3, 3) }),
    't-7': card('יואב', day(40), { active: false, left: { date: day(10), reason: 'העברה' } }),
  },
  teams: { 'tm-1': { project: 'padens', name: 'בנק א', members: ['t-1', 't-2'] }, 'tm-2': { project: 'interpreter', name: 'זוג 3', members: ['t-1'] } },
  'trainees/t-1/evidence': {
    'e-1': { kind: 'goal', date: day(25), excerpt: 'מעוניינת בפיקוד בהמשך', retracted: false },
    'e-2': { kind: 'background', date: day(29), excerpt: `למדה שנה מדעי המחשב. ${MARK}`, retracted: false },
    'e-3': { kind: 'talk', date: day(2), excerpt: 'דיברנו על הדיבאג', retracted: false },
    'e-4': { kind: 'note', date: day(1), excerpt: 'בוטל', retracted: true },
    'e-5': { kind: 'test', date: day(16), excerpt: 'קיבלה 85 בתרץ גולדסטאר, אמרה שהיה לה קל', test: 'Goldstar', score: 85, self: 'היה קל', retracted: false },
    'e-6': { kind: 'project-observation', date: day(10), excerpt: 'מובילה את הצוות בפאדנס, מחלקת משימות', project: 'padens', retracted: false },
    'e-7': { kind: 'code-review', date: day(12), excerpt: 'הקוד מסודר, פונקציות קצרות', test: 'Goldstar', retracted: false },
    'e-8': { kind: 'improve-keep', date: day(20), excerpt: 'לשפר: לכתוב תכנון על דף לפני שפותחת IDE', retracted: false },
  },
  'trainees/t-1/changes': {
    'c-1': { type: 'added', by: 'commander', name: 'נועה', at: at(62), retracted: false },
    'c-2': { type: 'status', by: 'agent', from: null, to: 'watch', reason: 'מתקשה בדיבאג', evidence: [], at: at(40), retracted: false },
    'c-3': { type: 'status', by: 'agent', from: 'watch', to: 'good', reason: 'מתקדמת יפה בדיבאג ובעבודת צוות', evidence: [], at: at(2), retracted: false },
    'c-4': { type: 'status', by: 'agent', from: 'good', to: 'concern', reason: 'בוטל', evidence: [], at: at(1), retracted: true },
  },
};
const mock = `<script>
const SAMPLE = ${JSON.stringify(sample)};
const snap = (id, data) => ({ id, exists: data !== undefined, data: () => data, metadata: {} });
const docsOf = (p) => Object.entries(SAMPLE[p] ?? Object.fromEntries(Object.entries(SAMPLE).filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v]))).map(([id, d]) => snap(id, d));
const query = (p, keep = () => true) => ({
  where: (field, op, value) => query(p, (d) => keep(d) && op === '==' && d.data()[field] === value),
  onSnapshot: (next) => { const docs = docsOf(p).filter(keep); setTimeout(() => next({ docs, size: docs.length, empty: !docs.length }), 30); return () => {}; },
});
const db = {
  doc: (p) => ({ onSnapshot: (next) => { setTimeout(() => next(snap(p.split('/').pop(), SAMPLE[p])), 30); return () => {}; } }),
  collection: (p) => query(p),
};
window.claude = { use: async (n) => (n === 'db' ? db : null) };
</script>`;
const skeleton = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>${mock}</head><body>${page}</body></html>`;
fs.writeFileSync(process.argv[2], skeleton);
