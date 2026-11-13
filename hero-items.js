/* ---------- 용사 상점: 아이템 목록 · 값 · 사고판 기록 계산 ----------
   그림: Kenney "Roguelike Characters" 2.0 (CC0, www.kenney.nl) → hero-sprites.png
   한 칸은 16×16, 칸 사이 1픽셀 틈. 아이템 id는 "열_행" (1부터).
   코인 = 지금 온도 + 장터에서 판 코인 − 상점·장터에서 쓴 코인. 온도 자체는 줄지 않아요.
   사고판 일은 shop/log에 한 줄씩 쌓고(지우지 않음), 화면은 그 기록을 처음부터 다시 계산해서 보여 줘요.
   index.html이 window.HERO로 쓰고, 테스트(node)는 require로 써요. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HERO = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TILE = 16, STEP = 17;

  /* 그리는 순서대로. optional이 false면 늘 하나는 입고 있어요 */
  const CATS = [
    { id: "body", name: "피부", optional: false },
    { id: "legs", name: "바지", optional: false },
    { id: "feet", name: "신발", optional: false },
    { id: "top", name: "옷", optional: false },
    { id: "beard", name: "수염", optional: true },
    { id: "hair", name: "머리", optional: true },
    { id: "hat", name: "모자", optional: true },
    { id: "shield", name: "방패", optional: true },
    { id: "weapon", name: "무기", optional: true }
  ];
  const RARITY = ["기본", "일반", "고급", "희귀", "영웅", "전설"];
  const PRICES = [3, 6, 10, 15, 25]; /* 일반·고급·희귀·영웅·전설 */

  const ITEMS = [];
  const add = (x, y, cat, tier, name) => ITEMS.push({ id: x + "_" + y, x: x, y: y, cat: cat, tier: tier, name: name });

  /* 피부: 1~2열, 1~4행 */
  const SKIN = ["밝은", "구릿빛", "갈색", "초록 오크"];
  for (let y = 1; y <= 4; y++) for (let x = 1; x <= 2; x++) add(x, y, "body", 0, SKIN[y - 1] + " 피부 " + x);

  /* 머리·수염: 색마다 4열×4행 묶음. 위 3행은 머리, 4행째는 수염 */
  [{ x: 20, y: 1, c: "갈색" }, { x: 24, y: 1, c: "주황" }, { x: 20, y: 5, c: "금발" }, { x: 24, y: 5, c: "검은" }, { x: 20, y: 9, c: "은발" }].forEach(h => {
    let n = 1;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 4; dx++) add(h.x + dx, h.y + dy, "hair", 0, h.c + " 머리 " + (n++));
    for (let dx = 0; dx < 4; dx++) add(h.x + dx, h.y + 3, "beard", 0, h.c + " 수염 " + (dx + 1));
  });

  /* 바지: 4열 (5행·10행은 장화) */
  const PANTS = { 1: "검은", 2: "갈색", 3: "흰", 4: "크림색", 6: "주황", 7: "청록", 8: "보라", 9: "초록" };
  Object.keys(PANTS).forEach(k => { const y = +k; add(4, y, "legs", y <= 2 ? 0 : 1, PANTS[k] + " 바지"); });

  /* 신발: 5열 1~10행, 4열 5·10행은 장화 */
  ["검은", "갈색", "흰", "크림색", "주황", "빨간", "청록", "보라", "초록", "자주"].forEach((c, i) => add(5, i + 1, "feet", i < 2 ? 0 : 1, c + " 신발"));
  add(4, 5, "feet", 2, "청록 장화");
  add(4, 10, "feet", 2, "갈색 장화");

  /* 옷: 7~18열, 1~10행. 4열씩 색 묶음, 5행씩 종류 */
  const TOP_COLOR = [["주황", "청록", "보라"], ["초록", "베이지", "검정"]];
  const TOP_KIND = ["셔츠", "조끼", "튜닉", "모험복"];
  const ARMOR = [["가죽 갑옷", "강철 갑옷", "보라 마법 갑옷"], ["숲의 갑옷", "황금 갑옷", "흑철 갑옷"]];
  for (let y = 1; y <= 10; y++) {
    const half = y <= 5 ? 0 : 1, row = (y - 1) % 5;
    for (let x = 7; x <= 18; x++) {
      const g = Math.floor((x - 7) / 4), col = (x - 7) % 4;
      let tier, name;
      if (row < 4) {
        name = TOP_COLOR[half][g] + " " + TOP_KIND[row] + (col ? " " + (col + 1) : "");
        tier = row === 0 ? (col === 0 ? 0 : 1) : row === 3 ? 3 : 2;
      } else if (col === 1) {
        name = "뿔 장식 갑옷 " + (half * 3 + g + 1); tier = 4;
      } else {
        name = ARMOR[half][g] + (col > 1 ? " " + col : "");
        tier = half === 0 ? (g === 0 ? 3 : 4) : (g === 0 ? 4 : 5);
      }
      add(x, y, "top", tier, name);
    }
  }

  /* 모자: 29~32열, 1~9행 */
  for (let y = 1; y <= 9; y++) for (let x = 29; x <= 32; x++) {
    const gold = x >= 31;
    let tier, name;
    if (y <= 2) { tier = gold ? 4 : 3; name = (gold ? "황금" : "강철") + " 투구"; }
    else if (y <= 6) { tier = gold ? 3 : 2; name = (gold ? "뾰족" : "모험가") + " 두건"; }
    else if (y === 7) { tier = gold ? 4 : 3; name = (gold ? "황금 " : "") + "뿔 투구"; }
    else if (y === 8) { tier = 2; name = "날개 머리띠"; }
    else { tier = 1; name = "챙 모자"; }
    add(x, y, "hat", tier, name + " " + ((y - 1) * 4 + (x - 28)));
  }

  /* 방패: 34~41열, 1~9행. 4열×3행 묶음마다 재질이 달라요 (3행째는 두 칸만 있어요) */
  [
    { x: 34, y: 1, name: "나무 방패", tiers: [1, 1, 1, 2] },
    { x: 38, y: 1, name: "강철 방패", tiers: [3, 3, 3, 3] },
    { x: 34, y: 4, name: "황금 방패", tiers: [4, 4, 4, 4] },
    { x: 38, y: 4, name: "기사단 방패", tiers: [2, 2, 2, 2] },
    { x: 34, y: 7, name: "체크무늬 방패", tiers: [3, 3, 3, 3] },
    { x: 38, y: 7, name: "바다 방패", tiers: [4, 4, 5, 5] }
  ].forEach(s => {
    let n = 1;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 4; dx++) {
      if (dy === 2 && dx >= 2) continue;
      add(s.x + dx, s.y + dy, "shield", s.tiers[dx], s.name + " " + (n++));
    }
  });

  /* 무기 */
  const METAL = ["나무", "구리", "강철", "황금", "다이아"];
  const STAFF = ["불꽃 지팡이", "물결 지팡이", "벚꽃 지팡이", "숲의 지팡이"];
  for (let y = 1; y <= 4; y++) for (let x = 43; x <= 47; x++) add(x, y, "weapon", x <= 44 ? 2 : x <= 46 ? 3 : 4, STAFF[y - 1] + " " + (x - 42));
  const ODD = ["철퇴", "모닝스타", "창", "미늘창", "전투망치"];
  const EVEN = ["양날도끼", "도끼", "손도끼", "큰 낫", "전투도끼"];
  for (let y = 5; y <= 6; y++) for (let x = 43; x <= 47; x++) add(x, y, "weapon", 2, "모험가 " + (y === 5 ? ODD : EVEN)[x - 43]);
  const BLADE = ["장검", "단검", "대검", "곡도"];
  for (let y = 7; y <= 10; y++) for (let x = 43; x <= 47; x++) add(x, y, "weapon", x - 42, METAL[x - 43] + " " + BLADE[y - 7]);
  for (let y = 1; y <= 10; y++) for (let x = 48; x <= 52; x++) {
    const tier = y <= 6 ? 3 : y <= 8 ? 4 : 5;
    add(x, y, "weapon", tier, ["강철", "황금", "다이아"][tier - 3] + " " + (y % 2 ? ODD : EVEN)[x - 48]);
  }
  [["나무 활", 2], ["강철 활", 3], ["황금 활", 4], ["흑철 활", 4], ["다이아 활", 5]].forEach((b, i) => {
    for (let x = 53; x <= 54; x++) add(x, i + 1, "weapon", b[1], b[0] + " " + (x - 52));
  });

  const BY_ID = {};
  ITEMS.forEach(it => { BY_ID[it.id] = it; });
  function byId(id) { return BY_ID[id] || null; }
  function sheetRect(it) { return { sx: (it.x - 1) * STEP, sy: (it.y - 1) * STEP, w: TILE, h: TILE }; }

  /* 값: prices는 [일반, 고급, 희귀, 영웅, 전설] (설정에서 바꿀 수 있어요) */
  function priceOf(it, prices) {
    if (!it || !it.tier) return 0;
    const p = Math.round(+((prices || PRICES)[it.tier - 1]));
    return p >= 1 ? p : PRICES[it.tier - 1];
  }

  /* 처음 모습: 번호마다 다르게 (기본 아이템만) */
  function defaultLook(no) {
    const free = c => ITEMS.filter(it => it.cat === c && it.tier === 0);
    const pick = (arr, k) => arr[((k % arr.length) + arr.length) % arr.length];
    const n = (+no || 1) * 7919;
    return {
      body: pick(free("body"), (+no || 1) - 1).id,
      legs: pick(free("legs"), n >> 1).id,
      feet: pick(free("feet"), n >> 2).id,
      top: pick(free("top"), n >> 3).id,
      hair: pick(free("hair"), n >> 4).id
    };
  }
  /* 가진 것(또는 기본 아이템)만 입히고, 꼭 입어야 하는 칸은 채워요 */
  function sanitizeLook(look, own, no) {
    const out = {}, base = defaultLook(no);
    CATS.forEach(c => {
      const it = look && byId(look[c.id]);
      if (it && it.cat === c.id && (it.tier === 0 || (own && own.has(it.id)))) out[c.id] = it.id;
      else if (!c.optional) out[c.id] = base[c.id];
    });
    return out;
  }

  /* ---------- 사고판 기록 ----------
     {k:"buy",   s:번호, i:아이템, p:값}         상점에서 사기
     {k:"sell",  s:번호, i:아이템, p:값}         장터에 올리기 (이 기록의 key가 장터 번호)
     {k:"cancel",s:번호, l:장터 key}            장터에서 내리기
     {k:"trade", s:사는 번호, l:장터 key}        친구 물건 사기
     {k:"void",  ref:기록 key}                  선생님이 되돌리기
     {k:"reset"}                                새 학기: 코인을 0부터 (가진 아이템은 그대로)
     key는 시각 순서로 정렬되는 글자라서, 같은 물건을 두 명이 동시에 사면 먼저 쓴 쪽만 인정돼요. */
  function newKey(now, rnd) {
    return Math.floor(now == null ? Date.now() : now).toString(36).padStart(9, "0") + (rnd == null ? Math.random().toString(36).slice(2, 7) : rnd);
  }
  function eventsOf(log) {
    const out = [];
    if (log && typeof log === "object") for (const k in log) { const v = log[k]; if (v && typeof v === "object" && v.k) out.push(Object.assign({}, v, { key: k })); }
    return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
  function replay(log) {
    const evs = eventsOf(log);
    const voided = new Set(evs.filter(e => e.k === "void" && e.ref).map(e => e.ref));
    const own = {}, spent = {}, earned = {}, listings = {}, applied = {}, history = {};
    const ownOf = n => own[n] || (own[n] = new Set());
    const plus = (o, n, v) => { o[n] = (o[n] || 0) + v; };
    const note = (n, h) => { (history[n] || (history[n] = [])).push(h); };
    const listed = (s, i) => Object.keys(listings).some(k => listings[k].seller === s && listings[k].item === i);
    for (const e of evs) {
      const s = Math.floor(+e.s) || 0;
      if (e.k === "void") { applied[e.key] = true; continue; }
      if (voided.has(e.key)) {
        if (e.k === "trade" && listings[e.l]) delete listings[e.l]; /* 되돌린 거래의 물건은 장터에 다시 올라가지 않아요 */
        applied[e.key] = false; continue;
      }
      let ok = false;
      if (e.k === "reset") {
        for (const k in spent) delete spent[k];
        for (const k in earned) delete earned[k];
        for (const k in listings) delete listings[k];
        ok = true;
      } else if (e.k === "buy") {
        const it = byId(e.i), p = Math.max(0, Math.floor(+e.p || 0));
        if (it && it.tier && s && !ownOf(s).has(it.id)) {
          ownOf(s).add(it.id); plus(spent, s, p); ok = true;
          note(s, { key: e.key, at: e.at, k: "buy", item: it.id, price: p });
        }
      } else if (e.k === "sell") {
        const it = byId(e.i), p = Math.max(0, Math.floor(+e.p || 0));
        if (it && s && p >= 1 && ownOf(s).has(it.id) && !listed(s, it.id)) {
          listings[e.key] = { key: e.key, seller: s, item: it.id, price: p, at: e.at };
          ok = true;
          note(s, { key: e.key, at: e.at, k: "sell", item: it.id, price: p });
        }
      } else if (e.k === "cancel") {
        const L = listings[e.l];
        if (L && L.seller === s) { delete listings[e.l]; ok = true; note(s, { key: e.key, at: e.at, k: "cancel", item: L.item, price: L.price }); }
      } else if (e.k === "trade") {
        const L = listings[e.l];
        if (L && s && s !== L.seller && ownOf(L.seller).has(L.item) && !ownOf(s).has(L.item)) {
          ownOf(L.seller).delete(L.item); ownOf(s).add(L.item);
          plus(spent, s, L.price); plus(earned, L.seller, L.price);
          delete listings[e.l]; ok = true;
          note(s, { key: e.key, at: e.at, k: "trade", item: L.item, price: L.price, other: L.seller, role: "buyer" });
          note(L.seller, { key: e.key, at: e.at, k: "trade", item: L.item, price: L.price, other: s, role: "seller" });
        }
      }
      applied[e.key] = ok;
    }
    /* 판 사람이 이제 그 물건을 갖고 있지 않으면 장터에서 내려요 */
    for (const k in listings) if (!ownOf(listings[k].seller).has(listings[k].item)) delete listings[k];
    return { own, spent, earned, listings, applied, history };
  }

  function owns(st, no, id) { const it = byId(id); return !!it && (it.tier === 0 || !!(st.own[no] && st.own[no].has(id))); }
  function coins(st, no, temp) { return Math.floor(+temp || 0) + (st.earned[no] || 0) - (st.spent[no] || 0); }
  function listingOf(st, no, id) { for (const k in st.listings) if (st.listings[k].seller === no && st.listings[k].item === id) return st.listings[k]; return null; }

  /* 할 수 있는지 미리 보기: 되면 "", 안 되면 이유 */
  function whyNotBuy(st, no, id, temp, prices) {
    const it = byId(id);
    if (!it || !it.tier) return "살 수 없는 아이템이에요";
    if (owns(st, no, id)) return "이미 갖고 있어요";
    const lack = priceOf(it, prices) - coins(st, no, temp);
    return lack > 0 ? lack + "코인이 모자라요" : "";
  }
  function whyNotSell(st, no, id, price, prices) {
    const it = byId(id);
    if (!it || !it.tier) return "기본 아이템은 팔 수 없어요";
    if (!st.own[no] || !st.own[no].has(id)) return "갖고 있지 않아요";
    if (listingOf(st, no, id)) return "이미 장터에 올렸어요";
    const p = Math.floor(+price || 0), cap = priceOf(it, prices);
    if (p < 1) return "1코인 이상으로 정해 주세요";
    if (p > cap) return "상점 값(" + cap + "코인)보다 비싸게 팔 수 없어요";
    return "";
  }
  function whyNotTrade(st, no, key, temp) {
    const L = st.listings[key];
    if (!L) return "이미 팔렸거나 내려간 물건이에요";
    if (L.seller === no) return "내가 올린 물건이에요";
    if (owns(st, no, L.item)) return "이미 갖고 있어요";
    const lack = L.price - coins(st, no, temp);
    return lack > 0 ? lack + "코인이 모자라요" : "";
  }

  return {
    TILE, STEP, CATS, RARITY, PRICES, ITEMS,
    byId, sheetRect, priceOf, defaultLook, sanitizeLook,
    newKey, eventsOf, replay, owns, coins, listingOf, whyNotBuy, whyNotSell, whyNotTrade
  };
});
