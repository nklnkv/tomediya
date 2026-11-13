import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCurrentEvents } from './qtickets.mjs';
import { normalize } from './lib.mjs';

test('запрашивает только будущие сеансы и связанные мероприятия, сохраняя фильтры на всех страницах', async () => {
  const now = Date.parse('2026-11-12T00:00:00Z');
  const calls = [];
  const events = await loadCurrentEvents(async path => {
    const url = new URL(path, 'https://example.com/');
    const payload = JSON.parse(url.searchParams.get('payload'));
    calls.push({ resource: url.pathname, ...payload });
    assert.deepEqual(payload.where.slice(0, 2), [{ column: 'is_active', value: 1 }, { column: 'deleted_at', operator: 'null' }]);
    if (url.pathname === '/shows') {
      assert.deepEqual(payload.where[2], { column: 'start_date', operator: '>=', value: new Date(now).toISOString() });
      return { data: [{ id: payload.page, event_id: 42, is_active: 1, start_date: '2026-11-15T16:00:00+03:00' }], paging: { total: 2 } };
    }
    assert.deepEqual(payload.where[2], { column: 'id', operator: 'in', value: [42] });
    return { data: [{ id: 42, is_active: 1, poster: { url: 'https://example.com/poster.jpg' }, url: 'https://example.com/tickets', site_url: 'https://example.com/social' }], paging: { total: 1 } };
  }, now);
  assert.equal(calls.length, 3);
  const cards = normalize(events, now);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].poster, 'https://example.com/poster.jpg');
  assert.equal(cards[0].url, 'https://example.com/tickets');
});

test('не запрашивает мероприятия, когда будущих сеансов нет', async () => {
  let calls = 0;
  assert.deepEqual(await loadCurrentEvents(async path => {
    calls++;
    assert.ok(path.startsWith('shows?'));
    return { data: [], paging: { total: 0 } };
  }), []);
  assert.equal(calls, 1);
});

test('отклоняет повторяющуюся страницу вместо неполной афиши', async () => {
  await assert.rejects(loadCurrentEvents(async () => ({ data: [{ id: 1, event_id: 42 }], paging: { total: 2 } })), /повторяет страницу/);
});
