// Filter on QTickets before pagination: never download the event archive.
export async function loadCurrentEvents(api, now = Date.now()) {
  const active = [
    { column: 'is_active', value: 1 },
    { column: 'deleted_at', operator: 'null' }
  ];
  async function list(resource, select, where) {
    const records = new Map();
    for (let page = 1; page <= 500; page++) {
      const payload = { select, where, orderBy: { id: 'asc' }, perPage: 100, page };
      const result = await api(`${resource}?payload=${encodeURIComponent(JSON.stringify(payload))}`);
      if (!Array.isArray(result.data)) throw new Error('Неизвестный формат ответа QTickets');
      const previousSize = records.size;
      for (const record of result.data) records.set(record.id, record);
      const total = result.paging?.total;
      if (!result.data.length || (total != null && records.size >= Number(total))) return [...records.values()];
      if (records.size === previousSize) throw new Error('QTickets повторяет страницу');
    }
    throw new Error('Не удалось получить все актуальные записи');
  }
  const shows = await list('shows',
    ['id', 'event_id', 'is_active', 'start_date', 'deleted_at', 'prices.default_price'],
    [...active, { column: 'start_date', operator: '>=', value: new Date(now).toISOString() }]);
  const byEvent = new Map();
  for (const show of shows) {
    if (!byEvent.has(show.event_id)) byEvent.set(show.event_id, []);
    byEvent.get(show.event_id).push(show);
  }
  const ids = [...byEvent.keys()];
  const events = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = await list('events',
      ['id', 'is_active', 'deleted_at', 'name', 'currency_id', 'place_name', 'place_address', 'poster.url', 'url', 'site_url'],
      [...active, { column: 'id', operator: 'in', value: ids.slice(offset, offset + 100) }]);
    events.push(...batch.map(event => ({ ...event, shows: byEvent.get(event.id) || [] })));
  }
  return events;
}
