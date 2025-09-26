// Listen2FM_Viewer/plugins/crypto/preset/concerned_daily_3x3.js
// 암호화폐 3x3 (초기 100개 바, 더블클릭 초기화, 5MA)
// 1행: BTC / ETH / SOL
// 2행: AAVE / XRP / LINK
// 3행: ADA / XLM / HBAR

import { calculateSMA } from "../indicators/movingAverage.js";
import { baseChartOptions, createTitleOverlay } from "./_common.js";
import { loadCrypto } from "../data/dataLoader.js"; // ★ 공용 로더 사용(캐시버스터/정규화/정렬 포함)

console.info("[crypto] concerned_daily_3x3 loaded", new Date().toISOString());

const UP = "#26a69a";
const DOWN = "#ef5350";

// ▼ 기본 초기 봉수(툴바 버튼으로 순환 변경 가능)
let CURRENT_INITIAL_BARS = 100;
const BARS_CYCLE = [60, 100, 160, 240, 320];

function setInitialVisibleRange(chart, data, bars = CURRENT_INITIAL_BARS) {
    try {
        const total = data.length;
        const from = Math.max(0, total - bars);
        chart.timeScale().setVisibleLogicalRange({ from, to: total - 1 });
    } catch { }
}

function toUnixSec(t) {
    if (typeof t === "number") return t > 1e12 ? Math.floor(t / 1000) : t;
    if (typeof t === "string") {
        const d = new Date(t);
        if (!Number.isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
    }
    return t;
}

function normalizeCandles(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((r) => {
            if (!r) return null;
            const lower = (k) => Object.keys(r).find((x) => x.toLowerCase() === k);
            const tKey = lower("time") || lower("timestamp") || lower("date");
            const oKey = lower("open") || "open";
            const hKey = lower("high") || "high";
            const lKey = lower("low") || "low";
            const cKey = lower("close") || "close";
            const vKey = lower("volume") || "volume";
            const hasOHLC = r[oKey] != null && r[hKey] != null && r[lKey] != null && r[cKey] != null;
            if (!tKey || !hasOHLC) return null;
            return {
                time: toUnixSec(r[tKey]),
                open: Number(r[oKey]),
                high: Number(r[hKey]),
                low: Number(r[lKey]),
                close: Number(r[cKey]),
                volume: Number(r[vKey] ?? 0),
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);
}

function normalizeLine(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((r) => {
            if (!r) return null;
            const tKey =
                Object.keys(r).find((k) => ["time", "timestamp", "date"].includes(k.toLowerCase())) || null;
            const numericKeys = Object.keys(r).filter((k) => {
                if (k === tKey) return false;
                const v = r[k];
                return typeof v === "number" && Number.isFinite(v);
            });
            const vKey =
                numericKeys.find((k) =>
                    ["close", "value", "index", "yield", "price"].includes(k.toLowerCase())
                ) || numericKeys[0];
            if (!tKey || !vKey) return null;
            return { time: toUnixSec(r[tKey]), value: Number(r[vKey]) };
        })
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);
}

// ── 진단/배지 유틸
function toISO(ts) {
    return ts ? new Date(ts * 1000).toISOString().slice(0, 19) + "Z" : "N/A";
}
function ensureBadgeStyle() {
    const id = "l2fm-mini-badge-style";
    if (document.getElementById(id)) return;
    const st = document.createElement("style");
    st.id = id;
    st.textContent = `
.l2fm-mini-badge{
  position:absolute; top:2px; left:2px; z-index:7;
  display:inline-flex; gap:6px; align-items:center;
  font-size:10px; font-weight:700; color:#e8e8ea;
  background:rgba(0,0,0,0.35); border:1px solid #2a2b31;
  border-radius:6px; padding:3px 6px; backdrop-filter: blur(2px);
}
.l2fm-mini-badge .sep{ opacity:.55; margin:0 2px; }
.l2fm-mini-badge .pos{ color:#26a69a; }
.l2fm-mini-badge .neg{ color:#ef5350; }
.l2fm-mini-badge .neu{ color:#9aa0a6; }
.l2fm-stale{
  position:absolute; right:6px; top:6px; z-index:8;
  font-size:11px; font-weight:700; color:#ffc107;
  background:rgba(0,0,0,.45); border:1px solid #2a2b31;
  border-radius:6px; padding:3px 6px;
}`;
    document.head.appendChild(st);
}
function showStaleTag(containerEl, msg = "STALE") {
    ensureBadgeStyle();
    let tag = containerEl.querySelector(".l2fm-stale");
    if (!tag) {
        tag = document.createElement("div");
        tag.className = "l2fm-stale";
        containerEl.appendChild(tag);
    }
    tag.textContent = msg;
}

/* ──────────────────────────────────────────────────────────────
   Strength Badge (좌상단 미니 배지)
────────────────────────────────────────────────────────────── */
function renderStrengthBadge(containerEl, candles) {
    try {
        ensureBadgeStyle();
        const badge = document.createElement("div");
        badge.className = "l2fm-mini-badge";

        const items = [];
        const n = candles.length;
        const last = candles[n - 1];
        const prev = candles[n - 2];

        // Disp(20)
        let dispStr = null;
        try {
            const ma20 = calculateSMA(candles, 20);
            const lastMA20 = ma20[ma20.length - 1]?.value;
            if (Number.isFinite(last?.close) && Number.isFinite(lastMA20) && lastMA20 !== 0) {
                const disp = (last.close / lastMA20) * 100;
                const pos = disp >= 100;
                dispStr = `<span class="${pos ? "pos" : "neg"}">Disp ${disp.toFixed(1)}</span>`;
            }
        } catch { }

        // MA_Osc(5-20)
        let oscStr = null;
        try {
            const ma5 = calculateSMA(candles, 5);
            const ma20 = calculateSMA(candles, 20);
            const v5 = ma5[ma5.length - 1]?.value;
            const v20 = ma20[ma20.length - 1]?.value;
            if (Number.isFinite(v5) && Number.isFinite(v20)) {
                const diff = v5 - v20;
                const sign = diff > 0 ? "+" : diff < 0 ? "−" : "0";
                const cls = diff > 0 ? "pos" : diff < 0 ? "neg" : "neu";
                oscStr = `<span class="${cls}">MA_Osc ${sign}</span>`;
            }
        } catch { }

        // 1D 변화율
        let chgStr = null;
        try {
            if (Number.isFinite(last?.close) && Number.isFinite(prev?.close) && prev.close !== 0) {
                const pct = ((last.close - prev.close) / prev.close) * 100;
                const cls = pct > 0 ? "pos" : pct < 0 ? "neg" : "neu";
                const sign = pct > 0 ? "+" : "";
                chgStr = `<span class="${cls}">${sign}${pct.toFixed(2)}%</span>`;
            }
        } catch { }

        [dispStr, oscStr, chgStr].forEach((s) => s && items.push(s));
        if (items.length === 0) return;

        badge.innerHTML = items.join(`<span class="sep">•</span>`);
        containerEl.appendChild(badge);
    } catch { }
}

/* ──────────────────────────────────────────────────────────────
   캔들 차트 생성 (거래량 제거 버전)
────────────────────────────────────────────────────────────── */
function makeCandleChart(LWC, el, title, candles) {
    createTitleOverlay(el, title);
    const ch = LWC.createChart(el, baseChartOptions(LWC));

    const ma240 = ch.addLineSeries({ color: "magenta", lineWidth: 4, priceLineVisible: false, lastValueVisible: false });
    const ma120 = ch.addLineSeries({ color: "darkorange", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const ma060 = ch.addLineSeries({ color: "green", lineWidth: 3, priceLineVisible: false, lastValueVisible: false });
    const ma020 = ch.addLineSeries({ color: "red", lineWidth: 3, priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1, priceLineColor: "red" });
    const ma005 = ch.addLineSeries({ color: "white", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });

    ma240.setData(calculateSMA(candles, 240));
    ma120.setData(calculateSMA(candles, 120));
    ma060.setData(calculateSMA(candles, 60));
    ma020.setData(calculateSMA(candles, 20));
    ma005.setData(calculateSMA(candles, 5));

    const cs = ch.addCandlestickSeries({
        upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN,
        wickUpColor: UP, wickDownColor: DOWN, priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1,
    });
    cs.setData(candles);
    try {
        const last = candles[candles.length - 1];
        cs.applyOptions({ priceLineColor: last && last.close >= last.open ? UP : DOWN });
    } catch { }

    setInitialVisibleRange(ch, candles, CURRENT_INITIAL_BARS);
    const onDblClick = () => setInitialVisibleRange(ch, candles, CURRENT_INITIAL_BARS);
    el.addEventListener("dblclick", onDblClick);

    renderStrengthBadge(el, candles);

    return {
        chart: ch,
        cleanup: () => el.removeEventListener("dblclick", onDblClick),
        candles,
        ma20: ma020,
        ma60: ma060,
    };
}

function makeLineChart(LWC, el, title, series) {
    createTitleOverlay(el, title);
    const ch = LWC.createChart(el, baseChartOptions(LWC));
    const ls = ch.addLineSeries({ color: "white", lineWidth: 2, priceLineVisible: true });
    ls.setData(series);

    setInitialVisibleRange(ch, series, CURRENT_INITIAL_BARS);
    const onDblClick = () => setInitialVisibleRange(ch, series, CURRENT_INITIAL_BARS);
    el.addEventListener("dblclick", onDblClick);

    return {
        chart: ch,
        cleanup: () => el.removeEventListener("dblclick", onDblClick),
        candles: series,
        ma20: null,
        ma60: null,
    };
}

export async function mountConcernedDaily3x3({ mainRoot }) {
    const LWC = window.LightweightCharts;
    if (!LWC) {
        mainRoot.innerHTML = '<p style="color:#f66;padding:8px">LightweightCharts 로드 실패</p>';
        return () => { };
    }

    mainRoot.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr;gap:6px;height:100%;">
      <div id="c11" style="position:relative;"></div>
      <div id="c12" style="position:relative;"></div>
      <div id="c13" style="position:relative;"></div>

      <div id="c21" style="position:relative;"></div>
      <div id="c22" style="position:relative;"></div>
      <div id="c23" style="position:relative;"></div>

      <div id="c31" style="position:relative;"></div>
      <div id="c32" style="position:relative;"></div>
      <div id="c33" style="position:relative;"></div>
    </div>
  `;

    const tiles = [];
    const cleanups = [];

    // 심볼 매핑
    const cells = [
        { el: "#c11", title: "BTC" },
        { el: "#c12", title: "ETH" },
        { el: "#c13", title: "SOL" },
        { el: "#c21", title: "AAVE" },
        { el: "#c22", title: "XRP" },
        { el: "#c23", title: "LINK" },
        { el: "#c31", title: "ADA" },
        { el: "#c32", title: "XLM" },
        { el: "#c33", title: "HBAR" },
    ];

    // 10일 이상 갱신 없으면 STALE 표시
    const TEN_DAYS = 86400 * 10;

    for (const { el, title } of cells) {
        try {
            // ★ 공용 로더 사용(캐시버스터/정규화/정렬/로그가 내부에서 처리)
            const raw = await loadCrypto({ symbol: title, timeframe: "daily", exchange: "upbit", force: true });
            const candles = normalizeCandles(raw);

            // 진단 로그
            const last = candles.at(-1);
            console.log(`[3x3] ${title} daily`, {
                length: candles.length,
                lastISO: toISO(last?.time),
                lastClose: last?.close
            });

            if (candles.length >= 5) {
                const tile = makeCandleChart(LWC, mainRoot.querySelector(el), title, candles);
                tiles.push(tile); cleanups.push(tile.cleanup);
            } else {
                const line = normalizeLine(raw);
                const tile = makeLineChart(LWC, mainRoot.querySelector(el), title, line);
                tiles.push(tile); cleanups.push(tile.cleanup);
            }

            // 최신성 배지
            if (last?.time && (Math.floor(Date.now() / 1000) - last.time) > TEN_DAYS) {
                showStaleTag(mainRoot.querySelector(el), "STALE");
            }
        } catch (e) {
            console.error(`[concerned_daily_3x3] load failed: ${title}`, e);
            const cell = mainRoot.querySelector(el);
            if (cell) {
                cell.innerHTML = `<div style="color:#f66; position:absolute; top:8px; left:8px;">데이터 로드 실패</div>`;
            }
        }
    }

    /* ───────────────────────────────────────────────
       툴바 연동: 생명선/추세선 깜빡이 + 초기봉수 변경
    ─────────────────────────────────────────────── */
    const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
    const btnTrend = document.querySelector('.main-toolbar [data-action="trendline"]');
    const btnBars = document.querySelector('.main-toolbar [data-action="initialbars"]');

    // 생명선(20) 깜빡이
    const LIFE_RED = "red", LIFE_YELLOW = "#FFD700";
    let lifelineOn = false, lifelineTimer = null, lifeFlip = false;

    function setLifelineUI(active) {
        if (!btnLife) return;
        if (active) btnLife.classList.add("active-preset");
        else btnLife.classList.remove("active-preset");
    }
    function applyLifeColor(color) {
        tiles.forEach((t) => { try { t.ma20?.applyOptions({ color }); } catch { } });
    }
    function startLifeline() {
        lifelineOn = true; setLifelineUI(true);
        applyLifeColor(LIFE_YELLOW);
        lifelineTimer = setInterval(() => {
            lifeFlip = !lifeFlip;
            applyLifeColor(lifeFlip ? LIFE_RED : LIFE_YELLOW);
        }, 1500);
    }
    function stopLifeline() {
        lifelineOn = false; setLifelineUI(false);
        if (lifelineTimer) { clearInterval(lifelineTimer); lifelineTimer = null; }
        lifeFlip = false; applyLifeColor(LIFE_RED);
    }
    const onLife = () => { if (!btnLife) return; if (lifelineOn) stopLifeline(); else startLifeline(); };

    // 추세선(60) 깜빡이
    const TREND_GREEN = "green", TREND_LIGHT = "#7CFC00";
    let trendOn = false, trendTimer = null, trendFlip = false;

    function setTrendUI(active) {
        if (!btnTrend) return;
        if (active) btnTrend.classList.add("active-preset");
        else btnTrend.classList.remove("active-preset");
    }
    function applyTrendColor(color) {
        tiles.forEach((t) => { try { t.ma60?.applyOptions({ color }); } catch { } });
    }
    function startTrend() {
        trendOn = true; setTrendUI(true);
        applyTrendColor(TREND_LIGHT);
        trendTimer = setInterval(() => {
            trendFlip = !trendFlip;
            applyTrendColor(trendFlip ? TREND_GREEN : TREND_LIGHT);
        }, 1500);
    }
    function stopTrend() {
        trendOn = false; setTrendUI(false);
        if (trendTimer) { clearInterval(trendTimer); trendTimer = null; }
        trendFlip = false; applyTrendColor(TREND_GREEN);
    }
    const onTrend = () => { if (!btnTrend) return; if (trendOn) stopTrend(); else startTrend(); };

    // 초기 봉수 변경(순환)
    function applyBarsToAll() {
        tiles.forEach((t) => { try { setInitialVisibleRange(t.chart, t.candles, CURRENT_INITIAL_BARS); } catch { } });
    }
    function cycleBars() {
        const idx = BARS_CYCLE.indexOf(CURRENT_INITIAL_BARS);
        const next = (idx >= 0 && idx < BARS_CYCLE.length - 1) ? BARS_CYCLE[idx + 1] : BARS_CYCLE[0];
        CURRENT_INITIAL_BARS = next;
        applyBarsToAll();
        try { if (btnBars) btnBars.textContent = `Bars ${CURRENT_INITIAL_BARS}`; } catch { }
    }
    const onBars = () => { if (!btnBars) return; cycleBars(); };

    // 이벤트 바인딩(있을 때만)
    if (btnLife) btnLife.addEventListener("click", onLife);
    if (btnTrend) btnTrend.addEventListener("click", onTrend);
    if (btnBars) btnBars.addEventListener("click", onBars);
    try { if (btnBars && !btnBars.textContent.trim()) btnBars.textContent = `Bars ${CURRENT_INITIAL_BARS}`; } catch { }

    return () => {
        try { if (btnLife) btnLife.removeEventListener("click", onLife); } catch { }
        try { if (btnTrend) btnTrend.removeEventListener("click", onTrend); } catch { }
        try { if (btnBars) btnBars.removeEventListener("click", onBars); } catch { }

        try { stopLifeline(); } catch { }
        try { stopTrend(); } catch { }

        try { cleanups.forEach((fn) => fn && fn()); } catch { }
        try { tiles.forEach((t) => t.chart?.remove?.()); } catch { }
    };
}

export function dispose() { }
