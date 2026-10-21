/* NEIS: 대구사수초등학교. 인증키는 이 브라우저에만 저장합니다. */
(() => {
  'use strict';
  const SCHOOL = { ATPT_OFCDC_SC_CODE: 'D10', SD_SCHUL_CODE: '7261210' };
  const $ = id => document.getElementById(id);
  const make = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const iso = date => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul'}).format(date);
  const compact = date => date.replaceAll('-', '');
  const shift = (date, days) => { const d = new Date(date + 'T12:00:00+09:00'); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
  const read = name => { try { return JSON.parse(localStorage.getItem(name)); } catch { return null; } };
  const write = (name, value) => { try { localStorage.setItem(name, JSON.stringify(value)); } catch {} };
  let key = read('hd-neis-key') || '';
  let selected = iso(new Date()), generation = 0, revision = 0;
  const cache = new Map(), pending = new Map();
  const style = make('style');
  style.textContent = '.school-countdowns{grid-column:2 / -1;display:flex;justify-content:flex-end;gap:8px 18px;flex-wrap:wrap;font-size:13px;line-height:1.5;margin-top:-6px}.school-countdowns span{white-space:nowrap}.school-countdowns b{color:var(--sun);font-size:1.08em;margin-left:5px}.school-body{font-size:clamp(14px,1.1vw,19px);overflow:auto;min-height:0}.school-body p{margin:8px 0}.school-body ul{padding-left:22px;margin:6px 0;columns:2;column-gap:22px}.school-body li{margin:4px 0;break-inside:avoid}.school-body details{margin-top:8px;font-size:12px}.school-body summary{cursor:pointer}.school-error{color:var(--alert)}.school-meal{flex:0 1 auto;max-height:42vh}.school-meal .head{margin-bottom:4px}.school-meal-date{font-size:12px;opacity:.7}@media(max-width:700px){.school-countdowns{grid-column:1;justify-content:center;margin-top:0}.school-meal{max-height:none}}';
  document.head.append(style);
  const countdowns = make('div', undefined, 'school-countdowns');
  countdowns.setAttribute('aria-label','학교 주요 일정 디데이');
  countdowns.setAttribute('aria-live','polite');
  document.querySelector('.top').append(countdowns);
  const card = make('div', undefined, 'card tab c-tang school-meal');
  card.id = 'cMeal';
  const head = make('div', undefined, 'head');
  const title = make('h2');
  title.innerHTML = '<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3.5 12.5h17a8.5 8.5 0 0 1-17 0zM9 21h6"/><path d="M13.5 3.5l-2.5 6M18 3.5l-2.5 6"/></svg></span>';
  title.append('급식표');
  head.append(title);
  const dateLabel = make('span', undefined, 'school-meal-date'); head.append(dateLabel);
  const meals = make('div', undefined, 'school-body');
  meals.setAttribute('aria-live', 'polite');
  card.append(head, meals);
  const right = $('classView').querySelectorAll('.col')[2];
  right.insertBefore(card, right.children[1] || null);

  async function request(service, params, apiKey) {
    const query = new URLSearchParams({Type:'json',pIndex:'1',pSize:'1000',...SCHOOL,...params});
    if (apiKey) query.set('KEY', apiKey);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('https://open.neis.go.kr/hub/' + service + '?' + query, {signal:controller.signal});
      if (!response.ok) throw new Error('나이스 연결 오류 (' + response.status + ')');
      const data = await response.json();
      const parts = data[service];
      const result = data.RESULT || parts?.flatMap(p => p.head || []).find(p => p.RESULT)?.RESULT;
      if (result?.CODE === 'INFO-200') return {rows:[],total:0};
      if (result && result.CODE !== 'INFO-000') throw new Error('나이스: ' + result.MESSAGE);
      if (!Array.isArray(parts)) throw new Error('나이스 응답 형식을 확인할 수 없습니다.');
      const rows = parts.flatMap(p => p.row || []);
      const total = parts.flatMap(p => p.head || []).find(p => p.list_total_count !== undefined)?.list_total_count;
      if (!Number.isFinite(Number(total))) throw new Error('나이스 자료 수를 확인할 수 없습니다.');
      return {rows,total:Number(total)};
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('나이스 응답 시간이 초과되었습니다. 새로고침해 주세요.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  // Sample responses contain at most five rows. Split by date rather than
  // presenting a truncated response as a complete school calendar.
  async function scheduleRange(from, to, apiKey) {
    const result = await request('SchoolSchedule', {AA_FROM_YMD:compact(from),AA_TO_YMD:compact(to)}, apiKey);
    if (result.rows.length >= result.total) return result.rows;
    if (from === to) throw new Error('하루 일정이 조회 한도를 넘었습니다. API 인증키를 확인해 주세요.');
    const days = Math.round((new Date(to+'T12:00:00+09:00') - new Date(from+'T12:00:00+09:00')) / 86400000);
    const middle = shift(from, Math.floor(days/2));
    // Sequential calls keep the unauthenticated API load bounded.
    return (await scheduleRange(from, middle, apiKey)).concat(await scheduleRange(shift(middle,1), to, apiKey));
  }
  async function cached(name, loader) {
    if (cache.has(name)) return cache.get(name);
    const disk = read('hd-neis-'+name);
    if (disk && Date.now()-disk.at < 6*60*60*1000 && Array.isArray(disk.rows)) { cache.set(name,disk.rows); return disk.rows; }
    if (pending.has(name)) return pending.get(name);
    const started = revision;
    const promise = loader().then(rows => { if(started===revision){cache.set(name,rows);write('hd-neis-'+name,{at:Date.now(),rows});} return rows; }).finally(() => {if(pending.get(name)===promise)pending.delete(name);});
    pending.set(name,promise); return promise;
  }
  function lines(value) { return String(value || '').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').split('\n').map(s=>s.trim()).filter(Boolean); }
  function showError(target, error) { target.replaceChildren(make('p', error.message || '연결하지 못했습니다. 새로고침해 주세요.', 'school-error')); }
  async function render() {
    const run = ++generation, date = selected, apiKey = key;
    dateLabel.textContent = date.slice(5).replace('-', '/') + ' 점심';
    meals.replaceChildren(make('p', '급식을 불러오는 중…'));
    countdowns.replaceChildren(make('span', '학교 일정 불러오는 중…'));
    const current = iso(new Date());
    const end = shift(current,365), scope = apiKey ? 'key' : 'sample';
    await Promise.allSettled([
      cached('meal-'+scope+'-'+date, async () => (await request('mealServiceDietInfo',{MLSV_YMD:compact(date),MMEAL_SC_CODE:'2'},apiKey)).rows).then(rows => {
        if (run !== generation) return;
        meals.replaceChildren();
        if (!rows.length) { meals.append(make('p','등록된 급식이 없습니다. (휴일·방학 또는 미등록)')); return; }
        for (const row of rows) {
          const list = make('ul'); lines(row.DDISH_NM).forEach(v=>list.append(make('li',v))); meals.append(list);
          meals.append(make('p', row.CAL_INFO || '', 'note'));
          const detail = make('details'); detail.append(make('summary','원산지 · 영양 정보'));
          detail.append(make('p',lines(row.ORPLC_INFO).join(' / ')),make('p',lines(row.NTR_INFO).join(' / ')));
          meals.append(detail);
        }
        meals.append(make('p','괄호 안 숫자는 나이스에 등록된 알레르기 유발 식품 번호입니다.', 'note'));
      }).catch(error=>{if(run===generation)showError(meals,error);}),
      cached('countdowns-'+scope+'-'+current, () => scheduleRange(current,end,apiKey)).then(rows => {
        if (run !== generation) return;
        // 안내사항 칸이 비어 있을 때 '다가오는 학교 일정'으로 보여 줘요
        window.hdSchedule = rows;
        window.dispatchEvent(new Event('school-schedule'));
        countdowns.replaceChildren();
        const sorted = [...rows].sort((a,b)=>a.AA_YMD.localeCompare(b.AA_YMD));
        for (const [label, match] of [['종업',/종업/],['졸업',/졸업/],['겨울방학',/겨울.*방학/]]) {
          const row = sorted.find(row=>match.test(row.EVENT_NM));
          const item = make('span', label);
          let value = '미정';
          if(row){
            const target = row.AA_YMD.slice(0,4)+'-'+row.AA_YMD.slice(4,6)+'-'+row.AA_YMD.slice(6,8);
            const days = Math.round((new Date(target+'T12:00:00+09:00')-new Date(current+'T12:00:00+09:00'))/86400000);
            value = days===0?'D-Day':'D−'+days;
            item.title = row.EVENT_NM+' · '+target;
          }
          item.append(make('b',value)); countdowns.append(item);
        }
      }).catch(error=>{if(run===generation){countdowns.replaceChildren(make('span','학교 일정 연결을 확인해 주세요'));countdowns.title=error.message;}})

    ]);
  }
  window.addEventListener('school-date',event=>{selected=event.detail;render();});
  // Refresh if the classroom screen stays open overnight.
  let today = iso(new Date());
  setInterval(()=>{const now=iso(new Date());if(now!==today){if(selected===today){selected=now;render();}today=now;}},60000);
  render();
})();