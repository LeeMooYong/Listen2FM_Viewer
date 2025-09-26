// Listen2FM_Viewer/plugins/usStocks/preset/single60m.js
// US 60분봉 단일 차트 — US Single Daily/30m와 동일 스펙(지표/도트/레전드/깜빡이/동기화)로 이식
// + MA Oscillator 확장: Mid(20–60, 흰=5–60, 교차=5–20) / Long(60–240, 빨강=20–240, 본선=60–240) 토글
// - timeframe만 "60m"으로 변경
// - 라우터 호환: default + named export + presetKey + dispose

import { loadEquity } from "../data/dataLoader.js";
import { calculateRSI } from "../../crypto/indicators/rsi.js";
import { calculateMACD } from "../../crypto/indicators/macd.js";
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import { calculateMAOscillator } from "../../crypto/indicators/maOscillator.js";
import observeAndSyncPriceAxisWidth from "../../shared/sync/priceAxisSync.js";
import {
    baseChartOptions, createTitleOverlay, linkTimeScalesOneWay,
    padWithWhitespace, setInitialVisibleRange
} from "../../crypto/preset/_common.js";

const INITIAL_BARS = 300;

// (옵션) 가격축 패딩 재동기화
function resyncAxisPadding(pairs) {
    const getW = (c) => { try { const w = c.priceScale('right').width(); return Number.isFinite(w) ? w : 0; } catch { return 0; } };
    const widths = pairs.map(p => getW(p.chart));
    const target = Math.max(...widths, 0);
    pairs.forEach((p, i) => {
        const pad = Math.max(0, target - widths[i]);
        if (p.container.__spRight) p.container.__spRight.style.width = pad + 'px';
    });
}

export async function mountUSSingle60m({
    mountId = "main-content-area",
    mainRoot = null,
    symbol = "NVDA",
} = {}) {
    const LWC = window.LightweightCharts;
    const root = mainRoot || document.getElementById(mountId);
    if (!LWC || !root) return () => { };

    const showNotice = (text) => {
        root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#bbb;font-weight:600;">${text}</div>`;
    };

    // 레이아웃: 메인(4) + 서브(1)
    root.innerHTML = `
    <div id="l2fm-us-single60m" style="display:grid;grid-template-rows:4fr 1fr;gap:6px;height:100%;">
      <div id="sd-main" style="min-height:120px; position:relative;"></div>
      <div id="sd-sub"  style="min-height:90px;  position:relative;"></div>
    </div>`;
    const elMain = root.querySelector("#sd-main");
    const elSub = root.querySelector("#sd-sub");

    // 타이틀
    createTitleOverlay(elMain, `${symbol} • 60m`);

    // 데이터 로드
    let candles = [];
    try {
        candles = await loadEquity({ symbol, timeframe: "60m" });
        if (!Array.isArray(candles) || candles.length === 0) {
            showNotice("데이터 준비중…");
            return () => { };
        }
    } catch (e) {
        console.warn("[US Single60m] data load error:", e);
        showNotice("데이터 준비중…");
        return () => { };
    }

    // 차트 생성
    const base = baseChartOptions(LWC);
    const mainChart = LWC.createChart(elMain, base);
    const subChart = LWC.createChart(elSub, {
        ...base,
        rightPriceScale: { borderColor: '#2a2b31', scaleMargins: { top: 0.1, bottom: 0.1 } }
    });
    subChart.applyOptions({
        handleScroll: false,
        handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false }
    });

    // ── 메인: 볼륨 → MA들 → 캔들 ──
    const UP = '#26a69a', DOWN = '#ef5350';

    const vol = mainChart.addHistogramSeries({
        priceScaleId: 'vol', priceFormat: { type: 'volume' },
        priceLineVisible: false, lastValueVisible: false,
    });
    vol.setData(candles.map(c => ({ time: c.time, value: c.volume ?? 0, color: (c.close >= c.open) ? UP : DOWN })));
    mainChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

    const ma240 = mainChart.addLineSeries({ color: 'magenta', lineWidth: 4, priceLineVisible: false });
    const ma120 = mainChart.addLineSeries({ color: 'darkorange', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const ma060 = mainChart.addLineSeries({ color: 'green', lineWidth: 3, priceLineVisible: false });
    const ma020 = mainChart.addLineSeries({ color: 'red', lineWidth: 3, priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1, priceLineColor: 'red' });
    const ma005 = mainChart.addLineSeries({ color: 'white', lineWidth: 2, priceLineVisible: false });

    ma240.setData(calculateSMA(candles, 240));
    ma120.setData(calculateSMA(candles, 120));
    ma060.setData(calculateSMA(candles, 60));
    ma020.setData(calculateSMA(candles, 20));
    ma005.setData(calculateSMA(candles, 5));
    ma120.applyOptions({ lineStyle: 2 }); // 점선

    const candle = mainChart.addCandlestickSeries({
        upColor: UP, downColor: DOWN, borderDownColor: DOWN, borderUpColor: UP,
        wickDownColor: DOWN, wickUpColor: UP,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1
    });
    candle.setData(candles);
    try {
        const last = candles[candles.length - 1];
        candle.applyOptions({ priceLineColor: last && last.close >= last.open ? UP : DOWN });
    } catch { }

    // MA 레전드
    (function addMaLegend() {
        const legend = document.createElement('div');
        Object.assign(legend.style, {
            position: 'absolute', top: '6px', left: '8px',
            display: 'flex', gap: '12px', alignItems: 'center',
            fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
            textShadow: '0 0 4px rgba(0,0,0,0.5)', pointerEvents: 'none', zIndex: 7
        });
        const mk = (color, label) => {
            const box = document.createElement('div');
            box.style.display = 'flex'; box.style.alignItems = 'center'; box.style.gap = '6px';
            const dot = document.createElement('span');
            Object.assign(dot.style, { width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block' });
            const txt = document.createElement('span'); txt.textContent = label;
            box.appendChild(dot); box.appendChild(txt);
            return box;
        };
        [['magenta', 'MA240'], ['darkorange', 'MA120'], ['green', 'MA60'], ['red', 'MA20'], ['white', 'MA5']]
            .forEach(([c, t]) => legend.appendChild(mk(c, t)));
        elMain.appendChild(legend);
    })();

    /* ===== 보조(서브) 시리즈: RSI / MACD / MAOSC / DISPARITY ===== */
    const rsiLine = subChart.addLineSeries({ color: '#FFD700', lineWidth: 1 });
    const rsiBase30 = subChart.addLineSeries({ color: 'green', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const rsiBase70 = subChart.addLineSeries({ color: 'red', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

    const macdLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });
    const sigLine = subChart.addLineSeries({ color: 'yellow', lineWidth: 1 });
    const hist = subChart.addHistogramSeries({ base: 0 });

    // MA Oscillator (fill/본선/보조/0선)
    const maoscFill = subChart.addBaselineSeries({
        baseValue: { type: 'price', price: 0 },
        topFillColor1: 'rgba(0, 128, 0, 0.25)', topFillColor2: 'rgba(0, 128, 0, 0.25)',
        bottomFillColor1: 'rgba(255, 0, 0, 0.2)', bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
        topLineColor: 'rgba(0,0,0,0)', bottomLineColor: 'rgba(0,0,0,0)',
        priceLineVisible: false, lastValueVisible: false,
    });
    const maoscLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });
    const maoWhite = subChart.addLineSeries({ color: '#ffffff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const maoscZero = subChart.addLineSeries({ color: 'green', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

    const disparityBase100 = subChart.addLineSeries({ color: '#FFD700', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
    const disparityFill = subChart.addBaselineSeries({
        baseValue: { type: 'price', price: 100 },
        topFillColor1: 'rgba(0, 128, 0, 0.25)', topFillColor2: 'rgba(0, 128, 0, 0.25)',
        bottomFillColor1: 'rgba(255, 0, 0, 0.2)', bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
        topLineColor: 'rgba(0,0,0,0)', bottomLineColor: 'rgba(0,0,0,0)',
        priceLineVisible: false, lastValueVisible: false,
    });
    const disparityLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });

    // === 지표 데이터 ===
    const rsiRaw = calculateRSI(candles, 14);
    const { macd: macdRaw, signal: sigRaw, histogram: histRaw } = calculateMACD(candles);
    const maoscRaw = calculateMAOscillator(candles, 20, 60); // 호환 유지(도트 fallback)

    const ma20 = calculateSMA(candles, 20);
    const closeMap = new Map(candles.map(c => [c.time, c.close]));
    const dispRaw = ma20
        .filter(m => Number.isFinite(m.value) && closeMap.has(m.time))
        .map(m => ({ time: m.time, value: (closeMap.get(m.time) / m.value) * 100 }));

    const mapHistColors = (items) => items.map(h => ({
        time: h.time, value: h.value,
        color: (h.value >= 0) ? 'rgba(0, 255, 0, 0.5)' : 'rgba(239, 83, 80, 0.5)',
    }));

    /* ===== (신규) MA Oscillator Mid/Long 데이터 준비 ===== */
    const sma5 = calculateSMA(candles, 5);
    const sma60 = calculateSMA(candles, 60);
    const sma240 = calculateSMA(candles, 240);

    const toMap = (arr) => new Map(arr.filter(x => Number.isFinite(x?.value)).map(x => [x.time, x.value]));
    const m5 = toMap(sma5), m20m = toMap(ma20), m60 = toMap(sma60), m240 = toMap(sma240);

    // Mid: 본선 빨강=(20-60), 보조 흰=(5-60)
    const midRed = candles.map(c => ({ time: c.time, value: (m20m.get(c.time) ?? NaN) - (m60.get(c.time) ?? NaN) })).filter(x => Number.isFinite(x.value));
    const midWhite = candles.map(c => ({ time: c.time, value: (m5.get(c.time) ?? NaN) - (m60.get(c.time) ?? NaN) })).filter(x => Number.isFinite(x.value));

    // Long: 본선 초록=(60-240), 보조 빨강=(20-240)
    const longRed = candles.map(c => ({ time: c.time, value: (m60.get(c.time) ?? NaN) - (m240.get(c.time) ?? NaN) })).filter(x => Number.isFinite(x.value));
    const longWhite = candles.map(c => ({ time: c.time, value: (m20m.get(c.time) ?? NaN) - (m240.get(c.time) ?? NaN) })).filter(x => Number.isFinite(x.value));

    // 교차(골드/데드): white - red 부호 변화
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
            if (diffPrev <= EPS && diffCurr > EPS) markers.push({ time: t, position: 'belowBar', color: '#16a34a', shape: 'arrowUp' });
            if (diffPrev >= -EPS && diffCurr < -EPS) markers.push({ time: t, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown' });
        }
        return markers;
    }
    const midMarkers = makeCrossMarkers(midWhite, midRed);   // (5-20) 교차
    const longMarkers = makeCrossMarkers(longWhite, longRed); // (20-60) 교차

    // 도트/펄스
    (function ensurePulseStyles() {
        const make = (id, css) => { if (!document.getElementById(id)) { const st = document.createElement('style'); st.id = id; st.textContent = css; document.head.appendChild(st); } };
        make('l2fm-rsi-pulse-style', `@keyframes l2fmPulse{0%{box-shadow:0 0 0 0 rgba(255,215,0,.65);opacity:1;}70%{box-shadow:0 0 0 12px rgba(255,215,0,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(255,215,0,0);opacity:.85;}}`);
        make('l2fm-maosc-pulse-style', `@keyframes l2fmMAOSCPulse{0%{box-shadow:0 0 0 0 rgba(0,255,0,.55);opacity:1;}70%{box-shadow:0 0 0 12px rgba(0,255,0,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(0,255,0,0);opacity:.85;}}`);
        make('l2fm-macd-pulse-style', `@keyframes l2fmMACDPulse{0%{box-shadow:0 0 0 0 rgba(255,215,0,.65);opacity:1;}70%{box-shadow:0 0 0 12px rgba(255,215,0,0);opacity:.9;}100%{box-shadow:0 0 0 0 rgba(255,215,0,0);opacity:.9;}}`);
        make('l2fm-disp-pulse-style', `@keyframes l2fmDISPPulse{0%{box-shadow:0 0 0 0 rgba(255,183,77,.55);opacity:1;}70%{box-shadow:0 0 0 12px rgba(255,183,77,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(255,183,77,0);opacity:.85;}}`);
    })();

    const mkDot = (bg, anim) => {
        const d = document.createElement('div');
        Object.assign(d.style, { position: 'absolute', width: '8px', height: '8px', borderRadius: '50%', background: bg, pointerEvents: 'none', zIndex: 5, left: '-9999px', top: '-9999px', animation: `${anim} 1.6s ease-out infinite` });
        elSub.appendChild(d);
        return d;
    };
    const rsiDot = mkDot('#FFD700', 'l2fmPulse');
    const macdDot = mkDot('#FFD700', 'l2fmMACDPulse');
    const maoDot = mkDot('green', 'l2fmMAOSCPulse');
    const dispDot = mkDot('#FFB74D', 'l2fmDISPPulse');

    function posDot(subChart, series, last) {
        const x = subChart.timeScale()?.timeToCoordinate(last?.time);
        const y = series?.priceToCoordinate?.(last?.value);
        return (Number.isFinite(x) && Number.isFinite(y)) ? { x: x - 4, y: y - 4 } : null;
    }
    const positionRSIDot = () => { const p = posDot(subChart, rsiLine, rsiRaw.at(-1)); if (p) { rsiDot.style.left = p.x + 'px'; rsiDot.style.top = p.y + 'px'; } else rsiDot.style.left = rsiDot.style.top = '-9999px'; };
    const positionMACDDot = () => { const p = posDot(subChart, macdLine, macdRaw.at(-1)); if (p) { macdDot.style.left = p.x + 'px'; macdDot.style.top = p.y + 'px'; } else macdDot.style.left = macdDot.style.top = '-9999px'; };
    const positionMAODot = () => {
        const last = (MAO_MODE === 'long' ? longRed.at(-1) : midRed.at(-1)) || maoscRaw.at(-1);
        const p = posDot(subChart, maoscLine, last);
        if (p) { maoDot.style.left = p.x + 'px'; maoDot.style.top = p.y + 'px'; }
        else { maoDot.style.left = maoDot.style.top = '-9999px'; }
    };
    const positionDISPDot = () => { const p = posDot(subChart, disparityLine, dispRaw.at(-1)); if (p) { dispDot.style.left = p.x + 'px'; dispDot.style.top = p.y + 'px'; } else dispDot.style.left = dispDot.style.top = '-9999px'; };

    // 레전드
    const mkLegend = () => {
        const box = document.createElement('div');
        Object.assign(box.style, {
            position: 'absolute', top: '6px', left: '8px',
            display: 'none', gap: '8px', padding: '4px 6px',
            fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
            background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
        });
        elSub.appendChild(box);
        return box;
    };
    const legendRSI = mkLegend();
    const legendMACD = mkLegend();
    const legendMAO = mkLegend();
    const legendDISP = mkLegend();

    function renderRSILegend() {
        const last = rsiRaw.at(-1)?.value;
        if (!Number.isFinite(last)) { legendRSI.style.display = 'none'; return; }
        legendRSI.innerHTML = `
      <span>RSI(14): <span style="color:#FFD700">${last.toFixed(1)}</span></span>
      <span style="margin:0 6px;">|</span>
      <span>Zones: <span style="color:green">30</span> / <span style="color:red">70</span></span>`;
        legendRSI.style.display = '';
    }
    function renderMACDLegend() {
        const mLast = macdRaw.at(-1)?.value, sLast = sigRaw.at(-1)?.value;
        if (!Number.isFinite(mLast) || !Number.isFinite(sLast)) { legendMACD.style.display = 'none'; return; }
        legendMACD.innerHTML = `
      <span>MACD(12,26,9): </span>
      <span style="color:red">${mLast.toFixed(2)}</span>
      <span style="margin:0 6px;">|</span>
      <span>Signal: <span style="color:yellow">${sLast.toFixed(2)}</span></span>`;
        legendMACD.style.display = '';
    }
    function renderMAOSCLegendMid() {
        legendMAO.innerHTML = `
      <span style="color:#ffffff">MA_Oscillator(</span>
      <span style="color:red">20</span>
      <span style="color:#ffffff">-</span>
      <span style="color:green">60</span>
      <span style="color:#ffffff">), </span><span style="color:#ffffff">5</span>`;
        legendMAO.style.display = '';
    }
    function renderMAOSCLegendLong() {
        legendMAO.innerHTML = `
      <span style="color:#ffffff">LMA_Oscillator(</span>
      <span style="color:green">60</span>
      <span style="color:#ffffff">-</span>
      <span style="color:magenta">240</span>
      <span style="color:#ffffff">), </span><span style="color:red">20</span>`;
        legendMAO.style.display = '';
    }
    function renderDISPLegend() {
        const last = dispRaw.at(-1)?.value;
        if (!Number.isFinite(last)) { legendDISP.style.display = 'none'; return; }
        const curColor = last >= 100 ? 'green' : 'red';
        legendDISP.innerHTML = `
      <span>Disparity(20): <span style="color:${curColor}">${last.toFixed(1)}%</span></span>
      <span style="margin:0 6px;">|</span>
      <span>Base: <span style="color:#FFD700">100</span></span>`;
        legendDISP.style.display = '';
    }

    // 토글 로직
    const pairs = [{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }];

    function hideAllLegends() { [legendRSI, legendMACD, legendMAO, legendDISP].forEach(b => b.style.display = 'none'); }
    function clearAllSub() {
        rsiLine.setData([]); rsiBase30.setData([]); rsiBase70.setData([]);
        macdLine.setData([]); sigLine.setData([]); hist.setData([]);
        maoscFill.setData([]); maoscLine.setData([]); maoscZero.setData([]); maoWhite.setData([]);
        disparityFill.setData([]); disparityLine.setData([]); disparityBase100.setData([]);
        [rsiDot, macdDot, maoDot, dispDot].forEach(d => { d.style.left = d.style.top = '-9999px'; });
        hideAllLegends();
    }

    // 현재 MAO 모드
    let MAO_MODE = 'mid'; // 'mid' | 'long'

    function showRSI() {
        clearAllSub();
        rsiLine.setData(padWithWhitespace(candles, rsiRaw));
        rsiBase30.setData(candles.map(c => ({ time: c.time, value: 30 })));
        rsiBase70.setData(candles.map(c => ({ time: c.time, value: 70 })));
        positionRSIDot(); renderRSILegend();
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showMACD() {
        clearAllSub();
        macdLine.setData(padWithWhitespace(candles, macdRaw));
        sigLine.setData(padWithWhitespace(candles, sigRaw));
        hist.setData(padWithWhitespace(candles, mapHistColors(histRaw)));
        positionMACDDot(); renderMACDLegend();
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }

    function renderMAOscillator(mode = 'mid') {
        // 초기화
        maoscFill.setData([]);
        maoscLine.setData([]);
        maoscZero.setData([]);
        maoWhite.setData([]);
        maoDot.style.left = maoDot.style.top = '-9999px';
        legendMAO.style.display = 'none';

        if (mode === 'long') {
            // 장기: 본선(60-240)=초록 1px, 보조(20-240)=빨강 1px, 기준선=0(마젠타 1px)
            maoscFill.setData(padWithWhitespace(candles, longRed));
            maoscLine.applyOptions({ color: 'green', lineWidth: 1 });
            maoscLine.setData(padWithWhitespace(candles, longRed));

            maoWhite.applyOptions({ color: 'red', lineWidth: 1 });
            maoWhite.setData(padWithWhitespace(candles, longWhite));

            maoscZero.applyOptions({ color: 'magenta', lineWidth: 1, lineStyle: 0 });
            maoscZero.setData(candles.map(c => ({ time: c.time, value: 0 })));

            maoWhite.setMarkers(longMarkers);
            positionMAODot();
            renderMAOSCLegendLong();
        } else {
            // 중기: 본선(20-60)=빨강 1px, 보조(5-60)=흰색 1px, 기준선=0(초록 1px)
            maoscFill.setData(padWithWhitespace(candles, midRed));
            maoscLine.applyOptions({ color: 'red', lineWidth: 1 });
            maoscLine.setData(padWithWhitespace(candles, midRed));

            maoWhite.applyOptions({ color: '#ffffff', lineWidth: 1 });
            maoWhite.setData(padWithWhitespace(candles, midWhite));

            maoscZero.applyOptions({ color: 'green', lineWidth: 1, lineStyle: 0 });
            maoscZero.setData(candles.map(c => ({ time: c.time, value: 0 })));

            maoWhite.setMarkers(midMarkers);
            positionMAODot();
            renderMAOSCLegendMid();
        }
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }

    function showMAOSC() {
        clearAllSub();
        renderMAOscillator(MAO_MODE);
    }

    function showDISP() {
        clearAllSub();
        disparityFill.setData(padWithWhitespace(candles, dispRaw));
        disparityLine.setData(padWithWhitespace(candles, dispRaw));
        disparityBase100.setData(candles.map(c => ({ time: c.time, value: 100 })));
        positionDISPDot(); renderDISPLegend();
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }

    // 초기: RSI
    showRSI();
    function setToolbarActive(name) {
        const btnRSI = document.querySelector('.main-toolbar [data-action="rsi"]');
        const btnMACD = document.querySelector('.main-toolbar [data-action="macd"]');
        const btnMAO = document.querySelector('.main-toolbar [data-action="ma_oscillator"]');
        const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');
        [btnRSI, btnMACD, btnMAO, btnDISP].forEach(b => b && b.classList.remove('active-preset'));
        if (name === 'RSI' && btnRSI) btnRSI.classList.add('active-preset');
        if (name === 'MACD' && btnMACD) btnMACD.classList.add('active-preset');
        if (name === 'MAOSC' && btnMAO) btnMAO.classList.add('active-preset');
        if (name === 'DISP' && btnDISP) btnDISP.classList.add('active-preset');
    }
    setToolbarActive('RSI');

    // Lifeline/Trendline (MA20/MA60 깜빡이)
    const LIFE_RED = 'red', LIFE_YELLOW = '#FFD700';
    let lifelineOn = false, lifelineTimer = null, lifeFlip = false;
    function setLifelineUI(active) {
        const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
        if (!btnLife) return;
        if (active) btnLife.classList.add('active-preset'); else btnLife.classList.remove('active-preset');
    }
    function startLifeline() {
        lifelineOn = true; setLifelineUI(true);
        try { ma020.applyOptions({ color: LIFE_YELLOW }); } catch { }
        lifelineTimer = setInterval(() => {
            try { lifeFlip = !lifeFlip; ma020.applyOptions({ color: lifeFlip ? LIFE_RED : LIFE_YELLOW }); } catch { }
        }, 1500);
    }
    function stopLifeline() {
        lifelineOn = false; setLifelineUI(false);
        if (lifelineTimer) { try { clearInterval(lifelineTimer); } catch { } lifelineTimer = null; }
        lifeFlip = false; try { ma020.applyOptions({ color: LIFE_RED }); } catch { }
    }
    function toggleLifeline() { if (lifelineOn) stopLifeline(); else startLifeline(); }

    const TREND_GREEN = 'green', TREND_LIGHT = '#7CFC00';
    let trendOn = false, trendTimer = null, trendFlip = false;
    function setTrendUI(active) {
        const btn = document.querySelector('.main-toolbar [data-action="trendline"]');
        if (!btn) return;
        if (active) btn.classList.add('active-preset'); else btn.classList.remove('active-preset');
    }
    function startTrend() {
        trendOn = true; setTrendUI(true);
        try { ma060.applyOptions({ color: TREND_LIGHT }); } catch { }
        trendTimer = setInterval(() => {
            try { trendFlip = !trendFlip; ma060.applyOptions({ color: trendFlip ? TREND_GREEN : TREND_LIGHT }); } catch { }
        }, 1500);
    }
    function stopTrend() {
        trendOn = false; setTrendUI(false);
        if (trendTimer) { try { clearInterval(trendTimer); } catch { } lifelineTimer = null; }
        trendFlip = false; try { ma060.applyOptions({ color: TREND_GREEN }); } catch { }
    }
    function toggleTrend() { if (trendOn) stopTrend(); else startTrend(); }

    // 툴바 이벤트
    const btnRSI = document.querySelector('.main-toolbar [data-action="rsi"]');
    const btnMACD = document.querySelector('.main-toolbar [data-action="macd"]');
    const btnMAO = document.querySelector('.main-toolbar [data-action="ma_oscillator"]');
    const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');
    const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
    const btnTrend = document.querySelector('.main-toolbar [data-action="trendline"]');

    const onRSI = () => { showRSI(); setToolbarActive('RSI'); };
    const onMACD = () => { showMACD(); setToolbarActive('MACD'); };

    // MA Oscillator 버튼: 표시 중이면 모드 토글, 아니면 Mid로 시작
    const onMAO = () => {
        const showingMAO = legendMAO.style.display !== 'none';
        if (showingMAO) {
            MAO_MODE = (MAO_MODE === 'mid') ? 'long' : 'mid';
            renderMAOscillator(MAO_MODE);
        } else {
            MAO_MODE = 'mid';
            showMAOSC();
            setToolbarActive('MAOSC');
        }
    };

    const onDISP = () => { showDISP(); setToolbarActive('DISP'); };
    const onLife = () => { toggleLifeline(); };
    const onTrend = () => { toggleTrend(); };

    btnRSI?.addEventListener('click', onRSI);
    btnMACD?.addEventListener('click', onMACD);
    btnMAO?.addEventListener('click', onMAO);
    btnDISP?.addEventListener('click', onDISP);
    btnLife?.addEventListener('click', onLife);
    btnTrend?.addEventListener('click', onTrend);

    // 도트 재배치
    const unsub = [];
    try {
        const ts = subChart.timeScale();
        const onRange = () => { positionRSIDot(); positionMAODot(); positionDISPDot(); positionMACDDot(); };
        ts.subscribeVisibleTimeRangeChange(onRange);
        unsub.push(() => ts.unsubscribeVisibleTimeRangeChange(onRange));
    } catch { }
    try {
        const ps = subChart.priceScale('right');
        if (ps?.subscribeSizeChange) {
            const onSize = () => { positionRSIDot(); positionMAODot(); positionDISPDot(); positionMACDDot(); };
            ps.subscribeSizeChange(onSize);
            unsub.push(() => ps.unsubscribeSizeChange(onSize));
        }
    } catch { }
    const ro = new ResizeObserver(() => {
        positionRSIDot(); positionMAODot(); positionDISPDot(); positionMACDDot();
    });
    try { ro.observe(elSub); } catch { }

    const tsLink = linkTimeScalesOneWay(mainChart, subChart);
    const paLink = observeAndSyncPriceAxisWidth([{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }]);

    setInitialVisibleRange(mainChart, candles, INITIAL_BARS);
    requestAnimationFrame(() => resyncAxisPadding([{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }]));

    const onDblClick = () => setInitialVisibleRange(mainChart, candles, INITIAL_BARS);
    elMain.addEventListener('dblclick', onDblClick);

    // 정리
    return () => {
        btnRSI?.removeEventListener('click', onRSI);
        btnMACD?.removeEventListener('click', onMACD);
        btnMAO?.removeEventListener('click', onMAO);
        btnDISP?.removeEventListener('click', onDISP);
        btnLife?.removeEventListener('click', onLife);
        btnTrend?.removeEventListener('click', onTrend);
        elMain.removeEventListener('dblclick', onDblClick);

        try { ro.disconnect(); } catch { }
        unsub.forEach(fn => { try { fn(); } catch { } });

        // 점/레전드 제거
        try { [rsiDot, macdDot, maoDot, dispDot].forEach(d => elSub.removeChild(d)); } catch { }
        try { [legendRSI, legendMACD, legendMAO, legendDISP].forEach(b => elSub.removeChild(b)); } catch { }

        try { mainChart.remove(); } catch { }
        try { subChart.remove(); } catch { }
        try { tsLink?.dispose?.(); } catch { }
        try { paLink?.dispose?.(); } catch { }
    };
}

export default mountUSSingle60m;
export const presetKey = 'usSingle60m';
export function dispose() { }
