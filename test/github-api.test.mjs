import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchActivity } from '../scripts/github-api.mjs';

const respond = (body, ok = true) => ({ ok, status: ok ? 200 : 403, json: async () => body });

test('fetchActivity is skipped without a token', async () => {
  assert.equal(await fetchActivity('o/r', undefined), null);
});

test('fetchActivity maps pulls and filters PRs out of issues', async () => {
  const calls = [];
  const fake = async (url, options) => {
    calls.push({ url, auth: options.headers.Authorization });
    if (url.includes('/pulls?')) {
      return respond([{ number: 2, title: 'PR', state: 'closed', merged_at: '2026-10-03T00:00:00Z', draft: false, user: { login: 'moy' }, created_at: 't', html_url: 'u' }]);
    }
    return respond([
      { number: 2, title: 'PR', pull_request: {}, state: 'closed', user: { login: 'moy' } },
      { number: 1, title: 'Bug', state: 'open', comments: 3, labels: [{ name: 'bug' }], user: { login: 'moy' }, created_at: 't', html_url: 'u' },
    ]);
  };

  const activity = await fetchActivity('o/r', 'tok', fake);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.auth === 'Bearer tok' && call.url.includes('/repos/o/r/')));
  assert.equal(activity.pulls[0].state, 'merged');
  assert.deepEqual(activity.issues.map((i) => [i.number, i.labels]), [[1, ['bug']]]);
});

test('fetchActivity degrades to null on API errors', async (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.equal(await fetchActivity('o/r', 'tok', async () => respond({}, false)), null);
});
