# Weboneh (weboneh.bsmch.net): how to reach it

The code-review site for the Commanders (תרצים, סורסים, הערות). Same network and same Microsoft sign-in as Herzl, so the recipe is the same: no MCP, no public API; run `fetch` **inside a signed-in Weboneh tab** with Claude in Chrome's `javascript_tool`, using the token the app keeps in `localStorage.authToken`. Never print, return, log or store the token, and never put it in a URL.

## Browser

Follow "Browser" in `${CLAUDE_PLUGIN_ROOT}/skills/hertzl-fetch/references/api.md` (one tab, one session, load the Chrome tools in one ToolSearch, batch the work in one `javascript_tool` call, close the tab when done, never the built-in browser), with these differences:

- The site is `https://weboneh.bsmch.net/`.
- Signed-in check: `({host: location.hostname, signedIn: !!localStorage.getItem('authToken') && !!sessionStorage.getItem('selectedCourse')})`. Not signed in → "תתחבר לוובונה בלשונית שנפתחה, ותגיד לי כשסיימת".
- **The header is the bare token: `Authorization: <token>`, with no `Bearer `.** `Bearer <token>` answers 401, as does a call with no header (the body is `/Unauthorized`).
- The API is same-origin, under `/api/`, so requests are relative (`/api/Tars/2296`).

## Helpers (paste once per page load with `javascript_tool`; they live on `window.W`)

```js
window.W = (() => {
  const tok = localStorage.getItem('authToken').replace(/^"|"$/g, '');
  const exp = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp;
  if (exp * 1000 < Date.now() + 60000) throw new Error('token expired: reload the Weboneh tab, then paste again');
  const C = JSON.parse(sessionStorage.getItem('selectedCourse')).id;
  const get = async u => { const r = await fetch(u, { headers: { Authorization: tok } }); if (!r.ok) throw new Error('GET ' + r.status + ' ' + u.split('?')[0]); return r.json(); };
  const norm = s => (s || '').replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const tars = async () => (await get('/api/Tars/Cycles/' + C)).map(x => ({ id: x.id, name: x.tar.name.trim(), deadline: x.deadline.slice(0, 10), done: x.doneSources, total: x.totalSources }));
  // words = the command's arguments split on spaces: the shortest leading run that names exactly one tar is the tar, the rest the student
  const pick = async words => {
    const ts = await tars();
    for (let k = 1; k <= words.length; k++) {
      const q = norm(words.slice(0, k).join(' ')), m = ts.filter(t => norm(t.name).includes(q));
      if (m.length === 1) return { tar: m[0], student: words.slice(k).join(' ') };
      if (!m.length) break;
    }
    return { tar: null, options: ts.map(t => t.name) };
  };
  // a comment as [line, type, severity, text]; the text is the stock text plus the checker's own addition
  const comment = x => [+x.serialize.split(':')[0], x.comment.type.name, x.comment.severity, (x.comment.text + (x.personalAddition || '')).trim()];
  // fills W.res with one record per student's source (all of them, or the one student); page it out with W.page
  const run = async (tarId, student = '') => {
    const t = await get('/api/Tars/' + tarId), words = norm(student).split(' ').filter(Boolean);
    const name = s => s.student.user.first_name + ' ' + s.student.user.last_name;
    const ss = t.sources.filter(s => words.every(w => norm(name(s)).includes(w)));
    if (student && ss.length !== 1) return { matches: ss.map(name) };
    const out = ss.map(s => ({ id: s.id, student: name(s), team: s.student.organizational_unit && s.student.organizational_unit.hebrew_name, checker: s.checker && s.checker.first_name + ' ' + s.checker.last_name, started: s.isStarted, done: s.isDone, published: s.isPublished }));
    for (let i = 0; i < out.length; i += 10) await Promise.all(out.slice(i, i + 10).map(async o => {
      if (!o.started) return;
      const cs = (await get('/api/Source/' + o.id + '/comments')).filter(x => !x.comment.isDeleted).map(comment);
      o.summary = cs.filter(c => c[1] === 'סיכום').map(c => c[3]).join('\n') || null;
      o.comments = cs.filter(c => c[1] !== 'סיכום').sort((a, b) => a[0] - b[0]);
    }));
    out.sort((a, b) => a.student.localeCompare(b.student, 'he'));
    W.res = out;
    return { tar: t.name.trim(), students: out.length, started: out.filter(o => o.started).length };
  };
  const tally = cs => cs.reduce((m, c) => (m[c[1]] = (m[c[1]] || 0) + 1, c[2] === 'Major' && (m.Major = (m.Major || 0) + 1), m), {});
  // brief: comments become a count plus counts by type (and Major)
  const page = (from, n = 10, brief = false) => W.res.slice(from, from + n).map(o => brief && o.comments ? { ...o, comments: o.comments.length, counts: tally(o.comments) } : o);
  return { C, courseName: JSON.parse(sessionStorage.getItem('selectedCourse')).hebrew_name, get, tars, pick, run, page };
})();
({ course: W.courseName });
```

Say which course it is ("הקורס: …") once, so the Commander can catch a wrong selection. `selectedCourse` missing → ask them to open their course in the tab.

## Facts about the data

- Tar list: `GET /api/Tars/Cycles/<course id>` → `[{id, tar: {id, name}, deadline, totalSources, doneSources, …}]`. `id` is the tar's instance in this cycle (the number in `/tar/2296`); `tar.id` is the template. Names are uneven (`תרץ 0 - Goldstar`, `תר"ץ 1 - BaseCalculator `): hence `norm`.
- One tar: `GET /api/Tars/<id>` → `sources[]`, one per student: `{id, student: {user: {first_name, last_name}, organizational_unit (the team), student: {student_number}}, checker, syncer, isStarted, isDone, isPublished, grades, …}`. The source `id` (e.g. 146983) is what the check page opens: `/source/<id>/check`.
- Comments of one source: `GET /api/Source/<source id>/comments` → `[{id, serialize: "line:col,line:col", personalAddition, isSuggestion, comment: {text, severity: None|Minor|Major, type: {name}, isDeleted}}]`. Shown text = `comment.text` + `personalAddition` (the addition often starts with " - "). Types seen: מימוש, קריאות - תכנות, Best Practice, נקודה חיובית, and **סיכום** = the summary comment (anchored at `1:1`, severity None, its words are all in `personalAddition`). A source may have none.
- The code itself: `GET /api/Source/<source id>/Code`. Not fetched by default; `serialize` gives the line.
- `/api/Source/<source id>/specialComments` and `/api/specialComments/<tar id>` exist and were empty on every source checked; look there only if a comment the Commander expects is missing.
- `isStarted` false = nobody has opened it yet (no comments). `isStarted` true and `isDone` false = a check in progress: its comments exist but may be partial. `isPublished` = the Trainee can already see it.
- Everything above is read-only; this recipe never writes to Weboneh.
- A page load of the site also calls `/api/Source/<id>/lint` (415) and others: ignore them.
