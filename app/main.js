// app/main.js — Overlay strategy + crypto 1회 초기화 + 탭 전환 락
// + fm_market에 Dashboard 버튼(D5/D20/D60) + 스케일/정렬 버튼 + 단축키(1/2/3)
// + US탭 기본 프리셋 "usQuadMonthlyDailyWeekly60m"
// + “마지막 프리셋 기억” 전면 차단(로컬스토리지 정리)
// + 키보드 탭 네비게이션(←/→, Home/End, Enter/Space)
// + 준비중 탭 키 일치: ["home","sim","real","auto-analysis"]

import { mountPreset } from "./router.js";

// 탭 전용 사이드바 렌더러
import { renderLeftSidebar as renderCryptoSidebar } from "../plugins/crypto/ui/sidebar.js";
import { renderUSSidebar } from "../plugins/usStocks/ui/sidebar.js";
import { renderKRSidebar } from "../plugins/krStocks/ui/sidebar.js";
import { renderEconomicSidebar } from "../plugins/economic/ui/sidebar.js";
// 오른쪽 사이드바(샘플: 종목 요약/스냅샷)
import { renderKRRightPanel } from "../plugins/krStocks/ui/rightPanel.js";

// 툴바 allowlist
import { getToolbarAllowlist, resolveToolbarKey } from "../plugins/shared/ui/toolbar.config.js";

/* ───────────────────────────── Helpers ───────────────────────────── */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function setActiveTab(menu) {
  $$(".topbar .tab").forEach(t => t.classList.toggle("active", t.dataset.menu === menu));
}

function getLeftRoot() {
  return document.querySelector("aside.left")
    || document.getElementById("left-sidebar")
    || document.querySelector(".left-sidebar")
    || document.body;
}

function getRightRoot() {
  return document.querySelector("aside.right")
    || document.getElementById("right-sidebar")
    || document.querySelector(".right-sidebar")
    || null;
}

function clearRightPanel() {
  const r = getRightRoot();
  if (r) r.innerHTML = "";
}

// 좌측을 덮는 오버레이 (비-crypto 탭 전용)
function ensureLeftOverlay() {
  const root = getLeftRoot();
  if (!root) return null;

  if (!root.dataset.l2fmOverlayInit) {
    const cs = window.getComputedStyle(root);
    if (cs.position === "static" || !root.style.position) root.style.position = "relative";
    root.dataset.l2fmOverlayInit = "1";
  }

  let ov = root.querySelector("#l2fm-left-overlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "l2fm-left-overlay";
    Object.assign(ov.style, {
      position: "absolute", inset: "0 0 0 0",
      background: window.getComputedStyle(root).backgroundColor || "#111",
      zIndex: "9999",
      display: "none",
      overflow: "auto",
      color: "#ddd", font: "12px system-ui,-apple-system, Segoe UI, Roboto"
    });
    root.prepend(ov);
  }
  return ov;
}
function showOverlay() {
  const ov = ensureLeftOverlay();
  if (!ov) return null;
  ov.style.display = "";
  ov.innerHTML = "";
  return ov;
}
function hideOverlay() {
  const ov = ensureLeftOverlay();
  if (ov) { ov.style.display = "none"; ov.innerHTML = ""; }
}

/* 중앙 영역 “준비중” 카드 렌더 */
function renderComingSoon(containerId, title = "준비중입니다", desc = "해당 탭의 기능은 개발 중입니다.") {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
  <div style="height:100%;display:flex;align-items:center;justify-content:center;">
    <div style="max-width:680px;width:92%;padding:24px 28px;border:1px solid #2a2b31;border-radius:12px;background:#121318;color:#e8e8ea;text-align:center;">
      <div style="font:700 22px/1.4 system-ui;">${title}</div>
      <div style="margin-top:8px;opacity:.8;font:500 14px/1.7 system-ui;">${desc}</div>
    </div>
  </div>`;
}

/* ───────────────────── Toolbar visibility ───────────────────── */

function getAllowedByKey(key) {
  const k = resolveToolbarKey(key) || key;
  return new Set(getToolbarAllowlist(k) || []);
}

function resolveToolbarKeyForUS(raw) {
  const key = String(raw || "");
  if (key.startsWith("usQuadMonthlyDailyWeekly")) return { picked: key, allowed: getAllowedByKey(key) };

  let allowed = getAllowedByKey(key);
  if (allowed.size) return { picked: key, allowed };

  const resolved = resolveToolbarKey(key) || key;
  allowed = getAllowedByKey(resolved);
  if (allowed.size) return { picked: resolved, allowed };

  const aliases = {
    usSingleMonthly: ["usSingleMonthly", "singleMonthly", "monthly", "usSingleDaily", "singleDaily"],
    usSingleWeekly: ["usSingleWeekly", "singleWeekly", "weekly", "usSingleDaily", "singleDaily"],
    usSingle60m: ["usSingle60m", "single60m", "60m", "usSingleDaily", "singleDaily"],
    usSingle30m: ["usSingle30m", "single30m", "30m", "usSingleDaily", "singleDaily"],
    usDualDaily60m: ["usDualDaily60m", "usDualMonthlyDaily"],
    usDualMonthlyDaily: ["usDualMonthlyDaily"],
  }[key] || [resolved, key, "usSingleDaily", "singleDaily"];

  for (const cand of aliases) {
    const a = getAllowedByKey(cand);
    if (a.size) return { picked: cand, allowed: a };
  }
  return { picked: key, allowed: new Set() };
}

function applyToolbarVisibilityForPreset(menu, key) {
  const allowed = (menu === "us") ? resolveToolbarKeyForUS(key).allowed : getAllowedByKey(key);

  $$(".main-toolbar [data-action]").forEach(btn => {
    const id = btn.getAttribute("data-action");
    // 대시보드 전용 버튼은 allowlist 예외 처리
    if (id && (id.startsWith("db_") || id === "db_scale" || id === "db_sort")) return;
    btn.style.display = allowed.has(id) ? "" : "none";
  });
}

/* ───────────────────── Preset dropdown per tab ───────────────────── */

const PRESET_MENU = {
  // 금융시황 탭 프리셋 드롭다운
  fm_market: [
    { value: "fmDaily3x3", label: "데일리 · 차트" },
    { value: "fmDashboard", label: "데일리 · Dashboard" },
  ],

  // ✅ crypto에 Dashboard 프리셋 추가
  crypto: [
    { value: "cryptoDashboard", label: "데일리 · Dashboard" },
    { value: "concernedDaily3x3", label: "관심코인 시황" },
    { value: "TW_Chart", label: "TW_Chart" },
    { value: "dualMonthlyDaily", label: "듀얼차트(월/일)" },
    { value: "dualDay2H", label: "듀얼차트(일/2H)" },
    { value: "monthly", label: "월봉" },
    { value: "daily", label: "일봉" },
    { value: "2h", label: "2시간" },
  ],
  macro: [
    { value: "econMacroPro", label: "Macro Pro View" },
    { value: "econUS10YDaily", label: "US10Y (Daily)" },
    { value: "econSingleViewer:ust10y:monthly", label: "US10Y (Monthly)" },
    { value: "econSingleViewer:spread10y2y:monthly", label: "10Y-2Y Spread (Monthly)" },
  ],
  us: [
    { value: "usQuadMonthlyDailyWeekly60m", label: "다중차트(월/일/주/60분)" },
    { value: "usQuadMonthlyDailyWeekly30m", label: "다중차트(월/일/주/30분)" },
    { value: "usDualMonthlyDaily", label: "듀얼차트(월/일)" },
    { value: "usDualDaily60m", label: "듀얼차트(일/60분)" },
    { value: "usSingleMonthly", label: "월봉" },
    { value: "usSingleWeekly", label: "주봉" },
    { value: "usSingleDaily", label: "일봉" },
    { value: "usSingle60m", label: "60분봉" },
    { value: "usSingle30m", label: "30분봉" },
  ],
  kr: [
    { label: "다중차트(월/일/주/30분)", value: "krQuadMonthlyDailyWeekly30m" },
    { label: "다중차트: 월/일/30", value: "krTriple_MonthlyDaily30m" },
    { label: "시장분석: KOSPI 일/30", value: "krMarket_Kospi_Daily30m" },
    { label: "시장분석: KOSDAQ 일/30", value: "krMarket_Kosdaq_Daily30m" },
    { label: "듀얼차트(월/일)", value: "krDualMonthlyDaily" },
    { label: "듀얼차트(일/30분)", value: "krDualDaily30m" },
    { label: "듀얼차트(30분/5분)", value: "krDual30m5m" },
    { label: "월봉", value: "krSingleMonthly" },
    { label: "주봉", value: "krSingleWeekly" },
    { label: "일봉", value: "krSingleDaily" },
    { label: "30분봉", value: "krSingle30m" },
  ],
};

const TF_TO_PRESET = {
  concernedDaily3x3: "concernedDaily3x3",
  TW_Chart: "twChart",
  dualMonthlyDaily: "dualMonthlyDaily",
  dualDay2H: "dualDay2H",
  monthly: "singleMonthly",
  daily: "singleDaily",
  "2h": "single2H",
};
const mapTfToPreset = tf => TF_TO_PRESET[tf] || "singleDaily";

/* US 프리셋 결정 */
const US_ALLOWED = new Set([
  "usSingleMonthly", "usSingleWeekly", "usSingleDaily", "usSingle60m", "usSingle30m",
  "usDualDaily60m", "usDualMonthlyDaily",
  "usQuadMonthlyDailyWeekly30m", "usQuadMonthlyDailyWeekly60m",
]);
const US_DEFAULT = "usQuadMonthlyDailyWeekly60m";
const resolveUSPreset = (v) => (US_ALLOWED.has(v) ? v : US_DEFAULT);

/* ───────────────────── “마지막 프리셋 기억” 전면 차단 ───────────────────── */
function clearLastPresetMemory(menu) {
  try {
    const keys = [
      "l2fm:lastPreset",
      "l2fm:preset",
      `l2fm:lastPreset:${menu}`,
      "l2fm:lastPreset:crypto",
      "l2fm:lastPreset:us",
      "l2fm:lastPreset:kr",
      "l2fm:lastPreset:macro",
      "l2fm:lastPreset:economic",
    ];
    keys.forEach(k => localStorage.removeItem(k));
  } catch { /* noop */ }
}

/* ───────────────────── Dashboard buttons (D5/D20/D60 + Scale + Sort) ───────────────────── */

function injectDashboardBtnCSS() {
  if (document.getElementById('l2fm-db-btn-css-hook')) return;
  const s = document.createElement('style');
  s.id = 'l2fm-db-btn-css-hook';
  s.textContent = ''; // 실제 CSS는 plugins/shared/dashboard/style.js에서 주입
  document.head.appendChild(s);
}

function updateDashboardButtons(active) {
  ['db_5d', 'db_20d', 'db_60d'].forEach(id => {
    const el = document.querySelector(`.main-toolbar [data-action="${id}"]`);
    if (!el) return;
    el.classList.toggle('active',
      (id === 'db_5d' && active === '5D') ||
      (id === 'db_20d' && active === '20D') ||
      (id === 'db_60d' && active === '60D'));
  });
}
function updateScaleButton() {
  const el = document.querySelector(`.main-toolbar [data-action="db_scale"]`);
  if (!el) return;
  const mode = window.L2FM_getDashboardScale?.() || 'auto';
  el.textContent = (mode === 'common') ? '공통스케일' : '개별스케일';
  el.classList.toggle('active', mode === 'common');
}
function updateSortButton() {
  const el = document.querySelector(`.main-toolbar [data-action="db_sort"]`);
  if (!el) return;
  const mode = window.L2FM_getDashboardSort?.() || 'fixed';
  el.textContent = ({
    fixed: '정렬: 고정',
    retDesc: '정렬: 수익률↓',
    retAsc: '정렬: 수익률↑',
    volDesc: '정렬: 변동성↓',
  })[mode] || '정렬';
}

function ensureDashboardButtons() {
  injectDashboardBtnCSS();
  const bar = document.querySelector('.main-toolbar');
  if (!bar) return;

  // .toolbar-group 뒤에 삽입
  const afterNode = bar.querySelector('.toolbar-group')?.nextSibling || null;

  const mkBtn = (id, label, onClick) => {
    let btn = bar.querySelector(`[data-action="${id}"]`);
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'l2fm-db-btn';
      btn.setAttribute('data-action', id);
      btn.type = 'button';
      btn.textContent = label;
      bar.insertBefore(btn, afterNode);
    } else {
      btn.classList.add('l2fm-db-btn');
      btn.textContent = label;
    }
    btn.onclick = onClick;
    return btn;
  };

  mkBtn('db_60d', 'D60', () => window.L2FM_setDashboardPeriod?.('60D'));
  mkBtn('db_20d', 'D20', () => window.L2FM_setDashboardPeriod?.('20D'));
  mkBtn('db_5d', 'D5', () => window.L2FM_setDashboardPeriod?.('5D'));
  mkBtn('db_scale', '개별스케일', () => window.L2FM_toggleDashboardScale?.());
  mkBtn('db_sort', '정렬', () => window.L2FM_cycleDashboardSort?.());

  updateDashboardButtons(window.L2FM_getDashboardPeriod?.() || '5D');
  updateScaleButton();
  updateSortButton();
}

/* ───────────────────── Toolbar preset menu ───────────────────── */

function setToolbarPresetMenuFor(menu) {
  const group = $(".main-toolbar .toolbar-group");
  const label = $('label[for="timeframe-select"]');
  const sel = $("#timeframe-select");
  if (!group || !label || !sel) return;

  const items = PRESET_MENU[menu] || [];
  // crypto에도 Dashboard가 들어가므로 용어 혼동 방지 위해 그대로 둠(기존 UX 유지)
  label.textContent = (menu === "crypto") ? "캔들주기:" : "프리셋:";
  sel.innerHTML = "";
  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = it.value; opt.textContent = it.label;
    sel.appendChild(opt);
  }
  group.style.display = items.length ? "" : "none";

  // 기본값 고정(복원 금지)
  if (menu === "fm_market") sel.value = "fmDaily3x3";
  if (menu === "crypto") sel.value = "concernedDaily3x3"; // 초기에는 기존 3x3(캔들)로 시작
  if (menu === "macro") sel.value = "econMacroPro";
  if (menu === "us") sel.value = "usQuadMonthlyDailyWeekly60m";
  if (menu === "kr") sel.value = "krQuadMonthlyDailyWeekly30m";

  if (menu === "fm_market") {
    ensureDashboardButtons();
    updateDashboardButtons(window.L2FM_getDashboardPeriod?.() || '5D');
    updateScaleButton();
    updateSortButton();
  }
}

function getActiveMenu() {
  return $(".topbar .tab.active")?.dataset.menu || "home";
}

/* ───────────────────── Sidebar render (overlay) ───────────────────── */

const state = {
  switching: false,
  current: "home",
  cryptoBooted: false,
};

async function renderSidebarFor(menu) {
  if (menu === "crypto") {
    hideOverlay();
    if (!state.cryptoBooted) {
      try { renderCryptoSidebar?.(); } catch (e) { console.error("crypto sidebar error:", e); }
      state.cryptoBooted = true;
    }
    return;
  }

  const slot = showOverlay();
  if (!slot) return;

  if (["home", "sim", "real", "auto-analysis"].includes(menu)) {
    slot.innerHTML = "";
    return;
  }

  try {
    switch (menu) {
      case "us": renderUSSidebar(slot); break;
      case "kr": renderKRSidebar(slot); break;
      case "macro": renderEconomicSidebar(slot); break;
      default: break;
    }
  } catch (e) {
    console.error("renderSidebarFor error:", e);
  }
}

/* ───────────────────── Main content per tab ───────────────────── */

async function mountDefaultFor(menu) {
  const sel = $("#timeframe-select");

  // 탭 이동 시 KR 이외엔 오른쪽 패널 비움
  if (menu !== "kr") clearRightPanel();

  if (["home", "sim", "real", "auto-analysis"].includes(menu)) {
    renderComingSoon("main-content-area", "준비중입니다", "이 탭의 기능은 아직 개발 중이며, 업데이트로 제공될 예정입니다.");
    $$(".main-toolbar [data-action]").forEach(btn => btn.style.display = "none");
    return;
  }

  switch (menu) {
    case "fm_market":
      await mountPreset("main-content-area", { preset: "fmDaily3x3" });
      applyToolbarVisibilityForPreset(menu, "fmDaily3x3");
      ensureDashboardButtons();
      break;

    case "crypto": {
      const value = sel?.value || "concernedDaily3x3";

      // ✅ cryptoDashboard 선택 시 대시보드 마운트 + 버튼 표시/동기화
      if (value === "cryptoDashboard") {
        await mountPreset("main-content-area", { preset: "cryptoDashboard" });
        ensureDashboardButtons();
        updateDashboardButtons(window.L2FM_getDashboardPeriod?.() || '5D');
        updateScaleButton();
        updateSortButton();
        applyToolbarVisibilityForPreset(menu, value);
        break;
      }

      // 기존 타임프레임 기반 프리셋 매핑
      const preset = mapTfToPreset(value);
      await mountPreset("main-content-area", { preset, symbol: "BTC", exchange: "upbit" });
      applyToolbarVisibilityForPreset(menu, value);
      break;
    }

    case "macro": {
      const value = sel?.value || "econMacroPro";
      if (value.startsWith("econSingleViewer:")) {
        const [, id, freq] = value.split(":");
        await mountPreset("main-content-area", { preset: "econSingleViewer", indicatorId: id, frequency: freq });
        applyToolbarVisibilityForPreset(menu, "econUS10YDaily");
      } else {
        await mountPreset("main-content-area", { preset: value });
        applyToolbarVisibilityForPreset(menu, value);
      }
      break;
    }

    case "us": {
      const value = sel?.value || US_DEFAULT;
      const preset = resolveUSPreset(value);
      await mountPreset("main-content-area", { preset, symbol: "SPY" });
      applyToolbarVisibilityForPreset(menu, value);
      break;
    }

    case "kr": {
      const value = sel?.value || "krQuadMonthlyDailyWeekly30m";
      await mountPreset("main-content-area", { preset: value, symbol: "삼성전자" });
      applyToolbarVisibilityForPreset(menu, value);
      document.body.dataset.activePreset = value; // 현재 KR 프리셋 기록

      // ▼ 오른쪽 사이드바(요약/스냅샷) 렌더
      try {
        const right = getRightRoot();
        if (right) {
          right.innerHTML = "";
          await renderKRRightPanel(right, { symbol: "삼성전자" });
        }
      } catch (e) {
        console.warn("[KR right-panel] render failed:", e);
      }
      break;
    }

    default:
      renderComingSoon("main-content-area");
      $$(".main-toolbar [data-action]").forEach(btn => btn.style.display = "none");
      break;
  }
}

/* ───────────────────── Preset change ───────────────────── */

async function onPresetChange() {
  const menu = getActiveMenu();
  const sel = $("#timeframe-select");
  if (!sel) return;
  const value = sel.value;

  if (["home", "sim", "real", "auto-analysis"].includes(menu)) return;

  switch (menu) {
    case "fm_market": {
      await mountPreset("main-content-area", { preset: value });
      ensureDashboardButtons();
      updateDashboardButtons(window.L2FM_getDashboardPeriod?.() || '5D');
      updateScaleButton();
      updateSortButton();
      applyToolbarVisibilityForPreset(menu, value);
      break;
    }
    case "crypto": {
      // ✅ cryptoDashboard 핸들링
      if (value === "cryptoDashboard") {
        await mountPreset("main-content-area", { preset: "cryptoDashboard" });
        ensureDashboardButtons();
        updateDashboardButtons(window.L2FM_getDashboardPeriod?.() || '5D');
        updateScaleButton();
        updateSortButton();
        applyToolbarVisibilityForPreset(menu, value);
        break;
      }
      const preset = mapTfToPreset(value);
      await mountPreset("main-content-area", { preset, symbol: "BTC", exchange: "upbit" });
      applyToolbarVisibilityForPreset(menu, value);
      break;
    }
    case "macro": {
      if (value.startsWith("econSingleViewer:")) {
        const [, id, freq] = value.split(":");
        await mountPreset("main-content-area", { preset: "econSingleViewer", indicatorId: id, frequency: freq });
        applyToolbarVisibilityForPreset(menu, "econUS10YDaily");
      } else {
        await mountPreset("main-content-area", { preset: value });
        applyToolbarVisibilityForPreset(menu, value);
      }
      break;
    }
    case "us": {
      const preset = resolveUSPreset(value);
      await mountPreset("main-content-area", { preset, symbol: "SPY" });
      applyToolbarVisibilityForPreset(menu, value);
      break;
    }
    case "kr": {
      await mountPreset("main-content-area", { preset: value, symbol: "삼성전자" });
      applyToolbarVisibilityForPreset(menu, value);
      document.body.dataset.activePreset = value; // 변경된 KR 프리셋 기록

      // 프리셋 변경 시에도 오른쪽 패널 갱신(심볼은 기본 '삼성전자')
      try {
        const right = getRightRoot();
        if (right) {
          await renderKRRightPanel(right, { symbol: "삼성전자" });
        }
      } catch (e) {
        console.warn("[KR right-panel] update failed:", e);
      }
      break;
    }
    default: break;
  }
}

/* ───────────────────── Tabs & init with lock ───────────────────── */

async function applyTab(menu) {
  if (state.switching) return;
  state.switching = true;
  try {
    clearLastPresetMemory(menu);
    setActiveTab(menu);
    setToolbarPresetMenuFor(menu);
    await renderSidebarFor(menu);
    await mountDefaultFor(menu);
    state.current = menu;
  } finally {
    state.switching = false;
  }
}

function bindTabs() {
  $$(".topbar .tab").forEach(tab => {
    tab.addEventListener("click", async () => {
      const menu = tab.dataset.menu;
      await applyTab(menu);
    });
  });
}

/* ── Keyboard navigation for top tabs (← / → / Home / End + Enter/Space) + 단축키(1/2/3) ── */
function enableTabKeyboardNav() {
  const tablist = document.querySelector('.topbar .menu-items');
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll('.tab'));
  if (tabs.length === 0) return;

  // ARIA & roving tabindex 초기화
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', '주요 탭');
  tabs.forEach((tab) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('tabindex', '-1');
    tab.setAttribute('aria-selected', 'false');
  });
  const active = tabs.find((t) => t.classList.contains('active')) || tabs[0];
  active.setAttribute('tabindex', '0');
  active.setAttribute('aria-selected', 'true');

  function focusTab(newTab) {
    if (!newTab) return;
    tabs.forEach((t) => {
      t.setAttribute('tabindex', '-1');
      t.setAttribute('aria-selected', String(t === newTab));
    });
    newTab.setAttribute('tabindex', '0');
    newTab.focus({ preventScroll: true });
  }

  // 화살표/홈/엔드/엔터/스페이스
  tablist.addEventListener('keydown', (e) => {
    const currentIndex = tabs.findIndex((t) => t === document.activeElement);
    if (currentIndex === -1) return;

    const last = tabs.length - 1;
    let nextIndex = null;

    switch (e.key) {
      case 'ArrowRight': nextIndex = (currentIndex + 1) % tabs.length; break;
      case 'ArrowLeft': nextIndex = (currentIndex - 1 + tabs.length) % tabs.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = last; break;
      case 'Enter':
      case ' ':
        document.activeElement.click(); // 기존 라우팅 재사용
        e.preventDefault();
        return;
      default: break;
    }

    if (nextIndex != null) {
      e.preventDefault();
      focusTab(tabs[nextIndex]);
    }
  });

  // 클릭 시에도 roving tabindex 동기화
  tablist.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab || !tablist.contains(tab)) return;
    focusTab(tab);
  });

  // .active 클래스 변경 시 동기화
  const mo = new MutationObserver(() => {
    const newActive = tabs.find((t) => t.classList.contains('active'));
    if (newActive) focusTab(newActive);
  });
  mo.observe(tablist, { subtree: true, attributes: true, attributeFilter: ['class'] });

  // fm_market 전용 단축키(1=5D, 2=20D, 3=60D)
  window.addEventListener('keydown', (e) => {
    if (getActiveMenu() !== 'fm_market') return;
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === '1') { window.L2FM_setDashboardPeriod?.('5D'); updateDashboardButtons('5D'); }
    if (e.key === '2') { window.L2FM_setDashboardPeriod?.('20D'); updateDashboardButtons('20D'); }
    if (e.key === '3') { window.L2FM_setDashboardPeriod?.('60D'); updateDashboardButtons('60D'); }
  });
}

async function init() {
  ensureLeftOverlay();
  bindTabs();
  enableTabKeyboardNav();
  $("#timeframe-select")?.addEventListener("change", onPresetChange);

  // 대시보드 상태 이벤트 → 버튼 라벨/활성화 동기화
  window.addEventListener('l2fm:db:period', (e) => updateDashboardButtons(e.detail?.period || '5D'));
  window.addEventListener('l2fm:db:scale', () => updateScaleButton());
  window.addEventListener('l2fm:db:sort', () => updateSortButton());

  clearLastPresetMemory("home");
  await applyTab("home"); // 항상 홈에서 시작
}

document.addEventListener("DOMContentLoaded", init);
