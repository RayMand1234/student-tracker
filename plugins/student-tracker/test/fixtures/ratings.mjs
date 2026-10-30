// The shared Rating fixture table (ticket 16): one Trainee × Skill's Assessments, in the order they
// were written, and the Rating, Trend and stale flag expected on `today` (ticket 05):
//   counting = not retracted, author agent | commander
//   Rating   = latest Commander Assessment if there is one, else latest agent one, else unrated (null)
//   Trend    = sign of Rating now − Rating as of today − 28 days (null when unrated then)
//   stale    = the Rating's Assessment is more than 42 days old
// "Latest" is by the day the Assessment rests on; on the same day, the one written last.
// The page's derivation tests, the store's card tests and the Rating eval all run this table,
// so the rule can't drift between the agent's instructions and the page code.
// Dates are relative to today 2026-10-30: 28 days back is 2026-10-02, 42 days back is 2026-09-18.
export const TODAY = '2026-10-30';

export const RATING_FIXTURES = [
  { name: 'no Assessment: unrated', assessments: [], expect: null },
  { name: 'only the Trainee\'s own: unrated', assessments: [['2026-10-20', 4, 'trainee']], expect: null },
  {
    name: 'a single agent Assessment leaves gray; no Trend without a Rating 4 weeks back',
    assessments: [['2026-10-20', 3, 'agent']],
    expect: { score: 3, author: 'agent', trend: null, stale: false },
  },
  {
    name: 'the latest agent Assessment, rising',
    assessments: [['2026-09-25', 2, 'agent'], ['2026-10-20', 3, 'agent']],
    expect: { score: 3, author: 'agent', trend: 1, stale: false },
  },
  {
    name: 'falling',
    assessments: [['2026-09-01', 4, 'agent'], ['2026-10-25', 2, 'agent']],
    expect: { score: 2, author: 'agent', trend: -1, stale: false },
  },
  {
    name: 'held',
    assessments: [['2026-09-01', 3, 'agent'], ['2026-10-25', 3, 'agent']],
    expect: { score: 3, author: 'agent', trend: 0, stale: false },
  },
  {
    name: 'the Commander\'s Assessment stays the Rating over a later agent one; Trend against the agent\'s earlier value',
    assessments: [['2026-09-20', 2, 'agent'], ['2026-10-10', 4, 'commander'], ['2026-10-25', 2, 'agent']],
    expect: { score: 4, author: 'commander', trend: 1, stale: false },
  },
  {
    name: 'a Commander Rating nobody re-set in 6 weeks is stale, even with a recent agent proposal',
    assessments: [['2026-09-01', 4, 'commander'], ['2026-10-25', 2, 'agent']],
    expect: { score: 4, author: 'commander', trend: 0, stale: true },
  },
  {
    name: 'the latest Commander Assessment wins over an older one',
    assessments: [['2026-10-01', 2, 'commander'], ['2026-10-15', 4, 'commander']],
    expect: { score: 4, author: 'commander', trend: 1, stale: false },
  },
  {
    name: 'exactly 42 days old is not yet stale',
    assessments: [['2026-09-18', 3, 'agent']],
    expect: { score: 3, author: 'agent', trend: 0, stale: false },
  },
  {
    name: '43 days old is stale; it keeps its value',
    assessments: [['2026-09-17', 3, 'agent']],
    expect: { score: 3, author: 'agent', trend: 0, stale: true },
  },
  {
    name: 'an Assessment exactly 28 days back is the Trend baseline',
    assessments: [['2026-10-02', 2, 'agent'], ['2026-10-29', 4, 'agent']],
    expect: { score: 4, author: 'agent', trend: 1, stale: false },
  },
  {
    name: 'one day short of 4 weeks back is no baseline',
    assessments: [['2026-10-03', 2, 'agent'], ['2026-10-29', 4, 'agent']],
    expect: { score: 4, author: 'agent', trend: null, stale: false },
  },
  {
    name: 'two on the same day: the one written last',
    assessments: [['2026-10-20', 2, 'agent'], ['2026-10-20', 4, 'agent']],
    expect: { score: 4, author: 'agent', trend: null, stale: false },
  },
  {
    name: 'an older Assessment logged late does not replace a newer one',
    assessments: [['2026-10-20', 3, 'agent'], ['2026-10-10', 2, 'agent']],
    expect: { score: 3, author: 'agent', trend: null, stale: false },
  },
  {
    name: 'a self-assessment in between changes nothing',
    assessments: [['2026-10-01', 3, 'agent'], ['2026-10-20', 5, 'trainee']],
    expect: { score: 3, author: 'agent', trend: 0, stale: false },
  },
];
