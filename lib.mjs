export function safeUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
// http-ссылку на картинку переводим на https: на HTTPS-сайте http-картинки блокируются.
export function posterUrl(value) {
  const url = safeUrl(value);
  return url && url.startsWith('http:') ? 'https:' + url.slice(5) : url;
}
// Кеш промисов по ключу: одновременные запросы делят один вызов, ошибки живут меньше успехов.
export function createCache(ttl, errorTtl = ttl, now = () => Date.now()) {
  const entries = new Map();
  return (key, load) => {
    const t = now();
    for (const [k, e] of entries) if (e.expires <= t) entries.delete(k);
    let entry = entries.get(key);
    if (!entry) {
      entry = { expires: t + ttl, promise: Promise.resolve().then(load) };
      entry.promise.catch(() => { entry.expires = Math.min(entry.expires, now() + errorTtl); });
      entries.set(key, entry);
    }
    return entry.promise;
  };
}
export function normalize(events, now = Date.now()) {
  const active = value => value === true || value === 1 || value === '1';
  const items = new Map();
  for (const event of events) {
    if (!active(event.is_active) || event.deleted_at) continue;
    for (const show of event.shows || []) {
      const start = Date.parse(show.start_date);
      if (!active(show.is_active) || show.deleted_at || !Number.isFinite(start) || start < now) continue;
      const prices = (show.prices || []).map(p => Number(p.default_price)).filter(p => Number.isFinite(p) && p >= 0);
      const poster = typeof event.poster === 'string' ? event.poster : event.poster?.url || event.poster?.path;
      items.set(`${event.id}-${show.id}`, {
        id: `${event.id}-${show.id}`, title: String(event.name || 'Стендап'),
        start: new Date(start).toISOString(), venue: String(event.place_name || 'Томедия'),
        address: String(event.place_address || ''), poster: posterUrl(poster),
        price: prices.length ? Math.min(...prices) : null,
        currency: event.currency_id || 'RUB', url: safeUrl(event.url) || safeUrl(event.site_url)
      });
    }
  }
  return [...items.values()].sort((a,b) => a.start.localeCompare(b.start));
}
