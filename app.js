"use strict";
// 어반사이드 팝업 POS — 판매·재고 기록과 본사 공유용. 실결제는 매장(백화점) 단말기에서 한다.
// 데이터: Google Sheets 기반 (어반사이드_초기재고_225 Sheet)
// 초기재고는 Google Sheets에서 CSV로 읽고, 판매/재고 기록도 Google Sheets에 저장

// Google Sheet ID
const GS_SHEET_ID = "1mMSqaT1S-wt9HH1t6vXYScCBud4K5l3q9Kg06d69f4A";
const GS_INIT_STOCK_CSV = `https://docs.google.com/spreadsheets/d/${GS_SHEET_ID}/export?format=csv&gid=0`;

// (레거시 Supabase 설정 - 필요 시 사용)
const SB_URL = "https://owykoqnhwmdhpadxipes.supabase.co";
const SB_KEY = "sb_publishable_Pgf79543Sk1FvB_PtWK5PA_2U9jlGbD";
const POLL_MS = 6000;
const TYPES = { pickup: "현장수령", ship: "택배배송", pre: "사전구매" };
const DISP = { restock: "정상 재고 복구", defect: "불량 분리", return: "본사 반송", adjust: "실사 보정", lost: "분실 처리" };
const REASONS = ["단순 변심", "사이즈·컬러 교환", "불량", "오발송·오등록", "기타"];
const REFUND_DAYS = 7;
const EXC_WARN_RATE = 0.10, EXC_WARN_AMT = 50000;
const DEFAULT_NOTICE = [
  "교환·반품은 구매일로부터 7일 이내, 택을 떼지 않은 미착용 상품만 가능해요. 이 영수증(주문번호)을 함께 보여 주세요.",
  "교환·환불은 구매하신 매장에서 백화점 결제 취소와 함께 진행돼요.",
  "택배·사전구매 상품은 안내된 시점에 순차 발송돼요.",
  "적립금과 회원 쿠폰은 오프라인 매장에서 사용할 수 없어요.",
].join("\n");

// ---------- 유틸 ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const won = n => (Math.round(n) || 0).toLocaleString("ko-KR");
const pad = n => String(n).padStart(2, "0");
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hm = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mdhm = t => { const d = new Date(t); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${hm(t)}`; };
const full = t => `${dayKey(t)} ${hm(t)}`;
const stamp = () => { const d = new Date(); return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`; };
const rid = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const token = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => "abcdefghijkmnpqrstuvwxyz23456789"[x % 32]).join(""); };
const pin8 = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(10000000 + (a[0] % 90000000)); };
const unitOf = (price, disc) => Math.floor(price * (1 - disc) / 1000) * 1000;
const optLabel = p => `${p.color} / ${p.size}`;
const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
const digits = s => String(s || "").replace(/\D/g, "");
const fmtPhone = v => { const d = digits(v).slice(0, 11); if (d.length < 9) return d; if (d.startsWith("02")) return d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` : `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`; return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`; };
const fmtReceiptNo = v => { const d = digits(v).slice(0, 8); if (d.length <= 4) return d; return `${d.slice(0, 4)}-${d.slice(4)}`; };
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch (e) { return null; } };
const ld = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
const isHQ = () => S.me && S.me.role === "hq";

function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind; el.textContent = msg;
  $("#toast").appendChild(el);
  setTimeout(() => el.remove(), kind === "bad" ? 4500 : 2800);
}
let audio = null;
function beep(ok) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = ok ? 1320 : 220; o.type = ok ? "sine" : "square";
    g.gain.value = 0.06; o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + (ok ? 0.08 : 0.35));
  } catch (e) {}
}
function setConn(ok, text) { $("#conn").innerHTML = `<span class="dot ${ok === true ? "ok" : ok === false ? "bad" : ""}"></span>${esc(text)}`; }

// ---------- 가격표 로드 (캐싱) ----------
let cachedPriceMap = null;
async function loadPriceMapFromGoogleSheets() {
  try {
    // prices_full.json 로드 (정가와 할인가 모두)
    const response = await fetch('data/prices_full.json?' + Math.random());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const pricesFull = await response.json();
    // prices_full.json에서 "discount" 값을 사용해서 프라이스맵 생성
    const priceMap = {};
    for (const [name, prices] of Object.entries(pricesFull)) {
      priceMap[name] = prices.discount || prices.normal || 0;
    }
    cachedPriceMap = priceMap;
    // 정가 맵도 저장 (renderFinder에서 사용)
    window.cachedNormalPriceMap = {};
    for (const [name, prices] of Object.entries(pricesFull)) {
      window.cachedNormalPriceMap[name] = prices.normal || 0;
    }

    return priceMap;
  } catch (e) {
    console.error("가격표 로드 실패:", e.message);
    return {};
  }
}

// ---------- 초기재고 로드 (CSV + 가격표 JSON) ----------
async function loadInitStockFromGoogleSheets() {
  try {
    // 로컬 파일 시도
    try {
      const csv = await fetch('data/stock.csv').then(r => r.text());
      if (csv) {

        const lines = csv.trim().split('\n').slice(1);
        const priceMap = await loadPriceMapFromGoogleSheets();

        // prices_full.json 로드
        let pricesFull = {};
        try {
          const pf = await fetch('data/prices_full.json?' + Math.random());
          if (pf.ok) pricesFull = await pf.json();
        } catch (e) {
        }

        const receipts = [];
        let debugCount = 0;
        for (const line of lines) {
          if (!line.trim()) continue;
          const cols = line.split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1'));
          const name = cols[0];
          const bc = cols[1];
          const size = cols[2] || "F";
          const color = cols[3] || "Free";
          const qty = parseInt(cols[4]) || 0;
          if (!name || !bc || qty === 0) continue;

          // [26FW] 등의 프리픽스 제거
          let cleanName = name.replace(/^\[26FW\]\s*/, '').trim();

          // 가격 찾기 (정상가와 할인가)
          let price = 0;
          let normalPrice = 0;
          let discountPrice = 0;
          let pricesObj = null;

          // 1. prices_full.json에서 정상가와 할인가 정보를 직접 가져오기
          if (pricesFull && typeof pricesFull === 'object') {
            if (pricesFull[name]) {
              pricesObj = pricesFull[name];
            } else if (pricesFull[cleanName]) {
              pricesObj = pricesFull[cleanName];
            } else if (color && color !== 'Free') {
              const colorlessName = cleanName.replace(new RegExp(`\\s*${color}\\s*$`), '').trim();
              if (pricesFull[colorlessName]) {
                pricesObj = pricesFull[colorlessName];
              }
            }
          }

          if (pricesObj) {
            normalPrice = pricesObj.normal || 0;
            discountPrice = pricesObj.discount || normalPrice;
            price = discountPrice;
          } else {
            // 폴백: 기존 priceMap 사용
            if (color && color !== 'Free') {
              const colorlessName = cleanName.replace(new RegExp(`\\s*${color}\\s*$`), '').trim();
              price = priceMap[colorlessName];
            }
            if (!price) {
              price = priceMap[cleanName];
            }
            if (!price) {
              price = priceMap[name];
            }
            normalPrice = price;
            discountPrice = price;
          }

          price = price || 0;
          receipts.push({
            kind: "init",
            label: "26FW_초기재고",
            ts: new Date().toISOString(),
            by: "system",
            items: [{ bc: bc, name: name, size: size, color: color, qty: qty, unit: price, normal: normalPrice, discount: discountPrice }]
          });
        }

        if (receipts.length > 0) {
          const item = receipts[0].items[0];
        }
        return receipts;
      }
    } catch (localErr) {
    }

    // Google Sheets 로드 비활성화 - 로컬 파일만 사용
    return [];
  } catch (e) {
    console.error("초기재고 로드 실패:", e);
    return [];
  }
}

// ---------- LocalStorage 데이터 저장/로드 ----------
function saveSalesDataToLocalStorage() {
  const data = {
    sales: S.sales,
    receipts: S.receipts,
    requests: S.requests,
    timestamp: new Date().toISOString()
  };
  ls("pos.salesData", JSON.stringify(data));
}

function loadSalesDataFromLocalStorage() {
  try {
    const data = ls("pos.salesData");
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed.sales && Array.isArray(parsed.sales)) S.sales.push(...parsed.sales);
      if (parsed.receipts && Array.isArray(parsed.receipts)) {
        // 초기재고는 이미 로드되었으므로, 그 이후의 입고만 로드
        const nonInitReceipts = parsed.receipts.filter(r => r.kind !== "init");
        S.receipts.push(...nonInitReceipts);
      }
      if (parsed.requests && Array.isArray(parsed.requests)) S.requests.push(...parsed.requests);
    }
  } catch (e) {
    console.error("판매 데이터 로드 실패:", e);
  }
}

// Google Sheets 동기화용 판매 데이터 export
window.exportSalesForSync = function() {
  const data = JSON.parse(ls("pos.salesData") || "{}");
  const output = JSON.stringify(data, null, 2);
  return data;
};

// ---------- 서버 연결 (6초마다 바뀐 게 있는지 확인) ----------
const Net = (() => {
  let pin = ls("pos.pin"), docs = {}, ver = 0, busy = false, timer = null, onChange = () => {}, onAuth = () => {};
  async function rpc(fn, body) {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
    if (!r.ok) throw new Error((j && j.message) || `HTTP ${r.status}`);
    return j;
  }
  async function call(fn, body = {}) {
    try { return await rpc(fn, { p_pin: pin, ...body }); }
    catch (e) { if (/\bPIN\b/.test(e.message)) { pin = null; ls("pos.pin", null); onAuth(); } throw e; }
  }
  async function pull(force) {
    if (busy || !pin) return; busy = true;
    try {
      const r = await call("pos_load", { p_ver: force ? 0 : ver });
      setConn(true, "연결됨 · 6초마다 자동 갱신");
      if (r) { ver = r.ver; docs = {}; for (const [p, d] of r.docs) docs[p] = d; if (r.me) S.me = r.me; onChange(); }
    } catch (e) { if (!/\bPIN\b/.test(e.message)) setConn(false, "연결 끊김 · 자동으로 다시 시도해요"); }
    finally { busy = false; }
  }
  return {
    hasPin: () => !!pin,
    async login(p) {
      // 로컬 직원 데이터에서 PIN 검증
      if (!S.config || !S.config.staff) throw new Error("Staff data not loaded");
      const staff = S.config.staff.find(s => s.pin === p);
      if (!staff) throw new Error("PIN error");
      pin = p; ls("pos.pin", p);
      return { name: staff.name, role: staff.role, store: staff.store };
    },
    logout() { pin = null; ls("pos.pin", null); docs = {}; ver = 0; },
    docs: () => docs,
    call, rpc, pull,
    async put(path, data, merge) {
      await call("pos_put", { p_path: path, p_data: data, p_merge: !!merge });
      docs[path] = merge ? { ...(docs[path] || {}), ...data } : data;
      onChange(); busy = false; pull(true);
    },
    start(cb, authCb) {
      onChange = cb; onAuth = authCb; pull(true);
      if (!timer) { timer = setInterval(() => { if (!document.hidden) pull(false); }, POLL_MS); document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(false); }); }
    },
  };
})();

// ---------- 상태 ----------
const S = {
  me: null, store: ls("pos.store") || "",
  products: [], byBc: {}, byEz: {}, byCode: {}, config: null,
  sales: [], receipts: [], requests: [], loaded: false,
  cart: [], orderExc: null, orderEmpDisc: null, empVerified: false, exchange: null, tab: "sell",
  stockFilter: { q: "", mode: "all" }, reqDraft: {}, reqFilter: { q: "", mode: "sold" }, reqMemo: "", upload: null,
  reportDay: "", closeDay: dayKey(Date.now()), lookupQ: "", shipMode: "todo", lowLine: 0, staff: null,
  closingDay: null, closingNotes: JSON.parse(ls("pos.closingNotes") || "{}"),
};
let composing = false, renderPending = false;
const P = (col, id) => `s/${S.store}/${col}/${id}`;
const storeCfg = (id = S.store) => (S.config.stores || []).find(s => s.id === id) || { id, name: id, code: "X" };

async function derive() {
  // ⚠️ Supabase 연동 비활성화 - 로컬 파일 + LocalStorage 사용
  const saved = ld("pos.config");
  S.config = saved || {
    stores: [{ id: "chungcheong", name: "더현대 충청", code: "HD_CC", promo: { on: true, threshold: 500000, rate: 0.05, basis: "list", mode: "seq" } }],
    notes: {},
    notice: "",
    staff: [
      { name: "본사", pin: "12345678", role: "hq", store: "hq" },
      { name: "노금정", pin: "87654321", role: "hq", store: "hq" }
    ]
  };
  S.store = "chungcheong";
  ls("pos.store", S.store);
  if (!saved) ls("pos.config", S.config);
  S.sales = []; S.receipts = []; S.requests = [];

  // 로컬 파일에서 초기재고 로드
  const initStock = await loadInitStockFromGoogleSheets();
  S.receipts.push(...initStock);

  // LocalStorage에서 판매/입고 데이터 복구
  loadSalesDataFromLocalStorage();

  // 초기재고로부터 products 배열 생성 (각 항목을 product처럼 취급)
  S.products = [];
  const productSet = new Set();

  let productCount = 0;
  for (const r of initStock) {
    if (r.kind === "init" && r.items) {
      for (const it of r.items) {
        // 고유키: 바코드 + 사이즈 + 색상 조합
        const uniqueKey = `${it.bc}|${it.size}|${it.color}`;
        if (!productSet.has(uniqueKey)) {
          productSet.add(uniqueKey);

          // initStock의 items에서 할인율 계산
          let disc = 0;

          // items에 normal과 discount 정보가 있으면 사용
          if (it.normal && it.normal > 0) {
            const normalPrice = it.normal;
            const discountPrice = it.discount || it.normal;
            disc = Math.max(0, Math.min(1, 1 - discountPrice / normalPrice));
          }

          S.products.push({
            bc: it.bc,
            name: it.name,
            ez: it.bc,
            code: it.bc,
            color: it.color || "Free",
            size: it.size || "F",
            price: it.unit || 0,
            normal: it.normal || 0,
            discount: it.discount || 0,
            disc: disc
          });
          productCount++;
        }
      }
    }
  }

  S.byBc = {}; S.byEz = {}; S.byCode = {};
  for (const p of S.products) {
    S.byBc[p.bc] = p;
    S.byEz[normEz(p.ez)] = p;
    S.byCode[String(p.code).toUpperCase()] = p;
  }

  // Supabase 데이터는 로드하지 않음 (로컬 초기재고만 사용)
  S.loaded = true;
}
// 이전 버전(아난티 초기) 판매 기록도 같은 모양으로 맞춘다
function normSale(s) {
  s.items = (s.items || []).map(it => {
    const p = S.byBc[it.bc] || {};
    return { type: "pickup", cq: 0, rs: 0, df: 0, rt: 0, promo: 0, exc: 0, name: p.name, color: p.color, size: p.size, ...it, net: it.net ?? it.unit * it.qty };
  });
  if (s.status === "canceled" && !s.cancels) {
    s.items.forEach(it => { it.cq = it.qty; it.rs = it.qty; });
    s.cancels = [{ id: "legacy", ts: s.canceledTs || s.ts, by: s.canceledBy, kind: "cancel", lines: s.items.map((it, i) => ({ i, qty: it.qty, disp: "restock" })), refund: s.total, reason: "전체 취소" }];
  }
  s.cancels = s.cancels || [];
  s.baseDisc = s.baseDisc ?? s.disc ?? 0;
  s.promoDisc = s.promoDisc || 0; s.excDisc = s.excDisc || 0;
  s.refunded = sum(s.cancels, c => c.refund || 0);
  const left = sum(s.items, it => it.qty - it.cq);
  s.state = left === 0 ? "canceled" : s.items.some(it => it.cq > 0) ? "partial" : "done";
  s.paid = s.paid ?? s.total;
  return s;
}
const saleDoc = s => { const o = { ...s }; for (const k of ["id", "state", "refunded"]) delete o[k]; return o; };

// ---------- 코드 매칭 (바코드 · 이지어드민 상품코드 · 품목코드) ----------
function normEz(v) {
  let s = String(v ?? "").trim().toUpperCase();
  if (/^\d+(\.0+)?$/.test(s)) s = String(parseInt(s, 10));
  if (/^\d{1,5}$/.test(s)) s = s.padStart(5, "0");
  return s;
}
function findProduct(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (S.byBc[s]) return S.byBc[s];
  const ez = normEz(s);
  if (S.byEz[ez]) return S.byEz[ez];
  if (/^\d{5}$/.test(ez) && S.byEz["S" + ez]) return S.byEz["S" + ez];
  return S.byCode[s.toUpperCase()] || null;
}

// ---------- 재고: 입고 합계 − 현장수령 판매 + 정상 복구된 반품 + 조정 항목 ----------
function ledger() {
  const init = {}, inQ = {}, sold = {}, back = {}, hold = {}, adj = {};
  for (const r of S.receipts) { const t = r.kind === "init" ? init : inQ; for (const it of r.items || []) t[it.bc] = (t[it.bc] || 0) + it.qty; }
  for (const s of S.sales) for (const it of s.items) {
    if (it.type !== "pickup") continue;
    sold[it.bc] = (sold[it.bc] || 0) + it.qty;
    back[it.bc] = (back[it.bc] || 0) + (it.rs || 0);
    hold[it.bc] = (hold[it.bc] || 0) + (it.df || 0);
  }
  for (const m of S.movements || []) {
    adj[m.bc] = (adj[m.bc] || 0) + (m.sign * m.qty);
  }
  return { init, inQ, sold, back, hold, adj, net: bc => (sold[bc] || 0) - (back[bc] || 0), stock: bc => (init[bc] || 0) + (inQ[bc] || 0) - (sold[bc] || 0) + (back[bc] || 0) + (adj[bc] || 0) };
}
const cartPickup = bc => sum(S.cart.filter(c => c.bc === bc && c.type === "pickup"), c => c.qty);

// ---------- 금액 계산: 기본할인(개당 1,000원 내림) → 프로모션 추가할인(주문에서 1회 내림) → 예외할인 ----------
function allocate(lines, weights, amount, key) {
  const W = sum(weights); if (!W || !amount) return;
  let used = 0, big = 0;
  lines.forEach((l, i) => { const v = Math.floor(amount * weights[i] / W); l[key] += v; used += v; if (weights[i] > weights[big]) big = i; });
  lines[big][key] += amount - used;
}
function priceCart(cart, orderExc) {
  const promo = storeCfg().promo || {};
  const lines = cart.map(c => { const p = S.byBc[c.bc], unit = unitOf(p.normal, p.disc); return { c, p, unit, base: unit * c.qty, list: p.normal * c.qty, promo: 0, exc: 0, emp: 0 }; });
  const gross = sum(lines, l => l.list), sale = sum(lines, l => l.base);
  const inBasis = lines.filter(l => promo.includeExcluded !== false || l.p.disc > 0);
  const basisAmt = sum(inBasis, l => promo.basis === "list" ? l.list : l.base);
  const hit = !!promo.on && promo.threshold > 0 && basisAmt >= promo.threshold;
  let promoTotal = 0;
  if (hit) {
    const elig = lines.filter(l => l.p.disc > 0);
    const raw = elig.map(l => (promo.mode === "seq" ? l.base : l.list) * promo.rate);
    promoTotal = Math.floor(sum(raw) / 1000) * 1000;
    allocate(elig, raw, promoTotal, "promo");
  }
  for (const l of lines) { const e = l.c.exc; if (!e) continue; const room = l.base - l.promo; l.exc = Math.max(0, Math.min(room, Math.floor(e.kind === "pct" ? room * e.v / 100 : e.v))); }
  let orderExcAmt = 0;
  if (orderExc) {
    const room = sum(lines, l => l.base - l.promo - l.exc);
    orderExcAmt = Math.max(0, Math.min(room, Math.floor(orderExc.kind === "pct" ? room * orderExc.v / 100 : orderExc.v)));
    allocate(lines, lines.map(l => l.base - l.promo - l.exc), orderExcAmt, "exc");
  }
  let empDiscAmt = 0;
  if (S.orderEmpDisc) {
    const room = sum(lines, l => l.base - l.promo - l.exc);
    empDiscAmt = Math.max(0, Math.min(room, Math.floor(room * 0.05)));
    allocate(lines, lines.map(l => l.base - l.promo - l.exc), empDiscAmt, "emp");
  }
  for (const l of lines) l.net = l.base - l.promo - l.exc - (l.emp || 0);
  const excTotal = sum(lines, l => l.exc);
  const empTotal = sum(lines, l => l.emp || 0);
  return {
    lines, gross, sale, baseDisc: gross - sale, promoTotal, excTotal, orderExcAmt, empTotal, empDiscAmt, total: sum(lines, l => l.net), qty: sum(lines, l => l.c.qty),
    basisAmt, hit, promo, gap: promo.on ? Math.max(0, (promo.threshold || 0) - basisAmt) : 0,
    warn: excTotal > 0 && (excTotal > gross * EXC_WARN_RATE || excTotal > EXC_WARN_AMT),
  };
}
const promoLabel = pr => { const p = pr || {}; return p.on ? `${won(p.threshold)}원 이상(${p.basis === "list" ? "정상가" : "할인가"} 기준) ${Math.round(p.rate * 1000) / 10}% 추가${p.mode === "seq" ? "(할인가에서)" : "(정상가 기준 합산)"}` : "프로모션 없음"; };

// ---------- 판매 ----------
function addToCart(p, via = "scan") {
  const L = ledger();
  let type = "pickup"; beep(true);
  const stock = L.stock(p.bc) - cartPickup(p.bc);
  if (stock < 1) {
    toast(`⚠️ 현장 재고 부족: ${p.name} (현재 ${L.stock(p.bc)}개). 음수 주문이 가능합니다 (판매 확정 시 사유 입력 필수).`, "warn");
  }
  const row = S.cart.find(c => c.bc === p.bc && c.type === type && !c.exc);
  if (row) {
    row.qty++; if (via === "search") row.via = "search";
  }
  else S.cart.unshift({ bc: p.bc, qty: 1, type, via, exc: null });
  render();
}
function handleScan(raw) {
  const p = findProduct(raw);
  if (!p) { beep(false); toast(`등록되지 않은 코드예요: ${raw}`, "bad"); return; }
  addToCart(p, "scan");
}
function nextOrderNo(t = Date.now()) {
  const pre = "HD_CC" + dayKey(t).slice(2).replace(/-/g, "") + "-";
  let max = 0; for (const s of S.sales) if (s.orderNo && s.orderNo.startsWith(pre)) max = Math.max(max, +s.orderNo.slice(pre.length) || 0);
  return pre + String(max + 1).padStart(3, "0");
}
const preNote = p => (S.config.notes || {})[p.name] || "입고 후 순차 발송";
const displayOrderNo = (orderNo) => {
  if (!orderNo) return "";
  if (orderNo.startsWith("HD_CC")) return orderNo;
  if (orderNo.match(/^[A-Z]\d{6}-\d{3}$/)) return "HD_CC" + orderNo.slice(1);
  return orderNo;
};
const pickupShort = () => {
  const L = ledger(), need = {};
  for (const c of S.cart) if (c.type === "pickup") need[c.bc] = (need[c.bc] || 0) + c.qty;
  return Object.entries(need).filter(([bc, q]) => L.stock(bc) < q).map(([bc, q]) => ({ bc, q, st: L.stock(bc) }));
};
async function commitSale(f) {
  const pr = priceCart(S.cart, S.orderExc), now = Date.now();
  const needShip = S.cart.some(c => c.type !== "pickup");
  const items = pr.lines.map(l => ({
    bc: l.p.bc, ez: l.p.ez, name: l.p.name, color: l.p.color, size: l.p.size, qty: l.c.qty, price: l.p.price, disc: l.p.disc, unit: l.unit,
    type: l.c.type, via: l.c.via, promo: l.promo, exc: l.exc, excInfo: l.c.exc ? { ...l.c.exc } : null, net: l.net,
    cq: 0, rs: 0, df: 0, rt: 0, note: l.c.type === "pre" ? preNote(l.p) : "",
  }));
  const id = "S" + dayKey(now).replace(/-/g, "") + "-" + hm(now).replace(":", "") + "-" + Math.random().toString(36).slice(2, 6);
  const orderNo = S.exchange ? S.exchange.orderNo + "_EX" : nextOrderNo(now);
  const doc = {
    ts: now, day: dayKey(now), store: S.store, orderNo, rt: token(20), by: S.me.name, items,
    qty: pr.qty, gross: pr.gross, baseDisc: pr.baseDisc, promoDisc: pr.promoTotal, promoInfo: pr.hit ? { ...pr.promo } : null,
    excDisc: pr.excTotal, orderExc: S.orderExc ? { ...S.orderExc, amount: pr.orderExcAmt } : null, excWarn: pr.warn,
    total: pr.total, paid: f.paid, memo: f.memo, custName: f.name, custPhone: f.phone, hyundaiReceiptNo: f.hyundaiReceiptNo,
    ship: needShip ? { name: f.rname, phone: f.rphone, addr: f.addr, memo: f.smemo } : null,
    consent: needShip ? { ts: now, by: S.me.name } : null,
    cancels: [], status: "done", exchangeOf: S.exchange ? { id: S.exchange.id, orderNo: S.exchange.orderNo } : null,
    synced: false,
  };
  closeModal();
  try {
    // 로컬 메모리에 판매 기록 저장
    const sale = { ...doc, id };
    S.sales.push(sale);

    // LocalStorage에 판매 데이터 저장
    saveSalesDataToLocalStorage();

    // Supabase에도 시도 (사용 가능하면)
    try {
      await Net.put(P("sales", id), doc);
      if (S.exchange) {
        const o = S.sales.find(x => x.id === S.exchange.id);
        if (o) await Net.put(P("sales", o.id), { exchangeTo: [...(o.exchangeTo || []), { id, orderNo: doc.orderNo }] }, true);
      }
    } catch (netErr) {

    }

    S.cart = []; S.orderExc = null; S.exchange = null; render();
    showReceipt(sale);
  } catch (e) { writeFail(e); }
}
function writeFail(e) {
  if (/FORBIDDEN/.test(e && e.message)) toast("이 계정으로는 할 수 없는 작업이에요. 본사에 요청해 주세요.", "bad");
  else toast("저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.", "bad");
}

// ---------- 고객 영수증 (QR) ----------
const receiptUrl = rt => new URL("receipt.html?t=" + rt, location.href).href;
async function showReceipt(s) {
  if (!s.rt) { s.rt = token(20); try { await Net.put(P("sales", s.id), { rt: s.rt }, true); } catch (e) { writeFail(e); return; } }
  const url = receiptUrl(s.rt);
  const cfg = S.config || {};
  const links = [];
  const guaranteeUrl = cfg.guaranteeUrl || "https://app.vircle.co.kr/guarantee/issue/1276?templateIdx=700/";
  const phone = cfg.phone || "070-7666-9034";
  if (guaranteeUrl) links.push(`<button onclick="window.open('${guaranteeUrl}', '_blank')" style="color:#1976d2;text-decoration:underline;border:none;background:none;cursor:pointer;font-weight:600;padding:0;font-size:inherit;font-family:inherit">보증서 발급</button>`);
  if (cfg.chatUrl) links.push(`<button onclick="window.open('${cfg.chatUrl}', '_blank')" style="color:#1976d2;text-decoration:underline;border:none;background:none;cursor:pointer;font-weight:600;padding:0;font-size:inherit;font-family:inherit">채팅 상담</button>`);
  if (phone) links.push(`<button onclick="window.location.href='tel:${phone.replace(/\D/g, '')}'" style="color:#1976d2;text-decoration:underline;border:none;background:none;cursor:pointer;font-weight:600;padding:0;font-size:inherit;font-family:inherit">${esc(phone)}</button>`);
  const linksHtml = links.length ? `<div style="margin-top:12px;padding:12px;background:#e3f2fd;border-radius:4px;text-align:center;border:1px solid #1976d2">${links.join(" · ")}</div>` : "";
  const noticeText = S.config.notice || DEFAULT_NOTICE;
  const noticeUntilAsSection = noticeText.split(/\n■\s*A\/S/)[0];
  openModal(`고객 영수증 · ${displayOrderNo(s.orderNo)}`, `<div class="qr">
      <div class="confirm-big">주문번호 <span class="num">${esc(displayOrderNo(s.orderNo))}</span> · ${won(s.total)}원</div>
      <div id="qrbox"></div>
      <div class="note">고객 휴대폰 카메라로 QR을 찍으면 영수증이 열려요. 교환·환불 때 이 화면을 보여 달라고 안내해 주세요.</div>
      ${noticeUntilAsSection.split("\n").map(line => `<div class="note">${esc(line)}</div>`).join("")}
      ${linksHtml}
      <div class="note mono" style="word-break:break-all;margin-top:12px"><a href="${esc(url)}" target="_blank" style="color:var(--accent);text-decoration:underline">${esc(url)}</a></div></div>`,
    `<button class="btn" data-act="copy" data-v="${esc(url)}">링크 복사</button><button class="btn primary" data-act="close" data-autofocus>닫기 (Enter)</button>`);
  try { new QRCode($("#qrbox"), { text: url, width: 200, height: 200 }); } catch (e) { $("#qrbox").textContent = "QR을 만들지 못했어요. 링크를 복사해 보내 주세요."; }
}

// ---------- 주문 조회 · 취소 · 교환 ----------
function findOrders(q) {
  const t = q.trim().toLowerCase(), d = digits(q);
  const list = [...S.sales].sort((a, b) => b.ts - a.ts);
  if (!t) return list.slice(0, 60);
  return list.filter(s => (s.orderNo || "").toLowerCase().includes(t) || (s.custName || "").toLowerCase().includes(t) || (s.ship && (s.ship.name || "").toLowerCase().includes(t))
    || (s.hyundaiReceiptNo && s.hyundaiReceiptNo.toLowerCase().includes(t))
    || (d.length >= 4 && (digits(s.custPhone).includes(d) || (s.ship && digits(s.ship.phone).includes(d)))));
}
const daysSince = ts => Math.floor((new Date(dayKey(Date.now())) - new Date(dayKey(ts))) / 86400000);
const stateChip = s => s.state === "canceled" ? `<span class="chip bad">취소</span>` : s.state === "partial" ? `<span class="chip warn">부분 취소</span>` : `<span class="chip go">판매</span>`;
const typeChips = s => [...new Set(s.items.map(i => i.type))].map(t => `<span class="chip t-${t}">${TYPES[t]}</span>`).join(" ");
function saleSummary(s) {
  const f = s.items[0] || {};
  const first = `${f.name || f.bc} ${f.color || ""} ${f.size || ""}`.trim();
  return s.items.length > 1 ? `${first} 외 ${s.items.length - 1}건 (${s.qty}개)` : `${first}${s.qty > 1 ? ` ×${s.qty}` : ""}`;
}
function lineState(it) {
  const left = it.qty - it.cq;
  if (it.type === "pickup") return it.cq ? `<span class="chip warn">취소 ${it.cq}</span>` : `<span class="chip go">수령 완료</span>`;
  const parts = [];
  if (it.exp) parts.push(`<span class="chip info">발주 등록 ${mdhm(it.exp.ts)}</span>`); else if (left > 0) parts.push(`<span class="chip warn">발주 대기</span>`);
  if (it.cq) parts.push(`<span class="chip bad">취소 ${it.cq}</span>`);
  if ((it.ezc || 0) > (it.ezcDone || 0)) parts.push(`<span class="chip bad">이지어드민 발주 취소 필요</span>`);
  return parts.join(" ");
}
function openOrder(id) {
  const s = S.sales.find(x => x.id === id); if (!s) return;
  const canShipEdit = s.ship && s.items.some(it => it.type !== "pickup" && !it.exp && it.qty - it.cq > 0);
  const left = sum(s.items, it => it.qty - it.cq);
  openModal(`주문 ${displayOrderNo(s.orderNo) || s.id}`, `
    ${!s.hyundaiReceiptNo ? `<div class="banner warn" style="margin-bottom:8px">⚠️ 더현대 영수증 번호 미등록 · 반품 시 필요할 수 있어요</div>` : ""}
    <div class="filters" style="margin-bottom:8px">${stateChip(s)} ${typeChips(s)} <span class="note">${full(s.ts)} · 담당 ${esc(s.by || "—")}</span></div>
    <table><thead><tr><th>상품</th><th>유형</th><th class="r">수량</th><th class="r">금액</th><th>상태</th></tr></thead><tbody>
    ${s.items.map(it => `<tr><td class="name-cell"><b>${esc(it.name)}</b> <span class="opt-big" style="font-size:14px">${esc(it.color)} / <span class="c">${esc(it.size)}</span></span>${it.note ? `<div class="note">${esc(it.note)}</div>` : ""}${it.excInfo ? `<div class="note warn-txt">예외할인 ${won(it.exc)}원 · ${esc(it.excInfo.reason)}</div>` : ""}</td>
      <td><span class="chip t-${it.type}">${TYPES[it.type]}</span></td><td class="r num">${it.qty}</td><td class="r num">${won(it.net)}</td><td>${lineState(it)}</td></tr>`).join("")}
    </tbody></table>
    <div class="box"><div class="form-grid">
      <div>정상가 <b class="num">${won(s.gross)}</b> · 기본할인 <b class="num">${won(s.baseDisc)}</b>${s.promoDisc ? ` · 프로모션 <b class="num">${won(s.promoDisc)}</b>` : ""}${s.excDisc ? ` · <span class="warn-txt">예외할인 ${won(s.excDisc)}</span>` : ""}</div>
      <div>판매금액 <b class="num">${won(s.total)}</b> · 실결제 <b class="num">${won(s.paid)}</b>${s.refunded ? ` · <span class="bad-txt">환불 ${won(s.refunded)}</span>` : ""}</div>
      <div>주문자 <b>${esc(s.custName || "—")}</b> ${esc(s.custPhone || "")}</div>
      ${s.hyundaiReceiptNo ? `<div class="wide">더현대 영수증 NO: <b class="num">${esc(s.hyundaiReceiptNo)}</b></div>` : ""}
      <div>${s.ship ? `수령자 <b>${esc(s.ship.name)}</b> ${esc(s.ship.phone)}<br><span class="note">${esc(s.ship.addr)}${s.ship.memo ? ` · ${esc(s.ship.memo)}` : ""}</span>` : `<span class="note">배송 정보 없음</span>`}</div>
      ${s.memo ? `<div class="wide">메모: ${esc(s.memo)}</div>` : ""}
      ${s.orderExc ? `<div class="wide warn-txt">주문 예외할인 ${won(s.orderExc.amount)}원 · ${esc(s.orderExc.reason)}</div>` : ""}
      ${s.exchangeOf ? `<div class="wide">교환 원주문: <button class="btn sm" data-act="order" data-id="${s.exchangeOf.id}">${esc(s.exchangeOf.orderNo)}</button></div>` : ""}
      ${(s.exchangeTo || []).length ? `<div class="wide">교환 새 주문: ${s.exchangeTo.map(x => `<button class="btn sm" data-act="order" data-id="${x.id}">${esc(x.orderNo)}</button>`).join(" ")}</div>` : ""}
    </div></div>
    ${s.cancels.length ? `<div class="box"><h4>취소·환불 이력</h4>${s.cancels.map(c => `<div class="note">${full(c.ts)} · ${c.kind === "exchange" ? "교환" : "취소"} · ${c.lines.map(l => `${esc((s.items[l.i] || {}).name)} ${esc((s.items[l.i] || {}).size)} ×${l.qty}${l.disp ? ` (${DISP[l.disp] || "발주 취소"})` : ""}`).join(", ")} · 환불 ${won(c.refund)}원 · ${esc(c.reason || "")} · 처리 ${esc(c.by || "—")}</div>`).join("")}</div>` : ""}`,
    `<button class="btn" data-act="receipt" data-id="${s.id}">고객 영수증 QR</button>
     ${!s.hyundaiReceiptNo ? `<button class="btn warn" data-act="receipt-edit" data-id="${s.id}">영수증 번호 입력</button>` : ""}
     <button class="btn" data-act="memo-edit" data-id="${s.id}">메모·실결제 수정</button>
     ${canShipEdit ? `<button class="btn" data-act="ship-edit" data-id="${s.id}">배송정보 수정</button>` : ""}
     ${left ? `<button class="btn yellow" data-act="cancel-open" data-id="${s.id}" data-k="exchange">교환</button><button class="btn primary" data-act="cancel-open" data-id="${s.id}" data-k="cancel">취소·환불</button>` : ""}`);
}
const RULES = `<details class="box"><summary>상황별 처리 규칙 (백화점 POS · 이 POS · 이지어드민)</summary>
  <table class="rules" style="margin-top:8px"><thead><tr><th>상황</th><th>백화점 POS</th><th>이 POS</th><th>이지어드민</th></tr></thead><tbody>
  <tr><td>교환 - 동일상품<br>(사이즈·컬러만 변경)</td><td>처리 없음</td><td>[교환] → 원상품 취소 → 새 상품(색상/사이즈만 다름) 판매</td><td>발주 상태에 따라 수정 또는 취소·재발주</td></tr>
  <tr><td>교환 - 다른상품</td><td>원결제 취소 후 새 상품 재결제</td><td>[교환] → 원상품 취소 → 새 상품 판매 (두 주문이 자동 연결)</td><td>택배 건이면 기존 발주 취소 후 새 발주</td></tr>
  <tr><td>부분 환불</td><td>전액 취소 후 남는 상품만 재결제</td><td>[취소·환불]에서 해당 상품·수량만 선택</td><td>택배 건이면 해당 상품 발주 취소</td></tr>
  <tr><td>전체 환불</td><td>결제 취소</td><td>[취소·환불]에서 전체 선택</td><td>택배 건이면 발주 취소·회수</td></tr>
  <tr><td>현금영수증 번호 변경</td><td>취소 후 같은 금액 재결제</td><td>처리 없음 · 메모만 남기기</td><td>처리 없음</td></tr>
  <tr><td>불량 반품</td><td>결제 취소</td><td>처리 방법을 ‘불량 분리’로 선택 (판매 재고로 안 돌아감)</td><td>본사 반송 전표</td></tr>
  </tbody></table></details>`;
function openCancel(id, kind) {
  const s = S.sales.find(x => x.id === id); if (!s) return;
  const days = daysSince(s.ts), late = days > REFUND_DAYS;
  const promo = storeCfg().promo || {};
  let cancelStage = 1, selectedLines = [], newItems = [];
  S.exchangeStage2Items = null;

  const renderStage1 = () => {
    const rows = s.items.map((it, i) => {
      const left = it.qty - it.cq; if (left <= 0) return "";
      const disp = it.type === "pickup"
        ? `<select class="input" data-cdisp="${i}">${Object.entries(DISP).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>`
        : `<span class="note">${it.exp ? `<span class="bad-txt">발주 등록됨 → 이지어드민 발주 취소 필요</span>` : "발주 전 · 바로 취소"}</span>`;
      return `<tr><td class="c"><input type="checkbox" data-cpick="${i}" aria-label="선택"></td>
        <td class="name-cell"><b>${esc(it.name)}</b> ${esc(it.color)} / <b>${esc(it.size)}</b> <span class="chip t-${it.type}">${TYPES[it.type]}</span></td>
        <td class="c"><select class="input" data-cqty="${i}">${Array.from({ length: left }, (_, k) => `<option value="${k + 1}" ${k + 1 === left ? "selected" : ""}>${k + 1}</option>`).join("")}</select> / ${left}</td>
        <td class="r num">${won(it.net / it.qty)}</td><td>${disp}</td></tr>`;
    }).join("");

    return `${late ? `<div class="banner bad">구매 후 ${days}일 지났어요 (기준 ${REFUND_DAYS}일). 본사 승인 사유를 반드시 기입하고 진행하세요.</div>` : `<div class="banner info">구매 ${days}일째 · 환불 가능 기간 안이에요.</div>`}
      ${kind === "exchange" ? `<p class="note">교환 = 취소한 상품 대신 새 상품을 담으세요. 1️⃣ 먼저 돌려받을 상품 선택 2️⃣ 새 상품 담기 3️⃣ 차액 확인 후 최종 처리</p>` : ""}
      <table style="margin-top:10px"><thead><tr><th></th><th>상품</th><th class="c">수량</th><th class="r">개당 금액</th><th>처리</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="form-grid" style="margin-top:12px">
        <label>사유<select class="input" id="c-reason">${REASONS.map(r => `<option ${kind === "exchange" && r.startsWith("사이즈") ? "selected" : ""}>${r}</option>`).join("")}</select></label>
        <label class="wide">상세 메모<input class="input" id="c-memo" placeholder="${kind === "exchange" ? "예: 블랙 M → 화이트 L 교환" : "예: 불량, 사이즈 맞지 않음"}"></label>
      </div>
      <div class="box" style="background:var(--border);padding:12px;border-radius:4px;margin:12px 0">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div class="note" style="font-size:12px;margin-bottom:4px">고객 환급액</div><div class="num" style="font-size:18px;font-weight:bold" id="c-refund-display">0원</div></div>
          <div><div class="note" style="font-size:12px;margin-bottom:4px">더현대 POS 환불</div><div class="num" style="font-size:18px;font-weight:bold;color:var(--accent)" id="c-hyundai-display">0원</div></div>
        </div>
        <input type="hidden" id="c-refund" value="0">
        <div id="c-promo-box" style="display:none;padding:8px;background:rgba(255,152,0,0.1);border-radius:4px">
          <label class="check" style="margin:0"><input type="checkbox" id="c-revoke-promo"> <span style="font-size:12px" id="c-promo-msg"></span></label>
        </div>
      </div>
      <div class="box"><h4>확인 (모두 체크해야 진행돼요)</h4>
        <label class="check"><input type="checkbox" data-cchk> 택이 붙어 있고 착용하지 않았어요</label>
        <label class="check"><input type="checkbox" data-cchk> 영수증(주문번호)으로 구매 내역을 확인했어요</label>
        ${late ? `<label class="check"><input type="checkbox" data-cchk> 기간이 지났지만 본사 승인을 받았어요</label>` : ""}
      </div>`;
  };

  const openStage2Modal = () => {
    selectedLines = [];
    s.items.forEach((it, i) => {
      const ck = $(`[data-cpick="${i}"]`);
      const qty = +$(`[data-cqty="${i}"]`).value || 0;
      if (ck && ck.checked) selectedLines.push({ i, qty, name: it.name, color: it.color, size: it.size, unitPrice: it.net / it.qty, totalPrice: (it.net / it.qty) * qty, type: it.type });
    });

    const cancelAmt = sum(selectedLines, l => l.totalPrice);
    const body = `
      <div class="box"><h4>돌려받을 상품 (확정)</h4>
        ${selectedLines.map(l => `<div class="note" style="margin:8px 0"><b>${esc(l.name)}</b> ${esc(l.color)} / ${esc(l.size)} ×${l.qty} = <b>${won(l.totalPrice)}</b>원</div>`).join("")}
        <div style="font-size:14px;font-weight:bold;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">취소액: ${won(cancelAmt)}원</div>
      </div>
      <div class="box"><h4>새로 구매할 상품</h4>
        <div style="margin-bottom:12px;position:relative">
          <label class="wide" style="display:block;margin-bottom:8px">바코드 스캔 또는 상품명<input class="input" id="new-scan" placeholder="바코드를 찍거나 상품명 검색" inputmode="numeric" data-autofocus style="display:block;width:100%;margin-top:4px"></label>
          <div id="search-results" style="position:absolute;top:calc(100% + 2px);left:0;right:0;background:var(--border);border:1px solid var(--line);border-radius:4px;max-height:240px;overflow-y:auto;z-index:1000;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.3)"></div>
        </div>
        <div id="new-items-box" class="note" style="min-height:40px;padding:8px;background:var(--border);border-radius:4px">선택한 상품이 여기에 나타나요</div>
      </div>
      <div class="box" style="background:var(--border);padding:12px;border-radius:4px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><div class="note" style="font-size:12px;margin-bottom:4px">취소액</div><div class="num" style="font-size:16px;font-weight:bold">${won(cancelAmt)}</div></div>
          <div><div class="note" style="font-size:12px;margin-bottom:4px">새상품</div><div class="num" style="font-size:16px;font-weight:bold" id="new-total">0원</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)">
          <div><div class="note" style="font-size:12px;margin-bottom:4px">고객 환급</div><div class="num" style="font-size:14px;font-weight:bold" id="refund-amt">0원</div></div>
          <div><div class="note" style="font-size:12px;margin-bottom:4px">추가결제</div><div class="num" style="font-size:14px;font-weight:bold;color:var(--accent)" id="extra-pay">0원</div></div>
        </div>
      </div>`;

    openModal(`교환 · 새 상품 선택 · ${displayOrderNo(s.orderNo)}`, body,
      `<button class="btn" data-act="close">취소</button><button class="btn primary" data-act="cancel-do" data-id="${s.id}" data-k="exchange" data-stage="2">교환 처리</button>`);

    newItems = [];
    const promo = storeCfg().promo || {};
    const updateCalc = () => {
      const newItemGross = sum(newItems, it => it.unit * it.qty); // 새상품 정상가 합계
      const finalGross = remainItemGross + newItemGross; // 최종 정상가 (남은품목 + 새상품)
      const shouldPromo = finalGross >= (promo.threshold || 500000); // 50만원 이상이면 프로모션 적용
      const promoDisc = shouldPromo ? Math.round(newItemGross * (promo.rate || 0.05)) : 0;
      const newAmt = newItemGross - promoDisc; // 새상품 판매가 (할인 적용됨)
      const promoDisplay = shouldPromo ? ` (프로모션 ${Math.round((promo.rate || 0.05) * 100)}% 적용)` : " (프로모션 미적용)";
      const diff = cancelAmt - newAmt;
      $("#new-total").textContent = won(newAmt) + promoDisplay;
      $("#refund-amt").textContent = won(Math.max(0, diff));
      $("#extra-pay").textContent = won(Math.max(0, -diff));
      $("#new-items-box").innerHTML = newItems.map((it, idx) => {
        const basePrice = it.unit * it.qty;
        const itemDisc = shouldPromo ? Math.round(basePrice * (promo.rate || 0.05)) : 0;
        const itemPrice = basePrice - itemDisc;
        return `<div style="display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;margin:6px 0;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1)">
          <div><b>${esc(it.name)}</b> <span style="color:var(--dim);font-size:12px">${esc(it.color)} / ${esc(it.size)}</span> ×<b>${it.qty}</b></div>
          <div style="text-align:right"><div style="font-size:11px;color:var(--dim);${itemDisc > 0 ? 'text-decoration:line-through' : ''}">${won(basePrice)}</div><div style="font-weight:bold;color:var(--go)">${won(itemPrice)}</div></div>
          <button class="btn sm" data-act="new-item-del" data-idx="${idx}">삭제</button>
        </div>`;
      }).join("");
    };

    setTimeout(() => {
      const scanInput = $("#new-scan");
      const searchResults = $("#search-results");
      if (scanInput) {
        scanInput.addEventListener("input", e => {
          const q = scanInput.value.trim();
          if (!q) {
            searchResults.style.display = "none";
            return;
          }
          const matches = S.products.filter(p =>
            p.name.toLowerCase().includes(q.toLowerCase()) ||
            p.bc.includes(q) ||
            (p.ez && p.ez.includes(q))
          ).slice(0, 8);

          if (matches.length) {
            searchResults.innerHTML = matches.map((p, idx) =>
              `<div style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);cursor:pointer;min-height:70px;display:grid;grid-template-rows:auto auto auto;gap:6px;align-content:center" data-search-idx="${idx}">
                <div style="font-weight:bold;font-size:13px;line-height:1.4">${esc(p.name)}</div>
                <div style="font-size:12px;color:var(--dim);line-height:1.3">${esc(p.color)} / ${esc(p.size)}</div>
                <div style="font-size:14px;font-weight:bold;color:var(--go)">${won(p.discount || p.price)}</div>
              </div>`
            ).join("");
            searchResults.style.display = "block";
          } else {
            searchResults.style.display = "none";
          }
        });

        scanInput.addEventListener("keydown", e => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const selected = $("[data-search-idx]");
          if (selected) selected.click();
          else {
            const q = scanInput.value.trim();
            if (!q) return;
            const p = findProduct(q) || S.byBc[q];
            if (!p) { toast("상품을 찾지 못했어요.", "bad"); return; }
            const ex = newItems.find(it => it.bc === p.bc && it.color === p.color && it.size === p.size);
            if (ex) ex.qty++; else newItems.push({ bc: p.bc, name: p.name, color: p.color, size: p.size, unit: p.discount || p.price, qty: 1 });
            scanInput.value = "";
            searchResults.style.display = "none";
            updateCalc();
          }
        });
      }
    }, 50);

    // 모달 내의 search result 클릭
    setTimeout(() => {
      const searchResults = $("#search-results");
      if (searchResults) {
        searchResults.addEventListener("click", e => {
          const item = e.target.closest("[data-search-idx]");
          if (item) {
            const idx = +item.dataset.searchIdx;
            const scanInput = $("#new-scan");
            const p = S.products.filter(p =>
              p.name.toLowerCase().includes(scanInput.value.trim().toLowerCase()) ||
              p.bc.includes(scanInput.value.trim()) ||
              (p.ez && p.ez.includes(scanInput.value.trim()))
            )[idx];
            if (p) {
              const ex = newItems.find(it => it.bc === p.bc && it.color === p.color && it.size === p.size);
              if (ex) ex.qty++; else newItems.push({ bc: p.bc, name: p.name, color: p.color, size: p.size, unit: p.discount || p.price, qty: 1 });
              scanInput.value = "";
              searchResults.style.display = "none";
              updateCalc();
            }
          }
        });
      }
    }, 50);

    // 모달 내의 delete 버튼 클릭
    setTimeout(() => {
      const newItemsBox = $("#new-items-box");
      if (newItemsBox) {
        newItemsBox.addEventListener("click", e => {
          if (e.target.dataset.act === "new-item-del") {
            const idx = +e.target.dataset.idx;
            newItems.splice(idx, 1);
            updateCalc();
          }
        });
      }
    }, 50);
    updateCalc();
  };

  openModal(`${kind === "exchange" ? "교환" : "취소·환불"} · ${displayOrderNo(s.orderNo)}`, renderStage1(),
    `${kind === "exchange" ? `<button class="btn yellow" data-act="cancel-stage2" data-id="${s.id}">다음 단계: 새 상품 담기</button>` : ""}<button class="btn" data-act="close">돌아가기</button><button class="btn primary" data-act="cancel-do" data-id="${s.id}" data-k="${kind}" ${kind === "exchange" ? 'style="display:none" data-stage="1"' : ""}>${kind === "exchange" ? "원상품 취소하고 새 상품 담기" : "취소·환불 기록"}</button>`);

  setTimeout(() => {
    const nextBtn = $("[data-act='cancel-stage2']");
    if (nextBtn) {
      nextBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openStage2Modal();
      });
    }
  }, 100);
  const recalc = () => {
    let cancelAmt = 0, remainItemNet = 0, remainItemGross = 0;
    s.items.forEach((it, i) => {
      const ck = $(`[data-cpick="${i}"]`);
      const qty = +$(`[data-cqty="${i}"]`).value || 0;
      if (ck && ck.checked) {
        cancelAmt += Math.round(it.net / it.qty * qty);
      } else {
        const itemGross = it.price * it.qty;
        const itemBaseDisc = itemGross - (it.base / it.qty * it.qty);
        remainItemGross += Math.round(itemGross - itemBaseDisc);
        remainItemNet += it.net;
      }
    });
    const promoApplies = remainItemGross >= (promo.threshold || 0);
    const needRevoke = !promoApplies && s.promoDisc > 0;
    const revokeCheckbox = $("#c-revoke-promo");
    revokeCheckbox.checked = needRevoke;
    let hyundaiAmount = remainItemGross;
    let finalRefund = needRevoke ? cancelAmt - s.promoDisc : cancelAmt;
    if (needRevoke) {
      $("#c-promo-box").style.display = "block";
      revokeCheckbox.disabled = false;
      $("#c-promo-msg").innerHTML = `⚠️ <b>자동 회수:</b> 남은 금액 ${won(remainItemGross)}원 &lt; ${won(promo.threshold || 0)}원<br>→ 프로모션 할인 ${won(s.promoDisc)}원 환수 (필요시 체크 해제)`;
    } else if (promoApplies && s.promoDisc > 0) {
      $("#c-promo-box").style.display = "block";
      revokeCheckbox.disabled = true;
      revokeCheckbox.checked = false;
      $("#c-promo-msg").innerHTML = `✓ <b>프로모션 유지:</b> 남은 금액 ${won(remainItemGross)}원 ≥ ${won(promo.threshold || 0)}원`;
    } else {
      $("#c-promo-box").style.display = "none";
    }
    revokeCheckbox.addEventListener("change", () => {
      if (needRevoke) {
        finalRefund = revokeCheckbox.checked ? cancelAmt - s.promoDisc : cancelAmt;
        hyundaiAmount = remainItemGross;
        $("#c-refund").value = finalRefund;
        $("#c-refund-display").textContent = won(finalRefund);
        $("#c-hyundai-display").textContent = won(Math.round(hyundaiAmount));
      }
    }, {once: false});
    $("#c-refund").value = finalRefund;
    $("#c-refund-display").textContent = won(finalRefund);
    $("#c-hyundai-display").textContent = won(Math.round(hyundaiAmount));
    const actionMsg = kind === "exchange" ? `【다음 액션】1️⃣ 더현대 ${won(Math.round(hyundaiAmount))} 환불 2️⃣ 판매화면에서 새상품 담기` : `【다음 액션】1️⃣ 더현대 ${won(Math.round(hyundaiAmount))} 환불 2️⃣ 고객에게 ${won(finalRefund)}원 반환`;
    if (!$("#c-action-info")) {
      $("#c-promo-box").insertAdjacentHTML("afterend", `<div id="c-action-info" style="margin-top:8px;padding:10px;background:rgba(76,175,80,0.1);border-left:4px solid var(--go);font-weight:bold;font-size:13px">${actionMsg}</div>`);
    } else {
      $("#c-action-info").innerHTML = actionMsg;
    }
  };
  recalc();
  $("#modal-root").addEventListener("change", e => { if (e.target.dataset.cpick !== undefined || e.target.dataset.cqty !== undefined) recalc(); });
  $("#c-reason").addEventListener("change", e => { if (e.target.value === "불량") document.querySelectorAll("[data-cdisp]").forEach(x => x.value = "defect"); });
}
function openStockAdjust(bc) {
  const p = S.byBc[bc]; if (!p) return;
  const L = ledger(), st = L.stock(bc);
  let sign = -1; // -1: 감소, +1: 증가
  const updatePreview = () => {
    const qty = Math.max(0, parseInt(digits($("#adj-qty").value), 10) || 0);
    const after = st + (sign * qty);
    $("#adj-preview").textContent = `${st}개 → ${after}개`;
    $("#adj-preview").style.color = after < 0 ? "var(--bad)" : after === st ? "" : "var(--accent)";
  };
  openModal(`재고 조정 · ${esc(p.name)} ${esc(p.color)} / ${esc(p.size)}`, `
    <div class="card highlight" style="margin-bottom:1rem">
      <strong>현재 재고</strong><br>
      <div style="font-size:24px;font-weight:700;color:var(--accent);margin:0.5rem 0">${st}개</div>
      <strong>조정 후</strong><br>
      <div id="adj-preview" style="font-size:20px;font-weight:600;margin-top:0.5rem">${st}개</div>
    </div>
    <div class="form-grid">
      <label>처리 방법<select class="input" id="adj-disp">${Object.entries(DISP).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
      <label>조정 방향
        <div class="seg" style="margin-top:0.5rem">
          <button class="btn sm" id="adj-minus" style="background:var(--accent);color:white;flex:1" data-sign="-1">감소 (-)</button>
          <button class="btn sm" id="adj-plus" style="flex:1" data-sign="+1">증가 (+)</button>
        </div>
      </label>
      <label>조정 수량<input class="input num" id="adj-qty" inputmode="numeric" placeholder="0" value="0"></label>
      <label class="wide">메모<input class="input" id="adj-memo" placeholder="예: 실사 결과 부족 2개 / 오발송 반입 3개 등"></label>
    </div>
    <div class="banner warn" style="font-weight:600">⚠️ 중요: 본사에 반드시 알림하세요!<br>이 조정 내용이 본사로 전송되며 기록으로 남겨집니다.</div>
  `, `<button class="btn" data-act="close">취소</button><button class="btn primary" data-act="stock-adj-do" data-bc="${bc}" data-sign="${sign}">조정 저장</button>`);

  const updateSign = (s) => { sign = parseInt(s); $("#adj-minus").style.background = sign === -1 ? "var(--accent)" : ""; $("#adj-plus").style.background = sign === 1 ? "var(--accent)" : ""; $("[data-act='stock-adj-do']").dataset.sign = sign; updatePreview(); };
  $("#adj-minus").addEventListener("click", () => updateSign("-1"));
  $("#adj-plus").addEventListener("click", () => updateSign("1"));
  $("#adj-qty").addEventListener("input", updatePreview);
}
async function doStockAdjust(bc) {
  const disp = $("#adj-disp")?.value; const qty = Math.max(0, parseInt(digits($("#adj-qty").value), 10) || 0); const memo = $("#adj-memo")?.value?.trim() || "";
  if (!qty) { toast("조정 수량을 입력해 주세요.", "bad"); return; }
  const p = S.byBc[bc]; if (!p) return;
  const sign = parseInt($("[data-act='stock-adj-do']")?.dataset.sign) || -1;
  closeModal();
  try {
    const entry = { bc, qty, sign, disp, memo, ts: Date.now(), by: S.me.name };
    S.movements = S.movements || []; S.movements.push(entry);
    await Net.put(P("stock_adj", rid("ADJ")), entry);
    const direction = sign > 0 ? "증가" : "감소";
    toast(`${DISP[disp]} · ${qty}개 ${direction}`, "go");
    render();
  } catch (e) { writeFail(e); }
}
async function doCancel(id, kind) {
  const s = S.sales.find(x => x.id === id); if (!s) return;
  if (!s.hyundaiReceiptNo) { toast("⚠️ 더현대 영수증 번호가 없어요. 백화점 POS 처리 시 필요할 수 있습니다. 주문 상세에서 영수증 번호를 추가한 후 진행해 주세요.", "warn"); }
  const lines = [];
  s.items.forEach((it, i) => { const ck = $(`[data-cpick="${i}"]`); if (ck && ck.checked) lines.push({ i, qty: +$(`[data-cqty="${i}"]`).value, disp: it.type === "pickup" ? $(`[data-cdisp="${i}"]`).value : (it.exp ? "ezcancel" : "ship") }); });
  if (!lines.length) { toast("취소할 상품을 골라 주세요.", "bad"); return; }
  if ([...document.querySelectorAll("[data-cchk]")].some(x => !x.checked)) { toast("확인 항목을 모두 체크해 주세요.", "bad"); return; }
  const items = s.items.map(it => ({ ...it }));
  for (const l of lines) {
    const it = items[l.i]; it.cq += l.qty;
    if (it.type === "pickup") { if (l.disp === "restock") it.rs += l.qty; else if (l.disp === "defect") it.df += l.qty; else it.rt += l.qty; }
    else if (l.disp === "ezcancel") it.ezc = (it.ezc || 0) + l.qty;
  }
  let refundAmt = Math.max(0, parseInt(digits($("#c-refund").value), 10) || 0);
  const revokePromo = $("#c-revoke-promo")?.checked;
  if (revokePromo && s.promoDisc > 0) {
    refundAmt = Math.max(0, refundAmt - s.promoDisc);
  }
  const entry = { id: rid("C"), ts: Date.now(), by: S.me.name, kind, lines, refund: refundAmt, reason: $("#c-reason").value + ($("#c-memo").value.trim() ? " · " + $("#c-memo").value.trim() : "") + (revokePromo && s.promoDisc > 0 ? ` [프로모션 ${won(s.promoDisc)}원 회수]` : ""), deptDone: true };
  const all = items.every(it => it.cq >= it.qty);
  closeModal();
  try {
    // 로컬 메모리에 취소 기록 업데이트
    const idx = S.sales.findIndex(x => x.id === id);
    if (idx >= 0) {
      S.sales[idx].items = items;
      S.sales[idx].cancels = [...s.cancels, entry];
      S.sales[idx].status = all ? "canceled" : "partial";
      // LocalStorage에 판매 데이터 저장
      saveSalesDataToLocalStorage();
    }

    // Supabase에도 시도 (사용 가능하면)
    try {
      await Net.put(P("sales", id), { items, cancels: [...s.cancels, entry], status: all ? "canceled" : "partial" }, true);
    } catch (netErr) {

    }

    if (kind === "exchange") {
      S.exchange = { id, orderNo: s.orderNo };
      S.cart = [];
      if (S.exchangeStage2Items && S.exchangeStage2Items.length) {
        S.exchangeStage2Items.forEach(it => {
          const p = S.byBc[it.bc];
          if (p) S.cart.push({ p, qty: it.qty, type: "pickup", via: "search" });
        });
        S.exchangeStage2Items = null;
      }
      goTab("sell");
      toast("원상품을 취소했어요. 새 상품이 준비되었습니다. 판매 확정해 주세요.", "go");
    } else toast(`취소·환불을 기록했어요 · 환불 ${won(entry.refund)}원`, "go");
  } catch (e) { writeFail(e); }
}

// ---------- 입고 요청 ----------
function reqItems() {
  return Object.entries(S.reqDraft).filter(([, q]) => q > 0).map(([bc, qty]) => ({ bc, qty }))
    .sort((a, b) => S.products.indexOf(S.byBc[a.bc]) - S.products.indexOf(S.byBc[b.bc]));
}
// 이지어드민 전표 양식: 상품코드 / 요청수량(빈칸) / 출고수량 — 코드는 텍스트로(앞자리 0 유지)
function slipBook(items, qtyHeader) {
  const aoa = [["상품코드", "요청수량", qtyHeader], ...items.map(i => [S.byBc[i.bc].ez, "", i.qty])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let r = 1; r < aoa.length; r++) { const ref = XLSX.utils.encode_cell({ r, c: 0 }); ws[ref].t = "s"; ws[ref].z = "@"; }
  ws["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 10 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}
function saveFile(filename, data) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const fileTag = () => storeCfg().name.replace(/\s/g, "");
async function submitRequest() {
  const items = reqItems(); if (!items.length) return;
  const now = Date.now(), id = "R" + stamp().replace("_", "-") + "-" + Math.random().toString(36).slice(2, 5);
  const doc = { ts: now, by: S.me.name, memo: S.reqMemo.trim(), items, qty: sum(items, i => i.qty), status: "요청" };
  closeModal();
  try {
    await Net.put(P("requests", id), doc);
    S.reqDraft = {}; S.reqMemo = ""; render();
    toast("입고 요청을 등록했어요.", "go");
    saveFile(`${fileTag()}_출고요청_${stamp()}_전표.xlsx`, slipBook(items, "출고수량"));
  } catch (e) { writeFail(e); }
}
async function setReqStatus(id, status) {
  try { await Net.put(P("requests", id), { status, ackTs: Date.now(), ackBy: S.me.name }, true); } catch (e) { writeFail(e); }
}
const pendingReq = bc => { let n = 0; for (const r of S.requests) if (r.status !== "입고완료") for (const i of r.items) if (i.bc === bc) n += i.qty; return n; };

// ---------- 입고 반영 (받은 수량 검수 후 반영) ----------
function parseSlip(buf, fileName) {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  const hi = rows.findIndex(r => r.some(c => String(c).replace(/\s/g, "") === "상품코드"));
  if (hi < 0) return { error: "‘상품코드’ 열을 찾지 못했어요. 이지어드민 전표 양식(상품코드 / 출고수량)인지 확인해 주세요." };
  const head = rows[hi].map(c => String(c).replace(/\s/g, ""));
  const ci = head.indexOf("상품코드");
  let qi = -1, qName = "";
  for (const n of ["입고수량", "출고수량", "출고요청", "수량"]) {
    const i = head.indexOf(n); if (i < 0) continue;
    if (rows.slice(hi + 1).some(r => Number(String(r[i]).replace(/,/g, "")) > 0)) { qi = i; qName = n; break; }
  }
  if (qi < 0) return { error: "수량 열(출고수량 · 입고수량 · 출고요청)에 0보다 큰 값이 없어요." };
  const agg = {}, bad = [];
  rows.slice(hi + 1).forEach((r, k) => {
    const code = String(r[ci]).trim(), q = Number(String(r[qi]).replace(/,/g, ""));
    if (!(q > 0)) return;
    const p = findProduct(code);
    if (!p) { bad.push({ row: hi + k + 2, code, qty: q }); return; }
    agg[p.bc] = (agg[p.bc] || 0) + Math.round(q);
  });
  const items = Object.entries(agg).map(([bc, qty]) => ({ bc, qty, got: qty }))
    .sort((a, b) => S.products.indexOf(S.byBc[a.bc]) - S.products.indexOf(S.byBc[b.bc]));
  return { fileName, qName, items, bad, sig: items.map(i => i.bc + ":" + i.qty).join("|"), qty: sum(items, i => i.qty) };
}
function guessRequest(up) {
  let best = "", score = 0;
  for (const r of S.requests.filter(r => r.status !== "입고완료")) {
    const want = Object.fromEntries((r.items || []).map(i => [i.bc, i.qty]));
    let hit = 0; for (const i of up.items) if (want[i.bc]) hit += Math.min(want[i.bc], i.qty);
    const sc = hit / (r.qty || 1);
    if (sc > score) { score = sc; best = r.id; }
  }
  return score >= 0.5 ? best : "";
}
async function commitReceipt() {
  const up = S.upload; if (!up) return;
  const items = up.items.filter(i => i.got > 0).map(i => ({ bc: i.bc, qty: i.got, slip: i.qty }));
  if (!items.length) return;
  const now = Date.now(), id = "I" + stamp().replace("_", "-") + "-" + Math.random().toString(36).slice(2, 5);
  const doc = { kind: "in", label: "추가 입고", ts: now, by: S.me.name, fileName: up.fileName, items, qty: sum(items, i => i.qty), slipQty: up.qty, sig: up.sig, requestId: up.requestId || "" };
  closeModal();
  try {
    await Net.put(P("receipts", id), doc);
    if (up.requestId) await Net.put(P("requests", up.requestId), { status: "입고완료", receiptId: id, doneTs: now }, true);
    S.upload = null; render();
    toast(`재고에 ${items.length}개 품목, 총 ${doc.qty}개를 추가했어요.`, "go");
  } catch (e) { writeFail(e); }
}
function readUpload(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try { const up = parseSlip(new Uint8Array(fr.result), file.name); if (!up.error) up.requestId = guessRequest(up); S.upload = up; }
    catch (err) { S.upload = { error: "파일을 읽지 못했어요. 엑셀(.xlsx) 파일인지 확인해 주세요." }; }
    render();
  };
  fr.readAsArrayBuffer(file);
}

// ---------- 배송 발주 (택배·사전구매 → 이지어드민 발주 양식) ----------
function shipLines() {
  const out = [];
  for (const s of S.sales) s.items.forEach((it, i) => { if (it.type !== "pickup") out.push({ s, it, i, left: it.qty - it.cq }); });
  return out.sort((a, b) => a.s.ts - b.s.ts);
}
// 이지어드민 수기발주 양식 (Downloads/261109밀리밀_수기발주.xlsx와 같은 11열, Sheet1)
// 같은 주문번호 = 합포. 주문번호는 양식처럼 날짜_매장코드+순번(POS C261127-001 → 261127_C001),
// 사전구매는 끝에 P를 붙여 당일발송과 따로 묶이게 한다. 메모 = 판매일_매장명 출고.
const SHIP_HEAD = ["발송일", "주문번호", "상품코드", "품목코드", "상품명", "옵션", "수량", "수령자명", "수령자전화번호", "수령자주소", "메모"];
const shipDate = t => { const d = new Date(t); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`; };
const yymmdd = t => dayKey(t).slice(2).replace(/-/g, "");
const ezOrderNo = s => { const m = /^([A-Z]+)(\d{6})-(\d+)$/.exec(s.orderNo || ""); return m ? `${m[2]}_${m[1]}${m[3]}` : (s.orderNo || s.id); };
function shipRow(x, qty, ts) {
  const s = x.s, it = x.it, sh = s.ship || {};
  const memo = [`${yymmdd(s.ts)}_${storeCfg().name} 출고`, it.type === "pre" ? `사전구매 ${it.note || "입고 후 순차 발송"}` : "", sh.memo || ""].filter(Boolean).join(" / ");
  return [shipDate(ts), ezOrderNo(s) + (it.type === "pre" ? "P" : ""), it.ez, "", `[26FW] ${it.name} ${it.color}`, it.size, qty, sh.name || s.custName || "", fmtPhone(sh.phone || s.custPhone), sh.addr || "", memo];
}
function shipBook(rows, ts) {
  const aoa = [SHIP_HEAD, ...rows.map(r => shipRow(r.x, r.qty, ts))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let r = 1; r < aoa.length; r++) for (const c of [1, 2]) { const ref = XLSX.utils.encode_cell({ r, c }); ws[ref].t = "s"; ws[ref].z = "@"; }
  ws["!cols"] = [10, 14, 10, 10, 44, 6, 6, 10, 15, 48, 30].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}
// 당일발송·사전구매를 각각 별도 파일로 (이지어드민에 따로 올려 합포가 섞이지 않게)
function saveShipFiles(rows, ts, tag) {
  for (const [t, label] of [["ship", "택배"], ["pre", "사전구매"]]) {
    const part = rows.filter(r => r.x.it.type === t);
    if (part.length) saveFile(`${fileTag()}_수기발주_${label}_${tag}.xlsx`, shipBook(part, ts));
  }
}
async function exportShip() {
  const todo = shipLines().filter(x => !x.it.exp && x.left > 0);
  if (!todo.length) { toast("새로 내보낼 택배·사전구매 건이 없어요."); return; }
  const batch = "B" + stamp(), ts = Date.now();
  saveShipFiles(todo.map(x => ({ x, qty: x.left })), ts, stamp());
  const bySale = {};
  for (const x of todo) (bySale[x.s.id] = bySale[x.s.id] || []).push(x);
  try {
    for (const [sid, xs] of Object.entries(bySale)) {
      const s = S.sales.find(y => y.id === sid), items = s.items.map(it => ({ ...it }));
      for (const x of xs) items[x.i].exp = { ts, by: S.me.name, batch, qty: x.left };
      await Net.put(P("sales", sid), { items }, true);
    }
    toast(`${todo.length}줄을 발주 등록 완료로 표시했어요. 이지어드민에 올려 주세요.`, "go");
  } catch (e) { writeFail(e); }
}
function reExportBatch(batch) {
  const rows = shipLines().filter(x => x.it.exp && x.it.exp.batch === batch).map(x => ({ x, qty: x.it.exp.qty }));
  if (rows.length) saveShipFiles(rows, rows[0].x.it.exp.ts, batch.slice(1) + "_재다운로드");
}
async function markEzCancelDone(sid, i) {
  const s = S.sales.find(y => y.id === sid), items = s.items.map(it => ({ ...it }));
  items[i].ezcDone = items[i].ezc;
  try { await Net.put(P("sales", sid), { items }, true); toast("이지어드민 발주 취소 처리 완료로 표시했어요.", "go"); } catch (e) { writeFail(e); }
}

// ---------- 매출 집계 · 일 마감 · 엑셀 ----------
function dailyRows() {
  const m = {};
  const D = k => m[k] || (m[k] = { day: k, n: 0, qty: 0, gross: 0, baseDisc: 0, promo: 0, exc: 0, excN: 0, total: 0, paid: 0, refund: 0, cn: 0, byType: { pickup: 0, ship: 0, pre: 0 }, memoN: 0 });
  for (const s of S.sales) {
    const d = D(s.day);
    d.n++; d.qty += s.qty; d.gross += s.gross; d.baseDisc += s.baseDisc; d.promo += s.promoDisc; d.exc += s.excDisc; d.total += s.total; d.paid += s.paid;
    if (s.excDisc) d.excN++; if (s.memo) d.memoN++;
    for (const it of s.items) d.byType[it.type] += it.net;
    for (const c of s.cancels) { const cd = D(dayKey(c.ts)); cd.refund += c.refund || 0; cd.cn++; }
  }
  return Object.values(m).map(d => ({ ...d, netSales: d.total - d.refund })).sort((a, b) => b.day.localeCompare(a.day));
}
function movements() {
  const out = [];
  for (const r of S.receipts) for (const it of r.items || []) { const p = S.byBc[it.bc]; if (p) out.push({ ts: r.ts, type: r.kind === "init" ? `초기입고(${r.label})` : "추가입고", p, qty: it.qty, ref: r.id, by: r.by }); }
  for (const s of S.sales) for (const it of s.items) {
    if (it.type !== "pickup") continue;
    const p = S.byBc[it.bc] || it;
    out.push({ ts: s.ts, type: "판매", p, qty: -it.qty, ref: s.orderNo || s.id, by: s.by });
    for (const c of s.cancels) for (const l of c.lines) if (s.items[l.i] === it && l.disp === "restock") out.push({ ts: c.ts, type: "취소 복구", p, qty: l.qty, ref: s.orderNo || s.id, by: c.by });
  }
  for (const m of S.movements || []) { const p = S.byBc[m.bc]; if (p) out.push({ ts: m.ts, type: DISP[m.disp] || m.disp, p, qty: -m.qty, ref: m.memo || "재고조정", by: m.by }); }
  return out.sort((a, b) => b.ts - a.ts);
}
function exportReport(day) {
  const L = ledger(), wb = XLSX.utils.book_new(), days = dailyRows();
  const add = (aoa, name) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  const cl = days.find(d => d.day === day);
  if (cl) add([["항목", "금액/건수"], ["일자", cl.day], ["판매 건수", cl.n], ["판매 수량", cl.qty], ["정상가 합계", cl.gross], ["기본 할인", cl.baseDisc], ["프로모션 할인", cl.promo], ["예외 할인", cl.exc], ["예외할인 주문 수", cl.excN], ["판매금액", cl.total], ["실결제금액 합계", cl.paid], ["실결제 − 판매금액", cl.paid - cl.total], ["취소·환불 건수", cl.cn], ["환불 금액", cl.refund], ["순매출 (판매 − 환불)", cl.netSales], ["현장수령 금액", cl.byType.pickup], ["택배배송 금액", cl.byType.ship], ["사전구매 금액", cl.byType.pre]], `일마감_${day.slice(5)}`);
  add([["일자", "건수", "수량", "정상가", "기본할인", "프로모션", "예외할인", "판매금액", "실결제", "환불", "순매출", "현장수령", "택배", "사전구매"], ...days.map(d => [d.day, d.n, d.qty, d.gross, d.baseDisc, d.promo, d.exc, d.total, d.paid, d.refund, d.netSales, d.byType.pickup, d.byType.ship, d.byType.pre])], "일매출");
  const d2 = [["판매시각", "주문번호", "주문상태", "판매유형", "주문자", "연락처", "상품코드", "바코드", "상품명", "컬러", "사이즈", "수량", "취소수량", "정상가", "기본할인가", "프로모션", "예외할인", "예외할인 사유", "최종금액", "발주", "실결제(주문)", "메모(주문)", "담당", "교환 원주문"]];
  for (const s of [...S.sales].sort((a, b) => a.ts - b.ts)) s.items.forEach((it, k) => d2.push([full(s.ts), s.orderNo || s.id, { done: "판매", partial: "부분취소", canceled: "전체취소" }[s.state], TYPES[it.type], s.custName || "", s.custPhone || "", it.ez, it.bc, it.name, it.color, it.size, it.qty, it.cq, it.price, it.unit, it.promo, it.exc, it.excInfo ? it.excInfo.reason : (s.orderExc && it.exc ? "주문 할인: " + s.orderExc.reason : ""), it.net, it.type === "pickup" ? "" : it.exp ? "등록 " + full(it.exp.ts) : "대기", k ? "" : s.paid, k ? "" : s.memo || "", s.by || "", s.exchangeOf ? s.exchangeOf.orderNo : ""]));
  add(d2, "판매상세");
  const d3 = [["처리일시", "주문번호", "구분", "상품", "옵션", "수량", "처리", "환불금액(건)", "사유", "처리자"]];
  for (const s of S.sales) for (const c of s.cancels) c.lines.forEach((l, k) => { const it = s.items[l.i] || {}; d3.push([full(c.ts), s.orderNo || s.id, c.kind === "exchange" ? "교환" : "취소", it.name, `${it.color} / ${it.size}`, l.qty, DISP[l.disp] || (l.disp === "ezcancel" ? "이지어드민 발주 취소" : "발주 전 취소"), k ? "" : c.refund, k ? "" : c.reason, k ? "" : c.by]); });
  add(d3, "취소환불");
  const d4 = [["상품코드", "바코드", "품목코드", "상품명", "컬러", "사이즈", "정상가", "할인율", "초기입고", "추가입고", "현장판매", "취소복구", "불량분리", "현재고"]];
  for (const p of S.products) { const a = L.init[p.bc] || 0, b = L.inQ[p.bc] || 0, c = L.sold[p.bc] || 0; if (!a && !b && !c) continue; d4.push([p.ez, p.bc, p.code, p.name, p.color, p.size, p.price, p.disc, a, b, c, L.back[p.bc] || 0, L.hold[p.bc] || 0, L.stock(p.bc)]); }
  add(d4, "재고현황");
  add([["일시", "구분", "상품코드", "상품명", "컬러", "사이즈", "수량", "기록번호", "담당"], ...movements().map(m => [full(m.ts), m.type, m.p.ez, m.p.name, m.p.color, m.p.size, m.qty, m.ref, m.by || ""])], "재고이동");
  saveFile(`${fileTag()}_매출재고_${stamp()}.xlsx`, XLSX.write(wb, { bookType: "xlsx", type: "array" }));
}

// ---------- 모달 ----------
function openModal(title, body, foot) {
  $("#modal-root").innerHTML = `<div class="modal-bg" id="mbg"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><h3>${esc(title)}</h3><button class="x" data-act="close" aria-label="닫기">×</button></div>
    <div class="modal-b">${body}</div><div class="modal-f">${foot}</div></div></div>`;
  const first = $("#modal-root [data-autofocus]"); if (first) first.focus();
}
function closeModal() { $("#modal-root").innerHTML = ""; }
function openFinder() {
  openModal("상품 찾기", `<input class="input" id="finder-q" style="width:100%" placeholder="상품명, 컬러, 사이즈, 코드로 검색 (예: 후디 블랙 L)" data-autofocus>
    <div class="finder-grid" id="finder-list" style="margin-top:12px"></div>`, `<button class="btn" data-act="close">닫기</button>`);
  renderFinder();
}
function renderFinder() {
  const box = $("#finder-list"); if (!box) return;
  const L = ledger(), q = ($("#finder-q").value || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = S.products.filter(p => { const h = `${p.name} ${p.color} ${p.size} ${p.ez} ${p.bc} ${p.code}`.toLowerCase(); return q.every(w => h.includes(w)); }).slice(0, 80);
  box.innerHTML = hits.map(p => {
    const st = L.stock(p.bc);
    // 정가와 할인가
    const normalPrice = p.normal || p.price;
    const discountPrice = p.discount || p.price;
    return `<button class="card ${st <= 0 ? "zero" : ""}" data-act="finder-pick" data-bc="${p.bc}">
    <div class="t">${esc(p.name)}</div><div class="o">${esc(optLabel(p))} · <span class="mono">${esc(p.ez)}</span></div>
    <div class="p">${won(discountPrice)}원 정가: ${won(normalPrice)}원</div>
    <div class="o">현장 재고 <b class="num">${st}</b>${st <= 0 ? " · 택배로 담겨요" : ""}</div></button>`;
  }).join("") || `<div class="empty"><strong>검색 결과가 없어요</strong>다른 단어로 찾아 보세요.</div>`;
}
function openExc(i) {
  const c = i === "order" ? S.orderExc : S.cart[+i].exc, p = i === "order" ? null : S.byBc[S.cart[+i].bc];
  openModal(i === "order" ? "주문 전체 예외할인" : "상품 예외할인", `
    ${p ? `<p><b>${esc(p.name)}</b> ${esc(optLabel(p))}</p>` : `<p class="note">기본할인·프로모션이 적용된 뒤 남은 금액에서 빠져요.</p>`}
    <div class="form-grid">
      <label>방식<select class="input" id="x-kind"><option value="amt" ${c && c.kind === "amt" ? "selected" : ""}>금액 (원)</option><option value="pct" ${c && c.kind === "pct" ? "selected" : ""}>비율 (%)</option></select></label>
      <label>값<input class="input num" id="x-v" inputmode="numeric" value="${c ? c.v : ""}" placeholder="예: 10000 또는 5" data-autofocus></label>
      <label class="wide">사유 (필수)<input class="input" id="x-reason" value="${esc(c ? c.reason : "")}" placeholder="예: 오픈 이벤트 약속, 오염 상품, 본사 승인 (OOO 팀장)"></label>
    </div>
    <p class="note">적용한 직원(${esc(S.me.name)})과 사유가 리포트에 따로 남아요. 정상가의 ${EXC_WARN_RATE * 100}% 또는 ${won(EXC_WARN_AMT)}원을 넘으면 ⚠ 표시돼요.</p>`,
    `${c ? `<button class="btn" data-act="exc-clear" data-i="${i}">예외할인 빼기</button>` : ""}<button class="btn" data-act="close">닫기</button><button class="btn primary" data-act="exc-save" data-i="${i}">적용</button>`);
}

// ---------- 화면 ----------
const TABS = [["sell", "판매"], ["orders", "주문 조회"], ["ship", "배송 발주"], ["stock", "재고 현황"], ["request", "입고 요청"], ["receive", "입고 반영"], ["price", "가격표"], ["report", "매출·마감"], ["closing", "마감일지"], ["admin", "설정", true]];
function render() {
  if (composing) { renderPending = true; return; }
  const tabs = TABS.filter(t => !t[2] || isHQ());
  if (!tabs.some(t => t[0] === S.tab)) S.tab = "sell";
  $("#tabs").innerHTML = tabs.map(([k, l]) => `<a href="#${k}" data-tab="${k}" ${k === S.tab ? 'aria-current="page"' : ""}>${l}</a>`).join("");
  const main = $("#main");
  if (!S.me) { main.innerHTML = ""; return; }
  $("#who").textContent = `${S.me.name}${isHQ() ? " (본사)" : ""}`;
  if (S.loaded) $("#store-chip").innerHTML = isHQ() ? `<select id="store-sel" aria-label="매장">${S.config.stores.map(s => `<option value="${esc(s.id)}" ${s.id === S.store ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : esc(storeCfg().name);
  if (!S.loaded) { main.innerHTML = `<div class="empty"><strong>데이터를 불러오는 중이에요</strong>잠시만 기다려 주세요.</div>`; return; }
  if (!S.products.length && S.tab !== "price") { main.innerHTML = `<div class="empty"><strong>상품 마스터가 아직 없어요</strong>본사에서 상품 목록을 등록하면 판매를 시작할 수 있어요.</div>`; return; }
  const keepFocus = document.activeElement && document.activeElement.id;
  const caret = document.activeElement && document.activeElement.selectionStart;
  main.innerHTML = ({ sell: viewSell, orders: viewOrders, ship: viewShip, stock: viewStock, request: viewRequest, receive: viewReceive, price: viewPrice, report: viewReport, closing: viewClosing, admin: viewAdmin }[S.tab])();
  strip();
  if (keepFocus && document.getElementById(keepFocus)) { const el = document.getElementById(keepFocus); el.focus(); try { if (caret != null) el.setSelectionRange(caret, caret); } catch (e) {} }
  else if (S.tab === "sell" && !$("#modal-root").innerHTML) { const sc = $("#scan"); if (sc) sc.focus(); }
}
function strip() {
  const L = ledger(), today = dayKey(Date.now()), td = dailyRows().find(d => d.day === today);
  const stock = sum(S.products, p => Math.max(0, L.stock(p.bc)));
  const todo = shipLines().filter(x => !x.it.exp && x.left > 0).length;
  $("#strip").textContent = `${storeCfg().name} · 오늘 ${td ? td.n : 0}건 ${won(td ? td.netSales : 0)}원 · 매장 재고 ${stock}개${todo ? ` · 발주 대기 ${todo}줄` : ""}${S.exchange ? ` · 교환 진행 중(${S.exchange.orderNo})` : ""}`;
}

function viewSell() {
  const L = ledger(), pr = priceCart(S.cart, S.orderExc), today = dayKey(Date.now());
  const rows = pr.lines.map((l, i) => {
    const p = l.p, c = l.c, short = c.type === "pickup" && L.stock(p.bc) < cartPickup(p.bc);
    return `<tr class="${short ? "out" : ""}">
      <td class="c"><span class="type-seg">${Object.entries(TYPES).map(([k, v]) => `<button class="t-${k}" data-act="ctype" data-i="${i}" data-t="${k}" aria-pressed="${c.type === k}">${v.slice(0, 2)}</button>`).join("")}</span>${short ? `<div class="note bad-txt">현장 재고 ${L.stock(p.bc)}</div>` : ""}</td>
      <td class="name-cell"><b>${esc(p.name)}</b>${c.via === "search" ? ` <span class="chip warn">검색으로 담음</span>` : ""}<div class="note mono">${esc(p.ez)} · ${esc(p.bc)}</div>${c.type === "pre" ? `<div class="note warn-txt">${esc(preNote(p))}</div>` : ""}</td>
      <td><b>${esc(p.color)}</b> / <b>${esc(p.size)}</b></td>
      <td class="c"><span class="qty"><button data-act="cq" data-i="${i}" data-d="-1" aria-label="수량 빼기">−</button><b class="num">${c.qty}</b><button data-act="cq" data-i="${i}" data-d="1" aria-label="수량 더하기">+</button></span></td>
      <td class="r num">${won(p.normal)}</td><td class="r num">${won(l.unit)}</td>
      <td class="r">${p.disc ? `${Math.round(p.disc * 100)}%` : `<span class="chip">할인제외</span>`}${l.promo ? `<div class="note" style="color:var(--go)">+프로모션 ${won(l.promo)}</div>` : ""}${l.exc ? `<div class="note warn-txt">예외 ${won(l.exc)}</div>` : ""}</td>
      <td class="r num"><b>${won(l.net)}</b></td>
      <td class="c"><button class="btn sm" data-act="exc" data-i="${i}">할인</button> <button class="btn sm" data-act="cdel" data-i="${i}">삭제</button></td></tr>`;
  }).join("");
  const todays = S.sales.filter(s => s.day === today).sort((a, b) => b.ts - a.ts);
  const promo = pr.promo || {};
  return `${S.exchange ? `<div class="banner warn" style="margin-bottom:12px">교환 진행 중 · 원주문 ${esc(S.exchange.orderNo)} · 새 상품을 담아 판매 확정하면 두 주문이 연결돼요. <button class="btn sm" data-act="exch-stop">교환 연결 해제</button></div>` : ""}
  <div class="cols">
    <section class="panel">
      <div class="scroll" style="max-height:52vh;min-height:260px"><table>
        <thead><tr><th class="c">판매 유형</th><th>상품명</th><th>컬러 / 사이즈</th><th class="c">수량</th><th class="r">정상가</th><th class="r">할인가</th><th class="r">할인</th><th class="r">금액</th><th class="c">작업</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="9"><div class="empty"><strong>바코드를 찍으면 여기에 담겨요</strong>현장 재고가 없는 상품은 택배배송으로 담겨요. 유형은 줄마다 바꿀 수 있어요.</div></td></tr>`}</tbody>
      </table></div>
      <div class="totals"><span>총 수량 <b>${pr.qty}</b></span><span class="amt">판매금액 <b>${won(pr.total)}</b></span></div>
      <div class="panel-b" style="border-top:1px solid var(--line)"><div class="btn-grid">
        <button class="btn yellow" data-act="cart-clear" ${S.cart.length ? "" : "disabled"}>초기화</button>
        <button class="btn dark" data-act="goto" data-tab="orders">주문 조회</button>
        <button class="btn primary" data-act="sale-confirm" ${S.cart.length ? "" : "disabled"}>판매 확정</button>
      </div></div>
    </section>
    <aside class="view">
      <section class="panel"><div class="panel-b view" style="gap:8px">
        <form class="scan-row" id="scan-form" autocomplete="off"><input class="input" id="scan" placeholder="바코드 스캔" inputmode="numeric" aria-label="바코드 스캔"><button class="btn dark" type="submit">스캔</button></form>
        <button class="btn" data-act="finder">상품 찾기</button>
      </div>
      ${promo.on ? `<div class="promo-hint">${pr.hit ? `<b>프로모션 적용</b> · ${esc(promoLabel(promo))}` : `${esc(promoLabel(promo))} · <b style="color:var(--warn)">${won(pr.gap)}원 더 담으면 적용</b>`}</div>` : ""}
      <div class="sum">
        <div class="k sub">정상가 합계</div><div class="v sub">${won(pr.gross)}</div>
        <div class="k sub">기본 할인</div><div class="v sub">−${won(pr.baseDisc)}</div>
        <div class="k sub">프로모션</div><div class="v sub">−${won(pr.promoTotal)}</div>
        <div class="k sub">예외 할인</div><div class="v sub" style="${pr.excTotal ? "color:var(--warn)" : ""}">−${won(pr.excTotal)}${pr.warn ? " ⚠" : ""}</div>
        ${pr.empDiscAmt ? `<div class="k sub">임직원 할인</div><div class="v sub" style="color:var(--go)">−${won(pr.empDiscAmt)}</div>` : ""}
        <div class="k pay">판매금액</div><div class="v pay">${won(pr.total)}</div>
      </div>
      <div class="panel-b"><button class="btn sm" data-act="exc" data-i="order" ${S.cart.length ? "" : "disabled"}>${S.orderExc ? `주문 예외할인 수정 (${S.orderExc.kind === "pct" ? S.orderExc.v + "%" : won(S.orderExc.v) + "원"})` : "주문 전체 예외할인"}</button></div>
      <div class="panel-b" style="display:flex;gap:8px;align-items:center"><button class="btn sm primary" data-act="emp-disc" ${S.cart.length ? "" : "disabled"} style="${S.orderEmpDisc ? "" : "opacity:0.6"}">임직원 추가 할인 5%${S.orderEmpDisc ? " ✓" : ""}</button><label class="check" style="margin:0"><input type="checkbox" id="emp-verified" ${S.empVerified ? "checked" : ""} data-act="emp-verify"> <span>사원증 확인</span></label></div></section>
      <section class="panel">
        <div class="panel-h"><h2>오늘 판매</h2><span class="sub">${todays.length}건</span></div>
        <div class="list scroll" style="max-height:40vh">${todays.map(s => `<div class="list-item">
          <span class="num meta">${hm(s.ts)}</span>
          <span class="grow ${s.state === "canceled" ? "canceled" : ""}">${esc(saleSummary(s))}<div class="meta">${esc(displayOrderNo(s.orderNo) || "")}${s.custName ? ` · ${esc(s.custName)}` : ""} · ${typeChips(s)}</div></span>
          <span class="num">${won(s.total - s.refunded)}</span>
          <button class="btn sm" data-act="order" data-id="${s.id}">보기</button>
        </div>`).join("") || `<div class="empty">아직 오늘 판매가 없어요.</div>`}</div>
      </section>
    </aside></div>`;
}
function openConfirm() {
  const short = pickupShort();
  const pr = priceCart(S.cart, S.orderExc), needShip = S.cart.some(c => c.type !== "pickup"), searched = S.cart.some(c => c.via === "search");
  openModal("판매 확정", `
    <div class="note">주문번호 <b class="num">${displayOrderNo(nextOrderNo())}</b> (확정 시 부여)${S.exchange ? ` · <b>교환 원주문 ${esc(displayOrderNo(S.exchange.orderNo))}</b>` : ""}</div>
    <div class="confirm-big">${pr.qty}개 · ${won(pr.total)}원</div>
    ${pr.lines.map((l, i) => `<div class="confirm-line ${l.c.via === "search" ? "search" : ""}">
      <div><div class="note">${esc(l.p.name)} · <span class="chip t-${l.c.type}">${TYPES[l.c.type]}</span>${l.c.via === "search" ? ` <span class="chip warn">검색으로 담음 · 실물 택 확인</span>` : ""}</div>
        <div class="opt-big">${esc(l.p.color)} / <span class="c">${esc(l.p.size)}</span> <span class="num" style="font-size:16px">×${l.c.qty}</span></div></div>
      <div class="r num"><b>${won(l.net)}</b></div></div>`).join("")}
    ${searched ? `<label class="check" style="margin-top:8px"><input type="checkbox" id="f-optok"> <b>검색으로 담은 상품의 컬러·사이즈를 실물 택과 대조했어요</b></label>` : ""}
    ${pr.promoTotal || pr.excTotal ? `<p class="note">기본할인 ${won(pr.baseDisc)} · 프로모션 ${won(pr.promoTotal)} · 예외할인 ${won(pr.excTotal)}${pr.warn ? " ⚠ 한도 초과(리포트 표시)" : ""}</p>` : ""}
    <div class="box"><h4>주문자</h4><div class="form-grid">
      <label>주문자 성함${needShip ? " (필수)" : ""}<input class="input" id="f-name" autocomplete="off" placeholder="예: 홍길동"></label>
      <label>연락처${needShip ? " (필수)" : " (주문 조회용, 권장)"}<input class="input" id="f-phone" inputmode="tel" autocomplete="off" placeholder="010-1234-5678"></label>
    </div></div>
    ${needShip ? `<div class="box"><h4>배송 정보 (택배·사전구매)</h4><div class="form-grid">
      <label>수령자<input class="input" id="f-rname" placeholder="비우면 주문자와 같아요"></label>
      <label>수령자 연락처<input class="input" id="f-rphone" inputmode="tel" placeholder="비우면 주문자와 같아요"></label>
      <label class="wide">주소 (필수)<input class="input" id="f-addr" placeholder="도로명 주소 + 상세 주소"></label>
      <label class="wide">배송 메모<input class="input" id="f-smemo" placeholder="예: 부재 시 경비실"></label>
    </div>
    <label class="check" style="margin-top:8px"><input type="checkbox" id="f-consent"> <span><b>[필수] 개인정보 수집·이용 동의를 받았어요</b><br><span class="note">수집 항목: 이름, 연락처, 주소 · 목적: 상품 배송, 주문·교환·환불 안내 · 보관: 팝업 종료 후 3개월 뒤 파기 · 배송을 위해 택배사·물류사에 제공돼요. 고객에게 이 내용을 읽어 주고 동의를 받으세요.</span></span></label></div>` : ""}
    <div class="box"><h4>결제 기록 (실결제는 백화점 단말기)</h4><div class="form-grid">
      <label>더현대 영수증 NO (선택)<input class="input" id="f-receipt-no" placeholder="예: 9151-0121" autocomplete="off"></label>
      <label>실결제금액 (원)<input class="input num" id="f-paid" inputmode="numeric" value="${pr.total}"></label>
      <label>메모<input class="input" id="f-memo" placeholder="예: 복합결제, 임직원 할인, 현금영수증 번호 이슈"></label>
    </div><p class="note">백화점 영수증의 NO 번호를 입력하면 반품 시 정확히 매칭돼요. 임직원 할인·카드 할인권 등으로 실제 결제금액이 다르면 고쳐 주세요.</p></div>`,
    `<button class="btn" data-act="close">돌아가기</button><button class="btn primary" data-act="sale-commit">판매 확정</button>`);
  const ph = ["#f-phone", "#f-rphone"].map(s => $(s)).filter(Boolean);
  ph.forEach(x => x.addEventListener("input", () => { x.value = fmtPhone(x.value); }));
  $("#f-name").focus();
}
function readConfirm() {
  const v = id => ($(id) ? $(id).value.trim() : "");
  const needShip = S.cart.some(c => c.type !== "pickup");
  const short = pickupShort();
  const f = { name: v("#f-name"), phone: fmtPhone(v("#f-phone")), paid: parseInt(digits(v("#f-paid")), 10) || 0, memo: v("#f-memo"), hyundaiReceiptNo: v("#f-receipt-no") || null };
  if ($("#f-optok") && !$("#f-optok").checked) return { err: "검색으로 담은 상품의 컬러·사이즈를 확인하고 체크해 주세요." };
  if (short.length && !f.memo) return { err: "현장 재고 부족: 메모에 사유를 필수 작성해 주세요." };
  if (needShip) {
    Object.assign(f, { rname: v("#f-rname") || f.name, rphone: fmtPhone(v("#f-rphone")) || f.phone, addr: v("#f-addr"), smemo: v("#f-smemo") });
    if (!f.name || digits(f.phone).length < 9) return { err: "택배·사전구매는 주문자 성함과 연락처가 필요해요." };
    if (f.addr.length < 6) return { err: "배송 주소를 입력해 주세요." };
    if (!$("#f-consent").checked) return { err: "개인정보 수집·이용 동의를 받고 체크해 주세요." };
  }
  return f;
}

function viewOrders() {
  const list = findOrders(S.lookupQ);
  const byDate = {};
  list.forEach(s => { const d = dayKey(s.ts); (byDate[d] = byDate[d] || []).push(s); });
  const rows = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).flatMap(([date, orders]) => {
    const dateRow = `<tr style="background:#2a2f38"><td colspan="10" style="padding:8px;font-weight:bold;color:#4a9eff">${date}</td></tr>`;
    const orderRows = orders.map(s => `<tr>
        <td class="num">${hm(s.ts)}</td><td class="mono">${esc(displayOrderNo(s.orderNo) || s.id)}${s.exchangeOf ? `<div class="note">← 교환 대상</div>` : ""}${s.exchangeTo && s.exchangeTo.length ? `<div class="note">교환 →</div>` : ""}</td>
        <td class="mono" style="color:#4a9eff">${s.hyundaiReceiptNo ? esc(s.hyundaiReceiptNo) : `<button class="btn sm orange" data-act="receipt-edit" data-id="${s.id}">영수증 NO 입력</button>`}</td>
        <td>${esc(s.custName || "—")}<div class="note">${esc(s.custPhone || "")}</div></td>
        <td class="name-cell">${esc(saleSummary(s))}${s.excWarn ? ` <span class="chip warn">⚠ 예외할인</span>` : ""}${s.memo ? ` <span class="chip">메모</span>` : ""}${s.exchangeOf ? `<div class="note" style="color:var(--warn)">교환 처리 중</div>` : ""}</td>
        <td>${typeChips(s)}</td><td class="r num">${won(s.total)}</td><td class="r num">${s.refunded ? won(s.refunded) : ""}</td><td>${stateChip(s)}</td>
        <td><button class="btn sm" data-act="order" data-id="${s.id}">열기</button></td></tr>`).join("");
    return dateRow + orderRows;
  });
  return `<section class="panel">
    <div class="panel-h"><h2>주문 조회</h2><span class="sub">날짜별로 정렬됨 · 영수증NO, 연락처 뒤 4자리, 주문번호, 이름으로 검색</span>
      <div class="filters spacer"><input class="input" id="lookup-q" placeholder="예: 9151-0121 · 5678 · C261120-003" value="${esc(S.lookupQ)}" style="min-width:260px"></div></div>
    <div class="scroll" style="max-height:72vh"><table>
      <thead><tr><th style="width:50px">시간</th><th>주문번호</th><th style="color:#4a9eff">영수증NO</th><th>주문자</th><th>상품</th><th>유형</th><th class="r">판매금액</th><th class="r">환불</th><th>상태</th><th style="width:60px"></th></tr></thead>
      <tbody>${rows.length ? rows.join("") : `<tr><td colspan="10"><div class="empty">찾는 주문이 없어요.</div></td></tr>`}</tbody>
    </table></div></section>`;
}

function viewShip() {
  const all = shipLines(), m = S.shipMode;
  const todo = all.filter(x => !x.it.exp && x.left > 0), done = all.filter(x => x.it.exp), cancelNeed = all.filter(x => (x.it.ezc || 0) > (x.it.ezcDone || 0));
  const list = m === "todo" ? todo : m === "done" ? done : cancelNeed;
  const batches = [...new Set(done.map(x => x.it.exp.batch))].sort().reverse();
  return `<div class="kpis">
    <div class="kpi"><div class="l">발주 대기</div><div class="n">${todo.length}</div><div class="s">택배 ${todo.filter(x => x.it.type === "ship").length} · 사전구매 ${todo.filter(x => x.it.type === "pre").length}줄</div></div>
    <div class="kpi"><div class="l">발주 등록 완료</div><div class="n">${done.length}</div><div class="s">${batches.length}회 내보냄</div></div>
    <div class="kpi"><div class="l">이지어드민 발주 취소 필요</div><div class="n" style="color:${cancelNeed.length ? "var(--bad)" : "inherit"}">${cancelNeed.length}</div><div class="s">발주 등록 후 취소·교환된 건</div></div>
  </div>
  <section class="panel">
    <div class="panel-h"><h2>배송 발주</h2>
      <div class="seg" role="group">${[["todo", "발주 대기"], ["done", "등록 완료"], ["cancel", "발주 취소 필요"]].map(([k, l]) => `<button data-act="ship-mode" data-m="${k}" aria-pressed="${m === k}">${l}</button>`).join("")}</div>
      <div class="filters spacer">${isHQ() ? `<button class="btn go" data-act="ship-export" ${todo.length ? "" : "disabled"}>발주 대기 ${todo.length}줄 엑셀로 내보내기</button>` : `<span class="note">발주 내보내기는 본사 계정에서 해요</span>`}</div></div>
    <div class="panel-b note">이지어드민 수기발주 양식(발송일·주문번호·상품코드·품목코드·상품명·옵션·수량·수령자명·수령자전화번호·수령자주소·메모)으로 내보내요. 주문번호는 POS 번호를 양식 형태로 바꿔 넣고(C261127-001 → 261127_C001), 메모는 ‘판매일_매장명 출고’예요. 택배와 사전구매는 파일이 따로 나가고(사전구매 주문번호 끝에 P), 같은 주문번호끼리 합포돼요. 내보낸 줄은 ‘등록 완료’로 바뀌어 다시 나가지 않아요(중복 발주 방지).</div>
    <div class="scroll" style="max-height:60vh"><table>
      <thead><tr><th>주문번호</th><th>유형</th><th>수령자</th><th>주소</th><th>상품</th><th class="r">수량</th><th>상태</th><th></th></tr></thead>
      <tbody>${list.map(x => `<tr><td class="mono"><button class="btn sm" data-act="order" data-id="${x.s.id}">${esc(displayOrderNo(x.s.orderNo))}</button></td>
        <td><span class="chip t-${x.it.type}">${TYPES[x.it.type]}</span></td>
        <td>${esc((x.s.ship || {}).name || x.s.custName)}<div class="note">${esc((x.s.ship || {}).phone || "")}</div></td>
        <td class="name-cell note">${esc((x.s.ship || {}).addr || "—")}</td>
        <td class="name-cell">${esc(x.it.name)} <b>${esc(x.it.color)} / ${esc(x.it.size)}</b>${x.it.note ? `<div class="note">${esc(x.it.note)}</div>` : ""}</td>
        <td class="r num">${m === "cancel" ? (x.it.ezc - (x.it.ezcDone || 0)) : m === "done" ? x.it.exp.qty : x.left}</td><td>${lineState(x.it)}</td>
        <td>${m === "cancel" && isHQ() ? `<button class="btn sm" data-act="ezc-done" data-id="${x.s.id}" data-i="${x.i}">처리 완료</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="8"><div class="empty">해당하는 건이 없어요.</div></td></tr>`}</tbody>
    </table></div>
    ${m === "done" && batches.length ? `<div class="panel-b filters"><span class="note">지난 발주 파일 다시 받기:</span>${batches.map(b => `<button class="btn sm" data-act="ship-batch" data-b="${b}">${b.slice(1)}</button>`).join("")}</div>` : ""}
  </section>`;
}

function stockRows(filterFn, extra) {
  const L = ledger(); let html = "", last = "";
  for (const p of S.products) {
    if (!filterFn(p, L)) continue;
    if (p.name !== last) { last = p.name; html += `<tr class="group"><td colspan="${extra.span}">${esc(p.name)} <span class="note">${won(p.price)}원 · ${p.disc ? `${Math.round(p.disc * 100)}% 할인` : "할인제외"}</span></td></tr>`; }
    html += extra.row(p, L);
  }
  return html;
}
function viewStock() {
  const L = ledger(), f = S.stockFilter, q = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const carried = S.products.filter(p => (L.init[p.bc] || 0) + (L.inQ[p.bc] || 0) > 0);
  const totalNow = sum(carried, p => L.stock(p.bc));
  const outN = carried.filter(p => L.stock(p.bc) <= 0).length, lowN = carried.filter(p => L.stock(p.bc) > 0 && L.stock(p.bc) <= S.lowLine).length;
  const fil = (p, L) => {
    if (f.mode !== "every" && (L.init[p.bc] || 0) + (L.inQ[p.bc] || 0) + (L.sold[p.bc] || 0) === 0) return false;
    const st = L.stock(p.bc);
    if (f.mode === "out" && st > 0) return false;
    if (f.mode === "low" && st > S.lowLine) return false;
    return q.every(w => `${p.name} ${p.color} ${p.size} ${p.ez} ${p.bc} ${p.code}`.toLowerCase().includes(w));
  };
  const rows = stockRows(fil, { span: 10, row: (p, L) => { const st = L.stock(p.bc); return `<tr class="${st <= 0 ? "out" : st <= S.lowLine ? "low" : ""}">
    <td>${esc(p.color)}</td><td>${esc(p.size)}</td><td class="mono">${esc(p.bc)}</td>
    <td class="r num">${L.init[p.bc] || 0}</td><td class="r num">${L.inQ[p.bc] || 0}</td><td class="r num">${L.net(p.bc)}</td><td class="r num">${L.hold[p.bc] || ""}</td>
    <td class="r num"><b>${st}</b></td><td class="c">${st <= 0 ? `<span class="chip bad">품절</span>` : st <= S.lowLine ? `<span class="chip warn">부족</span>` : `<span class="chip go">정상</span>`}</td><td class="c"><button class="btn sm" data-act="stock-adjust" data-bc="${p.bc}">조정</button></td></tr>`; } });
  return `<div class="kpis">
      <div class="kpi"><div class="l">현재 매장 재고</div><div class="n">${totalNow}</div><div class="s">${carried.length}개 SKU</div></div>
      <div class="kpi"><div class="l">초기 입고</div><div class="n">${sum(Object.values(L.init))}</div></div>
      <div class="kpi"><div class="l">추가 입고</div><div class="n">${sum(Object.values(L.inQ))}</div></div>
      <div class="kpi"><div class="l">현장 판매 (취소 복구 제외)</div><div class="n">${sum(Object.values(L.sold)) - sum(Object.values(L.back))}</div><div class="s">택배·사전구매는 본사 재고에서 나가요</div></div>
      <div class="kpi"><div class="l">품절 · 부족</div><div class="n" style="color:var(--bad)">${outN} · <span style="color:var(--warn)">${lowN}</span></div><div class="s">불량 분리 ${sum(Object.values(L.hold))}개</div></div>
    </div>
    <section class="panel">
      <div class="panel-h"><h2>재고 현황</h2>
        <div class="filters spacer">
          <input class="input" id="stock-q" placeholder="상품명 · 컬러 · 코드 검색" value="${esc(f.q)}">
          <div class="seg" role="group">${[["all", "입고 상품"], ["low", "부족"], ["out", "품절"], ["every", "전체 상품"]].map(([k, l]) => `<button data-act="stock-mode" data-m="${k}" aria-pressed="${f.mode === k}">${l}</button>`).join("")}</div>
          <label class="note">부족 기준 <select class="input" id="low-line">${[0, 1, 2, 3].map(n => `<option value="${n}" ${n === S.lowLine ? "selected" : ""}>${n ? n + "개 이하" : "품절만"}</option>`).join("")}</select></label>
        </div></div>
      <div class="scroll" style="max-height:70vh"><table>
        <thead><tr><th>컬러</th><th>사이즈</th><th>바코드</th><th class="r">초기</th><th class="r">입고</th><th class="r">현장판매</th><th class="r">불량분리</th><th class="r">현재고</th><th class="c">상태</th><th class="c">관리</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="10"><div class="empty">조건에 맞는 상품이 없어요.</div></td></tr>`}</tbody></table></div>
    </section>`;
}

function viewRequest() {
  const L = ledger(), f = S.reqFilter, q = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const items = reqItems(), totalQ = sum(items, i => i.qty);
  const fil = (p, L) => {
    if (S.reqDraft[p.bc] > 0) return true;
    if (f.mode === "sold" && !L.net(p.bc)) return false;
    if (f.mode === "carried" && !((L.init[p.bc] || 0) + (L.inQ[p.bc] || 0))) return false;
    return q.every(w => `${p.name} ${p.color} ${p.size} ${p.ez} ${p.bc}`.toLowerCase().includes(w));
  };
  const rows = stockRows(fil, { span: 6, row: (p, L) => { const st = L.stock(p.bc), v = S.reqDraft[p.bc] || 0; return `<tr class="${st <= 0 ? "out" : ""}">
    <td>${esc(p.color)} / ${esc(p.size)}</td><td class="mono">${esc(p.ez)}</td><td class="r num">${L.net(p.bc)}</td><td class="r num"><b>${st}</b></td>
    <td class="c"><span class="qty"><button data-act="rq" data-bc="${p.bc}" data-d="-1">−</button><input class="input qty-input" id="rq-${p.bc}" data-rq="${p.bc}" value="${v || ""}" inputmode="numeric" placeholder="0"><button data-act="rq" data-bc="${p.bc}" data-d="1">+</button></span></td>
    <td class="c">${v ? `<span class="chip info">요청 ${v}</span>` : ""}</td></tr>`; } });
  const reqs = [...S.requests].sort((a, b) => b.ts - a.ts);
  return `<div class="cols">
    <section class="panel">
      <div class="panel-h"><h2>입고 요청 만들기</h2><span class="sub">본사에 요청할 상품과 수량을 고르세요</span>
        <div class="filters spacer">
          <input class="input" id="req-q" placeholder="검색" value="${esc(f.q)}">
          <div class="seg" role="group">${[["sold", "판매된 상품"], ["carried", "입고 상품"], ["all", "전체 상품"]].map(([k, l]) => `<button data-act="req-mode" data-m="${k}" aria-pressed="${f.mode === k}">${l}</button>`).join("")}</div>
          <button class="btn sm" data-act="req-fill">판매된 만큼 채우기</button><button class="btn sm" data-act="req-reset">비우기</button>
        </div></div>
      <div class="scroll" style="max-height:44vh"><table>
        <thead><tr><th>옵션</th><th>이지어드민</th><th class="r">현장판매</th><th class="r">현재고</th><th class="c">요청 수량</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6"><div class="empty"><strong>아직 판매된 상품이 없어요</strong>‘입고 상품’이나 ‘전체 상품’을 눌러 고를 수 있어요.</div></td></tr>`}</tbody></table></div>
      <div class="req-cart">
        <div class="req-cart-h"><b>요청 목록</b><span class="note">${items.length ? `${items.length}개 품목 · 총 ${totalQ}개 담김` : "위 표에서 + 를 누르면 여기에 담겨요"}</span></div>
        ${items.length ? `<div class="scroll" style="max-height:30vh"><table><thead><tr><th>상품명</th><th>옵션</th><th>이지어드민</th><th class="r">현재고</th><th class="c">요청 수량</th><th class="c">작업</th></tr></thead>
          <tbody>${items.map(i => { const p = S.byBc[i.bc]; return `<tr><td class="name-cell"><b>${esc(p.name)}</b></td><td>${esc(optLabel(p))}</td><td class="mono">${esc(p.ez)}</td><td class="r num">${L.stock(p.bc)}</td>
            <td class="c"><span class="qty"><button data-act="rq" data-bc="${p.bc}" data-d="-1">−</button><b class="num" style="min-width:28px;display:inline-block">${i.qty}</b><button data-act="rq" data-bc="${p.bc}" data-d="1">+</button></span></td>
            <td class="c"><button class="btn sm" data-act="rdel" data-bc="${p.bc}">삭제</button></td></tr>`; }).join("")}</tbody></table></div>` : ""}
      </div>
      <div class="panel-b" style="border-top:1px solid var(--line);display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <input class="input" id="req-memo" style="flex:1;min-width:200px" placeholder="메모 (예: 주말 대비 다운 재킷 보충)" value="${esc(S.reqMemo)}">
        <span><b class="num">${items.length}</b>개 품목 · 총 <b class="num">${totalQ}</b>개</span>
        <button class="btn primary" data-act="req-confirm" ${items.length ? "" : "disabled"}>입고 요청 전표 만들기</button>
      </div>
    </section>
    <section class="panel">
      <div class="panel-h"><h2>요청 기록</h2><span class="sub">요청 → 출고확인(본사) → 입고완료</span></div>
      <div class="list">${reqs.map(r => `<div class="list-item">
        <span class="grow"><b>${mdhm(r.ts)}</b> · ${r.items.length}개 품목 ${r.qty}개<div class="meta">${esc(r.by || "")}${r.memo ? ` · ${esc(r.memo)}` : ""}</div></span>
        <span class="chip ${r.status === "입고완료" ? "go" : r.status === "출고확인" ? "info" : "warn"}">${r.status}</span>
        <span style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn sm" data-act="req-view" data-id="${r.id}">보기</button><button class="btn sm" data-act="req-slip" data-id="${r.id}">전표 받기</button>
          ${r.status === "요청" && isHQ() ? `<button class="btn sm" data-act="req-ack" data-id="${r.id}">출고확인</button>` : ""}
        </span></div>`).join("") || `<div class="empty">아직 입고 요청이 없어요.</div>`}</div>
    </section></div>`;
}

function viewReceive() {
  const L = ledger(), up = S.upload;
  let pre = "";
  if (up && up.error) pre = `<div class="panel-b"><div class="banner bad">${esc(up.error)}</div></div>`;
  else if (up) {
    const dup = S.receipts.find(r => r.sig && r.sig === up.sig);
    const open = S.requests.filter(r => r.status !== "입고완료").sort((a, b) => b.ts - a.ts);
    const got = sum(up.items, i => i.got);
    pre = `<div class="panel-b view" style="gap:10px">
      <div class="filters"><b>${esc(up.fileName)}</b><span class="chip">수량 열: ${esc(up.qName)}</span><span class="chip go">전표 ${up.qty}개 · 받은 수량 ${got}개</span>${up.bad.length ? `<span class="chip bad">매칭 안 됨 ${up.bad.length}행</span>` : ""}</div>
      ${dup ? `<div class="banner warn">같은 내용의 입고가 ${mdhm(dup.ts)}에 이미 반영됐어요. 같은 전표를 두 번 올린 건 아닌지 확인해 주세요.</div>` : ""}
      <div class="banner info">상자를 열어 실물을 세고, 전표와 다르면 ‘받은 수량’을 고쳐 주세요. 받은 수량만 재고에 더해져요.</div>
      <label class="filters">연결할 입고 요청 <select class="input" id="up-req"><option value="">연결 안 함</option>${open.map(r => `<option value="${r.id}" ${up.requestId === r.id ? "selected" : ""}>${mdhm(r.ts)} · ${r.items.length}개 품목 ${r.qty}개 (${r.status})</option>`).join("")}</select></label>
      <div class="scroll" style="max-height:48vh"><table><thead><tr><th>상품</th><th>옵션</th><th>이지어드민</th><th class="r">현재고</th><th class="r">전표</th><th class="c">받은 수량</th><th class="r">반영 후</th></tr></thead><tbody>
        ${up.items.map((i, k) => { const p = S.byBc[i.bc], st = L.stock(i.bc); return `<tr class="${i.got !== i.qty ? "low" : ""}"><td class="name-cell">${esc(p.name)}</td><td>${esc(optLabel(p))}</td><td class="mono">${esc(p.ez)}</td><td class="r num">${st}</td><td class="r num">${i.qty}</td><td class="c"><input class="input qty-input" data-upq="${k}" value="${i.got}" inputmode="numeric"></td><td class="r num"><b>${st + i.got}</b></td></tr>`; }).join("")}
        ${up.bad.map(b => `<tr class="unmatched"><td colspan="4">${b.row}행 · 코드 <span class="mono">${esc(b.code || "(비어 있음)")}</span> — 상품 마스터에 없는 코드라 제외돼요</td><td class="r num">${b.qty}</td><td></td><td></td></tr>`).join("")}
      </tbody></table></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn" data-act="up-clear">다시 고르기</button><button class="btn go" data-act="up-confirm" ${got ? "" : "disabled"}>재고 추가</button></div>
    </div>`;
  }
  const recs = [...S.receipts].sort((a, b) => b.ts - a.ts);
  return `<div class="cols">
    <section class="panel">
      <div class="panel-h"><h2>입고 반영</h2><span class="sub">본사 출고 전표를 올리고, 받은 수량을 확인해 반영해요</span></div>
      <div class="panel-b"><label class="drop" id="drop" for="up-file"><strong>전표 엑셀 파일을 끌어다 놓거나 눌러서 고르세요</strong><br>
        <span class="note">양식: 상품코드 / 요청수량 / 출고수량 (입고수량·출고요청 열도 읽어요). 상품코드는 이지어드민 코드나 바코드 모두 돼요.</span></label>
        <input type="file" id="up-file" accept=".xlsx,.xls,.csv" hidden></div>
      ${pre}
    </section>
    <section class="panel">
      <div class="panel-h"><h2>입고 기록</h2></div>
      <div class="list">${recs.map(r => `<div class="list-item"><span class="grow"><b>${r.kind === "init" ? "초기 입고 · " + esc(r.label) : "추가 입고"}</b><div class="meta">${mdhm(r.ts)} · ${esc(r.by || "")}${r.fileName ? " · " + esc(r.fileName) : ""}${r.slipQty && r.slipQty !== r.qty ? ` · <span class="warn-txt">전표 ${r.slipQty} → 받음 ${r.qty}</span>` : ""}</div></span><span class="num">${r.items.length}품목 · <b>${r.qty ?? sum(r.items, i => i.qty)}</b>개</span></div>`).join("") || `<div class="empty">아직 입고 기록이 없어요.</div>`}</div>
    </section></div>`;
}

function viewReport() {
  const L = ledger(), days = dailyRows(), cd = S.closeDay;
  const cl = days.find(d => d.day === cd) || { n: 0, qty: 0, gross: 0, baseDisc: 0, promo: 0, exc: 0, excN: 0, total: 0, paid: 0, refund: 0, cn: 0, netSales: 0, byType: { pickup: 0, ship: 0, pre: 0 }, memoN: 0 };
  const flagged = S.sales.filter(s => s.day === cd && (s.excDisc || s.memo || s.paid !== s.total));
  const cancels = []; for (const s of S.sales) for (const c of s.cancels) if (dayKey(c.ts) === cd) cancels.push({ s, c });
  const prod = {};
  for (const s of S.sales) for (const it of s.items) { const q = it.qty - it.cq; if (!q) continue; const o = prod[it.name] || (prod[it.name] = { name: it.name, qty: 0, total: 0 }); o.qty += q; o.total += Math.round(it.net / it.qty * q); }
  const top = Object.values(prod).sort((a, b) => b.total - a.total), maxT = Math.max(1, ...top.map(t => t.total));
  const mv = movements().filter(m => !S.reportDay || dayKey(m.ts) === S.reportDay).slice(0, 300);
  const kv = (k, v, cls = "") => `<div class="kpi"><div class="l">${k}</div><div class="n ${cls}" style="font-size:20px">${v}</div></div>`;
  return `<div class="filters"><h2 style="margin:0;font-size:17px">일 마감</h2><input class="input" type="date" id="close-day" value="${cd}"><span class="note">백화점 POS 마감 금액과 ‘실결제금액 합계’를 대조해 주세요</span><button class="btn go spacer" data-act="export">엑셀로 받기 (마감 포함)</button></div>
    <div class="kpis">
      ${kv("판매 건수 · 수량", `${cl.n}건 · ${cl.qty}개`)}${kv("정상가 합계", won(cl.gross))}${kv("기본 할인", won(cl.baseDisc))}${kv("프로모션 할인", won(cl.promo))}
      ${kv(`예외 할인 (${cl.excN}건)`, won(cl.exc), cl.exc ? "warn-txt" : "")}${kv("판매금액", won(cl.total))}${kv("실결제금액 합계", won(cl.paid))}${kv("실결제 − 판매", won(cl.paid - cl.total), cl.paid !== cl.total ? "warn-txt" : "")}
      ${kv(`취소·환불 (${cl.cn}건)`, won(cl.refund), cl.refund ? "bad-txt" : "")}${kv("순매출", won(cl.netSales))}${kv("현장 / 택배 / 사전", `${won(cl.byType.pickup)} / ${won(cl.byType.ship)} / ${won(cl.byType.pre)}`)}
    </div>
    ${flagged.length || cancels.length ? `<section class="panel"><div class="panel-h"><h2>확인할 주문</h2><span class="sub">예외할인 · 메모 · 실결제 차이 · 취소</span></div><div class="list">
      ${flagged.map(s => `<div class="list-item"><span class="num meta">${hm(s.ts)}</span><span class="grow"><b>${esc(displayOrderNo(s.orderNo))}</b> ${esc(saleSummary(s))}<div class="meta">${s.excDisc ? `<span class="warn-txt">예외할인 ${won(s.excDisc)}${s.excWarn ? " ⚠" : ""}</span> · ` : ""}${s.paid !== s.total ? `실결제 ${won(s.paid)} (판매 ${won(s.total)}) · ` : ""}${s.memo ? esc(s.memo) : ""}</div></span><button class="btn sm" data-act="order" data-id="${s.id}">보기</button></div>`).join("")}
      ${cancels.map(({ s, c }) => `<div class="list-item"><span class="num meta">${hm(c.ts)}</span><span class="grow"><span class="chip bad">${c.kind === "exchange" ? "교환" : "취소"}</span> <b>${esc(displayOrderNo(s.orderNo))}</b> 환불 ${won(c.refund)}원<div class="meta">${esc(c.reason || "")} · ${esc(c.by || "")}</div></span><button class="btn sm" data-act="order" data-id="${s.id}">보기</button></div>`).join("")}
    </div></section>` : ""}
    <div class="cols" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
      <section class="panel"><div class="panel-h"><h2>일매출</h2><span class="sub">순매출 = 판매금액 − 그날 환불</span></div>
        <div class="scroll"><table><thead><tr><th>일자</th><th class="r">건수</th><th class="r">판매금액</th><th class="r">실결제</th><th class="r">환불</th><th class="r">순매출</th></tr></thead><tbody>
        ${days.map(d => `<tr><td><button class="btn sm" data-act="cday" data-d="${d.day}">${d.day}</button></td><td class="r num">${d.n}</td><td class="r num">${won(d.total)}</td><td class="r num">${won(d.paid)}</td><td class="r num">${d.refund ? won(d.refund) : ""}</td><td class="r num"><b>${won(d.netSales)}</b></td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">아직 판매 기록이 없어요.</div></td></tr>`}
        </tbody></table></div></section>
      <section class="panel"><div class="panel-h"><h2>상품별 판매</h2><span class="sub">누적, 취소 제외, 금액 순</span></div>
        <div class="scroll" style="max-height:360px"><table><thead><tr><th>상품</th><th class="r">수량</th><th class="r">금액</th><th style="width:30%"></th></tr></thead><tbody>
        ${top.map(t => `<tr><td class="name-cell">${esc(t.name)}</td><td class="r num">${t.qty}</td><td class="r num">${won(t.total)}</td><td><div style="height:8px;border-radius:4px;background:var(--accent);width:${(t.total / maxT * 100).toFixed(1)}%"></div></td></tr>`).join("") || `<tr><td colspan="4"><div class="empty">아직 판매된 상품이 없어요.</div></td></tr>`}
        </tbody></table></div></section>
    </div>
    <section class="panel"><div class="panel-h"><h2>재고 이동 내역 (현장 재고)</h2><span class="sub">${S.reportDay || "전체 기간"} · 최근 ${mv.length}줄</span>
      <div class="filters spacer"><input class="input" type="date" id="rday" value="${S.reportDay}"><button class="btn sm" data-act="rday" data-d="">전체 보기</button></div></div>
      <div class="scroll" style="max-height:50vh"><table><thead><tr><th>일시</th><th>구분</th><th>상품</th><th>옵션</th><th class="r">수량</th><th>기록</th><th>담당</th></tr></thead><tbody>
      ${mv.map(m => `<tr><td class="num">${mdhm(m.ts)}</td><td><span class="chip ${m.type === "판매" ? "bad" : m.type === "취소 복구" ? "warn" : "go"}">${esc(m.type)}</span></td><td class="name-cell">${esc(m.p.name)}</td><td>${esc(m.p.color)} / ${esc(m.p.size)}</td><td class="r num" style="color:${m.qty < 0 ? "var(--bad)" : "var(--go)"}"><b>${m.qty > 0 ? "+" : ""}${m.qty}</b></td><td class="mono note">${esc(m.ref)}</td><td>${esc(m.by || "")}</td></tr>`).join("") || `<tr><td colspan="7"><div class="empty">기록이 없어요.</div></td></tr>`}
      </tbody></table></div></section>`;
}

function viewPrice() {
  // S.products에서 가격 정보 추출 (색상별 모두 표시)
  const priceList = [];
  const seen = new Set();

  for (const p of S.products) {
    if (p.price > 0 && p.name) {
      // 상품명|색상|사이즈 조합을 고유키로 사용
      const key = `${p.name}|${p.color}|${p.size}`;
      if (!seen.has(key)) {
        seen.add(key);
        priceList.push({
          name: p.name,
          color: p.color,
          size: p.size,
          price: p.price,
          category: p.name.split(" ")[0]
        });
      }
    }
  }

  // 상품 목록 (상품명순, 같은 상품끼리 색상별로)
  let priceData = priceList
    .filter(p => p.price > 0)  // 0원 필터링
    .sort((a, b) => {
      // 먼저 색상을 제거한 상품명 기준 정렬
      const cleanA = a.name.replace(/\s+(차콜|블랙|블루|화이트|브라운|카멜|베이지|오렌지|실버)$/, '');
      const cleanB = b.name.replace(/\s+(차콜|블랙|블루|화이트|브라운|카멜|베이지|오렌지|실버)$/, '');
      if (cleanA !== cleanB) return cleanA.localeCompare(cleanB, 'ko');
      // 같은 상품이면 가격순 (높은 가격이 앞)
      return b.price - a.price;
    });

  // 검색 필터링
  const searchId = `price-search-${Date.now()}`;
  const handleSearch = `
    const q = document.getElementById('${searchId}').value.toLowerCase();
    const rows = document.querySelectorAll('.price-row');
    rows.forEach(row => {
      const name = row.textContent.toLowerCase();
      row.style.display = name.includes(q) ? '' : 'none';
    });
  `;

  // 카테고리 색상 & 배지
  const categories = {
    "에일러론": { color: "#2196F3", label: "DOWN" },
    "메리노": { color: "#8B6F47", label: "WOOL" },
    "플랩": { color: "#4CAF50", label: "FLEECE" },
    "제로인": { color: "#FF9800", label: "THERMAL" },
    "이지모드": { color: "#9C27B0", label: "HYBRID" }
  };

  const getCategory = (name) => {
    const cat = name.split(" ")[0];
    return categories[cat] || { color: "#666", label: "OTHER" };
  };

  return `<div class="container" style="padding:20px;max-width:1000px;margin:0 auto">
    <div style="margin-bottom:24px">
      <h2 style="margin:0 0 8px 0;font-size:28px;font-weight:700">가격표</h2>
      <div style="font-size:14px;color:var(--dim)">26.11 프로모션 · <strong style="color:var(--accent)">${priceData.length}개</strong> 상품</div>
    </div>

    <div style="position:sticky;top:0;background:transparent;padding:12px 0;margin-bottom:16px;border-bottom:1px solid var(--line);z-index:10">
      <input type="text" id="${searchId}" placeholder="상품명으로 검색..."
        style="width:100%;padding:12px 16px;border:1px solid var(--line);border-radius:8px;font-size:14px;font-family:inherit;background:var(--input);color:var(--text)"
        oninput="${handleSearch}">
    </div>

    <div style="border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.15)">
      <table class="full-width" style="border-collapse:collapse;width:100%">
        <thead>
          <tr style="background:var(--dim);color:#fff">
            <th style="padding:16px;text-align:left;font-weight:700;font-size:14px">상품명</th>
            <th style="padding:16px;text-align:center;font-weight:700;font-size:14px;width:100px">색상</th>
            <th style="padding:16px;text-align:center;font-weight:700;font-size:14px;width:80px">사이즈</th>
            <th style="padding:16px;text-align:right;font-weight:700;font-size:14px;width:140px">판매가</th>
          </tr>
        </thead>
        <tbody>
          ${priceData.length ? priceData.map((p, idx) => {
    const cat = getCategory(p.name);
    const bgColor = idx % 2 === 0 ? 'transparent' : 'var(--border)';
    return `<tr class="price-row" style="border-bottom:1px solid var(--line);background:${bgColor};transition:all 0.2s;color:var(--text)" onmouseover="this.style.background='var(--accent)';this.style.color='#fff'" onmouseout="this.style.background='${bgColor}';this.style.color='var(--text)'">
              <td style="padding:14px 16px;text-align:left">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:3px;height:28px;background:${cat.color};border-radius:2px"></div>
                  <span style="font-size:14px;font-weight:500;color:var(--text)">${esc(p.name)}</span>
                </div>
              </td>
              <td style="padding:14px 16px;text-align:center;font-size:13px;color:var(--text)">${esc(p.color)}</td>
              <td style="padding:14px 16px;text-align:center;font-size:13px;color:var(--text)">${esc(p.size)}</td>
              <td style="padding:14px 16px;text-align:right;font-weight:bold;color:var(--accent);font-size:15px">${won(p.price)}</td>
            </tr>`;
  }).join("") : `<tr><td colspan="4" style="padding:40px 16px;text-align:center;color:var(--dim);font-size:14px">가격 정보가 있는 상품이 없어요</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

function viewClosing() {
  if (S.closingDay) return viewClosingNote(); // 메모 작성 화면
  const days = dailyRows(); // 최근 날짜부터 (내림차순)
  const kv = (k, v, cls = "") => `<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between"><div>${k}</div><div class="num ${cls}" style="font-weight:bold">${v}</div></div>`;
  return `<div class="filters"><h2 style="margin:0;font-size:17px">마감일지</h2><span class="note">날짜를 클릭하여 일보 작성 · 확인</span></div>
    <section class="panel"><div class="panel-h"><h2>마감 기록</h2><span class="sub">최근 ${days.length}일</span></div>
      <div class="scroll" style="max-height:60vh"><div>
      ${days.map(d => `
        <div class="list-item" style="padding:16px;border-bottom:1px solid var(--line);cursor:pointer;transition:background 0.2s" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background=''" onclick="S.closingDay='${d.day}'; render()">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-weight:bold;font-size:15px">${d.day}</div>
            <div style="display:flex;gap:8px">
              <span class="chip ${d.netSales > 0 ? "go" : d.netSales < 0 ? "bad" : ""}">${d.n}건</span>
              <span class="chip">${won(d.netSales)}</span>
            </div>
          </div>
          ${kv("판매금액", won(d.total))}
          ${kv("실결제", won(d.paid), d.paid !== d.total ? "warn-txt" : "")}
          ${kv("환불", won(d.refund), d.refund ? "bad-txt" : "")}
          ${kv("순매출", won(d.netSales), d.netSales > 0 ? "go-txt" : d.netSales < 0 ? "bad-txt" : "")}
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:12px;color:var(--dim)">
            <span>${d.qty}개 판매</span>
            <span>${S.closingNotes && S.closingNotes[d.day] ? "✓ 메모 작성됨" : "메모 없음"}</span>
          </div>
        </div>
      `).join("") || `<div class="empty">마감 기록이 없어요.</div>`}
      </div></div>
    </section>`;
}

function viewClosingNote() {
  const d = dailyRows().find(x => x.day === S.closingDay);
  if (!d) return `<div class="empty">데이터를 찾을 수 없어요.</div>`;
  const notes = S.closingNotes || {};
  const note = notes[S.closingDay] || { flow: "", reaction: "", issue: "" };
  const kv = (k, v, cls = "") => `<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between"><div>${k}</div><div class="num ${cls}" style="font-weight:bold">${v}</div></div>`;
  return `<div class="filters"><h2 style="margin:0;font-size:17px">${S.closingDay} 일보</h2><button class="btn sm spacer" onclick="S.closingDay=null; render()">← 목록으로</button></div>
    <section class="panel"><div class="panel-h"><h2>판매 현황</h2></div><div class="panel-b">
      ${kv("판매건수", `${d.n}건`)}
      ${kv("판매금액", won(d.total))}
      ${kv("실결제", won(d.paid), d.paid !== d.total ? "warn-txt" : "")}
      ${kv("환불", won(d.refund), d.refund ? "bad-txt" : "")}
      ${kv("순매출", won(d.netSales), d.netSales > 0 ? "go-txt" : d.netSales < 0 ? "bad-txt" : "")}
      ${kv("판매수량", `${d.qty}개`)}
    </div></section>
    <section class="panel" style="margin-top:16px"><div class="panel-h"><h2>일보 메모</h2><span class="sub">알바 감 잡을 수 있게 작성해주세요</span></div><div class="panel-b">
      <div style="margin-bottom:16px">
        <label style="display:block;margin-bottom:8px;font-weight:bold;font-size:13px">【오늘 흐름】</label>
        <textarea id="note-flow" style="width:100%;min-height:80px;padding:10px;border:1px solid var(--line);border-radius:4px;font-size:13px;font-family:inherit;resize:vertical" placeholder="고객 방문 시간대 · 분위기 · 이벤트 등&#10;예: 14시부터 활기 / 최종일 인식 고객 多 / 재방문 고객 증가">${esc(note.flow)}</textarea>
      </div>
      <div style="margin-bottom:16px">
        <label style="display:block;margin-bottom:8px;font-weight:bold;font-size:13px">【고객·상품 반응】</label>
        <textarea id="note-reaction" style="width:100%;min-height:80px;padding:10px;border:1px solid var(--line);border-radius:4px;font-size:13px;font-family:inherit;resize:vertical" placeholder="인기 상품 · 색상 반응 · 고객 나이대 · 재방문 등&#10;예: 7D 베이지 인기 / 한국 고객 多 / 온라인 가격 문의 증가">${esc(note.reaction)}</textarea>
      </div>
      <div style="margin-bottom:16px">
        <label style="display:block;margin-bottom:8px;font-weight:bold;font-size:13px">【이슈·요청·내일 액션】</label>
        <textarea id="note-issue" style="width:100%;min-height:80px;padding:10px;border:1px solid var(--line);border-radius:4px;font-size:13px;font-family:inherit;resize:vertical" placeholder="문제점 · 개선 사항 · 내일 초점 등&#10;예: 재고 부족 (사이즈 L 품절) / 명확한 상품 설명 필요 / 내일은 가격 메리트 강조">${esc(note.issue)}</textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="S.closingDay=null; render()">취소</button>
        <button class="btn primary" onclick="savClosingNote('${S.closingDay}')">저장</button>
      </div>
    </div></section>`;
}

function savClosingNote(day) {
  const flow = $("#note-flow").value.trim();
  const reaction = $("#note-reaction").value.trim();
  const issue = $("#note-issue").value.trim();
  if (!flow && !reaction && !issue) { toast("내용을 작성해주세요.", "warn"); return; }
  if (!S.closingNotes) S.closingNotes = {};
  S.closingNotes[day] = { flow, reaction, issue, by: S.me?.name, ts: Date.now() };
  ls("pos.closingNotes", JSON.stringify(S.closingNotes));
  toast("일보가 저장되었어요.", "go");
  S.closingDay = null;
  render();
}

function viewAdmin() {
  const st = storeCfg(), pm = st.promo || {}, names = [...new Set(S.products.map(p => p.name))];
  return `<div class="cols" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
    <section class="panel"><div class="panel-h"><h2>프로모션 · ${esc(st.name)}</h2><span class="sub">운영 중 바꾸면 다음 판매부터 바로 적용</span></div><div class="panel-b">
      <label class="check"><input type="checkbox" id="pm-on" ${pm.on ? "checked" : ""}> 구매금액 조건 추가할인 사용</label>
      <div class="form-grid" style="margin-top:8px">
        <label>기준금액 (원)<input class="input num" id="pm-th" value="${pm.threshold || 500000}" inputmode="numeric"></label>
        <label>추가할인율 (%)<input class="input num" id="pm-rate" value="${pm.rate ? Math.round(pm.rate * 1000) / 10 : 5}" inputmode="decimal"></label>
        <label>기준금액 계산<select class="input" id="pm-basis"><option value="sale" ${pm.basis !== "list" ? "selected" : ""}>할인가 합계 (고객이 내는 금액)</option><option value="list" ${pm.basis === "list" ? "selected" : ""}>정상가 합계</option></select></label>
        <label>추가할인 방식<select class="input" id="pm-mode"><option value="sum" ${pm.mode !== "seq" ? "selected" : ""}>합산 (정상가 × 추가율 · 10%+5%=15%)</option><option value="seq" ${pm.mode === "seq" ? "selected" : ""}>순차 (할인가 × 추가율)</option></select></label>
        <label class="wide check"><input type="checkbox" id="pm-inc" ${pm.includeExcluded !== false ? "checked" : ""}> 할인 제외 품목도 기준금액에는 포함 (추가할인은 할인 품목에만 적용)</label>
      </div>
      <div style="margin-top:10px;display:flex;justify-content:flex-end"><button class="btn primary" data-act="pm-save">저장</button></div>
    </div></section>
    <section class="panel"><div class="panel-h"><h2>매장</h2><span class="sub">주문번호 앞글자 = 코드</span></div><div class="panel-b">
      <table><thead><tr><th>ID</th><th>이름</th><th>코드</th></tr></thead><tbody>${S.config.stores.map(s => `<tr><td class="mono">${esc(s.id)}</td><td>${esc(s.name)}</td><td class="mono">${esc(s.code)}</td></tr>`).join("")}</tbody></table>
      <div class="form-grid" style="margin-top:10px"><label>ID (영문)<input class="input" id="st-id" placeholder="예: hyundai-seoul"></label><label>이름<input class="input" id="st-name" placeholder="예: 더현대 서울"></label><label>코드 (영문 1~2자)<input class="input" id="st-code" placeholder="예: H"></label><div style="display:flex;align-items:end"><button class="btn" data-act="st-add">매장 추가</button></div></div>
    </div></section>
    <section class="panel"><div class="panel-h"><h2>직원 PIN</h2><span class="sub">직원마다 8자리 PIN · 근무가 끝나면 ‘끄기’</span><button class="btn sm spacer" data-act="staff-load">${S.staff ? "새로고침" : "불러오기"}</button></div><div class="panel-b">
      ${S.staff ? `<table><thead><tr><th>이름</th><th>역할</th><th>매장</th><th>PIN</th><th></th></tr></thead><tbody>${S.staff.map(x => `<tr class="${x.active ? "" : "canceled"}"><td>${esc(x.name)}</td><td>${x.role === "hq" ? "본사" : "매장"}</td><td>${esc(x.store ? storeCfg(x.store).name : "전체")}</td><td class="mono">${esc(x.pin)}</td><td><button class="btn sm" data-act="staff-toggle" data-pin="${esc(x.pin)}">${x.active ? "끄기" : "켜기"}</button></td></tr>`).join("") || `<tr><td colspan="5" class="note">등록된 직원이 없어요.</td></tr>`}</tbody></table>` : `<p class="note">‘불러오기’를 누르면 직원 목록이 보여요.</p>`}
      <div class="form-grid" style="margin-top:10px">
        <label>이름<input class="input" id="sf-name" placeholder="예: 매장 김OO"></label>
        <label>역할<select class="input" id="sf-role"><option value="store">매장 직원</option><option value="hq">본사</option></select></label>
        <label>매장<select class="input" id="sf-store">${S.config.stores.map(s => `<option value="${esc(s.id)}" ${s.id === S.store ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
        <div style="display:flex;align-items:end"><button class="btn primary" data-act="staff-add">PIN 만들기</button></div>
      </div></div></section>
    <section class="panel"><div class="panel-h"><h2>설정</h2></div><div class="panel-b">
      <div class="form-grid" style="margin-bottom:10px">
        <label>매장 코드 (주문번호 접두어)<input class="input" id="config-code" placeholder="HD_CC" value="${esc(S.config.stores && S.config.stores[0] ? S.config.stores[0].code : "HD_CC")}"></label>
      </div>
    </section>
    <section class="panel"><div class="panel-h"><h2>영수증 · 사전구매 안내</h2></div><div class="panel-b">
      <div class="form-grid" style="margin-bottom:10px">
        <label>보증서 발급 링크<input class="input" id="notice-guarantee" placeholder="https://app.vircle.co.kr/guarantee/issue/..." value="${esc(S.config.guaranteeUrl || "https://app.vircle.co.kr/guarantee/issue/1276?templateIdx=700/")}"></label>
        <label>채팅 상담 링크<input class="input" id="notice-chat" placeholder="https://..." value="${esc(S.config.chatUrl || "")}"></label>
        <label>전화번호<input class="input" id="notice-phone" placeholder="070-7666-9034" value="${esc(S.config.phone || "070-7666-9034")}"></label>
      </div>
      <label class="field">고객 영수증 안내 문구 (교환·반품·기타)<textarea class="input" id="notice" rows="6">${esc(S.config.notice || DEFAULT_NOTICE)}</textarea></label>
      <p class="note">위 링크와 전화번호가 고객에게 보여질 때 클릭 가능한 형태로 표시돼요.</p>
      <details style="margin-top:10px"><summary>상품별 사전구매 발송 안내 (비우면 ‘입고 후 순차 발송’)</summary>
        <div style="display:grid;gap:6px;margin-top:8px">${names.map((n, k) => `<label class="form-grid" style="grid-template-columns:1fr 1fr;align-items:center"><span class="note">${esc(n)}</span><input class="input" data-note="${k}" value="${esc((S.config.notes || {})[n] || "")}" placeholder="예: 11월 말 순차 발송"></label>`).join("")}</div></details>
      <div style="margin-top:10px;display:flex;justify-content:flex-end"><button class="btn primary" data-act="notes-save">저장</button></div>
    </div></section></div>`;
}
async function saveConfig(patch) {
  try {
    S.config = { ...S.config, ...patch };
    ls("pos.config", S.config);
    toast("설정을 저장했어요.", "go");
  } catch (e) { writeFail(e); }
}
async function loadStaff() {
  try {
    // 로컬 직원 데이터 로드
    S.staff = S.config?.staff || [];
    render();
  } catch (e) { writeFail(e); }
}

// ---------- 이벤트 ----------
function goTab(t) { S.tab = t; closeModal(); try { history.replaceState(null, "", "#" + t); } catch (e) {} render(); window.scrollTo(0, 0); }
document.addEventListener("click", async e => {
  const tabA = e.target.closest("nav.tabs a[data-tab]");
  if (tabA) { e.preventDefault(); goTab(tabA.dataset.tab); return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act, d = b.dataset;
  if (a === "close") closeModal();
  else if (a === "goto") goTab(d.tab);
  else if (a === "copy") { try { await navigator.clipboard.writeText(d.v); toast("링크를 복사했어요.", "go"); } catch (err) { toast("복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.", "bad"); } }
  else if (a === "finder") openFinder();
  else if (a === "finder-pick") { const p = S.byBc[d.bc]; addToCart(p, "search"); toast(`담았어요: ${p.name} ${optLabel(p)}`, "go"); }
  else if (a === "ctype") { S.cart[+d.i].type = d.t; render(); }
  else if (a === "cq") { const c = S.cart[+d.i]; c.qty += +d.d; if (c.qty <= 0) S.cart.splice(+d.i, 1); render(); }
  else if (a === "cdel") { S.cart.splice(+d.i, 1); render(); }
  else if (a === "cart-clear") { S.cart = []; S.orderExc = null; render(); }
  else if (a === "exch-stop") { S.exchange = null; render(); }
  else if (a === "exc") openExc(d.i);
  else if (a === "exc-clear") { if (d.i === "order") S.orderExc = null; else S.cart[+d.i].exc = null; closeModal(); render(); }
  else if (a === "exc-save") {
    const v = parseFloat($("#x-v").value.replace(/,/g, "")), reason = $("#x-reason").value.trim(), kind = $("#x-kind").value;
    if (!(v > 0) || (kind === "pct" && v > 100)) { toast("할인 값을 확인해 주세요.", "bad"); return; }
    if (reason.length < 2) { toast("예외할인 사유를 입력해 주세요.", "bad"); return; }
    const x = { kind, v, reason, by: S.me.name };
    if (d.i === "order") S.orderExc = x; else S.cart[+d.i].exc = x;
    closeModal(); render();
  }
  else if (a === "emp-disc") { S.orderEmpDisc = !S.orderEmpDisc; render(); }
  else if (a === "emp-verify") { S.empVerified = !S.empVerified; render(); }
  else if (a === "sale-confirm") openConfirm();
  else if (a === "to-ship") { for (const c of S.cart) if (c.bc === d.bc && c.type === "pickup") c.type = "ship"; closeModal(); render(); toast("택배배송으로 바꿨어요. 다시 판매 확정을 눌러 주세요."); }
  else if (a === "sale-commit") {
    const f = readConfirm();
    if (f.err) { toast(f.err, "bad"); return; }
    const L = ledger();
    const negativeItems = S.cart.filter(c => c.type === "pickup" && L.stock(c.bc) - c.qty < 0);
    if (negativeItems.length > 0) {
      const itemNames = negativeItems.map(c => S.byBc[c.bc]?.name || c.bc).join(", ");
      if (!f.memo.includes("음수") && !f.memo.includes("부족") && !f.memo.includes("재고")) {
        toast(`⚠️ 음수 주문 주의: ${itemNames}. 메모에 사유를 남겨주세요.`, "warn");
        return;
      }
    }
    b.disabled = true;
    commitSale(f);
  }
  else if (a === "order") openOrder(d.id);
  else if (a === "receipt") { const s = S.sales.find(x => x.id === d.id); if (s) showReceipt(s); }
  else if (a === "cancel-open") openCancel(d.id, d.k);
  else if (a === "cancel-do") doCancel(d.id, d.k);
  else if (a === "stock-adjust") openStockAdjust(d.bc);
  else if (a === "stock-adj-do") doStockAdjust(d.bc);
  else if (a === "memo-edit") {
    const s = S.sales.find(x => x.id === d.id);
    openModal(`메모·실결제 · ${s.orderNo}`, `<div class="form-grid"><label>실결제금액 (원)<input class="input num" id="m-paid" value="${s.paid}" inputmode="numeric"></label><label>판매금액<input class="input num" value="${s.total}" disabled></label><label class="wide">메모<input class="input" id="m-memo" value="${esc(s.memo || "")}"></label></div>`,
      `<button class="btn" data-act="close">닫기</button><button class="btn primary" data-act="memo-save" data-id="${s.id}">저장</button>`);
  }
  else if (a === "receipt-edit") {
    const s = S.sales.find(x => x.id === d.id);
    openModal(`영수증 번호 · ${s.orderNo}`, `<div class="form-grid"><label>더현대 영수증 NO<input class="input" id="r-no" placeholder="예: 9151-0121" value="${s.hyundaiReceiptNo || ""}" data-autofocus></label></div><p class="note">예: 9151-0121 (하이픈은 자동으로 입력돼요)</p>`,
      `<button class="btn" data-act="close">닫기</button><button class="btn primary" data-act="receipt-save" data-id="${s.id}">저장</button>`);
    const inp = $("#r-no");
    if (inp) inp.addEventListener("input", () => { inp.value = fmtReceiptNo(inp.value); });
  }
  else if (a === "receipt-save") {
    const s = S.sales.find(x => x.id === d.id);
    const no = ($("#r-no") ? $("#r-no").value.trim() : "").slice(0, 20) || null;
    if (no && !no.match(/^\d{4}-\d+$/)) { toast("영수증 번호 형식이 잘못됐어요. (예: 9151-0121)", "bad"); return; }
    Net.put(P("sales", d.id), { hyundaiReceiptNo: no }, true).then(() => { closeModal(); render(); toast("영수증 번호를 저장했어요.", "go"); }).catch(writeFail);
  }
  else if (a === "memo-save") { try { await Net.put(P("sales", d.id), { paid: parseInt(digits($("#m-paid").value), 10) || 0, memo: $("#m-memo").value.trim() }, true); closeModal(); toast("저장했어요.", "go"); } catch (err) { writeFail(err); } }
  else if (a === "ship-edit") {
    const s = S.sales.find(x => x.id === d.id), sh = s.ship || {};
    openModal(`배송정보 수정 · ${s.orderNo}`, `<div class="form-grid"><label>수령자<input class="input" id="e-name" value="${esc(sh.name)}"></label><label>연락처<input class="input" id="e-phone" value="${esc(sh.phone)}"></label><label class="wide">주소<input class="input" id="e-addr" value="${esc(sh.addr)}"></label><label class="wide">배송 메모<input class="input" id="e-memo" value="${esc(sh.memo)}"></label></div><p class="note">발주 등록 전인 상품에만 반영돼요.</p>`,
      `<button class="btn" data-act="close">닫기</button><button class="btn primary" data-act="ship-save" data-id="${s.id}">저장</button>`);
  }
  else if (a === "ship-save") { try { await Net.put(P("sales", d.id), { ship: { name: $("#e-name").value.trim(), phone: fmtPhone($("#e-phone").value), addr: $("#e-addr").value.trim(), memo: $("#e-memo").value.trim() } }, true); closeModal(); toast("배송정보를 고쳤어요.", "go"); } catch (err) { writeFail(err); } }
  else if (a === "ship-mode") { S.shipMode = d.m; render(); }
  else if (a === "ship-export") exportShip();
  else if (a === "ship-batch") reExportBatch(d.b);
  else if (a === "ezc-done") markEzCancelDone(d.id, +d.i);
  else if (a === "stock-mode") { S.stockFilter.mode = d.m; render(); }
  else if (a === "req-mode") { S.reqFilter.mode = d.m; render(); }
  else if (a === "rq") { S.reqDraft[d.bc] = Math.max(0, (S.reqDraft[d.bc] || 0) + +d.d); render(); }
  else if (a === "req-fill") {
    const L = ledger(); let n = 0;
    for (const p of S.products) { const want = L.net(p.bc) - pendingReq(p.bc) - (L.inQ[p.bc] || 0); if (want > 0) { S.reqDraft[p.bc] = want; n++; } }
    toast(n ? `현장 판매 수량만큼 ${n}개 품목을 채웠어요. 이미 요청·입고된 수량은 뺐어요.` : "채울 상품이 없어요."); render();
  }
  else if (a === "req-reset") { S.reqDraft = {}; render(); }
  else if (a === "rdel") { delete S.reqDraft[d.bc]; render(); }
  else if (a === "req-confirm") {
    const items = reqItems();
    openModal("입고 요청 전표 만들기", `<div class="confirm-big">${items.length}개 품목, 총 ${sum(items, i => i.qty)}개를 본사에 요청할까요?</div>
      <table><thead><tr><th>상품코드</th><th>상품</th><th class="r">수량</th></tr></thead><tbody>${items.map(i => { const p = S.byBc[i.bc]; return `<tr><td class="mono">${esc(p.ez)}</td><td class="name-cell">${esc(p.name)} <span class="note">${esc(optLabel(p))}</span></td><td class="r num">${i.qty}</td></tr>`; }).join("")}</tbody></table>
      <p class="note">요청이 기록되고, 이지어드민 전표 엑셀(상품코드 / 요청수량 / 출고수량)이 저장돼요.</p>`,
      `<button class="btn" data-act="close">돌아가기</button><button class="btn primary" data-act="req-submit" data-autofocus>요청 등록 + 전표 저장</button>`);
  }
  else if (a === "req-submit") { b.disabled = true; submitRequest(); }
  else if (a === "req-slip") { const r = S.requests.find(x => x.id === d.id); saveFile(`${fileTag()}_출고요청_${r.id.slice(1, 12)}_전표.xlsx`, slipBook(r.items, "출고수량")); }
  else if (a === "req-ack") setReqStatus(d.id, "출고확인");
  else if (a === "req-view") {
    const r = S.requests.find(x => x.id === d.id);
    openModal(`입고 요청 · ${mdhm(r.ts)}`, `<p class="note">${esc(r.by || "")}${r.memo ? " · " + esc(r.memo) : ""} · 상태 ${r.status}</p><table><thead><tr><th>상품코드</th><th>상품</th><th class="r">수량</th></tr></thead><tbody>${r.items.map(i => { const p = S.byBc[i.bc] || {}; return `<tr><td class="mono">${esc(p.ez)}</td><td class="name-cell">${esc(p.name)} <span class="note">${esc(p.color)} / ${esc(p.size)}</span></td><td class="r num">${i.qty}</td></tr>`; }).join("")}</tbody></table>`, `<button class="btn" data-act="close">닫기</button>`);
  }
  else if (a === "up-clear") { S.upload = null; render(); }
  else if (a === "up-confirm") {
    const up = S.upload, got = sum(up.items, i => i.got), diff = up.items.filter(i => i.got !== i.qty).length;
    openModal("재고 추가", `<div class="confirm-big">받은 수량 총 ${got}개를 재고에 추가하시겠습니까?</div>
      ${diff ? `<p class="banner warn">전표와 받은 수량이 다른 품목이 ${diff}개 있어요 (전표 ${up.qty}개 → 받음 ${got}개). 본사에 차이를 알려 주세요.</p>` : ""}
      ${up.requestId ? `<p>연결한 입고 요청이 ‘입고완료’로 바뀌어요.</p>` : ""}${up.bad.length ? `<p class="banner warn">매칭 안 된 ${up.bad.length}행은 빼고 추가해요.</p>` : ""}`,
      `<button class="btn" data-act="close">아니요</button><button class="btn go" data-act="up-commit" data-autofocus>네, 추가할게요</button>`);
  }
  else if (a === "up-commit") { b.disabled = true; commitReceipt(); }
  else if (a === "rday") { S.reportDay = d.d; render(); }
  else if (a === "cday") { S.closeDay = d.d; render(); window.scrollTo(0, 0); }
  else if (a === "export") exportReport(S.closeDay);
  else if (a === "pm-save") {
    const promo = { on: $("#pm-on").checked, threshold: parseInt(digits($("#pm-th").value), 10) || 0, rate: (parseFloat($("#pm-rate").value) || 0) / 100, basis: $("#pm-basis").value, mode: $("#pm-mode").value, includeExcluded: $("#pm-inc").checked };
    if (promo.on && (!promo.threshold || !promo.rate)) { toast("기준금액과 추가할인율을 확인해 주세요.", "bad"); return; }
    saveConfig({ stores: S.config.stores.map(s => s.id === S.store ? { ...s, promo } : s) });
  }
  else if (a === "st-add") {
    const id = $("#st-id").value.trim().toLowerCase(), name = $("#st-name").value.trim(), code = $("#st-code").value.trim().toUpperCase();
    if (!/^[a-z0-9-]{2,30}$/.test(id) || !name || !/^[A-Z]{1,2}$/.test(code)) { toast("ID(영문·숫자), 이름, 코드(영문 1~2자)를 확인해 주세요.", "bad"); return; }
    if (S.config.stores.some(s => s.id === id || s.code === code)) { toast("이미 있는 ID나 코드예요.", "bad"); return; }
    saveConfig({ stores: [...S.config.stores, { id, name, code, promo: { on: false } }] });
  }
  else if (a === "notes-save") {
    const names = [...new Set(S.products.map(p => p.name))], notes = {};
    document.querySelectorAll("[data-note]").forEach(x => { const v = x.value.trim(); if (v) notes[names[+x.dataset.note]] = v; });
    const newCode = $("#config-code").value.trim() || "HD_CC";
    saveConfig({ stores: S.config.stores.map(s => ({...s, code: newCode})), notes, notice: $("#notice").value.trim(), guaranteeUrl: $("#notice-guarantee").value.trim(), chatUrl: $("#notice-chat").value.trim(), phone: $("#notice-phone").value.trim() });
  }
  else if (a === "staff-load") loadStaff();
  else if (a === "staff-add") {
    const name = $("#sf-name").value.trim(), role = $("#sf-role").value, store = role === "hq" ? "" : $("#sf-store").value;
    if (!name) { toast("직원 이름을 입력해 주세요.", "bad"); return; }
    const pin = pin8();
    try {
      // 로컬 직원 데이터에 추가
      S.config.staff = S.config.staff || [];
      S.config.staff.push({ name, pin, role, store, active: true });
      ls("pos.config", S.config);
      await loadStaff();
      toast(`${name} PIN: ${pin} — 본인에게만 전달해 주세요.`, "go");
    } catch (err) { writeFail(err); }
  }
  else if (a === "staff-toggle") {
    const x = S.staff.find(y => y.pin === d.pin);
    try { await Net.call("pos_staff_set", { p_staff_pin: x.pin, p_name: x.name, p_role: x.role, p_store: x.store, p_active: !x.active }); await loadStaff(); } catch (err) { writeFail(err); }
  }
});
document.addEventListener("submit", e => {
  if (e.target.id === "scan-form") { e.preventDefault(); const v = $("#scan").value; $("#scan").value = ""; if (v.trim()) handleScan(v); }
});
// 한글 입력 중(ㄱ+ㅏ→가 조합 중)에 화면을 다시 그리면 글자가 끊기므로, 조합이 끝날 때까지 미룬다
document.addEventListener("compositionstart", () => { composing = true; });
document.addEventListener("compositionend", () => { composing = false; setTimeout(() => { if (!composing && renderPending) { renderPending = false; render(); } }, 40); });
document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "finder-q") renderFinder();
  else if (t.id === "stock-q") { S.stockFilter.q = t.value; render(); }
  else if (t.id === "req-q") { S.reqFilter.q = t.value; render(); }
  else if (t.id === "lookup-q") { S.lookupQ = t.value; render(); }
  else if (t.id === "req-memo") S.reqMemo = t.value;
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.rq) { S.reqDraft[t.dataset.rq] = Math.max(0, parseInt(t.value, 10) || 0); render(); }
  else if (t.dataset.upq !== undefined) { S.upload.items[+t.dataset.upq].got = Math.max(0, parseInt(digits(t.value), 10) || 0); render(); }
  else if (t.id === "low-line") { S.lowLine = +t.value; render(); }
  else if (t.id === "up-req") { S.upload.requestId = t.value; }
  else if (t.id === "rday") { S.reportDay = t.value; render(); }
  else if (t.id === "close-day") { S.closeDay = t.value || dayKey(Date.now()); render(); }
  else if (t.id === "store-sel") { S.store = t.value; S.cart = []; S.orderExc = null; S.exchange = null; S.upload = null; derive().then(() => render()); }
  else if (t.id === "up-file" && t.files[0]) readUpload(t.files[0]);
});
document.addEventListener("dragover", e => { const d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
document.addEventListener("dragleave", e => { const d = e.target.closest && e.target.closest("#drop"); if (d) d.classList.remove("over"); });
document.addEventListener("drop", e => { const d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.remove("over"); if (e.dataTransfer.files[0]) readUpload(e.dataTransfer.files[0]); } });
// 핸드 스캐너: 입력칸 밖에서 찍어도 판매 화면이면 받아 준다
let kbuf = "", ktime = 0;
document.addEventListener("keydown", e => {
  if ($("#modal-root").innerHTML) {
    if (e.key === "Escape") closeModal();
    else if (e.key === "Enter" && !e.isComposing && document.activeElement && !["BUTTON", "SELECT", "INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) { const p = $("#modal-root [data-autofocus]"); if (p && p.tagName === "BUTTON") { e.preventDefault(); p.click(); } }
    return;
  }
  if (S.tab !== "sell") return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement && document.activeElement.tagName) || "")) return;
  const now = Date.now(); if (now - ktime > 120) kbuf = ""; ktime = now;
  if (e.key === "Enter") { if (kbuf.length >= 5) { e.preventDefault(); handleScan(kbuf); } kbuf = ""; }
  else if (e.key.length === 1) kbuf += e.key;
});
window.addEventListener("hashchange", () => { const t = location.hash.slice(1); if (TABS.some(x => x[0] === t)) { S.tab = t; render(); } });
setInterval(() => { const d = new Date(); $("#clock").textContent = `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }, 1000);

// ---------- 로그인 (직원 PIN) ----------
function showGate(msg = "") {
  S.me = null; render();
  let g = $("#gate");
  if (!g) {
    g = document.createElement("div"); g.id = "gate";
    g.innerHTML = `<form><h2>어반사이드 팝업 POS</h2><p class="note" style="margin:0">직원 PIN을 입력해 주세요</p>
      <input id="gate-pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN" required>
      <div class="err"></div><button>시작하기</button></form>`;
    document.body.appendChild(g);
    g.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const p = $("#gate-pin").value.trim(); if (!p) return;
      const btn = g.querySelector("button"); btn.disabled = true; btn.textContent = "확인 중…";
      try { S.me = await Net.login(p); g.remove(); start(); }
      catch (err) { btn.disabled = false; btn.textContent = "시작하기"; g.querySelector(".err").textContent = /\bPIN\b/.test(err.message) ? "PIN이 맞지 않거나 꺼진 계정이에요." : "서버에 연결하지 못했어요. 인터넷을 확인해 주세요."; }
    });
  }
  g.querySelector(".err").textContent = msg;
  setTimeout(() => $("#gate-pin") && $("#gate-pin").focus(), 0);
}
function start() {
  S.loaded = false;
  // S.me가 이미 설정되어 있으면 유지, 아니면 기본값 사용
  if (!S.me) S.me = { role: "store", store: "chungcheong" };
  render();
  // Supabase 연동 비활성화 - 로컬 데이터만 사용
  let deriveCompleted = false;
  const derivePromise = derive().then(() => {
    deriveCompleted = true;

    setConn(true, "로컬 모드");
    render();
  });
  // 타임아웃: 20초 후에도 derive가 완료되지 않으면 강제로 render
  setTimeout(() => {
    if (!deriveCompleted) {
      S.loaded = true;
      render();
    }
  }, 50000);
}
$("#who").addEventListener("click", () => { if (S.me && confirm("로그아웃할까요? (다른 직원으로 바꿀 때)")) { Net.logout(); S.cart = []; showGate(); } });
$("#who").title = "눌러서 로그아웃";
$("#who").style.cursor = "pointer";
(() => {
  const t = location.hash.slice(1); if (TABS.some(x => x[0] === t)) S.tab = t;
  // 저장된 PIN으로 복구, 없으면 로그인 화면 표시
  const savedPin = ls("pos.mePin");
  if (savedPin) {
    derive().then(() => {
      const staff = S.config.staff.find(s => s.pin === savedPin);
      if (staff) {
        S.me = staff; render();
      } else {
        ls("pos.mePin", null);
        showGate();
      }
    });
  } else {
    derive().then(() => showGate());
  }
})();
