// plugins/krStocks/preset/krSingle30m.js
// KR 30분봉 단일 차트 — KR 일봉과 완전 동일 구성 (데이터만 timeframe="30m")

import { loadKRStockCandles } from "../data/dataLoader.js";
import { calculateRSI } from "../../crypto/indicators/rsi.js";
import { calculateMACD } from "../../crypto/indicators/macd.js";
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import { calculateMAOscillator } from "../../crypto/indicators/maOscillator.js";
import observeAndSyncPriceAxisWidth from "../../shared/sync/priceAxisSync.js";
import { createTitleOverlay } from "../../crypto/preset/_common.js";

/* ───────── 공통 옵션 (일봉과 동일) ───────── */
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
const INITIAL_BARS = 360; // 일봉과 동일 정책 유지
function setInitialVisibleRange(chart, candles) {
    try {
        const ts = chart.timeScale();
        const total = candles.length;
        const from = Math.max(0, total - INITIAL_BARS);
        ts.setVisibleLogicalRange({ from, to: total - 1 });
    } catch { }
}

/* ───────── 메인 구현 (일봉과 동일) ───────── */
export default async function mountKRSingle30m({
    mountId = "main-content-area",
    symbol = "삼성전자",
} = {}) {
    const LWC = window.LightweightCharts;
    const mainRoot = document.getElementById(mountId);
    if (!LWC || !mainRoot) return () => { };

    // 레이아웃: 메인(4) + 서브(1)
    mainRoot.innerHTML = `
    <div id="l2fm-kr-single30m" style="display:grid;grid-template-rows:4fr 1fr;gap:6px;height:100%;">
      <div id="sd-main" style="min-height:120px; position:relative;"></div>
      <div id="sd-sub"  style="min-height:90px;  position:relative;"></div>
    </div>`;
    const elMain = mainRoot.querySelector("#sd-main");
    const elSub = mainRoot.querySelector("#sd-sub");

    // 타이틀
    createTitleOverlay(elMain, `${symbol} • 30분`);

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

    // ★ 데이터 로드: timeframe 만 "30m"
    const candles = await loadKRStockCandles({ name: symbol, timeframe: "30m" });

    // ── 메인: 볼륨 → MA들 → 캔들 ── (일봉 동일)
    const UP = '#26a69a', DOWN = '#ef5350';

    const vol = mainChart.addHistogramSeries({
        priceScaleId: 'vol', priceFormat: { type: 'volume' },
        priceLineVisible: false, lastValueVisible: false,
    });
    vol.setData(candles.map(c => ({ time: c.time, value: c.volume, color: (c.close >= c.open) ? UP : DOWN })));
    mainChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

    // 이동평균 (MA5/20/60/120/240) — 색/굵기/점선까지 동일
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

    /* ===== 보조(서브) — 일봉과 완전 동일 ===== */
    // RSI
    const rsiLine = subChart.addLineSeries({ color: '#FFD700', lineWidth: 1 });
    const rsiBase30 = subChart.addLineSeries({ color: 'green', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const rsiBase70 = subChart.addLineSeries({ color: 'red', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

    // MACD
    const macdLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });
    const sigLine = subChart.addLineSeries({ color: 'yellow', lineWidth: 1 });
    const hist = subChart.addHistogramSeries({ base: 0 });

    // MA Oscillator (20–60)
    const maoscFill = subChart.addBaselineSeries({
        baseValue: { type: 'price', price: 0 },
        topFillColor1: 'rgba(0, 128, 0, 0.25)', topFillColor2: 'rgba(0, 128, 0, 0.25)',
        bottomFillColor1: 'rgba(255, 0, 0, 0.2)', bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
        topLineColor: 'rgba(0,0,0,0)', bottomLineColor: 'rgba(0,0,0,0)',
        priceLineVisible: false, lastValueVisible: false,
    });
    const maoscLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });
    const maoscZero = subChart.addLineSeries({ color: 'green', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

    // Disparity(20)
    const disparityBase100 = subChart.addLineSeries({ color: '#FFD700', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
    const disparityFill = subChart.addBaselineSeries({
        baseValue: { type: 'price', price: 100 },
        topFillColor1: 'rgba(0, 128, 0, 0.25)', topFillColor2: 'rgba(0, 128, 0, 0.25)',
        bottomFillColor1: 'rgba(255, 0, 0, 0.2)', bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
        topLineColor: 'rgba(0,0,0,0)', bottomLineColor: 'rgba(0,0,0,0)',
        priceLineVisible: false, lastValueVisible: false,
    });
    const disparityLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });

    // === 지표 데이터 (일봉과 동일 파라미터) ===
    const rsiRaw = calculateRSI(candles, 14);
    const { macd: macdRaw, signal: sigRaw, histogram: histRaw } = calculateMACD(candles);
    const maoscRaw = calculateMAOscillator(candles, 20, 60);

    // Disparity(20) = 100 * Close / MA20
    const ma20 = calculateSMA(candles, 20);
    const closeMap = new Map(candles.map(c => [c.time, c.close]));
    const dispRaw = ma20
        .filter(m => Number.isFinite(m.value) && closeMap.has(m.time))
        .map(m => ({ time: m.time, value: (closeMap.get(m.time) / m.value) * 100 }));

    // MACD 히스토그램 색
    function mapHistColors(items) {
        return items.map(h => ({
            time: h.time,
            value: h.value,
            color: (h.value >= 0) ? 'rgba(0, 255, 0, 0.5)' : 'rgba(239, 83, 80, 0.5)',
        }));
    }

    /* ===== 펄스 도트 & 레전드(그대로) ===== */
    (function ensurePulseStyles() {
        const make = (id, css) => {
            if (!document.getElementById(id)) {
                const st = document.createElement('style'); st.id = id; st.textContent = css; document.head.appendChild(st);
            }
        };
        make('l2fm-rsi-pulse-style', `@keyframes l2fmPulse { 0%{box-shadow:0 0 0 0 rgba(255,215,0,0.65);opacity:1;}70%{box-shadow:0 0 0 12px rgba(255,215,0,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(255,215,0,0);opacity:.85;} }`);
        make('l2fm-maosc-pulse-style', `@keyframes l2fmMAOSCPulse{0%{box-shadow:0 0 0 0 rgba(0,255,0,.55);opacity:1;}70%{box-shadow:0 0 0 12px rgba(0,255,0,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(0,255,0,0);opacity:.85;}}`);
        make('l2fm-macd-pulse-style', `@keyframes l2fmMACDPulse{0%{box-shadow:0 0 0 0 rgba(255,215,0,.65);opacity:1;}70%{box-shadow:0 0 0 12px rgba(255,215,0,0);opacity:.9;}100%{box-shadow:0 0 0 0 rgba(255,215,0,0);opacity:.9;}}`);
        make('l2fm-disp-pulse-style', `@keyframes l2fmDISPPulse{0%{box-shadow:0 0 0 0 rgba(255,183,77,.55);opacity:1;}70%{box-shadow:0 0 0 12px rgba(255,183,77,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(255,183,77,0);opacity:.85;}}`);
    })();

    const mkDot = (bg) => {
        const d = document.createElement('div');
        Object.assign(d.style, { position: 'absolute', width: '8px', height: '8px', borderRadius: '50%', background: bg, pointerEvents: 'none', zIndex: 5, left: '-9999px', top: '-9999px' });
        return d;
    };
    const rsiDot = mkDot('#FFD700'); rsiDot.style.animation = 'l2fmPulse 1.6s ease-out infinite';
    const macdDot = mkDot('#FFD700'); macdDot.style.animation = 'l2fmMACDPulse 1.6s ease-out infinite';
    const maoscDot = mkDot('green'); maoscDot.style.animation = 'l2fmMAOSCPulse 1.6s ease-out infinite';
    const dispDot = mkDot('#FFB74D'); dispDot.style.animation = 'l2fmDISPPulse 1.6s ease-out infinite';
    [rsiDot, macdDot, maoscDot, dispDot].forEach(d => elSub.appendChild(d));

    function positionRSIDot() { const a = rsiRaw.at(-1); const x = subChart.timeScale()?.timeToCoordinate(a?.time); const y = rsiLine.priceToCoordinate?.(a?.value); (Number.isFinite(x) && Number.isFinite(y)) ? (rsiDot.style.left = (x - 4) + 'px', rsiDot.style.top = (y - 4) + 'px') : (rsiDot.style.left = rsiDot.style.top = '-9999px'); }
    function positionMACDDot() { const a = macdRaw.at(-1); const x = subChart.timeScale()?.timeToCoordinate(a?.time); const y = macdLine.priceToCoordinate?.(a?.value); (Number.isFinite(x) && Number.isFinite(y)) ? (macdDot.style.left = (x - 4) + 'px', macdDot.style.top = (y - 4) + 'px') : (macdDot.style.left = macdDot.style.top = '-9999px'); }
    function positionMAOSCDot() { const a = maoscRaw.at(-1); const x = subChart.timeScale()?.timeToCoordinate(a?.time); const y = maoscLine.priceToCoordinate?.(a?.value); (Number.isFinite(x) && Number.isFinite(y)) ? (maoscDot.style.left = (x - 4) + 'px', maoscDot.style.top = (y - 4) + 'px') : (maoscDot.style.left = maoscDot.style.top = '-9999px'); }
    function positionDISPDot() { const a = dispRaw.at(-1); const x = subChart.timeScale()?.timeToCoordinate(a?.time); const y = disparityLine.priceToCoordinate?.(a?.value); (Number.isFinite(x) && Number.isFinite(y)) ? (dispDot.style.left = (x - 4) + 'px', dispDot.style.top = (y - 4) + 'px') : (dispDot.style.left = dispDot.style.top = '-9999px'); }

    // 레전드(표시 중인 1종만)
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
        legendRSI.innerHTML = `RSI(14): <span style="color:#FFD700">${last.toFixed(1)}</span> <span style="margin:0 6px;opacity:.7">|</span> Zones: <span style="color:green">30</span> / <span style="color:red">70</span>`;
        legendRSI.style.display = '';
    }
    function renderMACDLegend() {
        const mLast = macdRaw.at(-1)?.value, sLast = sigRaw.at(-1)?.value;
        if (!Number.isFinite(mLast) || !Number.isFinite(sLast)) { legendMACD.style.display = 'none'; return; }
        legendMACD.innerHTML = `MACD(12,26,9) <span style="margin:0 6px;opacity:.7">|</span> MACD: <span style="color:red">${mLast.toFixed(2)}</span> <span style="margin:0 6px;opacity:.7">|</span> Signal: <span style="color:yellow">${sLast.toFixed(2)}</span>`;
        legendMACD.style.display = '';
    }
    function renderMAOSCLegend() {
        legendMAO.innerHTML = `<span style="color:#fff">MA_Oscillator(</span><span style="color:red">20</span><span style="color:#fff">-</span><span style="color:green">60</span><span style="color:#fff">)</span>`;
        legendMAO.style.display = '';
    }
    function renderDISPLegend() {
        const last = dispRaw.at(-1)?.value;
        if (!Number.isFinite(last)) { legendDISP.style.display = 'none'; return; }
        const cc = last >= 100 ? 'green' : 'red';
        legendDISP.innerHTML = `Disparity(20): <span style="color:${cc}">${last.toFixed(1)}%</span> <span style="margin:0 6px;opacity:.7">|</span> Base: <span style="color:#FFD700">100</span>`;
        legendDISP.style.display = '';
    }

    /* ===== 토글 (일봉 동일) ===== */
    let current = 'RSI';
    const pairs = [{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }];

    function hideAllLegends() { [legendRSI, legendMACD, legendMAO, legendDISP].forEach(b => b.style.display = 'none'); }
    function clearAllSub() {
        rsiLine.setData([]); rsiBase30.setData([]); rsiBase70.setData([]);
        macdLine.setData([]); sigLine.setData([]); hist.setData([]);
        maoscFill.setData([]); maoscLine.setData([]); maoscZero.setData([]);
        disparityFill.setData([]); disparityLine.setData([]); disparityBase100.setData([]);
        [rsiDot, macdDot, maoscDot, dispDot].forEach(d => { d.style.left = d.style.top = '-9999px'; });
        hideAllLegends();
    }

    function showRSI() {
        current = 'RSI';
        clearAllSub();
        rsiLine.setData(padWithWhitespace(candles, rsiRaw));
        rsiBase30.setData(candles.map(c => ({ time: c.time, value: 30 })));
        rsiBase70.setData(candles.map(c => ({ time: c.time, value: 70 })));
        positionRSIDot(); renderRSILegend();
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showMACD() {
        current = 'MACD';
        clearAllSub();
        macdLine.setData(padWithWhitespace(candles, macdRaw));
        sigLine.setData(padWithWhitespace(candles, sigRaw));
        hist.setData(padWithWhitespace(candles, mapHistColors(histRaw)));
        positionMACDDot(); renderMACDLegend();
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showMAOSC() {
        current = 'MAOSC';
        clearAllSub();
        maoscFill.setData(padWithWhitespace(candles, maoscRaw));
        maoscLine.setData(padWithWhitespace(candles, maoscRaw));
        maoscZero.setData(candles.map(c => ({ time: c.time, value: 0 })));
        positionMAOSCDot(); renderMAOSCLegend();
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showDISP() {
        current = 'DISP';
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

    // Lifeline/Trendline 깜빡이 (동일)
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
    const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');
    const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
    const btnTrend = document.querySelector('.main-toolbar [data-action="trendline"]');

    const onRSI = () => { showRSI(); setToolbarActive('RSI'); };
    const onMACD = () => { showMACD(); setToolbarActive('MACD'); };
    const onMAO = () => { showMAOSC(); setToolbarActive('MAOSC'); };
    const onDISP = () => { showDISP(); setToolbarActive('DISP'); };
    const onLife = () => { toggleLifeline(); };
    const onTrend = () => { toggleTrend(); };

    btnRSI?.addEventListener('click', onRSI);
    btnMACD?.addEventListener('click', onMACD);
    btnMAO?.addEventListener('click', onMAO);
    btnDISP?.addEventListener('click', onDISP);
    btnLife?.addEventListener('click', onLife);
    btnTrend?.addEventListener('click', onTrend);

    // 레이아웃 변화 대응
    const unsub = [];
    try {
        const ts = subChart.timeScale();
        const onRange = () => { positionRSIDot(); positionMAOSCDot(); positionDISPDot(); positionMACDDot(); };
        ts.subscribeVisibleTimeRangeChange(onRange);
        unsub.push(() => ts.unsubscribeVisibleTimeRangeChange(onRange));
    } catch { }
    try {
        const ps = subChart.priceScale('right');
        if (ps?.subscribeSizeChange) {
            const onSize = () => { positionRSIDot(); positionMAOSCDot(); positionDISPDot(); positionMACDDot(); };
            ps.subscribeSizeChange(onSize);
            unsub.push(() => ps.unsubscribeSizeChange(onSize));
        }
    } catch { }
    const ro = new ResizeObserver(() => {
        positionRSIDot(); positionMAOSCDot(); positionDISPDot(); positionMACDDot();
    });
    try { ro.observe(elSub); } catch { }

    const tsLink = linkTimeScalesOneWay(mainChart, subChart);
    const paLink = observeAndSyncPriceAxisWidth([{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }]);

    setInitialVisibleRange(mainChart, candles);
    requestAnimationFrame(() => resyncAxisPadding([{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }]));

    const onDblClick = () => setInitialVisibleRange(mainChart, candles);
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
        try { [rsiDot, macdDot, maoscDot, dispDot].forEach(d => elSub.removeChild(d)); } catch { }
        try { [legendRSI, legendMACD, legendMAO, legendDISP].forEach(b => elSub.removeChild(b)); } catch { }
        try { mainChart.remove(); } catch { }
        try { subChart.remove(); } catch { }
        try { tsLink?.dispose?.(); } catch { }
        try { paLink?.dispose?.(); } catch { }
    };
}

export const presetKey = 'krSingle30m';
