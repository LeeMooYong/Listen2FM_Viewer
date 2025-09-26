// KR 주봉(싱글) — 볼륨 / MA(4/12/26/52/104) / RSI(12) / MACD(12,52,9) / MAOSC(12-52) / Disparity(12)
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

// ── 데이터 로더(함수명 차이 흡수)
async function loadKRCandlesSafe({ symbol, timeframe }) {
    const mod = await import(`../data/dataLoader.js?v=${Date.now()}`);
    const fn =
        mod.loadKRStockCandles ||
        mod.loadKRStocks ||
        mod.loadKRStock ||
        mod.loadKR ||
        mod.loadStockKR ||
        mod.loadKRCandles;
    if (!fn) throw new Error("KR data loader not found in plugins/krStocks/data/dataLoader.js");
    try { return await fn({ symbol, timeframe }); }
    catch { return await fn({ name: symbol, timeframe }); }
}

const INITIAL_BARS_WEEKLY = 220;
const UP = "#26a69a", DOWN = "#ef5350";

export async function mountSingleWeekly({ mainRoot, mountId, symbol = "삼성전자" } = {}) {
    if (!mainRoot && mountId) {
        const el = document.getElementById(mountId);
        if (el) mainRoot = el;
    }
    if (!mainRoot) mainRoot = document.getElementById("main-content-area");

    const LWC = window.LightweightCharts;
    if (!LWC) { mainRoot.innerHTML = '<p style="color:#f66">LightweightCharts 로드 실패</p>'; return () => { }; }

    // 레이아웃
    mainRoot.innerHTML = `
    <div id="l2fm-kr-singleWeekly" style="display:grid;grid-template-rows:4fr 1fr;gap:6px;height:100%;">
      <div id="wmain" style="min-height:120px; position:relative;"></div>
      <div id="wsub"  style="min-height:90px;  position:relative;"></div>
    </div>`;
    const elMain = mainRoot.querySelector("#wmain");
    const elSub = mainRoot.querySelector("#wsub");

    // 타이틀
    createTitleOverlay(elMain, `${symbol} (KR • 주봉)`);

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
        candles = await loadKRCandlesSafe({ symbol, timeframe: "weekly" });
    } catch (e) {
        console.error("[krSingleWeekly] 데이터 로드 실패:", e);
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
    vol.setData(candles.map(c => ({ time: c.time, value: c.volume, color: (c.close >= c.open) ? UP : DOWN })));
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
    [
        ["white", "MA104"],
        ["magenta", "MA52"],
        ["#FFA500", "MA26"],
        ["green", "MA12"],
        ["red", "MA4"],
    ].forEach(([c, l]) => maLegend.appendChild(item(c, l)));
    elMain.appendChild(maLegend);

    // ── 보조지표 (RSI(12) / MACD(12,52,9) / MAOSC(12-52) / Disparity(12))
    const rsiLine = subChart.addLineSeries({ color: "#FFD700", lineWidth: 1 });
    const rsiBase30 = subChart.addLineSeries({ color: "green", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const rsiBase70 = subChart.addLineSeries({ color: "red", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

    const macdLine = subChart.addLineSeries({ color: "green", lineWidth: 1 });
    const sigLine = subChart.addLineSeries({ color: "red", lineWidth: 1 });

    const maoscFill = subChart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topFillColor1: "rgba(0,128,0,.25)", topFillColor2: "rgba(0,128,0,.25)",
        bottomFillColor1: "rgba(255,0,0,.2)", bottomFillColor2: "rgba(255,0,0,.2)",
        topLineColor: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)",
        priceLineVisible: false, lastValueVisible: false,
    });
    const maoscLine = subChart.addLineSeries({ color: "green", lineWidth: 1 });
    const maoscZero = subChart.addLineSeries({ color: "magenta", lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

    const disparityBase100 = subChart.addLineSeries({ color: "#FFD700", lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
    const disparityFill = subChart.addBaselineSeries({
        baseValue: { type: "price", price: 100 },
        topFillColor1: "rgba(0,128,0,.25)", topFillColor2: "rgba(0,128,0,.25)",
        bottomFillColor1: "rgba(255,0,0,.2)", bottomFillColor2: "rgba(255,0,0,.2)",
        topLineColor: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)",
        priceLineVisible: false, lastValueVisible: false,
    });
    const disparityLine = subChart.addLineSeries({ color: "#FF6F00", lineWidth: 1 });

    // 계산(파라미터 반영)
    const rsiRaw = calculateRSI(candles, 12);                 // RSI(12)
    const { macd: macdRaw, signal: sigRaw } = calculateMACD( // MACD(12,52,9)
        candles, 12, 52, 9
    );
    const maoscRaw = calculateMAOscillator(candles, 12, 52); // MAOSC(12-52)

    const ma12 = calculateSMA(candles, 12);                   // Disparity(12) 기준선
    const closeMap = new Map(candles.map(c => [c.time, c.close]));
    const dispRaw = ma12
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
        legendMAO.innerHTML = `<span style="color:#fff">MA_Oscillator(</span><span style="color:green">12</span><span style="color:#fff">-</span><span style="color:magenta">52</span><span style="color:#fff">)</span>`;
        legendMAO.style.display = "";
    };
    const renderDISP = () => {
        const v = dispRaw.at(-1)?.value;
        if (!Number.isFinite(v)) { legendDISP.style.display = "none"; return; }
        const cc = v >= 100 ? "green" : "red";
        legendDISP.innerHTML = `Disparity(12): <span style="color:${cc}">${v.toFixed(1)}%</span> <span style="opacity:.7;margin:0 6px;">|</span> Base: <span style="color:#FFD700">100</span>`;
        legendDISP.style.display = "";
    };

    // ── 토글
    let current = "MAOSC";
    const pairs = [{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }];
    const clearAll = () => {
        rsiLine.setData([]); rsiBase30.setData([]); rsiBase70.setData([]);
        macdLine.setData([]); sigLine.setData([]);
        maoscFill.setData([]); maoscLine.setData([]); maoscZero.setData([]);
        disparityFill.setData([]); disparityLine.setData([]); disparityBase100.setData([]);
        hideLegends();
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
        maoscFill.setData(padWithWhitespace(candles, maoscRaw));
        maoscLine.setData(padWithWhitespace(candles, maoscRaw));
        maoscZero.setData(candles.map(c => ({ time: c.time, value: 0 })));
        renderMAO(); requestAnimationFrame(() => resyncAxisPadding(pairs));
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
        try { tsLink?.dispose?.(); } catch { }
        try { paLink?.dispose?.(); } catch { }
        try { mainChart.remove(); } catch { }
        try { subChart.remove(); } catch { }
    };
}

// default export (라우터 호환)
export default async function mount(params) { return mountSingleWeekly(params); }
export function dispose() { }
