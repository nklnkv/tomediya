const list = document.querySelector('#events'), status = document.querySelector('#status'), retry = document.querySelector('#retry');
let events = [];
const dateFmt = new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Tomsk',day:'numeric',month:'long'});
const timeFmt = new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Tomsk',hour:'2-digit',minute:'2-digit'});
function el(tag, cls, text){ const node = document.createElement(tag); if(cls) node.className=cls; if(text!==undefined) node.textContent=text; return node; }
function render(){
  const query = document.querySelector('#search').value.toLocaleLowerCase('ru-RU').trim();
  const period = document.querySelector('#period').value;
  const limit = period==='week'?7:period==='month'?30:Infinity;
  const filtered = events.filter(e=>e.title.toLocaleLowerCase('ru-RU').includes(query)&&Date.parse(e.start)>=Date.now()&&Date.parse(e.start)<Date.now()+limit*86400000);
  list.replaceChildren(); document.querySelector('#count').textContent=filtered.length;
  for(const event of filtered){
    const card=el('article','card'), poster=el('div','poster');
    if(event.poster){const img=el('img'); img.src=event.poster;img.alt=`Афиша: ${event.title}`;img.loading='lazy';img.addEventListener('error',()=>poster.replaceChildren(el('span','placeholder','томедия✳')),{once:true});poster.append(img);} else poster.append(el('span','placeholder','томедия✳'));
    const meta=el('div','meta');meta.append(el('span','',dateFmt.format(new Date(event.start))),el('span','',timeFmt.format(new Date(event.start))));
    const bottom=el('div','card-bottom');
    let price='Цена на QTickets';
    if(event.price!==null){try{price='от '+new Intl.NumberFormat('ru-RU',{style:'currency',currency:event.currency,maximumFractionDigits:0}).format(event.price);}catch{price='Цена на QTickets';}}
    bottom.append(el('span','',price));
    const mapButton=el('button','map-button','Схема зала');mapButton.type='button';mapButton.addEventListener('click',()=>openSeatmap(event));bottom.append(mapButton);
    if(event.url){const buy=el('a','buy','Билеты ↗');buy.href=event.url;buy.rel='qtickets';buy.dataset.showId=event.id.split('-')[1];buy.dataset.background='#FFFFFF';buy.dataset.baseColor='#22221E';bottom.append(buy);}else bottom.append(el('span','unavailable','Ссылка уточняется'));
    card.append(poster,meta,el('h3','',event.title),el('p','place',[event.venue,event.address].filter(Boolean).join(' · ')),bottom);list.append(card);
  }
  window.qTickets?.init();
  if(!filtered.length){status.hidden=false;status.textContent=events.length?'По этим условиям мероприятий нет. Попробуй другие даты или название.':'Ближайшие мероприятия пока не опубликованы.';}else if(!status.dataset.stale){status.hidden=true;}
}
async function load(){status.hidden=false;status.textContent='Загружаем ближайшие мероприятия…';retry.hidden=true;delete status.dataset.stale;
  try{const res=await fetch('/api/events');const data=await res.json();if(!res.ok)throw Error(data.error);events=data.events;
    if(data.stale){status.dataset.stale='true';status.textContent='Показана сохранённая афиша. Актуальные цены и наличие билетов проверяй на QTickets.';} render();
  }catch{status.hidden=false;status.textContent='Не удалось загрузить афишу. Попробуй ещё раз чуть позже.';retry.hidden=false;}
}
let searchTimer;document.querySelector('#search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(render,200);});document.querySelector('#period').addEventListener('change',render);retry.addEventListener('click',load);load();

const seatDialog=el('dialog','seat-dialog');document.body.append(seatDialog);
let mapRequest;
async function openSeatmap(event){
  mapRequest?.abort();const controller=new AbortController();mapRequest=controller;
  seatDialog.replaceChildren();
  const close=el('button','seat-close','Закрыть ×');close.type='button';close.onclick=()=>seatDialog.close();
  const title=el('h2','',event.title);title.id='seat-title';seatDialog.setAttribute('aria-labelledby','seat-title');
  const content=el('div','seat-content','Загружаем схему…');
  seatDialog.append(close,title,el('p','',dateFmt.format(new Date(event.start))+' · '+timeFmt.format(new Date(event.start))),content);
  if(!seatDialog.open)seatDialog.showModal();
  try{
    const response=await fetch('/api/seatmap/'+encodeURIComponent(event.id),{signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error);
    content.replaceChildren();const map=data.seatmap;
    if(!map?.zones)throw Error('Для этого сеанса схема недоступна.');
    content.append(el('p','seat-note','Жёлтые — доступны, серые — недоступны. Выбор здесь не бронирует место.'));
    const selected=new Map(),summary=el('p','seat-summary','Выберите место на схеме');
    const scroll=el('div','seat-scroll'),canvas=el('div','seat-canvas');
    const width=Number(map.width)||1060,height=Number(map.height)||550;
    canvas.style.width=width+'px';canvas.style.height=height+'px';scroll.append(canvas);content.append(scroll,summary);
    let count=0;
    for(const zone of Object.values(map.zones))for(const [id,seat] of Object.entries(zone.seats||{})){
      if(!Array.isArray(seat.coords))continue;
      const offers=Object.values(data.offers||{}).map(o=>o.seats?.[id]).filter(o=>o?.available===true&&Number.isFinite(Number(o.price)));
      const price=offers.length?Math.min(...offers.map(o=>Number(o.price))):null;
      const label=zone.name+' · ряд/стол '+seat.row+' · место '+seat.place;
      const button=el('button','seat',String(seat.place));button.type='button';button.disabled=price===null;
      button.style.left=Number(seat.coords[0])+'px';button.style.top=Number(seat.coords[1])+'px';
      button.title=label+(price===null?' · недоступно':' · от '+price+' '+(data.currency||'RUB'));button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed','false');
      button.onclick=()=>{if(selected.has(id))selected.delete(id);else selected.set(id,{label,price});button.setAttribute('aria-pressed',String(selected.has(id)));summary.textContent=selected.size?[...selected.values()].map(s=>s.label).join('; ')+' — от '+[...selected.values()].reduce((sum,s)=>sum+s.price,0)+' '+(data.currency||'RUB'):'Выберите место на схеме';};
      canvas.append(button);count++;
    }
    if(!count){scroll.remove();summary.textContent='Свободная рассадка — выбор конкретного кресла не требуется.';}
    if(event.url){const buy=el('a','seat-buy','Купить через Qtickets ↗');buy.href=event.url;buy.target='_blank';buy.rel='noopener noreferrer';content.append(el('p','seat-note','При переходе в Qtickets места нужно выбрать заново. Доступность может измениться.'),buy);}
    else content.append(el('p','seat-note','Ссылка на покупку уточняется.'));
  }catch(error){if(error.name!=='AbortError')content.textContent=error.message||'Не удалось загрузить схему.';}
}
seatDialog.addEventListener('close',()=>mapRequest?.abort());
