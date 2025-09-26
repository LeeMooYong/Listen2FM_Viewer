// Listen2FM_Viewer/plugins/usStocks/preset/singleMonthly.js
// US 월봉(싱글) — KR 월봉과 동일 구성(볼륨/MA/RSI/MACD/MAOSC/Disparity + 툴바 토글 + 도트 + 레전드)

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

// 안전 로더: usStocks 데이터로더가 있으면 사용, 없으면 정적 JSON 폴백
async function loadUSCandlesSafe({ symbol = "SPY", timeframe = "monthly" }) {
    try {
        const mod = await import(`../data/dataLoader.js?v=${Date.now()}`);
        const fn =
            mod.loadUSStockCandles ||
            mod.loadUSStocksCandles ||
            mod.loadUSCandles ||
            mod.loadUS ||
            mod.loadEquity ||
            mod.loadStockUS;
        if (fn) return await fn({ symbol, timeframe, segment: "ETF", group: "ETF", etf: true });
    } catch { }

    const tfMap = { monthly: "monthly", weekly: "weekly", daily: "daily", "30m": "30m" };
    const url = `data/usStocks/ETF/${symbol}_${tfMap[timeframe] || "monthly"}.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch failed: ${url} (${res.status})`);
    const rows = await res.json();
    return rows.map(r => ({
        time: r.time,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume ?? 0),
    }));
}

const INITIAL_BARS_MONTHLY = 180;
const UP = "#26a69a", DOWN = "#ef5350";

// 라우터 호환: named export + default export
export async function mountUSSingleMonthly({ mainRoot, mountId, symbol = "SPY" } = {}) {
    // DOM 복구
    if (!mainRoot && mountId) {
        const el = document.getElementById(mountId);
        if (el) mainRoot = el;
    }
    if (!mainRoot) mainRoot = document.getElementById("main-content-area");

    const LWC = window.LightweightCharts;
    if (!LWC || !mainRoot) return () => { };

    // 레이아웃
    mainRoot.innerHTML = `
  <div id="l2fm-us-singleMonthly" style="display:grid;grid-template-rows:4fr 1fr;gap:6px;height:100%;">
    <div id="smain" style="min-height:120px; position:relative;"></div>
    <div id="ssub"  style="min-height:90px;  position:relative;"></div>
  </div>`;
    const elMain = mainRoot.querySelector("#smain");
    const elSub = mainRoot.querySelector("#ssub");

    // 타이틀
    createTitleOverlay(elMain, `${symbol} (US • 월봉)`);

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
        candles = await loadUSCandlesSafe({ symbol, timeframe: "monthly" });
    } catch (e) {
        console.error("[usSingleMonthly] 데이터 로드 실패:", e);
        elMain.innerHTML = `<div style="padding:12px;color:#f66">월봉 데이터 로드 실패: ${String(e?.message || e)}</div>`;
        return () => { };
    }

    // ── 메인: 볼륨(먼저)
    const vol = mainChart.addHistogramSeries({
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
    });
    vol.setData(candles.map(c => ({
        time: c.time, value: c.volume, color: (c.close >= c.open) ? UP : DOWN
    })));
    mainChart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

    // ── 이동평균(선 → 캔들) 72/24/12/6(점선)/3
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

    // 캔들(마지막: MA 위)
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

    // ── MA 레전드 (좌상단)
    (function addMALegend() {
        const legend = document.createElement("div");
        Object.assign(legend.style, {
            position: "absolute", top: "6px", left: "8px",
            display: "flex", gap: "12px", alignItems: "center",
            fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
            textShadow: "0 0 4px rgba(0,0,0,0.5)", pointerEvents: "none", zIndex: 7,
        });
        const mk = (color, label) => {
            const box = document.createElement("div");
            box.style.display = "flex"; box.style.alignItems = "center"; box.style.gap = "6px";
            const dot = document.createElement("span");
            Object.assign(dot.style, { width: "8px", height: "8px", borderRadius: "50%", background: color, display: "inline-block" });
            const txt = document.createElement("span"); txt.textContent = label;
            box.appendChild(dot); box.appendChild(txt);
            return box;
        };
        [["white", "MA72"], ["red", "MA24"], ["magenta", "MA12"], ["darkorange", "MA6"], ["green", "MA3"]]
            .forEach(([c, t]) => legend.appendChild(mk(c, t)));
        elMain.appendChild(legend);
    })();

    // ── 보조(하단): RSI(9) / MACD(3,12,5) / MAOSC(3-12) / Disparity(6)
    const rsiLine = subChart.addLineSeries({ color: "#FFD700", lineWidth: 1 });
    const rsiBase30 = subChart.addLineSeries({ color: "green", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const rsiBase70 = subChart.addLineSeries({ color: "red", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

    const macdLine = subChart.addLineSeries({ color: "green", lineWidth: 1 });
    const sigLine = subChart.addLineSeries({ color: "red", lineWidth: 1 });

    const maoscFill = subChart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topFillColor1: "rgba(0, 128, 0, 0.25)", topFillColor2: "rgba(0, 128, 0, 0.25)",
        bottomFillColor1: "rgba(255, 0, 0, 0.2)", bottomFillColor2: "rgba(255, 0, 0, 0.2)",
        topLineColor: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)",
        priceLineVisible: false, lastValueVisible: false,
    });
    const maoscLine = subChart.addLineSeries({ color: "green", lineWidth: 1 });
    const maoscZero = subChart.addLineSeries({ color: "magenta", lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

    const disparityBase100 = subChart.addLineSeries({ color: "#FFD700", lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
    const disparityFill = subChart.addBaselineSeries({
        baseValue: { type: "price", price: 100 },
        topFillColor1: "rgba(0, 128, 0, 0.25)", topFillColor2: "rgba(0, 128, 0, 0.25)",
        bottomFillColor1: "rgba(255, 0, 0, 0.2)", bottomFillColor2: "rgba(255, 0, 0, 0.2)",
        topLineColor: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)",
        priceLineVisible: false, lastValueVisible: false,
    });
    const disparityLine = subChart.addLineSeries({ color: "#FF6F00", lineWidth: 1 });

    // 지표 데이터
    const rsiRaw = calculateRSI(candles, 9);
    const { macd: macdRaw, signal: sigRaw } = calculateMACD(candles, 3, 12, 5);
    const maoscRaw = calculateMAOscillator(candles, 3, 12);

    const ma6 = calculateSMA(candles, 6);
    const closeMap = new Map(candles.map(c => [c.time, c.close]));
    const dispRaw = ma6
        .filter(m => Number.isFinite(m.value) && closeMap.has(m.time))
        .map(m => ({ time: m.time, value: (closeMap.get(m.time) / m.value) * 100 }));

    // ── 도트(펄스)
    (function ensurePulseCSS() {
        const id = "l2fm-pulse-usMonthly";
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
        const last = data.at(-1);
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = series.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            dot.style.left = (x - 4) + "px"; dot.style.top = (y - 4) + "px";
        } else { dot.style.left = dot.style.top = "-9999px"; }
    };

    // ── 레전드(하단)
    const mkLegend = () => {
        const b = document.createElement("div");
        Object.assign(b.style, {
            position: "absolute", top: "6px", left: "8px", display: "none",
            gap: "8px", padding: "4px 6px", fontSize: "12px", fontWeight: "700",
            color: "#e8e8ea", background: "rgba(0,0,0,0.0)", pointerEvents: "none", zIndex: 7
        });
        elSub.appendChild(b); return b;
    };
    const legendDisp = mkLegend(), legendMAO = mkLegend(), legendRSI = mkLegend(), legendMACD = mkLegend();
    const renderDisp = () => {
        const v = dispRaw.at(-1)?.value; if (!Number.isFinite(v)) { legendDisp.style.display = "none"; return; }
        const cc = v >= 100 ? "green" : "red";
        legendDisp.innerHTML = `<span>Disparity(6): <span style="color:${cc}">${v.toFixed(1)}%</span></span>
<span style="margin:0 6px;">|</span><span>Base: <span style="color:#FFD700">100</span></span>`;
        legendDisp.style.display = "";
    };
    const renderMAO = () => {
        legendMAO.innerHTML = `<span style="color:#fff">MA_Oscillator(</span><span style="color:green">3</span><span style="color:#fff">-</span><span style="color:magenta">12</span><span style="color:#fff">)</span>`;
        legendMAO.style.display = "";
    };
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

    // ── 토글 표시 로직
    let current = "MAOSC";
    const pairs = [{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }];
    const hideLegends = () => { legendDisp.style.display = "none"; legendMAO.style.display = "none"; legendRSI.style.display = "none"; legendMACD.style.display = "none"; };
    function clearAll() {
        rsiLine.setData([]); rsiBase30.setData([]); rsiBase70.setData([]);
        macdLine.setData([]); sigLine.setData([]); macdDot.style.left = macdDot.style.top = "-9999px";
        maoscFill.setData([]); maoscLine.setData([]); maoscZero.setData([]);
        disparityFill.setData([]); disparityLine.setData([]); disparityBase100.setData([]);
        rsiDot.style.left = rsiDot.style.top = "-9999px";
        maoscDot.style.left = maoscDot.style.top = "-9999px";
        dispDot.style.left = dispDot.style.top = "-9999px";
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

    // 초기
    showMAOSC();

    // ── 툴바 active 표시 + 클릭 핸들러
    function setToolbarActive(name) {
        const q = s => document.querySelector(`.main-toolbar [data-action="${s}"]`);
        const btns = { rsi: q("rsi"), macd: q("macd"), mao: q("ma_oscillator"), disp: q("disparity"), life: q("lifeline"), trend: q("trendline") };
        Object.values(btns).forEach(b => b && b.classList.remove("active-preset"));
        if (name === "RSI" && btns.rsi) btns.rsi.classList.add("active-preset");
        if (name === "MACD" && btns.macd) btns.macd.classList.add("active-preset");
        if (name === "MAOSC" && btns.mao) btns.mao.classList.add("active-preset");
        if (name === "DISP" && btns.disp) btns.disp.classList.add("active-preset");
    }
    setToolbarActive("MAOSC");

    const btnRSI = document.querySelector('.main-toolbar [data-action="rsi"]');
    const btnMACD = document.querySelector('.main-toolbar [data-action="macd"]');
    const btnMAO = document.querySelector('.main-toolbar [data-action="ma_oscillator"]');
    const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');
    const onRSI = () => { showRSI(); setToolbarActive("RSI"); };
    const onMACD = () => { showMACD(); setToolbarActive("MACD"); };
    const onMAO = () => { showMAOSC(); setToolbarActive("MAOSC"); };
    const onDISP = () => { showDISP(); setToolbarActive("DISP"); };
    btnRSI?.addEventListener("click", onRSI);
    btnMACD?.addEventListener("click", onMACD);
    btnMAO?.addEventListener("click", onMAO);
    btnDISP?.addEventListener("click", onDISP);

    // lifeline(MA3)/trendline(MA12) 깜빡이
    const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
    const btnTrend = document.querySelector('.main-toolbar [data-action="trendline"]');

    const WAVE_BASE = "green", WAVE_ALT = "#7CFC00";
    let waveOn = false, waveTimer = null, waveFlip = false;
    const setWaveUI = on => { if (!btnLife) return; on ? btnLife.classList.add("active-preset") : btnLife.classList.remove("active-preset"); };
    const setWaveColor = c => { try { ma003.applyOptions({ color: c }); } catch { } };
    function startWave() {
        waveOn = true; setWaveUI(true); setWaveColor(WAVE_ALT);
        waveTimer = setInterval(() => { waveFlip = !waveFlip; setWaveColor(waveFlip ? WAVE_BASE : WAVE_ALT); }, 1500);
    }
    function stopWave() { waveOn = false; setWaveUI(false); if (waveTimer) { try { clearInterval(waveTimer); } catch { } waveTimer = null; } waveFlip = false; setWaveColor(WAVE_BASE); }
    const onWave = () => waveOn ? stopWave() : startWave();
    btnLife?.addEventListener("click", onWave);

    const TREND_BASE = "magenta", TREND_ALT = "rgba(255,0,0,0.5)";
    let trendOn = false, trendTimer = null, trendFlip = false;
    const setTrendUI = on => { if (!btnTrend) return; on ? btnTrend.classList.add("active-preset") : btnTrend.classList.remove("active-preset"); };
    const setTrendColor = c => { try { ma012.applyOptions({ color: c }); } catch { } };
    function startTrend() {
        trendOn = true; setTrendUI(true); setTrendColor(TREND_ALT);
        trendTimer = setInterval(() => { trendFlip = !trendFlip; setTrendColor(trendFlip ? TREND_BASE : TREND_ALT); }, 1500);
    }
    function stopTrend() { trendOn = false; setTrendUI(false); if (trendTimer) { try { clearInterval(trendTimer); } catch { } trendTimer = null; } trendFlip = false; setTrendColor(TREND_BASE); }
    const onTrend = () => trendOn ? stopTrend() : startTrend();
    btnTrend?.addEventListener("click", onTrend);

    // 도트/리사이즈 대응
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

    // 동기화/초기보기
    const tsLink = linkTimeScalesOneWay(mainChart, subChart);
    const paLink = observeAndSyncPriceAxisWidth([{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }]);
    setInitialVisibleRange(mainChart, candles, INITIAL_BARS_MONTHLY);
    const onDbl = () => setInitialVisibleRange(mainChart, candles, INITIAL_BARS_MONTHLY);
    elMain.addEventListener("dblclick", onDbl);

    // 정리
    return () => {
        btnRSI?.removeEventListener("click", onRSI);
        btnMACD?.removeEventListener("click", onMACD);
        btnMAO?.removeEventListener("click", onMAO);
        btnDISP?.removeEventListener("click", onDISP);
        btnLife?.removeEventListener("click", onWave);
        btnTrend?.removeEventListener("click", onTrend);
        try { ro.disconnect(); } catch { }
        unsubs.forEach(fn => { try { fn(); } catch { } });
        try { elMain.removeEventListener("dblclick", onDbl); } catch { }
        try { paLink?.dispose?.(); } catch { } try { tsLink?.dispose?.(); } catch { }
        try { mainChart.remove(); } catch { } try { subChart.remove(); } catch { }
    };
}

export default async function mount(params) { return mountUSSingleMonthly(params); }
export function dispose() { }
