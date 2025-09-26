// US 주봉(싱글) — 볼륨 / MA(4/12/26/52/104) / RSI(12) / MACD(12,52,9) / MAOSC(12-52),4 / Disparity(12)
import { calculateRSI } from "../../crypto/indicators/rsi.js";
import { calculateMACD } from "../../crypto/indicators/macd.js";
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import { calculateMAOscillator } from "../../crypto/indicators/maOscillator.js";
import observeAndSyncPriceAxisWidth from "../../crypto/sync/priceAxisSync.js";
import {
    baseChartOptions,
    linkTimeScalesOneWay,
    padWithWhitespace,
    resyncAxisPadding,
    setInitialVisibleRange,
    createTitleOverlay,
} from "../../crypto/preset/_common.js";

// ── 데이터 로더: usStocks/data/dataLoader.js 의 loadEquity 를 직접 사용
async function loadUSCandlesSafe({ symbol, timeframe }) {
    const mod = await import(`../data/dataLoader.js?v=${Date.now()}`);
    const fn = mod?.loadEquity;
    if (typeof fn !== "function") {
        console.warn("[usSingleWeekly] US data loader exports:", Object.keys(mod || {}));
        throw new Error("US data loader not found in plugins/usStocks/data/dataLoader.js");
    }
    // dataLoader가 timeframe 별칭(d,w,m,1w 등)을 내부에서 정규화함
    return await fn({ symbol, timeframe });
}

const INITIAL_BARS_WEEKLY = 220;
const UP = "#26a69a", DOWN = "#ef5350";

export async function mountSingleWeekly({ mainRoot, mountId, symbol = "AAPL" } = {}) {
    if (!mainRoot && mountId) {
        const el = document.getElementById(mountId);
        if (el) mainRoot = el;
    }
    if (!mainRoot) mainRoot = document.getElementById("main-content-area");

    const LWC = window.LightweightCharts;
    if (!LWC) { mainRoot.innerHTML = '<p style="color:#f66">LightweightCharts 로드 실패</p>'; return () => { }; }

    // 레이아웃
    mainRoot.innerHTML = `
  <div id="l2fm-us-singleWeekly" style="display:grid;grid-template-rows:4fr 1fr;gap:6px;height:100%;">
    <div id="wmain" style="min-height:120px; position:relative;"></div>
    <div id="wsub"  style="min-height:90px;  position:relative;"></div>
  </div>`;
    const elMain = mainRoot.querySelector("#wmain");
    const elSub = mainRoot.querySelector("#wsub");

    // 타이틀
    createTitleOverlay(elMain, `${symbol} (US • Weekly)`);

    // 차트
    const base = baseChartOptions(LWC);
    const mainChart = LWC.createChart(elMain, base);
    const subChart = LWC.createChart(elSub, {
        ...base,
        rightPriceScale: { borderColor: "#2a2b31", scaleMargins: { top: 0.1, bottom: 0.1 } },
    });
    subChart.applyOptions({
        handleScroll: false,
        handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false },
    });

    // 데이터
    let candles = [];
    try {
        candles = await loadUSCandlesSafe({ symbol, timeframe: "weekly" });
    } catch (e) {
        console.error("[usSingleWeekly] 데이터 로드 실패:", e);
        elMain.innerHTML = `<div style="padding:12px;color:#f66">주봉 데이터 로드 실패: ${String(e?.message || e)}</div>`;
        return () => { };
    }

    // ── 볼륨
    const vol = mainChart.addHistogramSeries({
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
    });
    vol.setData(candles.map(c => ({ time: c.time, value: c.volume ?? 0, color: (c.close >= c.open) ? UP : DOWN })));
    mainChart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

    // ── 이동평균 (주봉 전용 규격)
    // MA4(빨강,3), MA12(녹색,3), MA26(밝은 오렌지,1,점선), MA52(마젠타,4), MA104(흰색,4)
    const ma104 = mainChart.addLineSeries({ color: "white", lineWidth: 4, priceLineVisible: false });
    const ma052 = mainChart.addLineSeries({ color: "magenta", lineWidth: 4, priceLineVisible: false });
    const ma026 = mainChart.addLineSeries({ color: "#FFA500", lineWidth: 1, priceLineVisible: false }); // 밝은 오렌지
    const ma012 = mainChart.addLineSeries({ color: "green", lineWidth: 3, priceLineVisible: false });
    const ma004 = mainChart.addLineSeries({ color: "red", lineWidth: 3, priceLineVisible: false });

    ma104.setData(calculateSMA(candles, 104));
    ma052.setData(calculateSMA(candles, 52));
    ma026.setData(calculateSMA(candles, 26));
    ma012.setData(calculateSMA(candles, 12));
    ma004.setData(calculateSMA(candles, 4));
    try { ma026.applyOptions({ lineStyle: 2 /* 점선 */ }); } catch { }

    // ── 캔들
    const candle = mainChart.addCandlestickSeries({
        upColor: UP, downColor: DOWN, borderDownColor: DOWN, borderUpColor: UP,
        wickDownColor: DOWN, wickUpColor: UP,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1,
    });
    candle.setData(candles);
    try {
        const last = candles.at(-1);
        candle.applyOptions({ priceLineColor: (last && last.close >= last.open) ? UP : DOWN });
    } catch { }

    // ── 메인 MA 레전드
    const maLegend = document.createElement("div");
    Object.assign(maLegend.style, {
        position: "absolute", top: "6px", left: "8px",
        display: "flex", gap: "12px", alignItems: "center",
        fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
        textShadow: "0 0 4px rgba(0,0,0,0.5)", pointerEvents: "none", zIndex: 7,
    });
    const item = (color, label) => {
        const w = document.createElement("div"); w.style.display = "flex"; w.style.alignItems = "center"; w.style.gap = "6px";
        const dot = document.createElement("span");
        Object.assign(dot.style, { display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: color });
        const t = document.createElement("span"); t.textContent = label;
        w.appendChild(dot); w.appendChild(t); return w;
    };
    [["white", "MA104"], ["magenta", "MA52"], ["#FFA500", "MA26"], ["green", "MA12"], ["red", "MA4"]]
        .forEach(([c, l]) => maLegend.appendChild(item(c, l)));
    elMain.appendChild(maLegend);

    // ── 보조지표 (RSI(12) / MACD(12,52,9) / MAOSC(12-52),4 / Disparity(12))
    const rsiLine = subChart.addLineSeries({ color: "#FFD700", lineWidth: 1 });
    const rsiBase30 = subChart.addLineSeries({ color: "green", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const rsiBase70 = subChart.addLineSeries({ color: "red", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

    const macdLine = subChart.addLineSeries({ color: "green", lineWidth: 1 });
    const sigLine = subChart.addLineSeries({ color: "red", lineWidth: 1 });

    // === MA Oscillator: 본선(12-52, 12주색=green, 1px) / 비교선(4-52, 4주색=red, 1px) / 기준선(0선=magenta, 1px)
    const maoscFill = subChart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topFillColor1: "rgba(0,128,0,.25)", topFillColor2: "rgba(0,128,0,.25)",
        bottomFillColor1: "rgba(255,0,0,.2)", bottomFillColor2: "rgba(255,0,0,.2)",
        topLineColor: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)",
        priceLineVisible: false, lastValueVisible: false,
    });
    const maoscLine = subChart.addLineSeries({ color: "green", lineWidth: 1 }); // 12-52 → 12주선 색상/1px
    const maoWhite = subChart.addLineSeries({ color: "red", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); // 4-52 → 4주선 색상/1px
    const maoscZero = subChart.addLineSeries({ color: "magenta", lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false }); // 기준선 1px

    const disparityBase100 = subChart.addLineSeries({ color: "#FFD700", lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
    const disparityFill = subChart.addBaselineSeries({
        baseValue: { type: "price", price: 100 },
        topFillColor1: "rgba(0,128,0,.25)", topFillColor2: "rgba(0,128,0,.25)",
        bottomFillColor1: "rgba(255,0,0,.2)", bottomFillColor2: "rgba(255,0,0,.2)",
        topLineColor: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)",
        priceLineVisible: false, lastValueVisible: false,
    });
    const disparityLine = subChart.addLineSeries({ color: "#FF6F00", lineWidth: 1 });

    // 계산
    const rsiRaw = calculateRSI(candles, 12);                 // RSI(12)
    const { macd: macdRaw, signal: sigRaw } = calculateMACD(  // MACD(12,52,9)
        candles, 12, 52, 9
    );

    // MAOSC 본선(12-52)
    const maoscRaw = calculateMAOscillator(candles, 12, 52);

    // 비교선(4-52) 및 교차(4-12) 마커
    const sma4 = calculateSMA(candles, 4);
    const sma12 = calculateSMA(candles, 12);
    const sma52 = calculateSMA(candles, 52);

    const toMap = arr => new Map(arr.filter(x => Number.isFinite(x?.value)).map(x => [x.time, x.value]));
    const m4 = toMap(sma4), m12 = toMap(sma12), m52 = toMap(sma52);

    const whiteRaw = candles
        .map(c => ({ time: c.time, value: (m4.get(c.time) ?? NaN) - (m52.get(c.time) ?? NaN) }))
        .filter(x => Number.isFinite(x.value));

    // 교차(4-12): (4-52) vs (12-52) == (4-12)
    function makeCrossMarkers(whiteSeries, redSeries) {
        const redByTime = new Map(redSeries.map(x => [x.time, x.value]));
        const markers = [];
        const EPS = 1e-8;
        for (let i = 1; i < whiteSeries.length; i++) {
            const t = whiteSeries[i].time;
            const t0 = whiteSeries[i - 1].time;
            if (!redByTime.has(t) || !redByTime.has(t0)) continue;
            const diffPrev = whiteSeries[i - 1].value - redByTime.get(t0);
            const diffCurr = whiteSeries[i].value - redByTime.get(t);
            if (diffPrev <= EPS && diffCurr > EPS) markers.push({ time: t, position: "belowBar", color: "#16a34a", shape: "arrowUp" }); // 골드
            if (diffPrev >= -EPS && diffCurr < -EPS) markers.push({ time: t, position: "aboveBar", color: "#ef4444", shape: "arrowDown" }); // 데드
        }
        return markers;
    }
    const maoMarkers = makeCrossMarkers(whiteRaw, maoscRaw);

    // Disparity(12)
    const ma12d = calculateSMA(candles, 12);
    const closeMap = new Map(candles.map(c => [c.time, c.close]));
    const dispRaw = ma12d
        .filter(m => Number.isFinite(m.value) && closeMap.has(m.time))
        .map(m => ({ time: m.time, value: (closeMap.get(m.time) / m.value) * 100 }));

    // ── 보조 레전드
    function mkLegend() {
        const b = document.createElement("div");
        Object.assign(b.style, {
            position: "absolute", top: "6px", left: "8px",
            display: "none", gap: "8px", padding: "4px 6px",
            fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
            background: "rgba(0,0,0,0.0)", pointerEvents: "none", zIndex: 7
        });
        elSub.appendChild(b);
        return b;
    }
    const legendRSI = mkLegend();
    const legendMACD = mkLegend();
    const legendMAO = mkLegend();
    const legendDISP = mkLegend();

    const hideLegends = () => {
        legendRSI.style.display = "none";
        legendMACD.style.display = "none";
        legendMAO.style.display = "none";
        legendDISP.style.display = "none";
    };

    const renderRSI = () => {
        const v = rsiRaw.at(-1)?.value;
        if (!Number.isFinite(v)) { legendRSI.style.display = "none"; return; }
        legendRSI.innerHTML = `RSI(12): <span style="color:#FFD700">${v.toFixed(1)}</span> <span style="opacity:.7;margin:0 6px;">|</span> Base: <span style="color:green">30</span> / <span style="color:red">70</span>`;
        legendRSI.style.display = "";
    };
    const renderMACD = () => {
        const m = macdRaw.at(-1)?.value, s = sigRaw.at(-1)?.value;
        if (!Number.isFinite(m) || !Number.isFinite(s)) { legendMACD.style.display = "none"; return; }
        legendMACD.innerHTML = `MACD(12,52,9) <span style="opacity:.7;margin:0 6px;">|</span> MACD: <span style="color:green">${m.toFixed(4)}</span> <span style="opacity:.7;margin:0 6px;">|</span> Signal: <span style="color:red">${s.toFixed(4)}</span>`;
        legendMACD.style.display = "";
    };
    const renderMAO = () => {
        legendMAO.innerHTML = `<span style="color:#fff">MA_Oscillator(</span><span style="color:green">12</span><span style="color:#fff">-</span><span style="color:magenta">52</span><span style="color:#fff">), </span><span style="color:red">4</span>`;
        legendMAO.style.display = "";
    };
    const renderDISP = () => {
        const v = dispRaw.at(-1)?.value;
        if (!Number.isFinite(v)) { legendDISP.style.display = "none"; return; }
        const cc = v >= 100 ? "green" : "red";
        legendDISP.innerHTML = `Disparity(12): <span style="color:${cc}">${v.toFixed(1)}%</span> <span style="opacity:.7;margin:0 6px;">|</span> Base: <span style="color:#FFD700">100</span>`;
        legendDISP.style.display = "";
    };

    // ── 도트(펄스) — MAO 최신값 위치
    (function ensurePulseStyles() {
        const make = (id, css) => { if (!document.getElementById(id)) { const st = document.createElement("style"); st.id = id; st.textContent = css; document.head.appendChild(st); } };
        make("l2fm-maosc-pulse-style", `@keyframes l2fmMAOSCPulse{0%{box-shadow:0 0 0 0 rgba(0,255,0,.55);opacity:1;}70%{box-shadow:0 0 0 12px rgba(0,255,0,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(0,255,0,0);opacity:.85;}}`);
    })();
    const mkDot = (bg, anim) => {
        const d = document.createElement("div");
        Object.assign(d.style, { position: "absolute", width: "8px", height: "8px", borderRadius: "50%", background: bg, pointerEvents: "none", zIndex: 5, left: "-9999px", top: "-9999px", animation: `${anim} 1.6s ease-out infinite` });
        elSub.appendChild(d);
        return d;
    };
    const maoDot = mkDot("green", "l2fmMAOSCPulse");
    const posDot = (series, last) => {
        const x = subChart.timeScale()?.timeToCoordinate(last?.time);
        const y = series?.priceToCoordinate?.(last?.value);
        return (Number.isFinite(x) && Number.isFinite(y)) ? { x: x - 4, y: y - 4 } : null;
    };
    const positionMAODot = () => {
        const last = maoscRaw.at(-1);
        const p = posDot(maoscLine, last);
        if (p) { maoDot.style.left = p.x + "px"; maoDot.style.top = p.y + "px"; } else maoDot.style.left = maoDot.style.top = "-9999px";
    };

    // ── 토글
    let current = "MAOSC";
    const pairs = [{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }];
    const clearAll = () => {
        rsiLine.setData([]); rsiBase30.setData([]); rsiBase70.setData([]);
        macdLine.setData([]); sigLine.setData([]);
        maoscFill.setData([]); maoscLine.setData([]); maoscZero.setData([]); maoWhite.setData([]);
        disparityFill.setData([]); disparityLine.setData([]); disparityBase100.setData([]);
        hideLegends();
        maoDot.style.left = maoDot.style.top = "-9999px";
    };

    function showRSI() {
        current = "RSI"; clearAll();
        rsiLine.setData(padWithWhitespace(candles, rsiRaw));
        rsiBase30.setData(candles.map(c => ({ time: c.time, value: 30 })));
        rsiBase70.setData(candles.map(c => ({ time: c.time, value: 70 })));
        renderRSI(); requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showMACD() {
        current = "MACD"; clearAll();
        macdLine.setData(padWithWhitespace(candles, macdRaw));
        sigLine.setData(padWithWhitespace(candles, sigRaw));
        renderMACD(); requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showMAOSC() {
        current = "MAOSC"; clearAll();
        // 본선/비교선/0선 + 마커
        maoscFill.setData(padWithWhitespace(candles, maoscRaw));
        maoscLine.applyOptions({ color: "green", lineWidth: 1 }); // 12-52
        maoscLine.setData(padWithWhitespace(candles, maoscRaw));

        maoWhite.applyOptions({ color: "red", lineWidth: 1 });    // 4-52
        maoWhite.setData(padWithWhitespace(candles, whiteRaw));
        maoWhite.setMarkers(maoMarkers);

        maoscZero.applyOptions({ color: "magenta", lineWidth: 1, lineStyle: 0 }); // 기준선 1px
        maoscZero.setData(candles.map(c => ({ time: c.time, value: 0 })));

        positionMAODot(); renderMAO();
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showDISP() {
        current = "DISP"; clearAll();
        disparityFill.setData(padWithWhitespace(candles, dispRaw));
        disparityLine.setData(padWithWhitespace(candles, dispRaw));
        disparityBase100.setData(candles.map(c => ({ time: c.time, value: 100 })));
        renderDISP(); requestAnimationFrame(() => resyncAxisPadding(pairs));
    }

    // 초기
    showMAOSC();

    // 툴바 연동
    const q = s => document.querySelector(`.main-toolbar [data-action="${s}"]`);
    const btnRSI = q("rsi"), btnMACD = q("macd"), btnMAO = q("ma_oscillator"), btnDISP = q("disparity");
    const setActive = name => {
        [btnRSI, btnMACD, btnMAO, btnDISP].forEach(b => b && b.classList.remove("active-preset"));
        if (name === "RSI" && btnRSI) btnRSI.classList.add("active-preset");
        if (name === "MACD" && btnMACD) btnMACD.classList.add("active-preset");
        if (name === "MAOSC" && btnMAO) btnMAO.classList.add("active-preset");
        if (name === "DISP" && btnDISP) btnDISP.classList.add("active-preset");
    };
    const onRSI = () => { showRSI(); setActive("RSI"); };
    const onMACD = () => { showMACD(); setActive("MACD"); };
    const onMAO = () => { showMAOSC(); setActive("MAOSC"); };
    const onDISP = () => { showDISP(); setActive("DISP"); };
    btnRSI?.addEventListener("click", onRSI);
    btnMACD?.addEventListener("click", onMACD);
    btnMAO?.addEventListener("click", onMAO);
    btnDISP?.addEventListener("click", onDISP);

    // 도트 재배치
    const unsub = [];
    try {
        const ts = subChart.timeScale();
        const onRange = () => { positionMAODot(); };
        ts.subscribeVisibleTimeRangeChange(onRange);
        unsub.push(() => ts.unsubscribeVisibleTimeRangeChange(onRange));
    } catch { }
    try {
        const ps = subChart.priceScale("right");
        if (ps?.subscribeSizeChange) {
            const onSize = () => { positionMAODot(); };
            ps.subscribeSizeChange(onSize);
            unsub.push(() => ps.unsubscribeSizeChange(onSize));
        }
    } catch { }
    const ro = new ResizeObserver(() => { positionMAODot(); });
    try { ro.observe(elSub); } catch { }

    // 동기화/초기보기
    const tsLink = linkTimeScalesOneWay(mainChart, subChart);
    const paLink = observeAndSyncPriceAxisWidth([{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }]);
    setInitialVisibleRange(mainChart, candles, INITIAL_BARS_WEEKLY);
    const onDbl = () => setInitialVisibleRange(mainChart, candles, INITIAL_BARS_WEEKLY);
    elMain.addEventListener("dblclick", onDbl);

    // 정리
    return () => {
        btnRSI?.removeEventListener("click", onRSI);
        btnMACD?.removeEventListener("click", onMACD);
        btnMAO?.removeEventListener("click", onMAO);
        btnDISP?.removeEventListener("click", onDISP);
        elMain.removeEventListener("dblclick", onDbl);

        try { ro.disconnect(); } catch { }
        unsub.forEach(fn => { try { fn(); } catch { } });

        try { tsLink?.dispose?.(); } catch { }
        try { paLink?.dispose?.(); } catch { }
        try { mainChart.remove(); } catch { }
        try { subChart.remove(); } catch { }
    };
}

// default export (라우터 호환)
export default async function mount(params) { return mountSingleWeekly(params); }
export function dispose() { }
