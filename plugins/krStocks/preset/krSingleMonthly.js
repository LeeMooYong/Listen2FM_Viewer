// Listen2FM_Viewer/plugins/krStocks/preset/krSingleMonthly.js
// KR 월봉(싱글)

import { calculateRSI } from "../../crypto/indicators/rsi.js";
import { calculateMACD } from "../../crypto/indicators/macd.js";
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import { calculateMAOscillator } from "../../crypto/indicators/maOscillator.js";
import observeAndSyncPriceAxisWidth from "../../shared/sync/priceAxisSync.js"; // 🔧 경로 수정
import {
    baseChartOptions,
    linkTimeScalesOneWay,
    padWithWhitespace,
    resyncAxisPadding,
    setInitialVisibleRange,
    createTitleOverlay,
} from "../../crypto/preset/_common.js";

// ✅ 동적 import(+캐시버스터) 제거 — 서버에서 404 나므로 정적 import 사용
import { loadKRStockCandles as _loadKR } from "../data/dataLoader.js";
async function loadKRCandlesSafe({ symbol, timeframe }) {
    return _loadKR({ symbol, timeframe });
}

const INITIAL_BARS_MONTHLY = 180;
const UP = "#26a69a", DOWN = "#ef5350";

export async function mountSingleMonthly({ mainRoot, mountId, symbol = "삼성전자" } = {}) {
    if (!mainRoot && mountId) {
        const el = document.getElementById(mountId);
        if (el) mainRoot = el;
    }
    if (!mainRoot) mainRoot = document.getElementById("main-content-area");

    const LWC = window.LightweightCharts;
    if (!LWC) {
        if (mainRoot) mainRoot.innerHTML = '<p style="color:#f66">LightweightCharts 로드 실패</p>';
        return () => { };
    }

    mainRoot.innerHTML = `
    <div id="l2fm-kr-singleMonthly" style="display:grid;grid-template-rows:4fr 1fr;gap:6px;height:100%;">
      <div id="smain" style="min-height:120px; position:relative;"></div>
      <div id="ssub"  style="min-height:90px;  position:relative;"></div>
    </div>`;
    const elMain = mainRoot.querySelector("#smain");
    const elSub = mainRoot.querySelector("#ssub");
    createTitleOverlay(elMain, `${symbol} (KR • 월봉)`);

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

    // 데이터 로드
    let candles = [];
    try {
        candles = await loadKRCandlesSafe({ symbol, timeframe: "monthly" });
    } catch (e) {
        console.error("[krSingleMonthly] 데이터 로드 실패:", e);
        elMain.innerHTML = `<div style="padding:12px;color:#f66">월봉 데이터 로드 실패: ${String(e?.message || e)}</div>`;
        return () => { };
    }

    // 볼륨
    const vol = mainChart.addHistogramSeries({
        priceScaleId: "vol", priceFormat: { type: "volume" },
        priceLineVisible: false, lastValueVisible: false,
    });
    vol.setData(candles.map(c => ({ time: c.time, value: c.volume, color: (c.close >= c.open) ? UP : DOWN })));
    mainChart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

    // MAs
    const ma072 = mainChart.addLineSeries({ color: "white", lineWidth: 3, priceLineVisible: false });
    const ma024 = mainChart.addLineSeries({ color: "red", lineWidth: 2, priceLineVisible: false });
    const ma012 = mainChart.addLineSeries({ color: "magenta", lineWidth: 3, priceLineVisible: false });
    const ma006 = mainChart.addLineSeries({ color: "darkorange", lineWidth: 1, priceLineVisible: false });
    const ma003 = mainChart.addLineSeries({ color: "green", lineWidth: 2, priceLineVisible: false });

    ma072.setData(calculateSMA(candles, 72));
    ma024.setData(calculateSMA(candles, 24));
    ma012.setData(calculateSMA(candles, 12));
    ma006.setData(calculateSMA(candles, 6));
    ma003.setData(calculateSMA(candles, 3));
    try { ma006.applyOptions({ lineStyle: 2 }); } catch { }

    const candle = mainChart.addCandlestickSeries({
        upColor: UP, downColor: DOWN, borderDownColor: DOWN, borderUpColor: UP,
        wickDownColor: DOWN, wickUpColor: UP,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1,
    });
    candle.setData(candles);
    try {
        const last = candles[candles.length - 1];
        candle.applyOptions({ priceLineColor: (last && last.close >= last.open) ? UP : DOWN });
    } catch { }

    // MA Legend
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
    [["white", "MA72"], ["red", "MA24"], ["magenta", "MA12"], ["darkorange", "MA6"], ["green", "MA3"]]
        .forEach(([c, l]) => maLegend.appendChild(item(c, l)));
    elMain.appendChild(maLegend);

    // ─ 보조 지표들 (RSI/MACD/MAOSC/Disparity) ─
    const rsiLine = subChart.addLineSeries({ color: "#FFD700", lineWidth: 1 });
    const rsiBase30 = subChart.addLineSeries({ color: "green", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const rsiBase70 = subChart.addLineSeries({ color: "red", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const macdLine = subChart.addLineSeries({ color: "green", lineWidth: 1 });
    const sigLine = subChart.addLineSeries({ color: "red", lineWidth: 1 });
    const maoscFill = subChart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topFillColor1: "rgba(0,128,0,0.25)", topFillColor2: "rgba(0,128,0,0.25)",
        bottomFillColor1: "rgba(255,0,0,0.2)", bottomFillColor2: "rgba(255,0,0,0.2)",
        topLineColor: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)",
        priceLineVisible: false, lastValueVisible: false,
    });
    const maoscLine = subChart.addLineSeries({ color: "green", lineWidth: 1 });
    const maoscZero = subChart.addLineSeries({ color: "magenta", lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
    const disparityBase100 = subChart.addLineSeries({ color: "#FFD700", lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
    const disparityFill = subChart.addBaselineSeries({
        baseValue: { type: "price", price: 100 },
        topFillColor1: "rgba(0,128,0,0.25)", topFillColor2: "rgba(0,128,0,0.25)",
        bottomFillColor1: "rgba(255,0,0,0.2)", bottomFillColor2: "rgba(255,0,0,0.2)",
        topLineColor: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)",
        priceLineVisible: false, lastValueVisible: false,
    });
    const disparityLine = subChart.addLineSeries({ color: "#FF6F00", lineWidth: 1 });

    const rsiRaw = calculateRSI(candles, 9);
    const { macd: macdRaw, signal: sigRaw } = calculateMACD(candles, 3, 12, 5);
    const maoscRaw = calculateMAOscillator(candles, 3, 12);

    const ma6 = calculateSMA(candles, 6);
    const closeMap = new Map(candles.map(c => [c.time, c.close]));
    const dispRaw = ma6
        .filter(m => Number.isFinite(m.value) && closeMap.has(m.time))
        .map(m => ({ time: m.time, value: (closeMap.get(m.time) / m.value) * 100 }));

    // dots
    (function ensurePulseCSS() {
        const id = "l2fm-pulse-krMonthly";
        if (!document.getElementById(id)) {
            const st = document.createElement("style"); st.id = id;
            st.textContent = `@keyframes l2fmPulse{0%{box-shadow:0 0 0 0 rgba(255,215,0,.65);opacity:1;}
70%{box-shadow:0 0 0 12px rgba(255,215,0,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(255,215,0,0);opacity:.85;}}
@keyframes l2fmDISPPulse{0%{box-shadow:0 0 0 0 rgba(255,183,77,.55);opacity:1;}70%{box-shadow:0 0 0 12px rgba(255,183,77,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(255,183,77,0);opacity:.85;}}`;
            document.head.appendChild(st);
        }
    })();
    const makeDot = (color, anim) => {
        const d = document.createElement("div");
        Object.assign(d.style, { position: "absolute", width: "8px", height: "8px", borderRadius: "50%", background: color, pointerEvents: "none", zIndex: 5, animation: `${anim} 1.6s ease-out infinite`, left: "-9999px", top: "-9999px" });
        elSub.appendChild(d); return d;
    };
    const rsiDot = makeDot("#FFD700", "l2fmPulse"),
        maoscDot = makeDot("green", "l2fmPulse"),
        dispDot = makeDot("#FFB74D", "l2fmDISPPulse"),
        macdDot = makeDot("#FFD700", "l2fmPulse");
    const placeDot = (series, data, dot) => {
        if (!data?.length) { dot.style.left = dot.style.top = "-9999px"; return; }
        const last = data.at(-1); const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = series.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) { dot.style.left = (x - 4) + "px"; dot.style.top = (y - 4) + "px"; }
        else { dot.style.left = dot.style.top = "-9999px"; }
    };

    // legends
    const mkLegend = () => {
        const b = document.createElement("div");
        Object.assign(b.style, { position: "absolute", top: "6px", left: "8px", display: "none", gap: "8px", padding: "4px 6px", fontSize: "12px", fontWeight: "700", color: "#e8e8ea", background: "rgba(0,0,0,0.0)", pointerEvents: "none", zIndex: 7 });
        elSub.appendChild(b); return b;
    };
    const legendDisp = mkLegend(), legendMAO = mkLegend(), legendRSI = mkLegend(), legendMACD = mkLegend();
    const renderDisp = () => {
        const v = dispRaw.at(-1)?.value; if (!Number.isFinite(v)) { legendDisp.style.display = "none"; return; }
        const cc = v >= 100 ? "green" : "red";
        legendDisp.innerHTML = `<span>Disparity(6): <span style="color:${cc}">${v.toFixed(1)}%</span></span><span style="margin:0 6px;">|</span><span>Base: <span style="color:#FFD700">100</span></span>`;
        legendDisp.style.display = "";
    };
    const renderMAO = () => { legendMAO.innerHTML = `<span style="color:#fff">MA_Oscillator(</span><span style="color:green">3</span><span style="color:#fff">-</span><span style="color:magenta">12</span><span style="color:#fff">)</span>`; legendMAO.style.display = ""; };
    const renderRSI = () => {
        const v = rsiRaw.at(-1)?.value; if (!Number.isFinite(v)) { legendRSI.style.display = "none"; return; }
        legendRSI.innerHTML = `<span>RSI(9): <span style="color:#FFD700">${v.toFixed(1)}</span></span><span style="margin:0 6px;">|</span><span>Base: <span style="color:green">30</span> / <span style="color:red">70</span></span>`;
        legendRSI.style.display = "";
    };
    const renderMACD = () => {
        const m = macdRaw.at(-1)?.value, s = sigRaw.at(-1)?.value;
        if (!Number.isFinite(m) || !Number.isFinite(s)) { legendMACD.style.display = "none"; return; }
        legendMACD.innerHTML = `<span>MACD(3,12,5)</span><span style="margin:0 6px;">|</span><span>MACD: <span style="color:green">${m.toFixed(4)}</span></span><span style="margin:0 6px;">|</span><span>Signal: <span style="color:red">${s.toFixed(4)}</span></span>`;
        legendMACD.style.display = "";
    };

    // 토글
    let current = "MAOSC";
    const pairs = [{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }];
    const hideLegends = () => { legendDisp.style.display = "none"; legendMAO.style.display = "none"; legendRSI.style.display = "none"; legendMACD.style.display = "none"; };
    function clearAll() {
        rsiLine.setData([]); rsiBase30.setData([]); rsiBase70.setData([]);
        macdLine.setData([]); sigLine.setData([]); macdDot.style.left = macdDot.style.top = "-9999px";
        maoscFill.setData([]); maoscLine.setData([]); maoscZero.setData([]);
        disparityFill.setData([]); disparityLine.setData([]); disparityBase100.setData([]);
        rsiDot.style.left = rsiDot.style.top = "-9999px"; maoscDot.style.left = maoscDot.style.top = "-9999px"; dispDot.style.left = dispDot.style.top = "-9999px";
        hideLegends();
    }
    function showRSI() {
        current = "RSI"; clearAll();
        rsiLine.setData(padWithWhitespace(candles, rsiRaw));
        rsiBase30.setData(candles.map(c => ({ time: c.time, value: 30 })));
        rsiBase70.setData(candles.map(c => ({ time: c.time, value: 70 })));
        placeDot(rsiLine, rsiRaw, rsiDot); renderRSI(); requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showMACD() {
        current = "MACD"; clearAll();
        macdLine.setData(padWithWhitespace(candles, macdRaw));
        sigLine.setData(padWithWhitespace(candles, sigRaw));
        placeDot(macdLine, macdRaw, macdDot); renderMACD(); requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showMAOSC() {
        current = "MAOSC"; clearAll();
        maoscFill.setData(padWithWhitespace(candles, maoscRaw));
        maoscLine.setData(padWithWhitespace(candles, maoscRaw));
        maoscZero.setData(candles.map(c => ({ time: c.time, value: 0 })));
        placeDot(maoscLine, maoscRaw, maoscDot); renderMAO(); requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showDISP() {
        current = "DISP"; clearAll();
        disparityFill.setData(padWithWhitespace(candles, dispRaw));
        disparityLine.setData(padWithWhitespace(candles, dispRaw));
        disparityBase100.setData(candles.map(c => ({ time: c.time, value: 100 })));
        placeDot(disparityLine, dispRaw, dispDot); renderDisp(); requestAnimationFrame(() => resyncAxisPadding(pairs));
    }

    showMAOSC();

    // 툴바 hook
    const q = s => document.querySelector(`.main-toolbar [data-action="${s}"]`);
    const setToolbarActive = (name) => {
        const btns = { rsi: q("rsi"), macd: q("macd"), mao: q("ma_oscillator"), disp: q("disparity") };
        Object.values(btns).forEach(b => b && b.classList.remove("active-preset"));
        if (name === "RSI" && btns.rsi) btns.rsi.classList.add("active-preset");
        if (name === "MACD" && btns.macd) btns.macd.classList.add("active-preset");
        if (name === "MAOSC" && btns.mao) btns.mao.classList.add("active-preset");
        if (name === "DISP" && btns.disp) btns.disp.classList.add("active-preset");
    };
    setToolbarActive("MAOSC");
    const onRSI = () => { showRSI(); setToolbarActive("RSI"); };
    const onMACD = () => { showMACD(); setToolbarActive("MACD"); };
    const onMAO = () => { showMAOSC(); setToolbarActive("MAOSC"); };
    const onDISP = () => { showDISP(); setToolbarActive("DISP"); };
    q("rsi")?.addEventListener("click", onRSI);
    q("macd")?.addEventListener("click", onMACD);
    q("ma_oscillator")?.addEventListener("click", onMAO);
    q("disparity")?.addEventListener("click", onDISP);

    // dots/resize
    const unsubs = [];
    try {
        const ts = subChart.timeScale();
        const onRange = () => {
            if (current === "RSI") placeDot(rsiLine, rsiRaw, rsiDot);
            if (current === "MAOSC") placeDot(maoscLine, maoscRaw, maoscDot);
            if (current === "DISP") placeDot(disparityLine, dispRaw, dispDot);
            if (current === "MACD") placeDot(macdLine, macdRaw, macdDot);
        };
        ts.subscribeVisibleTimeRangeChange(onRange); unsubs.push(() => ts.unsubscribeVisibleTimeRangeChange(onRange));
    } catch { }
    try {
        const ps = subChart.priceScale("right");
        if (ps?.subscribeSizeChange) {
            const onSize = () => {
                if (current === "RSI") placeDot(rsiLine, rsiRaw, rsiDot);
                if (current === "MAOSC") placeDot(maoscLine, maoscRaw, maoscDot);
                if (current === "DISP") placeDot(disparityLine, dispRaw, dispDot);
                if (current === "MACD") placeDot(macdLine, macdRaw, macdDot);
            };
            ps.subscribeSizeChange(onSize); unsubs.push(() => ps.unsubscribeSizeChange(onSize));
        }
    } catch { }
    const ro = new ResizeObserver(() => {
        if (current === "RSI") placeDot(rsiLine, rsiRaw, rsiDot);
        if (current === "MAOSC") placeDot(maoscLine, maoscRaw, maoscDot);
        if (current === "DISP") placeDot(disparityLine, dispRaw, dispDot);
        if (current === "MACD") placeDot(macdLine, macdRaw, macdDot);
    });
    try { ro.observe(elSub); } catch { }

    const tsLink = linkTimeScalesOneWay(mainChart, subChart);
    const paLink = observeAndSyncPriceAxisWidth([{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }]);
    setInitialVisibleRange(mainChart, candles, INITIAL_BARS_MONTHLY);
    const onDbl = () => setInitialVisibleRange(mainChart, candles, INITIAL_BARS_MONTHLY);
    elMain.addEventListener("dblclick", onDbl);

    return () => {
        q("rsi")?.removeEventListener("click", onRSI);
        q("macd")?.removeEventListener("click", onMACD);
        q("ma_oscillator")?.removeEventListener("click", onMAO);
        q("disparity")?.removeEventListener("click", onDISP);
        elMain.removeEventListener("dblclick", onDbl);
        try { ro.disconnect(); } catch { } unsubs.forEach(fn => { try { fn(); } catch { } });
        try { tsLink?.dispose?.(); } catch { } try { paLink?.dispose?.(); } catch { }
        try { mainChart.remove(); } catch { } try { subChart.remove(); } catch { }
    };
}

export default async function mount(params) { return mountSingleMonthly(params); }
export function dispose() { }
