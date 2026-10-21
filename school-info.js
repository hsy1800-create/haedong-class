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
  style.textContent = '.school-body{padding:0 16px 14px;font-size:clamp(14px,1.1vw,19px)}.school-body p{margin:8px 0}.school-body ul{padding-left:22px;margin:8px 0}.school-body li{margin:5px 0}.school-body details{margin-top:10px}.school-body summary{cursor:pointer;font-weight:700}.school-body .note{font-size:13px}.school-body input{max-width:100%;box-sizing:border-box;padding:8px}.school-body .school-list{max-height:210px;overflow:auto}.school-body .school-error{color:var(--alert)}';
  document.head.append(style);
  const card = make('div', undefined, 'card');
  card.style.flex = '0 1 auto';
  card.style.maxHeight = '48vh';
  card.style.overflow = 'auto';
  const head = make('div', undefined, 'head');
  head.append(make('h2', '학교 일정 · 급식'));
  const refresh = make('button', '새로고침', 'btn'); refresh.type = 'button'; head.append(refresh);
  const body = make('div', undefined, 'school-body');
  body.append(make('p', '대구사수초등학교 · 나이스 교육정보', 'note'));
  const dateLabel = make('p');
  const meals = make('div'), events = make('div');
  meals.setAttribute('aria-live', 'polite'); events.setAttribute('aria-live', 'polite');
  body.append(dateLabel, meals, events);
  const settings = make('details', undefined, 'tonly');
  settings.append(make('summary', '학교 API 설정'));
  const label = make('label', '나이스 API 인증키 ');
  const input = make('input'); input.type = 'password'; input.autocomplete = 'off'; input.value = key;
  label.append(input); settings.append(label);
  const save = make('button', '이 기기에 저장', 'btn'); save.type = 'button'; settings.append(save);
  settings.append(make('p', '키는 이 브라우저에만 저장됩니다. 학생 기기에서는 별도로 설정해 주세요. 키 없이도 조회하며, 일정이 많은 기간은 나누어 불러옵니다.', 'note'));
  const link = make('a', '나이스 인증키 발급'); link.href = 'https://open.neis.go.kr/'; link.target = '_blank'; link.rel = 'noopener noreferrer'; settings.append(link);
  body.append(settings, make('p', '학교가 나이스에 등록한 자료입니다. 미등록·변경된 일정은 학교 안내를 확인해 주세요.', 'note'));
  card.append(head, body);
  $('classView').querySelector('.col').append(card);

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
    dateLabel.textContent = date + ' · 시간표에서 날짜를 바꾸면 함께 바뀝니다.';
    meals.replaceChildren(make('p', '급식을 불러오는 중…'));
    events.replaceChildren(make('p', '앞으로 6개월의 학교 일정을 불러오는 중…'));
    const end = shift(date,183), scope = apiKey ? 'key' : 'sample';
    await Promise.allSettled([
      cached('meal-'+scope+'-'+date, async () => (await request('mealServiceDietInfo',{MLSV_YMD:compact(date),MMEAL_SC_CODE:'2'},apiKey)).rows).then(rows => {
        if (run !== generation) return;
        meals.replaceChildren(make('strong', '오늘의 점심'));
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
      cached('events-'+scope+'-'+date, () => scheduleRange(date,end,apiKey)).then(rows => {
        if (run !== generation) return;
        const unique = [...new Map(rows.map(row=>[row.AA_YMD+'|'+row.EVENT_NM+'|'+row.EVENT_CNTNT,row])).values()].sort((a,b)=>a.AA_YMD.localeCompare(b.AA_YMD));
        events.replaceChildren(make('strong', '다가오는 학교 일정'));
        const important = [];
        const groups = new Map();
        for (const row of unique.filter(row=>/졸업|종업|방학|개학|입학|시업/.test(row.EVENT_NM))) {
          const previous = groups.get(row.EVENT_NM);
          const rowDate = row.AA_YMD.slice(0,4)+'-'+row.AA_YMD.slice(4,6)+'-'+row.AA_YMD.slice(6,8);
          if (previous && shift(previous.end,1) === rowDate) previous.end = rowDate;
          else { const group = {...row,end:rowDate}; important.push(group); groups.set(row.EVENT_NM,group); }
        }
        const list = make('ul',undefined,'school-list');
        for (const row of important) {
          const dateText = row.AA_YMD.slice(0,4)+'-'+row.AA_YMD.slice(4,6)+'-'+row.AA_YMD.slice(6,8);
          const days = Math.round((new Date(dateText+'T12:00:00+09:00')-new Date(date+'T12:00:00+09:00'))/86400000);
          list.append(make('li',dateText+(row.end!==dateText?' ~ '+row.end:'')+' · '+row.EVENT_NM+' ('+(days===0?'오늘':'D−'+days)+')'));
        }
        events.append(important.length?list:make('p','조회 기간에 등록된 졸업식·종업식·방학 일정이 없습니다.'));
        const detail = make('details'); detail.append(make('summary','전체 학사일정 ('+unique.length+'건)'));
        const all = make('ul',undefined,'school-list'); unique.forEach(row=>all.append(make('li',row.AA_YMD.slice(4,6)+'/'+row.AA_YMD.slice(6,8)+' · '+row.EVENT_NM+(row.EVENT_CNTNT?' — '+row.EVENT_CNTNT:''))));
        detail.append(all); events.append(detail,make('p',date+' ~ '+end+' · 학교 전체 학년 일정', 'note'));
      }).catch(error=>{if(run===generation)showError(events,error);})
    ]);
  }
  save.addEventListener('click',()=>{key=input.value.trim();write('hd-neis-key',key);invalidate();render();});
  function invalidate() {
    revision++;
    cache.clear(); pending.clear();
    try { Object.keys(localStorage).filter(name=>name.startsWith('hd-neis-')&&name!=='hd-neis-key').forEach(name=>localStorage.removeItem(name)); } catch {}
  }
  refresh.addEventListener('click',()=>{invalidate();render();});
  window.addEventListener('school-date',event=>{selected=event.detail;render();});
  // Refresh if the classroom screen stays open overnight.
  let today = iso(new Date());
  setInterval(()=>{const now=iso(new Date());if(now!==today){if(selected===today){selected=now;render();}today=now;}},60000);
  render();
})();