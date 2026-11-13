import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,safeUrl,posterUrl,createCache} from './lib.mjs';
test('показывает все будущие сеансы и скрывает неактивные и прошедшие',()=>{
 const now=Date.parse('2026-11-12T00:00:00Z');
 const event={id:1,is_active:1,name:'Концерт',site_url:'https://qtickets.events/1',shows:[{id:1,is_active:1,start_date:'2026-11-15T20:00:00+07:00',prices:[{default_price:700}]},{id:2,is_active:1,start_date:'2026-11-13T20:00:00+07:00'},{id:3,is_active:'0',start_date:'2026-11-14T20:00:00+07:00'},{id:4,is_active:1,start_date:'2026-11-01T20:00:00+07:00'}]};
 const items=normalize([event,{...event,id:2,is_active:'0'}],now);
 assert.deepEqual(items.map(e=>e.id),['1-2','1-1']);assert.equal(items[1].price,700);assert.equal(items[0].price,null);
});
test('не публикует произвольные схемы URL',()=>{assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('/relative'),null);});
test('переводит http-афиши на https',()=>{assert.equal(posterUrl('http://example.com/a.jpg'),'https://example.com/a.jpg');assert.equal(posterUrl('https://example.com/a.jpg'),'https://example.com/a.jpg');assert.equal(posterUrl('data:x'),null);});
test('кеш объединяет запросы и истекает по времени',async()=>{
 let t=0,calls=0;const cache=createCache(30000,10000,()=>t);const load=async()=>++calls;
 assert.equal(await cache('a',load),1);assert.equal(await cache('a',load),1);assert.equal(calls,1);
 t=30000;assert.equal(await cache('a',load),2);
});
test('кеш хранит ошибку меньше, чем успех',async()=>{
 let t=0,calls=0;const cache=createCache(30000,10000,()=>t);const fail=async()=>{calls++;throw new Error('x');};
 await assert.rejects(cache('a',fail));await assert.rejects(cache('a',fail));assert.equal(calls,1);
 t=10000;await assert.rejects(cache('a',fail));assert.equal(calls,2);
});
