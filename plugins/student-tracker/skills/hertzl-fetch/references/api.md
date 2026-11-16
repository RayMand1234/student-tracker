# Herzl (herzl.bsmch.net): how to reach it

No MCP, no public API. The site is a single-page app signed in with Microsoft (MSAL); its calls go to `interactions.bsmch.net` and `core.bsmch.net` with a bearer token the app keeps in `localStorage.authToken`. So: run `fetch` **inside the Herzl tab** with Claude in Chrome's `javascript_tool`, and read the token there. Never print, return, log or store the token, and never put it in a URL.

## Browser

One tab, one session, few calls: the browser is expensive, so open it once, log in once, do every Herzl request for the whole job from this one tab, and close it. Subagents never open Herzl (give them no browser tools): they only read the tracker and return text; the session that holds the tab does all the Herzl reads and writes.

1. Load the Claude in Chrome tools in one ToolSearch call: `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool`.
2. `tabs_context_mcp` (createIfEmpty), then a Herzl tab: reuse one already on `herzl.bsmch.net`, else `tabs_create_mcp` + `navigate` to `https://herzl.bsmch.net/`.
3. Check the login with `javascript_tool`, not screenshots: `({host: location.hostname, signedIn: !!localStorage.getItem('authToken') && !!sessionStorage.getItem('selectedCourse')})` after a couple of seconds. Not signed in (the host is a Microsoft one, or no token) → tell the Commander "תתחבר להרצל בלשונית שנפתחה, ותגיד לי כשסיימת", and continue only when they say so. Never type their credentials.
4. The token is only ever used inside the page: the tool blocks token-like output, and nothing should copy it out to a file, the shell or a subagent. A token that has expired (the helper throws) → reload the tab (the app renews it itself); if that lands on a sign-in page, ask the Commander to log in again.
5. Batch: loop over all Trainees inside one `javascript_tool` call and return compact JSON, rather than one call per Trainee. Close the tab when the job is done.
6. The built-in browser pane blocks this site's scripts; use Claude in Chrome only.

## Helpers (paste once per page load with `javascript_tool`; they live on `window.H`)

Results returned from `javascript_tool` must be plain JSON of fields: the tool blocks anything that looks like a URL with a query string or a cookie.

```js
window.H = (() => {
  const raw = localStorage.getItem('authToken').replace(/^"|"$/g, '');
  const exp = JSON.parse(atob(raw.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp;
  if (exp * 1000 < Date.now() + 60000) throw new Error('token expired: reload the Herzl tab, then paste again');
  const auth = { Authorization: 'Bearer ' + raw };
  const course = JSON.parse(sessionStorage.getItem('selectedCourse'));
  const C = course.id;
  const strip = h => (h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const get = async u => { const r = await fetch(u, { headers: auth }); if (!r.ok) throw new Error('GET ' + r.status); return r.json(); };
  // params: {startDate, endDate (ISO), interactionTypes: [...], taggedUsersIds: [...]}; pages of 200
  const feed = async (p = {}) => {
    const all = [];
    for (let offset = 0; ; offset += 200) {
      const u = new URL('https://interactions.bsmch.net/interactions/' + C);
      u.searchParams.set('limit', '200'); u.searchParams.set('offset', String(offset));
      for (const [k, v] of Object.entries(p)) [].concat(v).forEach(x => u.searchParams.append(Array.isArray(v) ? k + '[]' : k, x));
      const page = await get(u).catch(e => { if (String(e).includes('404')) return []; throw e; }); // no match = 404
      all.push(...page);
      if (page.length < 200) return all;
    }
  };
  const students = async () => {
    const m = await get('https://core.bsmch.net/users-in-organizational-units/organizational-units/Student?OUsIds[]=' + C);
    return m[C].map(s => ({ id: s.id, name: s.user.first_name + ' ' + s.user.last_name }));
  };
  const slim = x => ({
    id: x.id, type: x.interaction_type, day: x.occurred_at, posted: x.posted_at, updated: x.updated_at,
    discipline: x.disciplinary_interaction && { type: x.disciplinary_interaction.discipline_violation_type, severity: x.disciplinary_interaction.discipline_violation_severity, treatment: x.disciplinary_interaction.treatment },
    by: x.posted_by && x.posted_by.first_name + ' ' + x.posted_by.last_name,
    to: x.interaction_tagged_users.map(g => g.user.user.first_name + ' ' + g.user.user.last_name),
    visibleToStudent: x.is_visible_to_students, staff: strip(x.staff_content), pub: strip(x.public_content),
  });
  // one personal Talk; html = the summary as <p>…</p> (use esc() on the text); day = 'YYYY-MM-DD' (Israel midnight)
  const post = async ({ studentId, day, html }) => {
    const body = { isEncoded: true, interactions: [{
      interaction_type: 'שיחה אישית', course_id: C, is_entire_course: false, is_visible_to_students: false,
      occurred_at: new Date(day + 'T00:00:00').toISOString(), staff_content: b64(html), public_content: '', tagged_users_ids: [studentId],
    }] };
    const r = await fetch('https://interactions.bsmch.net/interactions/staff', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: (await r.text()).slice(0, 300) };
  };
  return { C, courseName: course.hebrew_name, strip, esc, feed, students, slim, post };
})();
({ course: H.courseName });
```

Say which course it is ("הקורס: …") once, so the Commander can catch a wrong selection. Tab not on Herzl's course page / `selectedCourse` missing → ask them to open their course in the tab.

## Facts about the data

- A post ("interaction") has `interaction_type`: `שיחה אישית`, `נקודת מגע`, `בקשת יציאה`, `משמעת` (and others). `staff_content` is HTML only staff see; `public_content` is what the Trainee sees. A personal Talk uses `staff_content` only, `is_visible_to_students: false`, `public_content: ""`.
- The feed is the whole course, every staff member's posts, newest first. Filter a Trainee with `taggedUsersIds: [<id from students()>]`. That `id` is the Trainee's row in the course (not their user id) and is the same id the POST wants in `tagged_users_ids`.
- `occurred_at` of a Talk is that day's Israel midnight (`2026-11-15T22:00:00+00:00` = 16/11). Content comes back decoded; it goes up base64(UTF-8) with `isEncoded: true`.
- Reads and `H.post` were both verified live (a post returns 201 with the created record; it shows `is_visible_to_students: false`, empty `public_content`, tagged to the Trainee). Still read it back (`feed` with the Trainee and `startDate`) before saying it worked, and on any non-2xx report `status` and `body` and stop; never retry blindly.
- A filter that matches nothing answers 404, not `[]` (`feed` handles it).
- A disciplinary post (`interaction_type: משמעת`) carries `disciplinary_interaction: {discipline_violation_type, discipline_violation_severity, treatment}`, null on every other post. Types: אמינות, הפרת נוהל סגור, איחור, התחצפות, דיגום, טלפון, התנהגות בלתי הולמת, שילוב ראוי, הפרעה בשיעור, אי הבאת ציוד, בם, דוח 1, סולו, הקשב, אחר. Severities: קל, חמור, חמור מאוד. Read from the app's own code; no real one existed to test against yet, so check the first one you meet.
- A post's Israel date: `new Date(day).toLocaleDateString('sv-SE', {timeZone: 'Asia/Jerusalem'})` (`YYYY-MM-DD`).
- The shell cannot reach these services (the machine's TLS inspection fails certificate verification), and the bypass flags are not to be used: only the signed-in tab works.
- To remove a post made by mistake: `DELETE /interactions?interactionsIds[]=<id>` on `interactions.bsmch.net` (verified: 200 with the deleted ids). Only when the Commander asks.
- `startDate` / `endDate` filter on `occurred_at` (the Talk's day, Israel midnight = the previous day 22:00Z), not on when it was posted: to find recent posts, start a day or two earlier and filter `posted` yourself.
- Herzl's spelling of a Trainee's name can differ from the tracker's (first names were even swapped once). Match by full name; when the tracker has only a first name and several or no Herzl students fit, stop and ask. Never post on a "close" name.
