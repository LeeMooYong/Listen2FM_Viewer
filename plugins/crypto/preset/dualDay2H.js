// Listen2FM_Viewer/plugins/crypto/preset/dualDay2H.js
// 듀얼차트(일/2H): 좌(일봉), 우(2시간)
// - 보조지표: MAOSC / RSI / Disparity / MACD (버튼 싱글=양쪽, 더블=우측만)
// - 캔들은 항상 최상단. 초기 캔들수: 일봉 160, 2시간 320
// - 더블클릭(메인차트): 해당 패널만 초기범위 복귀
// - 가격라벨: 일봉/2시간 MA120 라벨 숨김, 2시간 MA5 라벨 숨김
// - 수평선: 일봉 MA20, 2시간 MA60
// - 메인→보조 시간축 단방향 링크, 가격축 폭 동기화
// - FIX: 보조 레전드 싱글톤+재부모, 과거 잔여 레전드 소거, 겹침 근절

import { loadCrypto } from "../data/dataLoader.js";
import { calculateSMA } from "../indicators/movingAverage.js";
import { calculateRSI } from "../indicators/rsi.js";
import { calculateMAOscillator } from "../indicators/maOscillator.js";
import { calculateMACD } from "../indicators/macd.js";
import observeAndSyncPriceAxisWidth from "../sync/priceAxisSync.js";
import {
    baseChartOptions,
    createTitleOverlay,
    setInitialVisibleRange,
    padWithWhitespace,
    linkTimeScalesOneWay,
} from "./_common.js";

const NAME_KO = {
    BTC: "비트코인", ETH: "이더리움", SOL: "솔라나", XRP: "엑스알피",
    XLM: "스텔라루멘", HBAR: "헤데라", ADA: "에이다", AAVE: "에이브",
    LINK: "체인링크", DOGE: "도지코인", AVAX: "아발란체", DOT: "폴카닷",
    TRX: "트론", SUI: "수이", ONDO: "온도파이낸스", IOTA: "아이오타",
    VET: "비체인", POL: "폴리곤", APT: "앱토스", ARB: "아비트럼",
    NEO: "네오", SHIB: "시바이누",
};

/* ───────── 공통: 메인차트 MA 레전드 ───────── */
function addMALegend(el, items) {
    const box = document.createElement("div");
    Object.assign(box.style, {
        position: "absolute", top: "6px", left: "8px",
        display: "flex", gap: "12px", alignItems: "center",
        fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
        textShadow: "0 0 4px rgba(0,0,0,0.5)", pointerEvents: "none", zIndex: 7,
    });
    const make = (color, label) => {
        const w = document.createElement("div");
        w.style.display = "flex"; w.style.alignItems = "center"; w.style.gap = "6px";
        const dot = document.createElement("span");
        Object.assign(dot.style, { display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: color });
        const txt = document.createElement("span"); txt.textContent = label;
        w.appendChild(dot); w.appendChild(txt);
        return w;
    };
    items.forEach(i => box.appendChild(make(i.c, i.t)));
    el.appendChild(box);
    return box;
}

/* ───────── 보조 패널 레전드: 싱글톤 + 재부모 ───────── */
function purgeLegacyLegends(host) {
    const selectors = [
        '#legend-daily-sub', '#legend-2h-sub',
        '#rsiLegend', '#d_maoscLegend', '#h2_rsiLegend', '#h_maoscLegend',
        '#d_dispLegend', '#h_dispLegend', '#d_macdLegend', '#h_macdLegend'
    ];
    selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(node => {
            if (!host.contains(node)) { try { node.remove(); } catch { } }
        });
    });
}
function ensureSingletonLegend(host, id) {
    let el = document.getElementById(id);
    if (el) {
        if (el.parentElement !== host) {
            try { el.parentElement?.removeChild(el); } catch { }
            host.appendChild(el);
        }
    } else {
        el = document.createElement("div");
        el.id = id;
        Object.assign(el.style, {
            position: "absolute", top: "6px", left: "8px",
            display: "none", padding: "4px 6px",
            fontSize: "12px", fontWeight: "700",
            color: "#e8e8ea", background: "rgba(0,0,0,0)",
            pointerEvents: "none", zIndex: 7,
            whiteSpace: "nowrap", textShadow: "0 0 4px rgba(0,0,0,.4)",
        });
        host.appendChild(el);
    }
    return el;
}
const setLegendText = (el, text) => { el.textContent = text; el.style.display = ""; };

/* ───────── 유틸 ───────── */
function ensureRSIPulseStyle() {
    const id = "l2fm-rsi-pulse-style";
    if (!document.getElementById(id)) {
        const st = document.createElement("style");
        st.id = id;
        st.textContent = `
@keyframes l2fmPulse{0%{box-shadow:0 0 0 0 rgba(255,215,0,.65);opacity:1;}70%{box-shadow:0 0 0 12px rgba(255,215,0,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(255,215,0,0);opacity:.85;}}`;
        document.head.appendChild(st);
    }
}
function ensureDISPPulseStyle() {
    const id = "l2fm-disp-pulse-style";
    if (!document.getElementById(id)) {
        const st = document.createElement("style");
        st.id = id;
        st.textContent = `@keyframes l2fmDISPPulse{0%{box-shadow:0 0 0 0 rgba(255,183,77,.55);opacity:1;}70%{box-shadow:0 0 0 12px rgba(255,183,77,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(255,183,77,0);opacity:.85;}}`;
        document.head.appendChild(st);
    }
}
function mapHistColors(items) {
    return items.map(h => ({
        time: h.time,
        value: h.value,
        color: (h.value >= 0) ? 'rgba(0,255,0,0.5)' : 'rgba(239,83,80,0.5)'
    }));
}
function smaOfSeries(series, period) {
    if (!Array.isArray(series) || period <= 1) return series || [];
    const out = []; const buf = []; let sum = 0;
    for (const p of series) {
        const v = Number(p.value);
        if (!Number.isFinite(v)) { out.push({ time: p.time, value: NaN }); continue; }
        buf.push(v); sum += v;
        if (buf.length > period) sum -= buf.shift();
        out.push({ time: p.time, value: (buf.length === period) ? (sum / period) : NaN });
    }
    return out;
}

// 보조선(white) vs 본선(main) 교차 마커(아이콘만, 텍스트 없음)
function buildCrossMarkers(whiteSeries, mainSeries, upColor = "green", downColor = "#ef5350") {
    const mainMap = new Map(mainSeries.map(p => [p.time, p.value]));
    const markers = [];
    const EPS = 1e-8;
    for (let i = 1; i < whiteSeries.length; i++) {
        const t0 = whiteSeries[i - 1]?.time, t1 = whiteSeries[i]?.time;
        if (!mainMap.has(t0) || !mainMap.has(t1)) continue;
        const prev = whiteSeries[i - 1].value - mainMap.get(t0);
        const curr = whiteSeries[i].value - mainMap.get(t1);
        if (!Number.isFinite(prev) || !Number.isFinite(curr)) continue;
        if (prev <= -EPS && curr > EPS) markers.push({ time: t1, position: "belowBar", shape: "arrowUp", color: upColor });
        if (prev >= EPS && curr < -EPS) markers.push({ time: t1, position: "aboveBar", shape: "arrowDown", color: downColor });
    }
    return markers;
}

/* ───────── 메인 함수 ───────── */
export async function mountDualDay2H({ mainRoot, symbol = "BTC", exchange = "upbit" }) {
    const LWC = window.LightweightCharts;
    if (!LWC) { mainRoot.innerHTML = '<p style="color:#f66">LightweightCharts 로드 실패</p>'; return () => { }; }

    // 레이아웃
    mainRoot.innerHTML = `
  <div id="dual-d2h" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;height:100%;">
    <div id="col-d"  style="display:grid;grid-template-rows:3fr 1fr;gap:6px;min-height:120px;">
      <div id="d-main" style="position:relative;"></div>
      <div id="d-sub"  style="position:relative; min-height:90px;"></div>
    </div>
    <div id="col-h2" style="display:grid;grid-template-rows:3fr 1fr;gap:6px;min-height:120px;">
      <div id="h2-main" style="position:relative;"></div>
      <div id="h2-sub"  style="position:relative; min-height:90px;"></div>
    </div>
  </div>`;

    const elDMain = mainRoot.querySelector("#d-main");
    const elDSub = mainRoot.querySelector("#d-sub");
    const elHMain = mainRoot.querySelector("#h2-main");
    const elHSub = mainRoot.querySelector("#h2-sub");

    purgeLegacyLegends(mainRoot);
    const legendD = ensureSingletonLegend(elDSub, "legend-daily-sub");
    const legendH = ensureSingletonLegend(elHSub, "legend-2h-sub");

    const ko = NAME_KO[symbol] || symbol;
    const quote = (exchange === "upbit") ? "KRW" : "USDT";
    const base = baseChartOptions(LWC);

    // 차트
    const chDMain = LWC.createChart(elDMain, base);
    const chDSub = LWC.createChart(elDSub, { ...base, rightPriceScale: { borderColor: "#2a2b31", scaleMargins: { top: .1, bottom: .1 } } });
    const chHMain = LWC.createChart(elHMain, base);
    const chHSub = LWC.createChart(elHSub, { ...base, rightPriceScale: { borderColor: "#2a2b31", scaleMargins: { top: .1, bottom: .1 } } });

    chDSub.applyOptions({ handleScroll: false, handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false } });
    chHSub.applyOptions({ handleScroll: false, handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false } });

    const tsLinkDaily = linkTimeScalesOneWay(chDMain, chDSub);
    const tsLink2H = linkTimeScalesOneWay(chHMain, chHSub);

    createTitleOverlay(elDMain, `${ko} 일봉 (${symbol}/${quote})`);
    createTitleOverlay(elHMain, `${ko} 2시간 (${symbol}/${quote})`);

    // 데이터
    const [dd, hd] = await Promise.all([
        loadCrypto({ symbol, timeframe: "daily", exchange }),
        loadCrypto({ symbol, timeframe: "2h", exchange }),
    ]);

    // 색
    const UP = "#26a69a", DOWN = "#ef5350";
    const COL = { ma5: "#ffffff", ma20: "red", ma60: "green", ma120: "darkorange", ma240: "magenta" };

    // 메인 세트
    function buildSet(chart, candles, maDefs) {
        const vol = chart.addHistogramSeries({
            priceScaleId: "vol", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false
        });
        vol.setData(candles.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? UP : DOWN })));
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: .8, bottom: 0 }, visible: false });

        const lines = {};
        maDefs.forEach(def => {
            const s = chart.addLineSeries({
                color: def.color, lineWidth: def.w || 3,
                priceLineVisible: !!def.pl, priceLineStyle: 0, priceLineWidth: 1, priceLineColor: def.color,
                lastValueVisible: def.lastValueVisible !== false,
            });
            s.setData(calculateSMA(candles, def.p));
            lines[`ma${def.p}`] = s;
        });

        const candle = chart.addCandlestickSeries({
            upColor: UP, downColor: DOWN, borderDownColor: DOWN, borderUpColor: UP,
            wickDownColor: DOWN, wickUpColor: UP,
            priceFormat: { type: "price", precision: 2, minMove: 0.01 },
            priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1,
        });
        candle.setData(candles);
        try { const last = candles.at(-1); candle.applyOptions({ priceLineColor: (last && last.close >= last.open) ? UP : DOWN }); } catch { }

        return { candle, vol, lines };
    }

    const dailySet = buildSet(chDMain, dd, [
        { p: 240, color: COL.ma240, w: 4 },
        { p: 120, color: COL.ma120, w: 1, lastValueVisible: false },
        { p: 60, color: COL.ma60, w: 3 },
        { p: 20, color: COL.ma20, w: 3, pl: true },
        { p: 5, color: COL.ma5, w: 2 },
    ]);
    const h2Set = buildSet(chHMain, hd, [
        { p: 240, color: COL.ma240, w: 4 },
        { p: 120, color: COL.ma120, w: 1, lastValueVisible: false },
        { p: 60, color: COL.ma60, w: 3, pl: true },
        { p: 20, color: COL.ma20, w: 3 },
        { p: 5, color: COL.ma5, w: 2, lastValueVisible: false },
    ]);
    try { dailySet.lines.ma120?.applyOptions({ lineStyle: 2 }); } catch { }
    try { h2Set.lines.ma120?.applyOptions({ lineStyle: 2 }); } catch { }

    // 메인 레전드
    const legendDailyMain = addMALegend(elDMain, [
        { c: COL.ma240, t: "MA240" }, { c: COL.ma120, t: "MA120" },
        { c: COL.ma60, t: "MA60" }, { c: COL.ma20, t: "MA20" }, { c: COL.ma5, t: "MA5" },
    ]);
    const legend2HMain = addMALegend(elHMain, [
        { c: COL.ma240, t: "MA240" }, { c: COL.ma120, t: "MA120" },
        { c: COL.ma60, t: "MA60" }, { c: COL.ma20, t: "MA20" }, { c: COL.ma5, t: "MA5" },
    ]);

    /* ───────── 보조지표 시리즈 ───────── */
    // RSI
    const rsiLine = chDSub.addLineSeries({ color: "#FFD700", lineWidth: 1 });
    const rsiBase30 = chDSub.addLineSeries({ color: "green", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const rsiBase70 = chDSub.addLineSeries({ color: "red", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const rsiRaw = calculateRSI(dd, 14);

    const h2_rsiLine = chHSub.addLineSeries({ color: "#FFD700", lineWidth: 1 });
    const h2_rsiB30 = chHSub.addLineSeries({ color: "green", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const h2_rsiB70 = chHSub.addLineSeries({ color: "red", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const h2_rsiRaw = calculateRSI(hd, 14);

    // ── 일봉 MAOSC (Mid: 본선=빨강 20-60, 보조=흰 5-60, 0선=초록(60)) ──
    const d_maoscBase = chDSub.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topFillColor1: "rgba(0,128,0,0.25)", topFillColor2: "rgba(0,128,0,0.25)",
        bottomFillColor1: "rgba(255,0,0,0.2)", bottomFillColor2: "rgba(255,0,0,0.2)",
        topLineColor: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)",
        priceLineVisible: false, lastValueVisible: false,
    });
    const d_maoscZero = chDSub.addLineSeries({ color: COL.ma60, lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
    const d_maoscMain = chDSub.addLineSeries({ color: COL.ma20, lineWidth: 1 });
    const d_maoWhite = chDSub.addLineSeries({ color: COL.ma5, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

    const d_mainRaw = calculateMAOscillator(dd, 20, 60);
    const d_whiteRaw = calculateMAOscillator(dd, 5, 60);
    const d_sigRaw = smaOfSeries(d_mainRaw, 5); // Signal 값은 레전드용(선은 그리지 않음)
    const d_crossMk = buildCrossMarkers(d_whiteRaw, d_mainRaw, "green", DOWN);

    // ── 2H MAOSC (Long: 본선=초록 60-240, 보조=빨강 20-240, 0선=마젠타(240)) ──
    const h_maoscBase = chHSub.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topFillColor1: "rgba(0,128,0,0.25)", topFillColor2: "rgba(0,128,0,0.25)",
        bottomFillColor1: "rgba(255,0,0,0.2)", bottomFillColor2: "rgba(255,0,0,0.2)",
        topLineColor: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)",
        priceLineVisible: false, lastValueVisible: false,
    });
    const h_maoscZero = chHSub.addLineSeries({ color: COL.ma240, lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
    const h_maoscMain = chHSub.addLineSeries({ color: COL.ma60, lineWidth: 1 });
    const h_maoWhite = chHSub.addLineSeries({ color: COL.ma20, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

    const h_mainRaw = calculateMAOscillator(hd, 60, 240);
    const h_whiteRaw = calculateMAOscillator(hd, 20, 240);
    const h_sigRaw = smaOfSeries(h_mainRaw, 20); // 선 미표시
    const h_crossMk = buildCrossMarkers(h_whiteRaw, h_mainRaw, "green", DOWN);

    // Disparity
    const d_dispBase100 = chDSub.addBaselineSeries({
        baseValue: { type: 'price', price: 100 },
        topFillColor1: 'rgba(0,128,0,0.25)', topFillColor2: 'rgba(0,128,0,0.25)',
        bottomFillColor1: 'rgba(255,0,0,0.2)', bottomFillColor2: 'rgba(255,0,0,0.2)',
        topLineColor: 'rgba(0,0,0,0)', bottomLineColor: 'rgba(0,0,0,0)',
        priceLineVisible: false, lastValueVisible: false,
    });
    const d_dispLine = chDSub.addLineSeries({ color: 'red', lineWidth: 1 });
    const d_dispRef = chDSub.addLineSeries({ color: 'green', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

    const h_dispBase100 = chHSub.addBaselineSeries({
        baseValue: { type: 'price', price: 100 },
        topFillColor1: 'rgba(0,128,0,0.25)', topFillColor2: 'rgba(0,128,0,0.25)',
        bottomFillColor1: 'rgba(255,0,0,0.2)', bottomFillColor2: 'rgba(255,0,0,0.2)',
        topLineColor: 'rgba(0,0,0,0)', bottomLineColor: 'rgba(0,0,0,0)',
        priceLineVisible: false, lastValueVisible: false,
    });
    const h_dispLine = chHSub.addLineSeries({ color: 'green', lineWidth: 1 });
    const h_dispRef = chHSub.addLineSeries({ color: 'magenta', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

    const ma20 = calculateSMA(dd, 20);
    const ma60 = calculateSMA(hd, 60);
    const dClose = new Map(dd.map(c => [c.time, c.close]));
    const hClose = new Map(hd.map(c => [c.time, c.close]));
    const d_dispRaw = ma20.filter(m => Number.isFinite(m.value) && dClose.has(m.time))
        .map(m => ({ time: m.time, value: (dClose.get(m.time) / m.value) * 100 }));
    const h_dispRaw = ma60.filter(m => Number.isFinite(m.value) && hClose.has(m.time))
        .map(m => ({ time: m.time, value: (hClose.get(m.time) / m.value) * 100 }));

    // MACD
    const d_macdLine = chDSub.addLineSeries({ color: 'red', lineWidth: 1 });
    const d_sigLine = chDSub.addLineSeries({ color: 'yellow', lineWidth: 1 });
    const d_hist = chDSub.addHistogramSeries({ base: 0 });
    const { macd: d_macdRaw, signal: d_sigRaw2, histogram: d_histRaw } = calculateMACD(dd);

    const h_macdLine = chHSub.addLineSeries({ color: 'red', lineWidth: 1 });
    const h_sigLine = chHSub.addLineSeries({ color: 'yellow', lineWidth: 1 });
    const h_hist = chHSub.addHistogramSeries({ base: 0 });
    const { macd: h_macdRaw, signal: h_sigRaw2, histogram: h_histRaw } = calculateMACD(hd);

    /* ───────── 초기 표기 ───────── */
    // 일봉 MAOSC
    d_maoscBase.setData(padWithWhitespace(dd, d_mainRaw));
    d_maoscMain.setData(padWithWhitespace(dd, d_mainRaw));
    d_maoWhite.setData(padWithWhitespace(dd, d_whiteRaw));
    d_maoscZero.setData(dd.map(c => ({ time: c.time, value: 0 })));
    d_maoWhite.setMarkers(d_crossMk);

    // 2H MAOSC
    h_maoscBase.setData(padWithWhitespace(hd, h_mainRaw));
    h_maoscMain.setData(padWithWhitespace(hd, h_mainRaw));
    h_maoWhite.setData(padWithWhitespace(hd, h_whiteRaw));
    h_maoscZero.setData(hd.map(c => ({ time: c.time, value: 0 })));
    h_maoWhite.setMarkers(h_crossMk);

    ensureRSIPulseStyle(); ensureDISPPulseStyle();
    const d_dot = document.createElement("div");
    Object.assign(d_dot.style, { position: "absolute", width: "8px", height: "8px", borderRadius: "50%", background: "#FFB74D", pointerEvents: "none", zIndex: 6, animation: "l2fmDISPPulse 1.6s ease-out infinite", left: "-9999px", top: "-9999px" });
    elDSub.appendChild(d_dot);
    const h2_dot = document.createElement("div");
    Object.assign(h2_dot.style, { position: "absolute", width: "8px", height: "8px", borderRadius: "50%", background: "#FFD700", pointerEvents: "none", zIndex: 6, animation: "l2fmPulse 1.6s ease-out infinite", left: "-9999px", top: "-9999px" });
    elHSub.appendChild(h2_dot);

    const placeDot = (subChart, series, data, dotEl) => {
        if (!data?.length) { dotEl.style.left = dotEl.style.top = "-9999px"; return; }
        const last = data.at(-1);
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = series.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) { dotEl.style.left = (x - 4) + "px"; dotEl.style.top = (y - 4) + "px"; }
        else { dotEl.style.left = dotEl.style.top = "-9999px"; }
    };

    let daySubCurrent = "MAOSC";
    let h2SubCurrent = "MAOSC";

    /* ───────── 보조 표시 함수 ───────── */
    function clearDayAll() {
        rsiLine.setData([]); rsiBase30.setData([]); rsiBase70.setData([]);
        d_dispBase100.setData([]); d_dispLine.setData([]); d_dispRef.setData([]);
        d_macdLine.setData([]); d_sigLine.setData([]); d_hist.setData([]);

        d_maoscBase.setData([]); d_maoscMain.setData([]); d_maoWhite.setData([]); d_maoscZero.setData([]); d_maoWhite.setMarkers([]);
    }
    function clearH2All() {
        h2_rsiLine.setData([]); h2_rsiB30.setData([]); h2_rsiB70.setData([]);
        h_dispBase100.setData([]); h_dispLine.setData([]); h_dispRef.setData([]);
        h_macdLine.setData([]); h_sigLine.setData([]); h_hist.setData([]);

        h_maoscBase.setData([]); h_maoscMain.setData([]); h_maoWhite.setData([]); h_maoscZero.setData([]); h_maoWhite.setMarkers([]);
    }

    function showDayMAOSC() {
        d_maoscBase.setData(padWithWhitespace(dd, d_mainRaw));
        d_maoscMain.setData(padWithWhitespace(dd, d_mainRaw));
        d_maoWhite.setData(padWithWhitespace(dd, d_whiteRaw));
        d_maoscZero.setData(dd.map(c => ({ time: c.time, value: 0 })));
        d_maoWhite.setMarkers(d_crossMk);

        setLegendText(legendD, "MA Oscillator(20-60)/Signal 5");

        rsiLine.setData([]); rsiBase30.setData([]); rsiBase70.setData([]);
        d_dispBase100.setData([]); d_dispLine.setData([]); d_dispRef.setData([]);
        d_macdLine.setData([]); d_sigLine.setData([]); d_hist.setData([]);

        daySubCurrent = "MAOSC"; placeDot(chDSub, d_maoscMain, d_mainRaw, d_dot);
    }
    function showH2MAOSC() {
        h_maoscBase.setData(padWithWhitespace(hd, h_mainRaw));
        h_maoscMain.setData(padWithWhitespace(hd, h_mainRaw));
        h_maoWhite.setData(padWithWhitespace(hd, h_whiteRaw));
        h_maoscZero.setData(hd.map(c => ({ time: c.time, value: 0 })));
        h_maoWhite.setMarkers(h_crossMk);

        setLegendText(legendH, "MA Oscillator(60-240)/Signal 20");

        h2_rsiLine.setData([]); h2_rsiB30.setData([]); h2_rsiB70.setData([]);
        h_dispBase100.setData([]); h_dispLine.setData([]); h_dispRef.setData([]);
        h_macdLine.setData([]); h_sigLine.setData([]); h_hist.setData([]);

        h2SubCurrent = "MAOSC"; placeDot(chHSub, h_maoscMain, h_mainRaw, h2_dot);
    }
    function showDayRSI() {
        rsiLine.setData(padWithWhitespace(dd, rsiRaw));
        rsiBase30.setData(dd.map(c => ({ time: c.time, value: 30 })));
        rsiBase70.setData(dd.map(c => ({ time: c.time, value: 70 })));
        const v = rsiRaw.at(-1)?.value; setLegendText(legendD, `RSI(14): ${Number.isFinite(v) ? v.toFixed(1) : "—"}`);

        d_maoscBase.setData([]); d_maoscMain.setData([]); d_maoWhite.setData([]); d_maoscZero.setData([]); d_maoWhite.setMarkers([]);
        d_dispBase100.setData([]); d_dispLine.setData([]); d_dispRef.setData([]);
        d_macdLine.setData([]); d_sigLine.setData([]); d_hist.setData([]);

        daySubCurrent = "RSI"; placeDot(chDSub, rsiLine, rsiRaw, d_dot);
    }
    function showH2RSI() {
        h2_rsiLine.setData(padWithWhitespace(hd, h2_rsiRaw));
        h2_rsiB30.setData(hd.map(c => ({ time: c.time, value: 30 })));
        h2_rsiB70.setData(hd.map(c => ({ time: c.time, value: 70 })));
        const v = h2_rsiRaw.at(-1)?.value; setLegendText(legendH, `RSI(14): ${Number.isFinite(v) ? v.toFixed(1) : "—"}`);

        h_maoscBase.setData([]); h_maoscMain.setData([]); h_maoWhite.setData([]); h_maoscZero.setData([]); h_maoWhite.setMarkers([]);
        h_dispBase100.setData([]); h_dispLine.setData([]); h_dispRef.setData([]);
        h_macdLine.setData([]); h_sigLine.setData([]); h_hist.setData([]);

        h2SubCurrent = "RSI"; placeDot(chHSub, h2_rsiLine, h2_rsiRaw, h2_dot);
    }
    function showDayDISP() {
        d_dispBase100.setData(dd.map(c => ({ time: c.time, value: 100 })));
        d_dispLine.setData(padWithWhitespace(dd, d_dispRaw));
        d_dispRef.setData(dd.map(c => ({ time: c.time, value: 100 })));
        const v = d_dispRaw.at(-1)?.value; setLegendText(legendD, `Disparity(20): ${Number.isFinite(v) ? v.toFixed(1) : "—"}%`);

        d_maoscBase.setData([]); d_maoscMain.setData([]); d_maoWhite.setData([]); d_maoscZero.setData([]); d_maoWhite.setMarkers([]);
        rsiLine.setData([]); rsiBase30.setData([]); rsiBase70.setData([]);
        d_macdLine.setData([]); d_sigLine.setData([]); d_hist.setData([]);

        daySubCurrent = "DISP"; placeDot(chDSub, d_dispLine, d_dispRaw, d_dot);
    }
    function showH2DISP() {
        h_dispBase100.setData(hd.map(c => ({ time: c.time, value: 100 })));
        h_dispLine.setData(padWithWhitespace(hd, h_dispRaw));
        h_dispRef.setData(hd.map(c => ({ time: c.time, value: 100 })));
        const v = h_dispRaw.at(-1)?.value; setLegendText(legendH, `Disparity(60): ${Number.isFinite(v) ? v.toFixed(1) : "—"}%`);

        h_maoscBase.setData([]); h_maoscMain.setData([]); h_maoWhite.setData([]); h_maoscZero.setData([]); h_maoWhite.setMarkers([]);
        h2_rsiLine.setData([]); h2_rsiB30.setData([]); h2_rsiB70.setData([]);
        h_macdLine.setData([]); h_sigLine.setData([]); h_hist.setData([]);

        h2SubCurrent = "DISP"; placeDot(chHSub, h_dispLine, h_dispRaw, h2_dot);
    }
    function showDayMACD() {
        d_macdLine.setData(padWithWhitespace(dd, d_macdRaw));
        d_sigLine.setData(padWithWhitespace(dd, d_sigRaw2));
        d_hist.setData(padWithWhitespace(dd, mapHistColors(d_histRaw)));
        const m = d_macdRaw.at(-1)?.value, s = d_sigRaw2.at(-1)?.value;
        setLegendText(legendD, `MACD(12,26,9): ${Number.isFinite(m) ? m.toFixed(2) : "—"} | Signal: ${Number.isFinite(s) ? s.toFixed(2) : "—"}`);

        d_maoscBase.setData([]); d_maoscMain.setData([]); d_maoWhite.setData([]); d_maoscZero.setData([]); d_maoWhite.setMarkers([]);
        rsiLine.setData([]); rsiBase30.setData([]); rsiBase70.setData([]);
        d_dispBase100.setData([]); d_dispLine.setData([]); d_dispRef.setData([]);

        daySubCurrent = "MACD"; placeDot(chDSub, d_macdLine, d_macdRaw, d_dot);
    }
    function showH2MACD() {
        h_macdLine.setData(padWithWhitespace(hd, h_macdRaw));
        h_sigLine.setData(padWithWhitespace(hd, h_sigRaw2));
        h_hist.setData(padWithWhitespace(hd, mapHistColors(h_histRaw)));
        const m = h_macdRaw.at(-1)?.value, s = h_sigRaw2.at(-1)?.value;
        setLegendText(legendH, `MACD(12,26,9): ${Number.isFinite(m) ? m.toFixed(2) : "—"} | Signal: ${Number.isFinite(s) ? s.toFixed(2) : "—"}`);

        h_maoscBase.setData([]); h_maoscMain.setData([]); h_maoWhite.setData([]); h_maoscZero.setData([]); h_maoWhite.setMarkers([]);
        h2_rsiLine.setData([]); h2_rsiB30.setData([]); h2_rsiB70.setData([]);
        h_dispBase100.setData([]); h_dispLine.setData([]); h_dispRef.setData([]);

        h2SubCurrent = "MACD"; placeDot(chHSub, h_macdLine, h_macdRaw, h2_dot);
    }

    // 초기 화면
    setInitialVisibleRange(chDMain, dd, 160);
    setInitialVisibleRange(chHMain, hd, 320);
    showDayMAOSC(); showH2MAOSC();

    // 더블클릭 초기화
    const onDblDaily = () => { setInitialVisibleRange(chDMain, dd, 160); setTimeout(() => refreshDots(), 0); };
    const onDblH2 = () => { setInitialVisibleRange(chHMain, hd, 320); setTimeout(() => refreshDots(), 0); };
    elDMain.addEventListener("dblclick", onDblDaily);
    elHMain.addEventListener("dblclick", onDblH2);

    // 가격축 폭 동기화
    const paLink = observeAndSyncPriceAxisWidth([
        { chart: chDMain, container: elDMain },
        { chart: chDSub, container: elDSub },
        { chart: chHMain, container: elHMain },
        { chart: chHSub, container: elHSub },
    ]);

    // 툴바
    const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
    const btnTrend = document.querySelector('.main-toolbar [data-action="trendline"]');
    const btnMAO = document.querySelector('.main-toolbar [data-action="ma_oscillator"]');
    const btnRSI = document.querySelector('.main-toolbar [data-action="rsi"]');
    const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');
    const btnMACD = document.querySelector('.main-toolbar [data-action="macd"]');

    const setActive = (btn, on) => { if (!btn) return; on ? btn.classList.add("active-preset") : btn.classList.remove("active-preset"); };
    function syncToolbarActive() {
        setActive(btnMAO, (daySubCurrent === "MAOSC" || h2SubCurrent === "MAOSC"));
        setActive(btnRSI, (daySubCurrent === "RSI" || h2SubCurrent === "RSI"));
        setActive(btnDISP, (daySubCurrent === "DISP" || h2SubCurrent === "DISP"));
        setActive(btnMACD, (daySubCurrent === "MACD" || h2SubCurrent === "MACD"));
    }
    syncToolbarActive();

    // 생명선/추세선(기존)
    const LIFE_RED = "red", LIFE_YELLOW = "#FFD700";
    let lifelineOn = false, lifelineTimer = null, lifeFlip = false;
    function setLifeColor(c) { try { dailySet.lines.ma20.applyOptions({ color: c }); } catch { } }
    function startLifeline() {
        lifelineOn = true; setActive(btnLife, true); setLifeColor(LIFE_YELLOW);
        lifelineTimer = setInterval(() => { lifeFlip = !lifeFlip; setLifeColor(lifeFlip ? LIFE_RED : LIFE_YELLOW); }, 1500);
    }
    function stopLifeline() { lifelineOn = false; setActive(btnLife, false); if (lifelineTimer) { clearInterval(lifelineTimer); lifelineTimer = null; } lifeFlip = false; setLifeColor(LIFE_RED); }

    const TREND_GREEN = "green", TREND_LIGHT = "#7CFC00";
    let trendOn = false, trendTimer = null, trendFlip = false;
    function setTrendColor(c) { try { dailySet.lines.ma60.applyOptions({ color: c }); } catch { } try { h2Set.lines.ma60.applyOptions({ color: c }); } catch { } }
    function startTrend() {
        trendOn = true; setActive(btnTrend, true); setTrendColor(TREND_LIGHT);
        trendTimer = setInterval(() => { trendFlip = !trendFlip; setTrendColor(trendFlip ? TREND_GREEN : TREND_LIGHT); }, 1500);
    }
    function stopTrend() { trendOn = false; setActive(btnTrend, false); if (trendTimer) { clearInterval(trendTimer); trendTimer = null; } trendFlip = false; setTrendColor(TREND_GREEN); }

    function bindSingleVsDouble(btn, onSingle, onDouble, delay = 220) {
        if (!btn) return () => { };
        let timer = null;
        const handler = () => {
            if (timer) { clearTimeout(timer); timer = null; onDouble?.(); return; }
            timer = setTimeout(() => { timer = null; onSingle?.(); }, delay);
        };
        btn.addEventListener("click", handler);
        return () => btn.removeEventListener("click", handler);
    }

    const onLife = () => lifelineOn ? stopLifeline() : startLifeline();
    const onTrend = () => trendOn ? stopTrend() : startTrend();
    btnLife?.addEventListener("click", onLife);
    btnTrend?.addEventListener("click", onTrend);

    const offMAO = bindSingleVsDouble(btnMAO, () => { showDayMAOSC(); showH2MAOSC(); syncToolbarActive(); refreshDots(); },
        () => { showH2MAOSC(); syncToolbarActive(); refreshDots(); });
    const offRSI = bindSingleVsDouble(btnRSI, () => { showDayRSI(); showH2RSI(); syncToolbarActive(); refreshDots(); },
        () => { showH2RSI(); syncToolbarActive(); refreshDots(); });
    const offDISP = bindSingleVsDouble(btnDISP, () => { showDayDISP(); showH2DISP(); syncToolbarActive(); refreshDots(); },
        () => { showH2DISP(); syncToolbarActive(); refreshDots(); });
    const offMACD = bindSingleVsDouble(btnMACD, () => { showDayMACD(); showH2MACD(); syncToolbarActive(); refreshDots(); },
        () => { showH2MACD(); syncToolbarActive(); refreshDots(); });

    function refreshDots() {
        try {
            if (daySubCurrent === "MAOSC") placeDot(chDSub, d_maoscMain, d_mainRaw, d_dot);
            else if (daySubCurrent === "RSI") placeDot(chDSub, rsiLine, rsiRaw, d_dot);
            else if (daySubCurrent === "DISP") placeDot(chDSub, d_dispLine, d_dispRaw, d_dot);
            else if (daySubCurrent === "MACD") placeDot(chDSub, d_macdLine, d_macdRaw, d_dot);
        } catch { }
        try {
            if (h2SubCurrent === "MAOSC") placeDot(chHSub, h_maoscMain, h_mainRaw, h2_dot);
            else if (h2SubCurrent === "RSI") placeDot(chHSub, h2_rsiLine, h2_rsiRaw, h2_dot);
            else if (h2SubCurrent === "DISP") placeDot(chHSub, h_dispLine, h_dispRaw, h2_dot);
            else if (h2SubCurrent === "MACD") placeDot(chHSub, h_macdLine, h_macdRaw, h2_dot);
        } catch { }
    }

    try { chDSub.timeScale().subscribeVisibleTimeRangeChange(refreshDots); } catch { }
    try { chHSub.timeScale().subscribeVisibleTimeRangeChange(refreshDots); } catch { }
    const roD = new ResizeObserver(refreshDots);
    const roH = new ResizeObserver(refreshDots);
    try { roD.observe(elDSub); } catch { }
    try { roH.observe(elHSub); } catch { }
    refreshDots();

    // 정리
    return () => {
        btnLife?.removeEventListener("click", onLife);
        btnTrend?.removeEventListener("click", onTrend);
        try { offMAO?.(); offRSI?.(); offDISP?.(); offMACD?.(); } catch { }

        try { elDMain.removeChild(legendDailyMain); } catch { }
        try { elHMain.removeChild(legend2HMain); } catch { }

        try { legendD.remove(); } catch { }
        try { legendH.remove(); } catch { }

        try { elDSub.removeChild(d_dot); } catch { }
        try { elHSub.removeChild(h2_dot); } catch { }

        try { roD.disconnect(); roH.disconnect(); } catch { }
        try { tsLinkDaily?.dispose?.(); tsLink2H?.dispose?.(); } catch { }
        try { chDMain.remove(); chDSub.remove(); chHMain.remove(); chHSub.remove(); } catch { }
    };
}

export function dispose() { }
