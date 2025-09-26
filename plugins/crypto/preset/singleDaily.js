// Listen2FM_Viewer/plugins/crypto/preset/singleDaily.js

import { loadCrypto } from "../data/dataLoader.js";
import { calculateRSI } from "../indicators/rsi.js";
import { calculateMACD } from "../indicators/macd.js";
import { calculateSMA } from "../indicators/movingAverage.js";
import { calculateMAOscillator } from "../indicators/maOscillator.js";
import observeAndSyncPriceAxisWidth from "../sync/priceAxisSync.js";
import { createTitleOverlay } from "./_common.js"; // ★ 타이틀 공통 사용

/* 공통 옵션 (원본 유지) */
function baseChartOptions(LWC) {
    return {
        layout: { background: { type: 'solid', color: '#0e0f13' }, textColor: '#e8e8ea' },
        grid: { vertLines: { color: '#2a2b31' }, horzLines: { color: '#2a2b31' } },
        rightPriceScale: { borderColor: '#2a2b31' },
        timeScale: { borderColor: '#2a2b31', rightOffset: 2 },
        crosshair: { mode: LWC.CrosshairMode.Normal },
        autoSize: true
    };
}
function linkTimeScalesOneWay(mainChart, subChart) {
    const mainTs = mainChart.timeScale();
    const subTs = subChart.timeScale();
    const apply = (r) => { if (r) { try { subTs.setVisibleLogicalRange(r); } catch { } } };
    const onLog = (r) => apply(r);
    mainTs.subscribeVisibleLogicalRangeChange(onLog);
    try { const cur = mainTs.getVisibleLogicalRange?.(); if (cur) apply(cur); } catch { }
    return { dispose() { try { mainTs.unsubscribeVisibleLogicalRangeChange(onLog); } catch { } } };
}
function padWithWhitespace(fullCandles, seriesData) {
    if (!Array.isArray(seriesData) || !seriesData.length) return [];
    const firstIdx = fullCandles.findIndex(c => c.time === seriesData[0].time);
    if (firstIdx <= 0) return seriesData;
    const pad = [];
    for (let k = 0; k < firstIdx; k++) pad.push({ time: fullCandles[k].time });
    return pad.concat(seriesData);
}
function resyncAxisPadding(pairs) {
    const getW = (c) => { try { const w = c.priceScale('right').width(); return Number.isFinite(w) ? w : 0; } catch { return 0; } };
    const widths = pairs.map(p => getW(p.chart));
    const target = Math.max(...widths, 0);
    pairs.forEach((p, i) => {
        const pad = Math.max(0, target - widths[i]);
        if (p.container.__spRight) p.container.__spRight.style.width = pad + 'px';
    });
}
const INITIAL_BARS = 360;
function setInitialVisibleRange(chart, candles) {
    try {
        const ts = chart.timeScale();
        const total = candles.length;
        const from = Math.max(0, total - INITIAL_BARS);
        ts.setVisibleLogicalRange({ from, to: total - 1 });
    } catch { }
}
const NAME_KO = {
    BTC: "비트코인", ETH: "이더리움", SOL: "솔라나", XRP: "엑스알피",
    XLM: "스텔라루멘", HBAR: "헤데라", ADA: "에이다", AAVE: "에이브",
    LINK: "체인링크", DOGE: "도지코인", AVAX: "아발란체", DOT: "폴카닷",
    TRX: "트론", SUI: "수이", ONDO: "온도파이낸스", IOTA: "아이오타",
    VET: "비체인", POL: "폴리곤", APT: "앱토스", ARB: "아비트럼",
    NEO: "네오", SHIB: "시바이누",
};

export async function mountSingleDaily({ mainRoot, symbol = "BTC", exchange = "upbit" }) {
    const LWC = window.LightweightCharts;
    if (!LWC) { mainRoot.innerHTML = '<p style="color:#f66">LightweightCharts 로드 실패</p>'; return () => { }; }

    mainRoot.innerHTML = `
      <div id="l2fm-singleDaily" style="display:grid;grid-template-rows:4fr 1fr;gap:6px;height:100%;">
        <div id="sd-main" style="min-height:120px; position:relative;"></div>
        <div id="sd-sub"  style="min-height:90px;  position:relative;"></div>
      </div>`;
    const elMain = mainRoot.querySelector("#sd-main");
    const elSub = mainRoot.querySelector("#sd-sub");

    // 타이틀
    const ko = NAME_KO[symbol] || symbol;
    const quote = (exchange === 'upbit') ? 'KRW' : 'USDT';
    createTitleOverlay(elMain, `${ko} (${symbol}/${quote})`);

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

    const candles = await loadCrypto({ symbol, timeframe: "daily", exchange });

    // ── 메인: 볼륨 → MA들 → 캔들 ──
    const UP = '#26a69a', DOWN = '#ef5350';

    const vol = mainChart.addHistogramSeries({
        priceScaleId: 'vol', priceFormat: { type: 'volume' },
        priceLineVisible: false, lastValueVisible: false,
    });
    vol.setData(candles.map(c => ({ time: c.time, value: c.volume, color: (c.close >= c.open) ? UP : DOWN })));
    mainChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

    const ma240 = mainChart.addLineSeries({ color: 'magenta', lineWidth: 4, priceLineVisible: false });
    const ma120 = mainChart.addLineSeries({
        color: 'darkorange', lineWidth: 1, priceLineVisible: false,
        lastValueVisible: false,
    });
    const ma060 = mainChart.addLineSeries({ color: 'green', lineWidth: 3, priceLineVisible: false });
    const ma020 = mainChart.addLineSeries({
        color: 'red', lineWidth: 3, priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1, priceLineColor: 'red'
    });
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

    // 좌측 상단 MA 레전드 (원본 유지)
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

    // ===== 보조 시리즈 =====
    // RSI
    const rsiLine = subChart.addLineSeries({ color: '#FFD700', lineWidth: 1 });
    const rsiBase30 = subChart.addLineSeries({ color: 'green', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const rsiBase70 = subChart.addLineSeries({ color: 'red', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

    // MACD (요청: 시그널 yellow)
    const macdLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });
    const sigLine = subChart.addLineSeries({ color: 'yellow', lineWidth: 1 });
    const hist = subChart.addHistogramSeries({ base: 0 });

    // MA_Oscillator (채움 + 선 + 0선) — 확장: Mid/Long 토글 지원
    const maoscFill = subChart.addBaselineSeries({
        baseValue: { type: 'price', price: 0 },
        topFillColor1: 'rgba(0, 128, 0, 0.25)',
        topFillColor2: 'rgba(0, 128, 0, 0.25)',
        bottomFillColor1: 'rgba(255, 0, 0, 0.2)',
        bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
        topLineColor: 'rgba(0,0,0,0)',
        bottomLineColor: 'rgba(0,0,0,0)',
        priceLineVisible: false,
        lastValueVisible: false,
    });
    const maoscLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 }); // 기본(중기) 빨강 = MA20
    const maoWhite = subChart.addLineSeries({ color: '#ffffff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); // 흰=MA5 계열
    const maoscZero = subChart.addLineSeries({
        color: 'green', lineWidth: 1, lineStyle: 0,
        lastValueVisible: false, priceLineVisible: false
    });

    // FG Index
    const fgLine = subChart.addLineSeries({ color: '#5ee0ff', lineWidth: 1 });
    const fg25 = subChart.addLineSeries({ color: '#7CFC00', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const fg75 = subChart.addLineSeries({ color: 'red', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

    // Disparity(20)
    const disparityBase100 = subChart.addLineSeries({
        color: '#FFD700', lineWidth: 1, lineStyle: 0,
        lastValueVisible: false, priceLineVisible: false
    });
    const disparityFill = subChart.addBaselineSeries({
        baseValue: { type: 'price', price: 100 },
        topFillColor1: 'rgba(0, 128, 0, 0.25)',
        topFillColor2: 'rgba(0, 128, 0, 0.25)',
        bottomFillColor1: 'rgba(255, 0, 0, 0.2)',
        bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
        topLineColor: 'rgba(0,0,0,0)',
        bottomLineColor: 'rgba(0,0,0,0)',
        priceLineVisible: false,
        lastValueVisible: false,
    });
    const disparityLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });

    // === 지표 데이터 ===
    const rsiRaw = calculateRSI(candles, 14);
    const { macd: macdRaw, signal: sigRaw, histogram: histRaw } = calculateMACD(candles);

    // (레거시 호환) 기본 MAOSC 데이터(20-60) — 유지
    const maoscRaw = calculateMAOscillator(candles, 20, 60); // 20-60

    // (신규) MAOSC Mid/Long용 SMA 준비
    const sma005_m = calculateSMA(candles, 5);
    const sma020_m = calculateSMA(candles, 20);
    const sma060_m = calculateSMA(candles, 60);
    const sma240_m = calculateSMA(candles, 240);

    const toMap = (arr) => new Map(arr.filter(a => Number.isFinite(a?.value)).map(a => [a.time, a.value]));
    const m5 = toMap(sma005_m);
    const m20m = toMap(sma020_m);
    const m60 = toMap(sma060_m);
    const m240 = toMap(sma240_m);

    // Mid(중기): 본선 빨강=(20-60), 흰=(5-60)
    const midRed = candles.map(c => ({ time: c.time, value: (m20m.get(c.time) ?? NaN) - (m60.get(c.time) ?? NaN) })).filter(x => Number.isFinite(x.value));
    const midWhite = candles.map(c => ({ time: c.time, value: (m5.get(c.time) ?? NaN) - (m60.get(c.time) ?? NaN) })).filter(x => Number.isFinite(x.value));
    // Long(장기): 본선 초록=(60-240), 흰→빨강=(20-240)
    const longRed = candles.map(c => ({ time: c.time, value: (m60.get(c.time) ?? NaN) - (m240.get(c.time) ?? NaN) })).filter(x => Number.isFinite(x.value));
    const longWhite = candles.map(c => ({ time: c.time, value: (m20m.get(c.time) ?? NaN) - (m240.get(c.time) ?? NaN) })).filter(x => Number.isFinite(x.value));

    // 교차 마커 (white vs red 교차)
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
            if (diffPrev <= EPS && diffCurr > EPS) markers.push({ time: t, position: 'belowBar', color: '#16a34a', shape: 'arrowUp' }); // 골드
            if (diffPrev >= -EPS && diffCurr < -EPS) markers.push({ time: t, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown' }); // 데드
        }
        return markers;
    }
    const midMarkers = makeCrossMarkers(midWhite, midRed);
    const longMarkers = makeCrossMarkers(longWhite, longRed);

    // Disparity(20): 100 * Close / MA20
    const ma20 = calculateSMA(candles, 20);
    const closeMap = new Map(candles.map(c => [c.time, c.close]));
    const dispRaw = ma20
        .filter(m => Number.isFinite(m.value) && closeMap.has(m.time))
        .map(m => ({ time: m.time, value: (closeMap.get(m.time) / m.value) * 100 }));

    // === 히스토그램 색상(±, 투명도 50) ===
    function mapHistColors(items) {
        return items.map(h => ({
            time: h.time,
            value: h.value,
            color: (h.value >= 0) ? 'rgba(0, 255, 0, 0.5)' : 'rgba(239, 83, 80, 0.5)' // green/red 50%
        }));
    }

    // === 펄스 스타일 (RSI/MAOSC/MACD/FG/DISP) ===
    (function ensurePulseStyle() {
        const id = 'l2fm-rsi-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            st.textContent = `
@keyframes l2fmPulse { 0% { box-shadow: 0 0 0 0 rgba(255,215,0,0.65); opacity:1;}
70% { box-shadow:0 0 0 12px rgba(255,215,0,0); opacity:.85;} 100% { box-shadow:0 0 0 0 rgba(255,215,0,0); opacity:.85;} }`;
            document.head.appendChild(st);
        }
    })();
    const rsiDot = document.createElement('div');
    Object.assign(rsiDot.style, { position: 'absolute', width: '8px', height: '8px', borderRadius: '50%', background: '#FFD700', pointerEvents: 'none', zIndex: '5', animation: 'l2fmPulse 1.6s ease-out infinite', left: '-9999px', top: '-9999px' });
    elSub.appendChild(rsiDot);
    function positionRSIDot() {
        if (current !== 'RSI' || !rsiRaw.length) { rsiDot.style.left = rsiDot.style.top = '-9999px'; return; }
        const last = rsiRaw[rsiRaw.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = rsiLine.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) { rsiDot.style.left = (x - 4) + 'px'; rsiDot.style.top = (y - 4) + 'px'; }
    }

    (function ensureMAOSCPulseStyle() {
        const id = 'l2fm-maosc-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            st.textContent = `
@keyframes l2fmMAOSCPulse{
  0%{box-shadow:0 0 0 0 rgba(0,255,0,.55);opacity:1;}
  70%{box-shadow:0 0 0 12px rgba(0,255,0,0);opacity:.85;}
  100%{box-shadow:0 0 0 0 rgba(0,255,0,0);opacity:.85;}
}`;
            document.head.appendChild(st);
        }
    })();
    const maoscDot = document.createElement('div');
    Object.assign(maoscDot.style, {
        position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
        background: 'green', pointerEvents: 'none', zIndex: 5,
        animation: 'l2fmMAOSCPulse 1.6s ease-out infinite', left: '-9999px', top: '-9999px'
    });
    elSub.appendChild(maoscDot);

    // 현재 MAOSC 모드 상태 (mid | long), 기본 mid
    let MAO_MODE = 'mid';

    function positionMAOSCDot() {
        if (current !== 'MAOSC') { maoscDot.style.left = maoscDot.style.top = '-9999px'; return; }
        const srcArr = (MAO_MODE === 'long') ? longRed : midRed;
        if (!srcArr.length) { maoscDot.style.left = maoscDot.style.top = '-9999px'; return; }
        const last = srcArr[srcArr.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = maoscLine.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            maoscDot.style.left = (x - 4) + 'px';
            maoscDot.style.top = (y - 4) + 'px';
        } else {
            maoscDot.style.left = maoscDot.style.top = '-9999px';
        }
    }

    (function ensureMACDPulseStyle() {
        const id = 'l2fm-macd-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            st.textContent = `
@keyframes l2fmMACDPulse{
  0%{box-shadow:0 0 0 0 rgba(255,215,0,.65);opacity:1;}
  70%{box-shadow:0 0 0 12px rgba(255,215,0,0);opacity:.9;}
  100%{box-shadow:0 0 0 0 rgba(255,215,0,0);opacity:.9;}
}`;
            document.head.appendChild(st);
        }
    })();
    const macdDot = document.createElement('div');
    Object.assign(macdDot.style, {
        position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
        background: '#FFD700', pointerEvents: 'none', zIndex: 5,
        animation: 'l2fmMACDPulse 1.6s ease-out infinite', left: '-9999px', top: '-9999px'
    });
    elSub.appendChild(macdDot);
    function positionMACDDot() {
        if (current !== 'MACD' || !macdRaw.length) { macdDot.style.left = macdDot.style.top = '-9999px'; return; }
        const last = macdRaw[macdRaw.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = macdLine.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) { macdDot.style.left = (x - 4) + 'px'; macdDot.style.top = (y - 4) + 'px'; }
    }

    (function ensureFGPulseStyle() {
        const id = 'l2fm-fg-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            st.textContent = `
@keyframes l2fmFGPulse { 0% { box-shadow: 0 0 0 0 rgba(94,224,255,0.65); opacity:1;}
70% { box-shadow:0 0 0 12px rgba(94,224,255,0); opacity:.85;} 100% { box-shadow:0 0 0 0 rgba(94,224,255,0); opacity:.85;} }`;
            document.head.appendChild(st);
        }
    })();
    const fgDot = document.createElement('div');
    Object.assign(fgDot.style, { position: 'absolute', width: '8px', height: '8px', borderRadius: '50%', background: '#5ee0ff', pointerEvents: 'none', zIndex: '5', animation: 'l2fmFGPulse 1.6s ease-out infinite', left: '-9999px', top: '-9999px' });
    elSub.appendChild(fgDot);
    let fgDataCurrent = null;
    function positionFGDot(fgData) {
        if (current !== 'FG' || !fgData?.length) { fgDot.style.left = fgDot.style.top = '-9999px'; return; }
        const last = fgData[fgData.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = fgLine.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) { fgDot.style.left = (x - 4) + 'px'; fgDot.style.top = (y - 4) + 'px'; }
    }

    (function ensureDispPulseStyle() {
        const id = 'l2fm-disp-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            st.textContent = `@keyframes l2fmDISPPulse{
  0%{box-shadow:0 0 0 0 rgba(255,183,77,.55);opacity:1;}
  70%{box-shadow:0 0 0 12px rgba(255,183,77,0);opacity:.85;}
  100%{box-shadow:0 0 0 0 rgba(255,183,77,0);opacity:.85;}
}`;
            document.head.appendChild(st);
        }
    })();
    const dispDot = document.createElement('div');
    Object.assign(dispDot.style, {
        position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
        background: '#FFB74D', pointerEvents: 'none', zIndex: 5,
        animation: 'l2fmDISPPulse 1.6s ease-out infinite', left: '-9999px', top: '-9999px'
    });
    elSub.appendChild(dispDot);
    function positionDISPDot() {
        if (current !== 'DISP' || !dispRaw.length) { dispDot.style.left = dispDot.style.top = '-9999px'; return; }
        const last = dispRaw[dispRaw.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = disparityLine.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) { dispDot.style.left = (x - 4) + 'px'; dispDot.style.top = (y - 4) + 'px'; }
    }

    // === 레전드(각 지표) ===
    // MAOSC
    const legendBoxMAOSC = document.createElement('div');
    Object.assign(legendBoxMAOSC.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elSub.appendChild(legendBoxMAOSC);
    function renderMAOSCLegend(mode) {
        if (current !== 'MAOSC') { legendBoxMAOSC.style.display = 'none'; return; }
        if (mode === 'long') {
            // 장기: (60-240), 20 — 색상은 메인 MA와 동일
            legendBoxMAOSC.innerHTML = `
          <span style="color:#ffffff">LMA_Oscillator(</span>
          <span style="color:green">60</span>
          <span style="color:#ffffff">-</span>
          <span style="color:magenta">240</span>
          <span style="color:#ffffff">), </span><span style="color:red">20</span>`;
        } else {
            // 중기: (20-60), 5
            legendBoxMAOSC.innerHTML = `
          <span style="color:#ffffff">MA_Oscillator(</span>
          <span style="color:red">20</span>
          <span style="color:#ffffff">-</span>
          <span style="color:green">60</span>
          <span style="color:#ffffff">), </span><span style="color:#ffffff">5</span>`;
        }
        legendBoxMAOSC.style.display = '';
    }

    // Disparity
    const legendBoxDisp = document.createElement('div');
    Object.assign(legendBoxDisp.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elSub.appendChild(legendBoxDisp);
    function renderDisparityLegend() {
        if (current !== 'DISP') { legendBoxDisp.style.display = 'none'; return; }
        if (!dispRaw?.length) { legendBoxDisp.style.display = 'none'; return; }
        const last = dispRaw[dispRaw.length - 1]?.value;
        if (!Number.isFinite(last)) { legendBoxDisp.style.display = 'none'; return; }
        const curColor = last >= 100 ? 'green' : 'red';
        legendBoxDisp.innerHTML = `
          <span>Disparity(20): <span style="color:${curColor}">${last.toFixed(1)}%</span></span>
          <span style="margin:0 6px;">|</span>
          <span>Base: <span style="color:#FFD700">100</span></span>
        `;
        legendBoxDisp.style.display = '';
    }

    // RSI (복구)
    const legendBoxRSI = document.createElement('div');
    Object.assign(legendBoxRSI.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elSub.appendChild(legendBoxRSI);
    function renderRSILegend() {
        if (current !== 'RSI') { legendBoxRSI.style.display = 'none'; return; }
        if (!rsiRaw?.length) { legendBoxRSI.style.display = 'none'; return; }
        const last = rsiRaw[rsiRaw.length - 1]?.value;
        if (!Number.isFinite(last)) { legendBoxRSI.style.display = 'none'; return; }
        legendBoxRSI.innerHTML = `
          <span>RSI(14): <span style="color:#FFD700">${last.toFixed(1)}</span></span>
          <span style="margin:0 6px;">|</span>
          <span>Zones: <span style="color:green">30</span> / <span style="color:red">70</span></span>
        `;
        legendBoxRSI.style.display = '';
    }

    // MACD (복구)
    const legendBoxMACD = document.createElement('div');
    Object.assign(legendBoxMACD.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elSub.appendChild(legendBoxMACD);
    function renderMACDLegend() {
        if (current !== 'MACD') { legendBoxMACD.style.display = 'none'; return; }
        const mLast = macdRaw?.[macdRaw.length - 1]?.value;
        const sLast = sigRaw?.[sigRaw.length - 1]?.value;
        if (!Number.isFinite(mLast) || !Number.isFinite(sLast)) { legendBoxMACD.style.display = 'none'; return; }
        legendBoxMACD.innerHTML = `
          <span>MACD(12,26,9): </span>
          <span style="color:red">${mLast.toFixed(2)}</span>
          <span style="margin:0 6px;">|</span>
          <span>Signal: <span style="color:yellow">${sLast.toFixed(2)}</span></span>
        `;
        legendBoxMACD.style.display = '';
    }

    // FG Index (복구)
    const legendBoxFG = document.createElement('div');
    Object.assign(legendBoxFG.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elSub.appendChild(legendBoxFG);
    function renderFGLegend(fgData) {
        if (current !== 'FG') { legendBoxFG.style.display = 'none'; return; }
        if (!fgData?.length) { legendBoxFG.style.display = 'none'; return; }
        const last = fgData[fgData.length - 1]?.value;
        if (!Number.isFinite(last)) { legendBoxFG.style.display = 'none'; return; }
        legendBoxFG.innerHTML = `
          <span>FG Index: <span style="color:#5ee0ff">${last.toFixed(0)}</span></span>
          <span style="margin:0 6px;">|</span>
          <span>Bands: <span style="color:#7CFC00">25</span> / <span style="color:red">75</span></span>
        `;
        legendBoxFG.style.display = '';
    }

    // === 토글 ===
    let current = 'RSI';
    const pairs = [{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }];

    function clearAllSub() {
        // RSI
        rsiLine.setData([]); rsiBase30.setData([]); rsiBase70.setData([]);
        // MACD
        macdLine.setData([]); sigLine.setData([]); hist.setData([]); macdDot.style.left = macdDot.style.top = '-9999px';
        // MAOSC
        maoscFill.setData([]); maoscLine.setData([]); maoWhite.setData([]); maoscZero.setData([]); maoscDot.style.left = maoscDot.style.top = '-9999px';
        // FG
        fgLine.setData([]); fg25.setData([]); fg75.setData([]); fgDot.style.left = fgDot.style.top = '-9999px';
        // Disparity
        disparityFill.setData([]); disparityLine.setData([]); disparityBase100.setData([]); dispDot.style.left = dispDot.style.top = '-9999px';
        // dots
        rsiDot.style.left = rsiDot.style.top = '-9999px';
        // legends
        legendBoxMAOSC.style.display = 'none';
        legendBoxDisp.style.display = 'none';
        legendBoxRSI.style.display = 'none';
        legendBoxMACD.style.display = 'none';
        legendBoxFG.style.display = 'none';
    }

    function showRSI() {
        current = 'RSI';
        clearAllSub();
        rsiLine.setData(padWithWhitespace(candles, rsiRaw));
        rsiBase30.setData(candles.map(c => ({ time: c.time, value: 30 })));
        rsiBase70.setData(candles.map(c => ({ time: c.time, value: 70 })));
        positionRSIDot();
        renderRSILegend();
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showMACD() {
        current = 'MACD';
        clearAllSub();
        macdLine.setData(padWithWhitespace(candles, macdRaw));
        sigLine.setData(padWithWhitespace(candles, sigRaw));
        const histData = mapHistColors(histRaw);
        hist.setData(padWithWhitespace(candles, histData));
        positionMACDDot();
        renderMACDLegend();
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }

    function renderMAOscillator(mode = 'mid') {
        current = 'MAOSC';
        clearAllSub();

        if (mode === 'long') {
            // 장기: 본선 초록(60-240), 보조 빨강(20-240), 기준선 마젠타(240)
            maoscFill.setData(padWithWhitespace(candles, longRed));
            maoscLine.applyOptions({ color: 'green', lineWidth: 1 });
            maoscLine.setData(padWithWhitespace(candles, longRed));

            maoWhite.applyOptions({ color: 'red', lineWidth: 1 });
            maoWhite.setData(padWithWhitespace(candles, longWhite));
            maoWhite.setMarkers(longMarkers);

            maoscZero.applyOptions({ color: 'magenta', lineWidth: 1, lineStyle: 0 });
            maoscZero.setData(candles.map(c => ({ time: c.time, value: 0 })));
        } else {
            // 중기: 본선 빨강(20-60), 보조 흰(5-60), 기준선 초록(60)
            maoscFill.setData(padWithWhitespace(candles, midRed));
            maoscLine.applyOptions({ color: 'red', lineWidth: 1 });
            maoscLine.setData(padWithWhitespace(candles, midRed));

            maoWhite.applyOptions({ color: '#ffffff', lineWidth: 1 });
            maoWhite.setData(padWithWhitespace(candles, midWhite));
            maoWhite.setMarkers(midMarkers);

            maoscZero.applyOptions({ color: 'green', lineWidth: 1, lineStyle: 0 });
            maoscZero.setData(candles.map(c => ({ time: c.time, value: 0 })));
        }

        positionMAOSCDot();
        renderMAOSCLegend(mode);
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }

    async function showFG() {
        current = 'FG';
        clearAllSub();
        try {
            const res = await fetch('data/crypto/fg_index/btc_feargreed_merged.json');
            const raw = await res.json();
            fgDataCurrent = raw.map(r => ({ time: r.time, value: r.fg_value }));
            fgLine.setData(padWithWhitespace(candles, fgDataCurrent));
            fg25.setData(candles.map(c => ({ time: c.time, value: 25 })));
            fg75.setData(candles.map(c => ({ time: c.time, value: 75 })));
            positionFGDot(fgDataCurrent);
            renderFGLegend(fgDataCurrent);
        } catch (e) {
            console.error('FG Index load failed:', e);
        }
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showDISP() {
        current = 'DISP';
        clearAllSub();
        disparityFill.setData(padWithWhitespace(candles, dispRaw));
        disparityLine.setData(padWithWhitespace(candles, dispRaw));
        disparityBase100.setData(candles.map(c => ({ time: c.time, value: 100 })));
        positionDISPDot();
        renderDisparityLegend();
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }

    // 초기 표시: RSI
    showRSI();

    function setToolbarActive(name) {
        const btnRSI = document.querySelector('.main-toolbar [data-action="rsi"]');
        const btnMACD = document.querySelector('.main-toolbar [data-action="macd"]');
        const btnMAO = document.querySelector('.main-toolbar [data-action="ma_oscillator"]');
        const btnFG = document.querySelector('.main-toolbar [data-action="fg_index"]');
        const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');
        [btnRSI, btnMACD, btnMAO, btnFG, btnDISP].forEach(b => b && b.classList.remove('active-preset'));
        if (name === 'RSI' && btnRSI) btnRSI.classList.add('active-preset');
        if (name === 'MACD' && btnMACD) btnMACD.classList.add('active-preset');
        if (name === 'MAOSC' && btnMAO) btnMAO.classList.add('active-preset');
        if (name === 'FG' && btnFG) btnFG.classList.add('active-preset');
        if (name === 'DISP' && btnDISP) btnDISP.classList.add('active-preset');
    }
    setToolbarActive('RSI');

    // 생명선/추세선 깜빡이 (원본 유지)
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
        if (trendTimer) { try { clearInterval(trendTimer); } catch { } trendTimer = null; }
        trendFlip = false; try { ma060.applyOptions({ color: TREND_GREEN }); } catch { }
    }
    function toggleTrend() { if (trendOn) stopTrend(); else startTrend(); }

    // 툴바 이벤트
    const btnRSI = document.querySelector('.main-toolbar [data-action="rsi"]');
    const btnMACD = document.querySelector('.main-toolbar [data-action="macd"]');
    const btnMAO = document.querySelector('.main-toolbar [data-action="ma_oscillator"]');
    const btnFG = document.querySelector('.main-toolbar [data-action="fg_index"]');
    const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');
    const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
    const btnTrend = document.querySelector('.main-toolbar [data-action="trendline"]');

    const onRSI = () => { showRSI(); setToolbarActive('RSI'); };
    const onMACD = () => { showMACD(); setToolbarActive('MACD'); };

    // ★ MA Oscillator 버튼: 표시 중이면 Mid↔Long 토글, 아니면 Mid로 표시 시작
    const onMAO = () => {
        if (current === 'MAOSC') {
            MAO_MODE = (MAO_MODE === 'mid') ? 'long' : 'mid';
            renderMAOscillator(MAO_MODE);
        } else {
            MAO_MODE = 'mid';
            renderMAOscillator(MAO_MODE);
            setToolbarActive('MAOSC');
        }
    };

    const onFG = () => { showFG(); setToolbarActive('FG'); };
    const onDISP = () => { showDISP(); setToolbarActive('DISP'); };
    const onLife = () => { toggleLifeline(); };
    const onTrend = () => { toggleTrend(); };

    btnRSI?.addEventListener('click', onRSI);
    btnMACD?.addEventListener('click', onMACD);
    btnMAO?.addEventListener('click', onMAO);
    btnFG?.addEventListener('click', onFG);
    btnDISP?.addEventListener('click', onDISP);
    btnLife?.addEventListener('click', onLife);
    btnTrend?.addEventListener('click', onTrend);

    // 레이아웃 변화에 따른 점 재배치
    const unsub = [];
    try {
        const ts = subChart.timeScale();
        const onRange = () => {
            positionRSIDot();
            positionMAOSCDot();
            positionDISPDot();
            positionMACDDot();
            positionFGDot(fgDataCurrent);
        };
        ts.subscribeVisibleTimeRangeChange(onRange);
        unsub.push(() => ts.unsubscribeVisibleTimeRangeChange(onRange));
    } catch { }
    try {
        const ps = subChart.priceScale('right');
        if (ps?.subscribeSizeChange) {
            const onSize = () => {
                positionRSIDot();
                positionMAOSCDot();
                positionDISPDot();
                positionMACDDot();
                positionFGDot(fgDataCurrent);
            };
            ps.subscribeSizeChange(onSize);
            unsub.push(() => ps.unsubscribeSizeChange(onSize));
        }
    } catch { }
    const ro = new ResizeObserver(() => {
        positionRSIDot();
        positionMAOSCDot();
        positionDISPDot();
        positionMACDDot();
        positionFGDot(fgDataCurrent);
    });
    try { ro.observe(elSub); } catch { }

    const tsLink = linkTimeScalesOneWay(mainChart, subChart);
    const paLink = observeAndSyncPriceAxisWidth(pairs);

    setInitialVisibleRange(mainChart, candles);
    requestAnimationFrame(() => resyncAxisPadding(pairs));

    const onDblClick = () => setInitialVisibleRange(mainChart, candles);
    elMain.addEventListener('dblclick', onDblClick);

    // 정리
    return () => {
        btnRSI?.removeEventListener('click', onRSI);
        btnMACD?.removeEventListener('click', onMACD);
        btnMAO?.removeEventListener('click', onMAO);
        btnFG?.removeEventListener('click', onFG);
        btnDISP?.removeEventListener('click', onDISP);
        btnLife?.removeEventListener('click', onLife);
        btnTrend?.removeEventListener('click', onTrend);
        elMain.removeEventListener('dblclick', onDblClick);
        try { ro.disconnect(); } catch { }
        unsub.forEach(fn => { try { fn(); } catch { } });
        // 점/레전드/차트 제거
        try { elSub.removeChild(rsiDot); } catch { }
        try { elSub.removeChild(fgDot); } catch { }
        try { elSub.removeChild(maoscDot); } catch { }
        try { elSub.removeChild(dispDot); } catch { }
        try { elSub.removeChild(macdDot); } catch { }
        try { elSub.removeChild(legendBoxMAOSC); } catch { }
        try { elSub.removeChild(legendBoxDisp); } catch { }
        try { elSub.removeChild(legendBoxRSI); } catch { }
        try { elSub.removeChild(legendBoxMACD); } catch { }
        try { elSub.removeChild(legendBoxFG); } catch { }
        try { mainChart.remove(); } catch { }
        try { subChart.remove(); } catch { }
        try { tsLink?.dispose?.(); } catch { }
        try { paLink?.dispose?.(); } catch { }
    };
}

export function dispose() { }
