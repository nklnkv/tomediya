import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { normalize, createCache } from './lib.mjs';
import { loadCurrentEvents } from './qtickets.mjs';

const token = process.env.QTICKETS_TOKEN;
let cache = null, pending = null, retryAfter = 0;
function api(path) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://qtickets.ru/api/rest/v1/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, timeout: 15000
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', part => { body += part; if (body.length > 20000000) req.destroy(new Error('Ответ слишком большой')); });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`QTickets: HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Некорректный ответ QTickets')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('QTickets не ответил вовремя')));
    req.on('error', reject);
  });
}
async function sync() {
  if (!token) throw new Error('Не настроен токен QTickets');
  const all = await loadCurrentEvents(api);
  cache = { events: normalize(all), updatedAt: new Date().toISOString() };
  return cache;
}
async function getEvents() {
  if (cache && Date.now() - Date.parse(cache.updatedAt) < 300000) return cache;
  if (Date.now() < retryAfter) { if (cache) return { ...cache, stale: true }; throw new Error('Повторная попытка позже'); }
  if (!pending) pending = sync().catch(e => { retryAfter = Date.now() + 30000; throw e; }).finally(() => pending = null);
  try { return await pending; } catch (e) { if (cache) return { ...cache, stale: true }; throw e; }
}
// Схема зала: не чаще 2 запросов к partners API на сеанс за 30 с (после ошибки — повтор через 10 с).
const seatmapCache = createCache(30000, 10000);
function loadSeatmap(eventId, showId) {
  return seatmapCache(`${eventId}-${showId}`, async () => {
    const partnersToken = process.env.QTICKETS_PARTNERS_TOKEN;
    if (!partnersToken) throw new Error('Missing partner token');
    const [map, offers] = await Promise.all(['seatmap','offers'].map(async method => {
      const response = await fetch(`https://qtickets.ru/api/partners/v1/events/${method}/${eventId}/${showId}`, { headers: { Authorization: `Bearer ${partnersToken}` }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Partner API unavailable');
      const data = await response.json();
      if (data.status === 'error') throw new Error('Partner API error');
      return data;
    }));
    return JSON.stringify({ seatmap: map.seatmap, offers: offers.offers, currency: offers.currency_id });
  });
}
const files = { '/': ['index.html','text/html; charset=utf-8'], '/app.js': ['app.js','text/javascript; charset=utf-8'], '/style.css': ['style.css','text/css; charset=utf-8'] };
http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://cdn.qtickets.tech https://qtickets.ru https://qtickets.tech; connect-src 'self' https://qtickets.ru https://*.qtickets.ru https://qtickets.tech https://*.qtickets.tech; frame-src https://qtickets.ru https://*.qtickets.ru https://qtickets.events https://*.qtickets.events https://qtickets.tech https://*.qtickets.tech; base-uri 'none'; frame-ancestors 'none'");
  // HEAD обрабатывается как GET; Node сам не отправляет тело в ответ на HEAD.
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  const path = new URL(req.url,'http://localhost').pathname;
  const mapMatch = path.match(/^\/api\/seatmap\/(\d+)-(\d+)$/);
  if (mapMatch) {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    try {
      const current = await getEvents();
      if (!current.events.some(e => e.id === `${mapMatch[1]}-${mapMatch[2]}`)) { res.writeHead(404); return res.end('{}'); }
      res.end(await loadSeatmap(mapMatch[1], mapMatch[2]));
    } catch { res.writeHead(503); res.end(JSON.stringify({error:'Не удалось загрузить схему. Попробуйте позже.'})); }
    return;
  }
  if (path === '/api/events') {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    try { res.end(JSON.stringify(await getEvents())); }
    catch { res.writeHead(503); res.end(JSON.stringify({error:'Не удалось загрузить афишу. Попробуйте чуть позже.'})); }
    return;
  }
  const file = files[path];
  if (!file) { res.writeHead(404); return res.end('Не найдено'); }
  try { const data = await readFile(new URL(`./public/${file[0]}`,import.meta.url)); res.setHeader('Content-Type',file[1]); res.end(data); }
  catch { res.writeHead(500); res.end('Ошибка сервера'); }
}).listen(Number(process.env.PORT || 3000),process.env.HOST || '127.0.0.1', () => console.log(`Афиша: http://localhost:${process.env.PORT || 3000}`));
