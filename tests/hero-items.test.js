/* 용사 상점 규칙 테스트: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../hero-items.js");

const EMPTY = new Set(("1_5 2_5 24_9 24_10 24_11 24_12 25_9 25_10 25_11 25_12 26_9 26_10 26_11 26_12 27_9 27_10 27_11 27_12 " +
  "29_10 30_10 31_10 32_10 34_10 35_10 36_3 36_6 36_9 36_10 37_3 37_6 37_9 37_10 38_10 39_10 40_3 40_6 40_9 40_10 " +
  "41_3 41_6 41_9 41_10 53_6 53_7 53_8 53_9 53_10 54_6 54_7 54_8 54_9 54_10").split(" "));

const item = (cat, tier) => H.ITEMS.find(i => i.cat === cat && i.tier === tier);
const SWORD = item("weapon", 1), HAT = item("hat", 1), CROWN = item("hat", 4);
let n = 0;
const key = () => H.newKey(1700000000000 + (n++) * 1000, "aaaaa");
function logOf(...evs) { const o = {}; evs.forEach(e => { o[e.key || key()] = e; delete e.key; }); return o; }

test("catalog: every category, no empty sprite tiles, unique ids, free choice for required parts", () => {
  assert.equal(new Set(H.ITEMS.map(i => i.id)).size, H.ITEMS.length);
  H.ITEMS.forEach(i => assert.ok(!EMPTY.has(i.id), "empty tile " + i.id));
  H.CATS.forEach(c => assert.ok(H.ITEMS.some(i => i.cat === c.id), c.id));
  H.CATS.filter(c => !c.optional).forEach(c => assert.ok(H.ITEMS.some(i => i.cat === c.id && i.tier === 0), c.id));
  assert.ok(H.ITEMS.filter(i => i.tier > 0).length > 300);
});

test("prices follow rarity and can be changed", () => {
  assert.equal(H.priceOf(SWORD), 3);
  assert.equal(H.priceOf(CROWN), 15);
  assert.equal(H.priceOf(SWORD, [1, 2, 3, 4, 5]), 1);
  assert.equal(H.priceOf(SWORD, ["", 2, 3, 4, 5]), 3, "empty setting falls back to default");
  assert.equal(H.priceOf(H.byId("1_1")), 0);
});

test("default looks use free items and differ between students", () => {
  const a = H.defaultLook(1), b = H.defaultLook(2);
  assert.notDeepEqual(a, b);
  Object.values(a).forEach(id => assert.equal(H.byId(id).tier, 0));
});

test("sanitizeLook keeps owned items only", () => {
  const look = { body: "1_1", weapon: SWORD.id, hat: "nope" };
  assert.equal(H.sanitizeLook(look, new Set(), 3).weapon, undefined);
  assert.equal(H.sanitizeLook(look, new Set([SWORD.id]), 3).weapon, SWORD.id);
  assert.ok(H.sanitizeLook({}, null, 3).top);
});

test("buying spends coins and gives the item; buying it twice does nothing", () => {
  const st = H.replay(logOf({ k: "buy", s: 3, i: SWORD.id, p: 3 }, { k: "buy", s: 3, i: SWORD.id, p: 3 }));
  assert.ok(H.owns(st, 3, SWORD.id));
  assert.equal(H.coins(st, 3, 10), 7);
  assert.equal(H.whyNotBuy(st, 3, SWORD.id, 10), "이미 갖고 있어요");
  assert.equal(H.whyNotBuy(st, 4, CROWN.id, 10), "5코인이 모자라요");
  assert.equal(H.whyNotBuy(st, 4, CROWN.id, 15), "");
});

test("selling to a friend moves the item and the coins", () => {
  const b = key(), sell = key(), trade = key();
  const log = logOf({ key: b, k: "buy", s: 3, i: HAT.id, p: 3 }, { key: sell, k: "sell", s: 3, i: HAT.id, p: 2 }, { key: trade, k: "trade", s: 5, l: sell });
  const st = H.replay(log);
  assert.ok(!H.owns(st, 3, HAT.id));
  assert.ok(H.owns(st, 5, HAT.id));
  assert.equal(H.coins(st, 3, 10), 10 - 3 + 2);
  assert.equal(H.coins(st, 5, 10), 8);
  assert.deepEqual(Object.keys(st.listings), []);
  assert.equal(st.history[3].at(-1).role, "seller");
  assert.equal(st.history[5].at(-1).other, 3);
});

test("listing rules: must own it, not twice, not above the shop price", () => {
  const st0 = H.replay(logOf({ k: "buy", s: 3, i: HAT.id, p: 3 }));
  assert.equal(H.whyNotSell(st0, 3, HAT.id, 3), "");
  assert.match(H.whyNotSell(st0, 3, HAT.id, 4), /비싸게/);
  assert.equal(H.whyNotSell(st0, 4, HAT.id, 1), "갖고 있지 않아요");
  assert.equal(H.whyNotSell(st0, 3, "1_1", 1), "기본 아이템은 팔 수 없어요");
  const b = key(), s1 = key();
  const st1 = H.replay(logOf({ key: b, k: "buy", s: 3, i: HAT.id, p: 3 }, { key: s1, k: "sell", s: 3, i: HAT.id, p: 2 }, { k: "sell", s: 3, i: HAT.id, p: 1 }));
  assert.equal(Object.keys(st1.listings).length, 1, "second listing of the same item is ignored");
  assert.equal(H.whyNotSell(st1, 3, HAT.id, 1), "이미 장터에 올렸어요");
  assert.equal(H.whyNotTrade(st1, 3, s1, 9), "내가 올린 물건이에요");
});

test("only the seller can take a listing down", () => {
  const b = key(), s1 = key();
  const base = [{ key: b, k: "buy", s: 3, i: HAT.id, p: 3 }, { key: s1, k: "sell", s: 3, i: HAT.id, p: 2 }];
  const other = H.replay(logOf(...base.map(e => Object.assign({}, e)), { k: "cancel", s: 4, l: s1 }));
  assert.equal(Object.keys(other.listings).length, 1);
  const mine = H.replay(logOf(...base.map(e => Object.assign({}, e)), { k: "cancel", s: 3, l: s1 }));
  assert.equal(Object.keys(mine.listings).length, 0);
});

test("two friends buy the same listing at once: the earlier record wins", () => {
  const b = key(), s1 = key(), t1 = key(), t2 = key();
  const st = H.replay(logOf({ key: b, k: "buy", s: 3, i: HAT.id, p: 3 }, { key: s1, k: "sell", s: 3, i: HAT.id, p: 2 }, { key: t2, k: "trade", s: 6, l: s1 }, { key: t1, k: "trade", s: 5, l: s1 }));
  assert.ok(H.owns(st, 5, HAT.id), "t1 has the smaller key, so it came first");
  assert.ok(!H.owns(st, 6, HAT.id));
  assert.equal(H.coins(st, 6, 10), 10, "the late buyer pays nothing");
  assert.equal(st.applied[t2], false);
});

test("the teacher can undo a purchase or a trade", () => {
  const b = key(), s1 = key(), t1 = key();
  const evs = () => [{ key: b, k: "buy", s: 3, i: HAT.id, p: 3 }, { key: s1, k: "sell", s: 3, i: HAT.id, p: 2 }, { key: t1, k: "trade", s: 5, l: s1 }];
  const undoTrade = H.replay(logOf(...evs(), { k: "void", ref: t1 }));
  assert.ok(H.owns(undoTrade, 3, HAT.id));
  assert.ok(!H.owns(undoTrade, 5, HAT.id));
  assert.equal(H.coins(undoTrade, 5, 10), 10);
  assert.equal(Object.keys(undoTrade.listings).length, 0, "an undone trade does not put the item back on the market");
  const undoBuy = H.replay(logOf(...evs(), { k: "void", ref: b }));
  assert.equal(H.coins(undoBuy, 3, 10), 10, "refund");
  assert.ok(!H.owns(undoBuy, 5, HAT.id), "the friend could not buy what the seller no longer had");
});

test("new semester reset zeroes coins but keeps items", () => {
  const st = H.replay(logOf({ k: "buy", s: 3, i: HAT.id, p: 3 }, { k: "reset" }));
  assert.ok(H.owns(st, 3, HAT.id));
  assert.equal(H.coins(st, 3, 0), 0);
});

test("keys sort by time and garbage records are ignored", () => {
  assert.ok(H.newKey(1000, "x") < H.newKey(2000, "x"));
  assert.ok(H.newKey(9e12, "x") > H.newKey(1e12, "x"));
  const st = H.replay({ a: null, b: "x", c: { k: "buy", s: 2, i: "nope", p: 3 }, d: { k: "teleport" } });
  assert.deepEqual(st.spent, {});
});
