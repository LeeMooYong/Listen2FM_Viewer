// Listen2FM_Viewer/plugins/krStocks/ui/sidebar.js
// 카탈로그 기반 아코디언(코스피/코스닥) — 시총TOP + 개별종목 자동렌더

import { mountPreset } from "../../../app/router.js";
// ✅ 공용 로더(브리지) 사용: plugins/krStocks/data/catalog.js → data/krStocks/catalog.js
import { loadKRCatalog } from "../data/catalog.js";

/* ────────────────────────────────────────────────────────────────
 * 상태 보존 (시장, 아코디언 열림)
 * ──────────────────────────────────────────────────────────────── */
const LS_KEY = "l2fm.kr.sidebar";
function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* noop */ }
}
function getState() {
  const s = loadState();
  return {
    market: s.market || "kospi",
    open: s.open || { kospi: {}, kosdaq: {} }, // {kospi:{'시총 TOP':true,'개별종목':true}, kosdaq:{...}}
  };
}

/* ────────────────────────────────────────────────────────────────
 * 현재 KR 프리셋 키 얻기
 *  - 툴바 드롭다운(#timeframe-select)의 "값 그대로" 사용
 *  - 값이 없거나 KR 프리셋이 아니면 기본값(다중차트)로
 * ──────────────────────────────────────────────────────────────── */
function getActiveKRPresetKey() {
  const sel =
    document.querySelector("#timeframe-select") ||
    document.querySelector(".toolbar .preset-select") ||
    document.querySelector(".preset-select");

  const val = String(sel?.value || "").trim();
  if (val && val.startsWith("kr")) return val;

  // 안전 기본값(다중차트)
  return "krQuadMonthlyDailyWeekly30m";
}

/* ────────────────────────────────────────────────────────────────
 * CSS 주입 (아코디언 & 토글)
 * ──────────────────────────────────────────────────────────────── */
function ensureCSS() {
  const id = "l2fm-kr-sidebar-css";
  if (document.getElementById(id)) return;
  const st = document.createElement("style");
  st.id = id;
  st.textContent = `
  #kr-market-toggle { display:flex; gap:8px; padding:8px; }
  #kr-market-toggle .mkbtn {
    flex:1; padding:6px 10px; border:1px solid #2a2b31; border-radius:8px;
    background:#16171c; color:#d7d7db; cursor:pointer; font-weight:700;
  }
  #kr-market-toggle .mkbtn.active { background:#1f2128; color:#5ee0ff; border-color:#334; }

  .kr-accordion { border:1px solid #2a2b31; border-radius:10px; margin:8px; background:#121318; }
  .kr-acc-header {
    padding:8px 10px; font-weight:700; color:#e8e8ea; user-select:none; cursor:pointer;
    display:flex; align-items:center; justify-content:space-between;
  }
  .kr-acc-header .caret { transition:transform .18s ease; opacity:.85; }
  .kr-acc-header.open .caret { transform:rotate(90deg); }

  .kr-acc-body { max-height:0; overflow:hidden; transition:max-height .2s ease; }
  .kr-acc-body.open { max-height:320px; overflow:auto; }

  .kr-list { list-style:none; margin:0; padding:6px 0; }
  .kr-list li {
    padding:6px 10px; color:#ddd; cursor:pointer; border-radius:6px; margin:2px 6px;
  }
  .kr-list li:hover { background:#1b1c22; }
  .kr-list li.focused { background:#1b1c22; color:#5ee0ff; }
  `;
  document.head.appendChild(st);
}

/* ────────────────────────────────────────────────────────────────
 * DOM 유틸
 * ──────────────────────────────────────────────────────────────── */
function mk(tag, cls) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  return el;
}

function renderMarketToggle(container, current, onSwitch) {
  const wrap = mk("div");
  wrap.id = "kr-market-toggle";

  const btnK = mk("button", "mkbtn"); btnK.textContent = "Kospi";
  const btnQ = mk("button", "mkbtn"); btnQ.textContent = "Kosdaq";

  const syncUI = (who) => {
    btnK.classList.toggle("active", who === "kospi");
    btnQ.classList.toggle("active", who === "kosdaq");
  };
  syncUI(current);

  btnK.addEventListener("click", () => { syncUI("kospi"); onSwitch("kospi"); });
  btnQ.addEventListener("click", () => { syncUI("kosdaq"); onSwitch("kosdaq"); });

  wrap.appendChild(btnK);
  wrap.appendChild(btnQ);
  container.appendChild(wrap);
}

function renderAccordionSet(container, market, groups, openMap, onItemClick) {
  const frag = document.createDocumentFragment();

  groups.forEach(({ sector, items }) => {
    const acc = mk("div", "kr-accordion");
    const hdr = mk("div", "kr-acc-header");
    const title = mk("div"); title.textContent = sector;
    const caret = mk("span", "caret"); caret.textContent = "▶";
    hdr.appendChild(title); hdr.appendChild(caret);

    const body = mk("div", "kr-acc-body");
    const ul = mk("ul", "kr-list"); body.appendChild(ul);

    // 초기 펼침 상태
    const initiallyOpen = !!openMap[sector];
    if (initiallyOpen) {
      hdr.classList.add("open");
      body.classList.add("open");
    }

    // 토글
    hdr.addEventListener("click", () => {
      const nowOpen = !body.classList.contains("open");
      hdr.classList.toggle("open", nowOpen);
      body.classList.toggle("open", nowOpen);

      const s = getState();
      s.open[market][sector] = nowOpen;
      saveState(s);
    });

    // 항목 채우기
    items.forEach(({ code, name }) => {
      const li = mk("li");
      li.dataset.code = code;
      li.dataset.name = name;
      li.innerHTML = `<span style="opacity:.85">${code}</span> <span>(${name})</span>`;
      li.addEventListener("click", () => onItemClick({ code, name }, li));
      ul.appendChild(li);
    });

    acc.appendChild(hdr);
    acc.appendChild(body);
    frag.appendChild(acc);
  });

  container.appendChild(frag);
}

/* ────────────────────────────────────────────────────────────────
 * 카탈로그 로딩 & 가공 (공용 로더 사용)
 * ──────────────────────────────────────────────────────────────── */
async function loadCatalog() {
  if (window.__KR_CATALOG__) return window.__KR_CATALOG__;
  try {
    const json = await loadKRCatalog();   // ✅ 여기서만 로드
    window.__KR_CATALOG__ = json;
    return json;
  } catch (e) {
    console.error("[KR sidebar] catalog load failed:", e);
    return null;
  }
}

function resolveName(code, lookup) {
  const ent = lookup?.[code];
  return ent?.display || code;
}

// groups: [{sector:"시총 TOP", items:[{code,name}]}, {sector:"개별종목", items:[...]}]
function buildGroupsFromCatalog(catalog, marketKey) {
  const m = catalog?.markets?.[marketKey];
  const lookup = catalog?.lookup || {};
  if (!m) return [];

  // TOP
  const topCodes = (m.top?.items || []).slice(0, m.top?.limit || 20);
  const topItems = topCodes.map(code => ({ code, name: resolveName(code, lookup) }));

  // singles — 종목명 오름차순
  const singleCodes = Array.isArray(m.singles?.codes) ? [...m.singles.codes] : [];
  const singleItems = singleCodes
    .map(code => ({ code, name: resolveName(code, lookup) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return [
    { sector: "시총 TOP", items: topItems },
    { sector: "개별종목", items: singleItems },
  ];
}

/* ────────────────────────────────────────────────────────────────
 * 메인 렌더러
 * ──────────────────────────────────────────────────────────────── */
export async function renderKRSidebar(root) {
  if (!root) return;
  ensureCSS();

  // 컨테이너 초기화
  root.innerHTML = "";
  root.style.padding = "6px 0";

  // 헤더
  const header = mk("div");
  header.textContent = "국내주식";
  Object.assign(header.style, {
    fontWeight: "700",
    color: "#e8e8ea",
    padding: "8px 10px",
    borderBottom: "1px solid #2a2b31",
    userSelect: "none",
    textAlign: "center",
  });
  root.appendChild(header);

  // 카탈로그 로드
  const catalog = await loadCatalog();
  if (!catalog) {
    const err = mk("div");
    err.style.padding = "10px";
    err.style.color = "#f66";
    err.textContent = "catalog.kr.json 로드 실패";
    root.appendChild(err);
    return;
  }

  // 상태
  const state = getState();
  document.body.dataset.activeMarket = state.market;

  // 시장 토글
  renderMarketToggle(root, state.market, (market) => {
    const s = getState();
    s.market = market;
    saveState(s);
    document.body.dataset.activeMarket = market;
    listsWrap.innerHTML = "";
    renderLists(listsWrap, market);
  });

  // 리스트 영역
  const listsWrap = mk("div");
  root.appendChild(listsWrap);

  function renderLists(container, market) {
    const groups = buildGroupsFromCatalog(catalog, market);
    renderAccordionSet(container, market, groups, getState().open[market], onSelectItem);
  }

  // 종목 선택 시 → 현재 KR 프리셋으로 마운트
  async function onSelectItem(item, li) {
    // 포커스 UI
    root.querySelectorAll(".kr-list li.focused").forEach(n => n.classList.remove("focused"));
    li.classList.add("focused");

    const preset = getActiveKRPresetKey(); // 예: krQuadMonthlyDailyWeekly30m, krDualMonthlyDaily, ...
    try {
      await mountPreset("main-content-area", { preset, symbol: item.name });
      document.body.dataset.activePreset = preset; // 현재 프리셋 기록
    } catch (e) {
      console.warn("[KR Sidebar] mount failed:", e);
    }
  }

  // 최초 렌더
  renderLists(listsWrap, state.market);

  // ⚠️ 자동 클릭(삼성전자 강제 선택) 제거
  // 초기 마운트는 main.js가 담당하므로, 여기서는 아무 것도 하지 않습니다.
}
