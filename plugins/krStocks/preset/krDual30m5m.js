// plugins/krStocks/preset/krDual30m5m.js
// 좌: 30분(메인 + 서브) / 우: 5분(메인 + 서브)
// 목적: 장중 트레이딩 훈련 — 30분(추세) ↔ 5분(파동)
// 동급: 30m MA5 ↔ 5m MA20, 30m MA20 ↔ 5m MA240
// 보조지표: MA_Osc / RSI / MACD / Disparity (FG 제외)

import { loadKRStockCandles } from "../data/dataLoader.js";
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import { calculateMAOscillator } from "../../crypto/indicators/maOscillator.js";
import { calculateRSI } from "../../crypto/indicators/rsi.js";
import { calculateMACD } from "../../crypto/indicators/macd.js";

// 공통 동기화 유틸(공유 폴더)
import observeAndSyncPriceAxisWidth from "../../shared/sync/priceAxisSync.js";
// 타이틀 오버레이 (기존 재사용)
import { createTitleOverlay } from "../../crypto/preset/_common.js";

/* ───────── 옵션/유틸 ───────── */
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

// 30분 메인 → 30분 서브, 5분 메인 → 5분 서브 (단방향 링크)
function linkTimeScalesOneWay(mainChart, subChart) {
    const mainTs = mainChart.timeScale();
    const subTs = subChart.timeScale();
    const apply = (r) => { if (r) try { subTs.setVisibleLogicalRange(r); } catch { } };
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

function setInitialVisibleRange(chart, totalBars) {
    try {
        const ts = chart.timeScale();
        const to = Math.max(0, totalBars - 1);
        const from = Math.max(0, to - Math.min(240, totalBars - 1));
        ts.setVisibleLogicalRange({ from, to });
    } catch { }
}

/* 기본 바 개수(초기 뷰) — 필요 시 조정 */
const BARS_30M_DEFAULT = 200;
const BARS_5M_DEFAULT = 300;

/* ───────── 메인 ───────── */
export default async function mountKR_Dual30m5m({
    mountId = "main-content-area",
    symbol = "삼성전자",
} = {}) {
    const LWC = window.LightweightCharts;
    const mainRoot = document.getElementById(mountId);
    if (!LWC || !mainRoot) return () => { };

    // 레이아웃: 1 x 2 (좌: 30분, 우: 5분) — 각 칸 내부는 3:1(메인:서브)
    mainRoot.innerHTML = `
    <div id="kr-dual-30m-5m" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;height:100%;">
      <div id="left-30m"  style="display:grid;grid-template-rows:3fr 1fr;gap:6px;min-height:120px;">
        <div id="l-main" style="position:relative;"></div>
        <div id="l-sub"  style="position:relative;"></div>
      </div>
      <div id="right-5m" style="display:grid;grid-template-rows:3fr 1fr;gap:6px;min-height:120px;">
        <div id="r-main" style="position:relative;"></div>
        <div id="r-sub"  style="position:relative;"></div>
      </div>
    </div>`;

    const elLMain = mainRoot.querySelector('#l-main'); // 30m main
    const elLSub = mainRoot.querySelector('#l-sub');  // 30m sub
    const elRMain = mainRoot.querySelector('#r-main'); // 5m main
    const elRSub = mainRoot.querySelector('#r-sub');  // 5m sub

    // 타이틀
    createTitleOverlay(elLMain, `${symbol} • 30분봉`);
    createTitleOverlay(elRMain, `${symbol} • 5분봉`);

    const base = baseChartOptions(LWC);

    // 차트 생성
    const ch30M = LWC.createChart(elLMain, base);
    const ch30S = LWC.createChart(elLSub, { ...base, rightPriceScale: { borderColor: '#2a2b31', scaleMargins: { top: 0.1, bottom: 0.1 } } });
    const ch5M = LWC.createChart(elRMain, base);
    const ch5S = LWC.createChart(elRSub, { ...base, rightPriceScale: { borderColor: '#2a2b31', scaleMargins: { top: 0.1, bottom: 0.1 } } });

    // 서브 차트: 사용자 스크롤/스케일 비활성
    [ch30S, ch5S].forEach(c => c.applyOptions({
        handleScroll: false,
        handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false }
    }));

    // 데이터 로드
    const [d30, d5] = await Promise.all([
        loadKRStockCandles({ name: symbol, timeframe: "30m" }),
        loadKRStockCandles({ name: symbol, timeframe: "5m" }),
    ]);

    const UP = '#26a69a', DOWN = '#ef5350';

    // ── 메인 세트 빌더 (볼륨 + MAs + 캔들)
    function buildMainSet(chart, candles, maDefs) {
        const vol = chart.addHistogramSeries({
            priceScaleId: 'vol',
            priceFormat: { type: 'volume' },
            priceLineVisible: false,
            lastValueVisible: false
        });
        vol.setData(candles.map(c => ({
            time: c.time, value: c.volume, color: (c.close >= c.open) ? UP : DOWN
        })));
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

        const lines = {};
        maDefs.forEach(def => {
            const s = chart.addLineSeries({
                color: def.color,
                lineWidth: def.w || 3,
                priceLineVisible: !!def.pl,
                priceLineStyle: 0,
                priceLineWidth: 1,
                priceLineColor: def.color,
                lastValueVisible: def.lastValueVisible !== false,
            });
            s.setData(calculateSMA(candles, def.p));
            lines[`ma${def.p}`] = s;
        });

        const candle = chart.addCandlestickSeries({
            upColor: UP, downColor: DOWN, borderDownColor: DOWN, borderUpColor: UP,
            wickDownColor: DOWN, wickUpColor: UP,
            priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
            priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1
        });
        candle.setData(candles);
        try {
            const last = candles[candles.length - 1];
            candle.applyOptions({ priceLineColor: (last && last.close >= last.open) ? UP : DOWN });
        } catch { }

        return { candle, vol, lines };
    }

    // 30분 메인(추세): 240/120/60/20/5 — 60/20/5가 핵심
    const m30 = buildMainSet(ch30M, d30, [
        { p: 240, color: 'magenta', w: 4 },
        { p: 120, color: 'darkorange', w: 1, lastValueVisible: false },
        { p: 60, color: 'green', w: 3 },
        { p: 20, color: 'red', w: 3, pl: true },
        { p: 5, color: 'white', w: 2 },
    ]);

    // 5분 메인(파동): 240/120/60/20/5 — 240/20/5가 핵심
    const m5 = buildMainSet(ch5M, d5, [
        { p: 240, color: 'magenta', w: 4 },
        { p: 120, color: 'darkorange', w: 1, lastValueVisible: false },
        { p: 60, color: 'green', w: 3 },
        { p: 20, color: 'red', w: 3, pl: true },
        { p: 5, color: 'white', w: 2 },
    ]);

    // 점선 스타일(가독성 동일화) — 30분 120, 5분 120
    try { m30.lines.ma120?.applyOptions({ lineStyle: 2 }); } catch { }
    try { m5.lines.ma120?.applyOptions({ lineStyle: 2 }); } catch { }

    // MA 레전드
    function addLegend(el, items) {
        const box = document.createElement('div');
        Object.assign(box.style, {
            position: 'absolute', top: '6px', left: '8px',
            display: 'flex', gap: '12px', alignItems: 'center',
            fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
            textShadow: '0 0 4px rgba(0,0,0,0.5)', pointerEvents: 'none', zIndex: 7
        });
        const make = (color, label) => {
            const w = document.createElement('div');
            w.style.display = 'flex'; w.style.alignItems = 'center'; w.style.gap = '6px';
            const dot = document.createElement('span');
            Object.assign(dot.style, { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color });
            const t = document.createElement('span'); t.textContent = label;
            w.appendChild(dot); w.appendChild(t);
            return w;
        };
        items.forEach(i => box.appendChild(make(i.c, i.t)));
        el.appendChild(box);
        return box;
    }
    const lg30 = addLegend(elLMain, [
        { c: 'magenta', t: 'MA240' }, { c: 'darkorange', t: 'MA120' }, { c: 'green', t: 'MA60' }, { c: 'red', t: 'MA20' }, { c: 'white', t: 'MA5' },
    ]);
    const lg5 = addLegend(elRMain, [
        { c: 'magenta', t: 'MA240' }, { c: 'darkorange', t: 'MA120' }, { c: 'green', t: 'MA60' }, { c: 'red', t: 'MA20' }, { c: 'white', t: 'MA5' },
    ]);

    /* ───────── 보조(서브) — MAOSC / RSI / MACD / Disparity ───────── */

    // MA_Oscillator
    function buildMAOsc(subChart, candles, fast, slow, zeroColor = '#FFD700', lineColor = 'green') {
        const base = subChart.addBaselineSeries({
            baseValue: { type: 'price', price: 0 },
            topFillColor1: 'rgba(0, 128, 0, 0.25)',
            topFillColor2: 'rgba(0, 128, 0, 0.25)',
            bottomFillColor1: 'rgba(255, 0, 0, 0.2)',
            bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
            topLineColor: 'rgba(0,0,0,0)',
            bottomLineColor: 'rgba(0,0,0,0)',
            priceLineVisible: false, lastValueVisible: false,
        });
        const zero = subChart.addLineSeries({ color: zeroColor, lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
        const line = subChart.addLineSeries({ color: lineColor, lineWidth: 1 });

        const raw = calculateMAOscillator(candles, fast, slow);
        base.setData(padWithWhitespace(candles, raw));
        line.setData(padWithWhitespace(candles, raw));
        zero.setData(candles.map(c => ({ time: c.time, value: 0 })));

        return { base, zero, line, raw };
    }

    // 30분: (5,20) — 5분: (20,240)
    const osc30 = buildMAOsc(ch30S, d30, 5, 20, '#FFD700', 'green');
    const osc5 = buildMAOsc(ch5S, d5, 20, 240, '#FFD700', 'red');
    try { osc5.zero.applyOptions({ color: 'green' }); } catch { }

    // RSI
    const rsi30 = {
        line: ch30S.addLineSeries({ color: '#FFD700', lineWidth: 1 }),
        b30: ch30S.addLineSeries({ color: 'green', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }),
        b70: ch30S.addLineSeries({ color: 'red', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }),
        data: calculateRSI(d30, 14),
    };
    const rsi5 = {
        line: ch5S.addLineSeries({ color: '#FFD700', lineWidth: 1 }),
        b30: ch5S.addLineSeries({ color: 'green', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }),
        b70: ch5S.addLineSeries({ color: 'red', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }),
        data: calculateRSI(d5, 14),
    };
    function clearRSI_30() { rsi30.line.setData([]); rsi30.b30.setData([]); rsi30.b70.setData([]); }
    function clearRSI_5() { rsi5.line.setData([]); rsi5.b30.setData([]); rsi5.b70.setData([]); }

    // Disparity
    function buildDisparity(subChart, candles, maPeriod) {
        const base100 = subChart.addLineSeries({ color: '#FFD700', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
        const fill = subChart.addBaselineSeries({
            baseValue: { type: 'price', price: 100 },
            topFillColor1: 'rgba(0, 128, 0, 0.25)', topFillColor2: 'rgba(0, 128, 0, 0.25)',
            bottomFillColor1: 'rgba(255, 0, 0, 0.2)', bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
            topLineColor: 'rgba(0,0,0,0)', bottomLineColor: 'rgba(0,0,0,0)',
            priceLineVisible: false, lastValueVisible: false,
        });
        const line = subChart.addLineSeries({ color: '#FF6F00', lineWidth: 1 });

        const ma = calculateSMA(candles, maPeriod);
        const closeMap = new Map(candles.map(c => [c.time, c.close]));
        const raw = ma
            .filter(m => Number.isFinite(m.value) && closeMap.has(m.time))
            .map(m => ({ time: m.time, value: (closeMap.get(m.time) / m.value) * 100 }));

        base100.setData(candles.map(c => ({ time: c.time, value: 100 })));
        fill.setData(padWithWhitespace(candles, raw));
        line.setData(padWithWhitespace(candles, raw));

        return { base100, fill, line, raw };
    }
    const disp30 = buildDisparity(ch30S, d30, 20);   // 30m Disparity(20)
    const disp5 = buildDisparity(ch5S, d5, 20);   // 5m  Disparity(20) — 단기 기준 유지

    // MACD
    function buildMACD(subChart, candles) {
        const macdLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });
        const sigLine = subChart.addLineSeries({ color: 'yellow', lineWidth: 1 });
        const hist = subChart.addHistogramSeries({ base: 0 });
        const { macd, signal, histogram } = calculateMACD(candles);

        const histColored = histogram.map(h => ({
            time: h.time, value: h.value,
            color: (h.value >= 0) ? 'rgba(0, 255, 0, 0.5)' : 'rgba(239, 83, 80, 0.5)'
        }));

        macdLine.setData(padWithWhitespace(candles, macd));
        sigLine.setData(padWithWhitespace(candles, signal));
        hist.setData(padWithWhitespace(candles, histColored));

        return { macdLine, sigLine, hist, raw: { macd, signal, histogram: histColored } };
    }
    const macd30 = buildMACD(ch30S, d30);
    const macd5 = buildMACD(ch5S, d5);

    // ── 레전드(서브): 필요한 시점에만 표시
    function mkLegendBox(host) {
        const box = document.createElement('div');
        Object.assign(box.style, {
            position: 'absolute', top: '6px', left: '8px',
            display: 'none', gap: '8px', padding: '4px 6px',
            fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
            background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
        });
        host.appendChild(box);
        return box;
    }
    const legendOsc30 = mkLegendBox(elLSub);
    const legendOsc5 = mkLegendBox(elRSub);
    const legendRSI30 = mkLegendBox(elLSub);
    const legendRSI5 = mkLegendBox(elRSub);
    const legendDISP30 = mkLegendBox(elLSub);
    const legendDISP5 = mkLegendBox(elRSub);
    const legendMACD30 = mkLegendBox(elLSub);
    const legendMACD5 = mkLegendBox(elRSub);

    function showLegend(box, html) { box.innerHTML = html; box.style.display = ''; }
    function hideAllLegendsLeft() { [legendOsc30, legendRSI30, legendDISP30, legendMACD30].forEach(b => b.style.display = 'none'); }
    function hideAllLegendsRight() { [legendOsc5, legendRSI5, legendDISP5, legendMACD5].forEach(b => b.style.display = 'none'); }

    /* ───────── 표시/숨김 헬퍼 ───────── */
    function clear30_All() {
        osc30.base.setData([]); osc30.line.setData([]); osc30.zero.setData([]);
        rsi30.line.setData([]); rsi30.b30.setData([]); rsi30.b70.setData([]);
        disp30.base100.setData([]); disp30.fill.setData([]); disp30.line.setData([]);
        macd30.macdLine.setData([]); macd30.sigLine.setData([]); macd30.hist.setData([]);
        hideAllLegendsLeft();
    }
    function clear5_All() {
        osc5.base.setData([]); osc5.line.setData([]); osc5.zero.setData([]);
        rsi5.line.setData([]); rsi5.b30.setData([]); rsi5.b70.setData([]);
        disp5.base100.setData([]); disp5.fill.setData([]); disp5.line.setData([]);
        macd5.macdLine.setData([]); macd5.sigLine.setData([]); macd5.hist.setData([]);
        hideAllLegendsRight();
    }

    // MAOSC
    function show30_OSC() {
        clear30_All();
        osc30.base.setData(padWithWhitespace(d30, osc30.raw));
        osc30.line.setData(padWithWhitespace(d30, osc30.raw));
        osc30.zero.setData(d30.map(c => ({ time: c.time, value: 0 })));
        showLegend(legendOsc30,
            `<span style="color:#fff">MA_Oscillator(</span><span style="color:red">5</span><span style="color:#fff">-</span><span style="color:green">20</span><span style="color:#fff">)</span>`);
    }
    function show5_OSC() {
        clear5_All();
        osc5.base.setData(padWithWhitespace(d5, osc5.raw));
        osc5.line.setData(padWithWhitespace(d5, osc5.raw));
        osc5.zero.setData(d5.map(c => ({ time: c.time, value: 0 })));
        showLegend(legendOsc5,
            `<span style="color:#fff">MA_Oscillator(</span><span style="color:red">20</span><span style="color:#fff">-</span><span style="color:green">240</span><span style="color:#fff">)</span>`);
    }

    // RSI
    function show30_RSI() {
        clear30_All();
        rsi30.line.setData(padWithWhitespace(d30, rsi30.data));
        rsi30.b30.setData(d30.map(c => ({ time: c.time, value: 30 })));
        rsi30.b70.setData(d30.map(c => ({ time: c.time, value: 70 })));
        const v = rsi30.data.at(-1)?.value;
        showLegend(legendRSI30, `RSI(14): <span style="color:#FFD700">${Number.isFinite(v) ? v.toFixed(1) : '-'}</span> | Zones: <span style="color:green">30</span> / <span style="color:red">70</span>`);
    }
    function show5_RSI() {
        clear5_All();
        rsi5.line.setData(padWithWhitespace(d5, rsi5.data));
        rsi5.b30.setData(d5.map(c => ({ time: c.time, value: 30 })));
        rsi5.b70.setData(d5.map(c => ({ time: c.time, value: 70 })));
        const v = rsi5.data.at(-1)?.value;
        showLegend(legendRSI5, `RSI(14): <span style="color:#FFD700">${Number.isFinite(v) ? v.toFixed(1) : '-'}</span> | Zones: <span style="color:green">30</span> / <span style="color:red">70</span>`);
    }

    // Disparity(20)
    function show30_DISP() {
        clear30_All();
        disp30.base100.setData(d30.map(c => ({ time: c.time, value: 100 })));
        disp30.fill.setData(padWithWhitespace(d30, disp30.raw));
        disp30.line.setData(padWithWhitespace(d30, disp30.raw));
        showLegend(legendDISP30, `Disparity(20) • Base <span style="color:#FFD700">100</span>`);
    }
    function show5_DISP() {
        clear5_All();
        disp5.base100.setData(d5.map(c => ({ time: c.time, value: 100 })));
        disp5.fill.setData(padWithWhitespace(d5, disp5.raw));
        disp5.line.setData(padWithWhitespace(d5, disp5.raw));
        showLegend(legendDISP5, `Disparity(20) • Base <span style="color:#FFD700">100</span>`);
    }

    // MACD
    function show30_MACD() {
        clear30_All();
        macd30.macdLine.setData(padWithWhitespace(d30, macd30.raw.macd));
        macd30.sigLine.setData(padWithWhitespace(d30, macd30.raw.signal));
        macd30.hist.setData(padWithWhitespace(d30, macd30.raw.histogram));
        const m = macd30.raw.macd.at(-1)?.value, s = macd30.raw.signal.at(-1)?.value;
        showLegend(legendMACD30, `MACD(12,26,9): <span style="color:red">${Number.isFinite(m) ? m.toFixed(2) : '-'}</span> | Signal: <span style="color:yellow">${Number.isFinite(s) ? s.toFixed(2) : '-'}</span>`);
    }
    function show5_MACD() {
        clear5_All();
        macd5.macdLine.setData(padWithWhitespace(d5, macd5.raw.macd));
        macd5.sigLine.setData(padWithWhitespace(d5, macd5.raw.signal));
        macd5.hist.setData(padWithWhitespace(d5, macd5.raw.histogram));
        const m = macd5.raw.macd.at(-1)?.value, s = macd5.raw.signal.at(-1)?.value;
        showLegend(legendMACD5, `MACD(12,26,9): <span style="color:red">${Number.isFinite(m) ? m.toFixed(2) : '-'}</span> | Signal: <span style="color:yellow">${Number.isFinite(s) ? s.toFixed(2) : '-'}</span>`);
    }

    // 초기: MAOSC 양쪽
    show30_OSC(); show5_OSC();

    // 가격축 동기화(좌 세트/우 세트), 타임스케일 링크(단방향)
    const linkL = linkTimeScalesOneWay(ch30M, ch30S);
    const linkR = linkTimeScalesOneWay(ch5M, ch5S);
    const paLeft = observeAndSyncPriceAxisWidth([{ chart: ch30M, container: elLMain }, { chart: ch30S, container: elLSub }]);
    const paRight = observeAndSyncPriceAxisWidth([{ chart: ch5M, container: elRMain }, { chart: ch5S, container: elRSub }]);

    // 초기 범위
    setInitialVisibleRange(ch30M, d30.length);
    setInitialVisibleRange(ch30S, d30.length);
    setInitialVisibleRange(ch5M, d5.length);
    setInitialVisibleRange(ch5S, d5.length);

    const onDbl30 = () => { setInitialVisibleRange(ch30M, d30.length); setInitialVisibleRange(ch30S, d30.length); };
    const onDbl5 = () => { setInitialVisibleRange(ch5M, d5.length); setInitialVisibleRange(ch5S, d5.length); };
    elLMain.addEventListener('dblclick', onDbl30);
    elRMain.addEventListener('dblclick', onDbl5);

    /* ───────── 툴바 ───────── */
    const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
    const btnTrend = document.querySelector('.main-toolbar [data-action="trendline"]');
    const btnMAO = document.querySelector('.main-toolbar [data-action="ma_oscillator"]');
    const btnRSI = document.querySelector('.main-toolbar [data-action="rsi"]');
    const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');
    const btnMACD = document.querySelector('.main-toolbar [data-action="macd"]');

    const setActive = (btn, on) => { if (!btn) return; on ? btn.classList.add('active-preset') : btn.classList.remove('active-preset'); };

    // 생명선/추세선(30분 메인에 적용 — 일/30m과 동일 철학)
    const LIFE_RED = 'red', LIFE_YELLOW = '#FFD700';
    let lifeOn = false, lifeTimer = null, lifeFlip = false;
    function setLifeColor(c) { try { m30.lines.ma20.applyOptions({ color: c }); } catch { } } // 30m MA20 = 핵심 추세
    function startLife() { lifeOn = true; setActive(btnLife, true); setLifeColor(LIFE_YELLOW); lifeTimer = setInterval(() => { lifeFlip = !lifeFlip; setLifeColor(lifeFlip ? LIFE_RED : LIFE_YELLOW); }, 1500); }
    function stopLife() { lifeOn = false; setActive(btnLife, false); if (lifeTimer) { clearInterval(lifeTimer); lifeTimer = null; } setLifeColor(LIFE_RED); }
    const onLife = () => lifeOn ? stopLife() : startLife();

    const TREND_GREEN = 'green', TREND_LIGHT = '#7CFC00';
    let trendOn = false, trendTimer = null, trendFlip = false;
    function setTrendColor(c) { try { m30.lines.ma60.applyOptions({ color: c }); } catch { } } // 30m MA60 = 중기 추세
    function startTrend() { trendOn = true; setActive(btnTrend, true); setTrendColor(TREND_LIGHT); trendTimer = setInterval(() => { trendFlip = !trendFlip; setTrendColor(trendFlip ? TREND_GREEN : TREND_LIGHT); }, 1500); }
    function stopTrend() { trendOn = false; setActive(btnTrend, false); if (trendTimer) { clearInterval(trendTimer); trendTimer = null; } setTrendColor(TREND_GREEN); }
    const onTrend = () => trendOn ? stopTrend() : startTrend();

    // 싱글/더블 클릭 유틸(싱글: 좌/우 모두, 더블: 우(5분)만)
    function bindSingleVsDouble(btn, onSingle, onDouble, delay = 220) {
        if (!btn) return () => { };
        let t = null;
        const handler = () => {
            if (t) { clearTimeout(t); t = null; onDouble?.(); return; }
            t = setTimeout(() => { t = null; onSingle?.(); }, delay);
        };
        btn.addEventListener('click', handler);
        return () => btn.removeEventListener('click', handler);
    }

    const offMAO = bindSingleVsDouble(btnMAO, () => { show30_OSC(); show5_OSC(); setActive(btnMAO, true); setActive(btnRSI, false); setActive(btnDISP, false); setActive(btnMACD, false); }, () => { show5_OSC(); setActive(btnMAO, true); });
    const offRSI = bindSingleVsDouble(btnRSI, () => { show30_RSI(); show5_RSI(); setActive(btnMAO, false); setActive(btnRSI, true); setActive(btnDISP, false); setActive(btnMACD, false); }, () => { show5_RSI(); setActive(btnRSI, true); });
    const offDISP = bindSingleVsDouble(btnDISP, () => { show30_DISP(); show5_DISP(); setActive(btnMAO, false); setActive(btnRSI, false); setActive(btnDISP, true); setActive(btnMACD, false); }, () => { show5_DISP(); setActive(btnDISP, true); });
    const offMACD = bindSingleVsDouble(btnMACD, () => { show30_MACD(); show5_MACD(); setActive(btnMAO, false); setActive(btnRSI, false); setActive(btnDISP, false); setActive(btnMACD, true); }, () => { show5_MACD(); setActive(btnMACD, true); });

    btnLife?.addEventListener('click', onLife);
    btnTrend?.addEventListener('click', onTrend);

    // 정리
    return () => {
        try { elLMain.removeEventListener('dblclick', onDbl30); } catch { }
        try { elRMain.removeEventListener('dblclick', onDbl5); } catch { }

        btnLife?.removeEventListener('click', onLife);
        btnTrend?.removeEventListener('click', onTrend);
        offMAO?.(); offRSI?.(); offDISP?.(); offMACD?.();

        setActive(btnMAO, false); setActive(btnRSI, false); setActive(btnDISP, false); setActive(btnMACD, false);
        setActive(btnLife, false); setActive(btnTrend, false);

        try { elLMain.removeChild(lg30); } catch { }
        try { elRMain.removeChild(lg5); } catch { }

        try { linkL?.dispose?.(); } catch { }
        try { linkR?.dispose?.(); } catch { }
        try { paLeft?.dispose?.(); } catch { }
        try { paRight?.dispose?.(); } catch { }

        try { ch30M.remove(); } catch { }
        try { ch30S.remove(); } catch { }
        try { ch5M.remove(); } catch { }
        try { ch5S.remove(); } catch { }
    };
}

export const presetKey = 'krDual30m5m';
