// plugins/krStocks/preset/krDualDaily30m.js
// 좌: 일봉(메인+보조) / 우: 30분봉(메인+보조)
// 보조지표: 일봉 = MA Oscillator(20-60),5  |  30분봉 = MA Oscillator(60-240),20
// - 색상은 메인차트 이평선 팔레트와 동일 (5=white, 20=red, 60=green, 240=magenta)
// - 두께 1px
// - 일봉(Mid): 본선=(20-60) 빨강 1px, 흰선=(5-60) 흰 1px, 기준선=0 초록 1px, 교차(5↔20) 화살표
// - 30분(Long): 본선=(60-240) 초록 1px, 보조=(20-240) 빨강 1px, 기준선=0 마젠타 1px, 교차(20↔60) 화살표

import { loadKRStockCandles } from "../data/dataLoader.js";
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import { calculateMAOscillator } from "../../crypto/indicators/maOscillator.js";
import { calculateRSI } from "../../crypto/indicators/rsi.js";
import { calculateMACD } from "../../crypto/indicators/macd.js";
import observeAndSyncPriceAxisWidth from "../../shared/sync/priceAxisSync.js";
import {
    baseChartOptions, createTitleOverlay, setInitialVisibleRange,
    linkTimeScalesOneWay, padWithWhitespace
} from "../../crypto/preset/_common.js";

const BARS_DAILY = 160;
const BARS_30M = 320;

export default async function mountKRDualDaily30m({
    mountId = "main-content-area",
    symbol = "삼성전자",
} = {}) {
    const LWC = window.LightweightCharts;
    const mainRoot = document.getElementById(mountId);
    if (!LWC || !mainRoot) return () => { };

    // 레이아웃
    mainRoot.innerHTML = `
  <div id="kr-dual-d-30m" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;height:100%;">
    <div id="col-daily" style="display:grid;grid-template-rows:3fr 1fr;gap:6px;min-height:120px;">
      <div id="d-main" style="position:relative;"></div>
      <div id="d-sub"  style="position:relative;"></div>
    </div>
    <div id="col-30m" style="display:grid;grid-template-rows:3fr 1fr;gap:6px;min-height:120px;">
      <div id="m30-main" style="position:relative;"></div>
      <div id="m30-sub"  style="position:relative;"></div>
    </div>
  </div>`;

    const elDMain = mainRoot.querySelector("#d-main");
    const elDSub = mainRoot.querySelector("#d-sub");
    const elMMain = mainRoot.querySelector("#m30-main");
    const elMSub = mainRoot.querySelector("#m30-sub");

    // 타이틀
    createTitleOverlay(elDMain, `${symbol} • 일봉`);
    createTitleOverlay(elMMain, `${symbol} • 30분봉`);

    const base = baseChartOptions(LWC);

    // 차트 생성
    const chDM = LWC.createChart(elDMain, base);
    const chDS = LWC.createChart(elDSub, { ...base, rightPriceScale: { borderColor: '#2a2b31', scaleMargins: { top: 0.1, bottom: 0.1 } } });
    const chM30 = LWC.createChart(elMMain, base);
    const chMS = LWC.createChart(elMSub, { ...base, rightPriceScale: { borderColor: '#2a2b31', scaleMargins: { top: 0.1, bottom: 0.1 } } });

    // 서브 차트 조작 비활성(단방향 링크)
    [chDS, chMS].forEach(c => c.applyOptions({
        handleScroll: false,
        handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false }
    }));

    // 데이터 로드
    const [dd, m30] = await Promise.all([
        loadKRStockCandles({ name: symbol, timeframe: "daily" }),
        loadKRStockCandles({ name: symbol, timeframe: "30m" }),
    ]);

    const UP = '#26a69a', DOWN = '#ef5350';

    // 공통 메인 세트(볼륨 + 이평 + 캔들)
    function buildMainSet(chart, candles, maDefs) {
        const vol = chart.addHistogramSeries({
            priceScaleId: 'vol', priceFormat: { type: 'volume' },
            priceLineVisible: false, lastValueVisible: false
        });
        vol.setData(candles.map(c => ({ time: c.time, value: c.volume, color: (c.close >= c.open) ? UP : DOWN })));
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

        const lines = {};
        maDefs.forEach(def => {
            const s = chart.addLineSeries({
                color: def.color, lineWidth: def.w || 3,
                priceLineVisible: !!def.pl, priceLineStyle: 0, priceLineWidth: 1, priceLineColor: def.color,
                lastValueVisible: def.lastValueVisible !== false
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

    // 일봉 메인
    const dm = buildMainSet(chDM, dd, [
        { p: 240, color: 'magenta', w: 4 },
        { p: 120, color: 'darkorange', w: 1, lastValueVisible: false },
        { p: 60, color: 'green', w: 3 },
        { p: 20, color: 'red', w: 3, pl: true },
        { p: 5, color: 'white', w: 2 },
    ]);
    try { dm.lines.ma120?.applyOptions({ lineStyle: 2 }); } catch { }

    // 30분 메인
    const mset = buildMainSet(chM30, m30, [
        { p: 240, color: 'magenta', w: 4 },
        { p: 120, color: 'darkorange', w: 1, lastValueVisible: false },
        { p: 60, color: 'green', w: 3 },
        { p: 20, color: 'red', w: 3, pl: true },
        { p: 5, color: 'white', w: 2 },
    ]);
    try { mset.lines.ma120?.applyOptions({ lineStyle: 2 }); } catch { }

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
    const lgD = addLegend(elDMain, [
        { c: 'magenta', t: 'MA240' }, { c: 'darkorange', t: 'MA120' }, { c: 'green', t: 'MA60' }, { c: 'red', t: 'MA20' }, { c: 'white', t: 'MA5' },
    ]);
    const lgM = addLegend(elMMain, [
        { c: 'magenta', t: 'MA240' }, { c: 'darkorange', t: 'MA120' }, { c: 'green', t: 'MA60' }, { c: 'red', t: 'MA20' }, { c: 'white', t: 'MA5' },
    ]);

    /* ───────── 보조지표: MA Oscillator(일=Mid, 30분=Long) + RSI/Disparity/MACD (그대로) ───────── */

    // 공통 pulse 스타일
    (function ensurePulseStyles() {
        const make = (id, css) => { if (!document.getElementById(id)) { const st = document.createElement('style'); st.id = id; st.textContent = css; document.head.appendChild(st); } };
        make('l2fm-osc-pulse-style', `@keyframes l2fmOscPulse{0%{box-shadow:0 0 0 0 rgba(255,215,0,.65);opacity:1;}70%{box-shadow:0 0 0 12px rgba(255,215,0,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(255,215,0,0);opacity:.85;}}`);
        make('l2fm-macd-pulse-style', `@keyframes l2fmMACDPulse{0%{box-shadow:0 0 0 0 rgba(255,215,0,.65);opacity:1;}70%{box-shadow:0 0 0 12px rgba(255,215,0,0);opacity:.9;}100%{box-shadow:0 0 0 0 rgba(255,215,0,0);opacity:.9;}}`);
        make('l2fm-disp-pulse-style', `@keyframes l2fmDISPPulse{0%{box-shadow:0 0 0 0 rgba(255,183,77,.55);opacity:1;}70%{box-shadow:0 0 0 12px rgba(255,183,77,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(255,183,77,0);opacity:.85;}}`);
    })();

    const mkDot = (host, bg, anim) => {
        const d = document.createElement('div');
        Object.assign(d.style, {
            position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
            background: bg, pointerEvents: 'none', zIndex: 6, left: '-9999px', top: '-9999px',
            animation: `${anim} 1.6s ease-out infinite`
        });
        host.appendChild(d);
        return d;
    };
    const dotDO = mkDot(elDSub, '#FFD700', 'l2fmOscPulse');
    const dotMO = mkDot(elMSub, '#FFD700', 'l2fmOscPulse');
    const dotDISPD = mkDot(elDSub, '#FFB74D', 'l2fmDISPPulse');
    const dotDISPM = mkDot(elMSub, '#FFB74D', 'l2fmDISPPulse');
    const dotMACDD = mkDot(elDSub, '#FFD700', 'l2fmMACDPulse');
    const dotMACDM = mkDot(elMSub, '#FFD700', 'l2fmMACDPulse');

    // 교차 마커 헬퍼 (white - main 부호 변화)
    function makeCrossMarkers(whiteSeries, mainSeries) {
        const redByTime = new Map(mainSeries.map(x => [x.time, x.value]));
        const markers = [];
        const EPS = 1e-8;
        for (let i = 1; i < whiteSeries.length; i++) {
            const t = whiteSeries[i].time, t0 = whiteSeries[i - 1].time;
            if (!redByTime.has(t) || !redByTime.has(t0)) continue;
            const diffPrev = whiteSeries[i - 1].value - redByTime.get(t0);
            const diffCurr = whiteSeries[i].value - redByTime.get(t);
            if (diffPrev <= EPS && diffCurr > EPS) markers.push({ time: t, position: 'belowBar', color: '#16a34a', shape: 'arrowUp' });
            if (diffPrev >= -EPS && diffCurr < -EPS) markers.push({ time: t, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown' });
        }
        return markers;
    }

    // MAOSC: 일(Mid 20-60, white=5-60) / 30분(Long 60-240, white=20-240)
    function buildMAOsc_MID(subChart, candles) {
        const fill = subChart.addBaselineSeries({
            baseValue: { type: 'price', price: 0 },
            topFillColor1: 'rgba(0,128,0,0.25)', topFillColor2: 'rgba(0,128,0,0.25)',
            bottomFillColor1: 'rgba(255,0,0,0.2)', bottomFillColor2: 'rgba(255,0,0,0.2)',
            topLineColor: 'rgba(0,0,0,0)', bottomLineColor: 'rgba(0,0,0,0)',
            priceLineVisible: false, lastValueVisible: false
        });
        const main = subChart.addLineSeries({ color: 'red', lineWidth: 1 });          // (20-60)
        const white = subChart.addLineSeries({ color: '#ffffff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); // (5-60)
        const zero = subChart.addLineSeries({ color: 'green', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

        const rawMain = calculateMAOscillator(candles, 20, 60); // (20-60)
        const rawWhite = calculateMAOscillator(candles, 5, 60);  // (5-60)
        const markers = makeCrossMarkers(rawWhite, rawMain);     // (5 ↔ 20) 교차

        fill.setData(padWithWhitespace(candles, rawMain));
        main.setData(padWithWhitespace(candles, rawMain));
        white.setData(padWithWhitespace(candles, rawWhite));
        white.setMarkers(markers);
        zero.setData(candles.map(c => ({ time: c.time, value: 0 })));

        // markers를 반환 객체에 보관
        return { fill, main, white, zero, rawMain, rawWhite, markers };
    }

    function buildMAOsc_LONG(subChart, candles) {
        const fill = subChart.addBaselineSeries({
            baseValue: { type: 'price', price: 0 },
            topFillColor1: 'rgba(0,128,0,0.25)', topFillColor2: 'rgba(0,128,0,0.25)',
            bottomFillColor1: 'rgba(255,0,0,0.2)', bottomFillColor2: 'rgba(255,0,0,0.2)',
            topLineColor: 'rgba(0,0,0,0)', bottomLineColor: 'rgba(0,0,0,0)',
            priceLineVisible: false, lastValueVisible: false
        });
        const main = subChart.addLineSeries({ color: 'green', lineWidth: 1 });       // (60-240)
        const white = subChart.addLineSeries({ color: 'red', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); // (20-240)
        const zero = subChart.addLineSeries({ color: 'magenta', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

        const rawMain = calculateMAOscillator(candles, 60, 240); // (60-240)
        const rawWhite = calculateMAOscillator(candles, 20, 240); // (20-240)
        const markers = makeCrossMarkers(rawWhite, rawMain);      // (20 ↔ 60) 교차

        fill.setData(padWithWhitespace(candles, rawMain));
        main.setData(padWithWhitespace(candles, rawMain));
        white.setData(padWithWhitespace(candles, rawWhite));
        white.setMarkers(markers);
        zero.setData(candles.map(c => ({ time: c.time, value: 0 })));

        // markers를 반환 객체에 보관
        return { fill, main, white, zero, rawMain, rawWhite, markers };
    }

    const maoD = buildMAOsc_MID(chDS, dd);    // 일봉: (20-60),5
    const maoM = buildMAOsc_LONG(chMS, m30);  // 30분: (60-240),20

    // RSI
    function buildRSI(subChart, candles, period = 14) {
        const line = subChart.addLineSeries({ color: '#FFD700', lineWidth: 1 });
        const b30 = subChart.addLineSeries({ color: 'green', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        const b70 = subChart.addLineSeries({ color: 'red', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        const data = calculateRSI(candles, period);
        return { line, b30, b70, data };
    }
    const rsiD = buildRSI(chDS, dd, 14);
    const rsiM = buildRSI(chMS, m30, 14);

    // Disparity(20)
    function buildDisparity(subChart, candles, maPeriod = 20) {
        const base100 = subChart.addLineSeries({ color: '#FFD700', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
        const fill = subChart.addBaselineSeries({
            baseValue: { type: 'price', price: 100 },
            topFillColor1: 'rgba(0,128,0,0.25)', topFillColor2: 'rgba(0,128,0,0.25)',
            bottomFillColor1: 'rgba(255,0,0,0.2)', bottomFillColor2: 'rgba(255,0,0,0.2)',
            topLineColor: 'rgba(0,0,0,0)', bottomLineColor: 'rgba(0,0,0,0)',
            priceLineVisible: false, lastValueVisible: false
        });
        const line = subChart.addLineSeries({ color: '#FF6F00', lineWidth: 1 });
        const ma = calculateSMA(candles, maPeriod);
        const closeMap = new Map(candles.map(c => [c.time, c.close]));
        const raw = ma.filter(m => Number.isFinite(m.value) && closeMap.has(m.time))
            .map(m => ({ time: m.time, value: (closeMap.get(m.time) / m.value) * 100 }));
        base100.setData(candles.map(c => ({ time: c.time, value: 100 })));
        fill.setData(padWithWhitespace(candles, raw));
        line.setData(padWithWhitespace(candles, raw));
        return { base100, fill, line, raw };
    }
    const dispD = buildDisparity(chDS, dd, 20);
    const dispM = buildDisparity(chMS, m30, 20);

    // MACD
    function buildMACD(subChart, candles) {
        const macdLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });
        const sigLine = subChart.addLineSeries({ color: 'yellow', lineWidth: 1 });
        const hist = subChart.addHistogramSeries({});
        const { macd, signal, histogram } = calculateMACD(candles);
        const histColored = histogram.map(h => ({ time: h.time, value: h.value, color: (h.value >= 0) ? 'rgba(0,255,0,0.5)' : 'rgba(239,83,80,0.5)' }));
        macdLine.setData(padWithWhitespace(candles, macd));
        sigLine.setData(padWithWhitespace(candles, signal));
        hist.setData(padWithWhitespace(candles, histColored));
        return { macdLine, sigLine, hist, raw: { macd, signal, histogram: histColored } };
    }
    const macdD = buildMACD(chDS, dd);
    const macdM = buildMACD(chMS, m30);

    // 서브 레전드
    const mkLegend = (host) => {
        const box = document.createElement('div');
        Object.assign(box.style, {
            position: 'absolute', top: '6px', left: '8px',
            display: 'none', gap: '8px', padding: '4px 6px',
            fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
            background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
        });
        host.appendChild(box);
        return box;
    };
    const lgMAOD = mkLegend(elDSub);
    const lgMAOM = mkLegend(elMSub);
    const lgRSID = mkLegend(elDSub);
    const lgRSIM = mkLegend(elMSub);
    const lgDISPD = mkLegend(elDSub);
    const lgDISPM = mkLegend(elMSub);
    const lgMACDD = mkLegend(elDSub);
    const lgMACDM = mkLegend(elMSub);

    const renderMAOLegendMid = (box) => {
        box.innerHTML = `
      <span style="color:#ffffff">MA_Oscillator(</span>
      <span style="color:red">20</span>
      <span style="color:#ffffff">-</span>
      <span style="color:green">60</span>
      <span style="color:#ffffff">), </span><span style="color:#ffffff">5</span>`;
        box.style.display = '';
    };
    const renderMAOLegendLong = (box) => {
        box.innerHTML = `
      <span style="color:#ffffff">LMA_Oscillator(</span>
      <span style="color:green">60</span>
      <span style="color:#ffffff">-</span>
      <span style="color:magenta">240</span>
      <span style="color:#ffffff">), </span><span style="color:red">20</span>`;
        box.style.display = '';
    };

    const renderRSILegend = (box, label, val) => {
        if (!Number.isFinite(val)) { box.style.display = 'none'; return; }
        box.innerHTML = `<span>${label}: <span style="color:#FFD700">${val.toFixed(1)}</span></span>
      <span style="margin:0 6px;">|</span>
      <span>Zones: <span style="color:green">30</span> / <span style="color:red">70</span></span>`;
        box.style.display = '';
    };
    const renderDISPLegend = (box, p, last) => {
        if (!Number.isFinite(last)) { box.style.display = 'none'; return; }
        const curColor = last >= 100 ? 'green' : 'red';
        box.innerHTML = `<span>Disparity(${p}): <span style="color:${curColor}">${last.toFixed(1)}%</span></span>
      <span style="margin:0 6px;">|</span>
      <span>Base: <span style="color:#FFD700">100</span></span>`;
        box.style.display = '';
    };
    const renderMACDLegend = (box, m, s) => {
        if (!Number.isFinite(m) || !Number.isFinite(s)) { box.style.display = 'none'; return; }
        box.innerHTML = `<span>MACD(12,26,9): <span style="color:red">${m.toFixed(2)}</span></span>
      <span style="margin:0 6px;">|</span>
      <span>Signal: <span style="color:yellow">${s.toFixed(2)}</span></span>`;
        box.style.display = '';
    };

    // 도트 위치 헬퍼 (메인선 기준)
    function placeDot(subChart, series, data, dot) {
        if (!data?.length) { dot.style.left = dot.style.top = '-9999px'; return; }
        const last = data[data.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = series.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            dot.style.left = (x - 4) + 'px'; dot.style.top = (y - 4) + 'px';
        } else { dot.style.left = dot.style.top = '-9999px'; }
    }

    let subD = 'MAOSC';   // 일봉 서브 현재
    let subM = 'MAOSC';   // 30분 서브 현재

    const posMAO_D = () => (subD === 'MAOSC') ? placeDot(chDS, maoD.main, maoD.rawMain, dotDO) : (dotDO.style.left = dotDO.style.top = '-9999px');
    const posMAO_M = () => (subM === 'MAOSC') ? placeDot(chMS, maoM.main, maoM.rawMain, dotMO) : (dotMO.style.left = dotMO.style.top = '-9999px');
    const posDISP_D = () => (subD === 'DISP') ? placeDot(chDS, dispD.line, dispD.raw, dotDISPD) : (dotDISPD.style.left = dotDISPD.style.top = '-9999px');
    const posDISP_M = () => (subM === 'DISP') ? placeDot(chMS, dispM.line, dispM.raw, dotDISPM) : (dotDISPM.style.left = dotDISPM.style.top = '-9999px');
    const posMACD_D = () => (subD === 'MACD') ? placeDot(chDS, macdD.macdLine, macdD.raw.macd, dotMACDD) : (dotMACDD.style.left = dotMACDD.style.top = '-9999px');
    const posMACD_M = () => (subM === 'MACD') ? placeDot(chMS, macdM.macdLine, macdM.raw.macd, dotMACDM) : (dotMACDM.style.left = dotMACDM.style.top = '-9999px');

    // 표시/숨김 유틸
    function clearRSI_D() { rsiD.line.setData([]); rsiD.b30.setData([]); rsiD.b70.setData([]); }
    function clearRSI_M() { rsiM.line.setData([]); rsiM.b30.setData([]); rsiM.b70.setData([]); }
    function clearMAO_D() { maoD.fill.setData([]); maoD.main.setData([]); maoD.white.setData([]); maoD.white.setMarkers([]); maoD.zero.setData([]); }
    function clearMAO_M() { maoM.fill.setData([]); maoM.main.setData([]); maoM.white.setData([]); maoM.white.setMarkers([]); maoM.zero.setData([]); }
    function clearDISP_D() { dispD.base100.setData([]); dispD.fill.setData([]); dispD.line.setData([]); }
    function clearDISP_M() { dispM.base100.setData([]); dispM.fill.setData([]); dispM.line.setData([]); }
    function clearMACD_D() { macdD.macdLine.setData([]); macdD.sigLine.setData([]); macdD.hist.setData([]); }
    function clearMACD_M() { macdM.macdLine.setData([]); macdM.sigLine.setData([]); macdM.hist.setData([]); }

    function showD_MAOSC() {
        maoD.fill.setData(padWithWhitespace(dd, maoD.rawMain));
        maoD.main.setData(padWithWhitespace(dd, maoD.rawMain));
        maoD.white.setData(padWithWhitespace(dd, maoD.rawWhite));
        maoD.white.setMarkers(maoD.markers);            // ← 화살표 복원
        maoD.zero.setData(dd.map(c => ({ time: c.time, value: 0 })));
        clearRSI_D(); clearDISP_D(); clearMACD_D();
        renderMAOLegendMid(lgMAOD);
        lgRSID.style.display = lgDISPD.style.display = lgMACDD.style.display = 'none';
        posMAO_D(); dotDISPD.style.left = dotDISPD.style.top = '-9999px'; dotMACDD.style.left = dotMACDD.style.top = '-9999px';
    }
    function showM_MAOSC() {
        maoM.fill.setData(padWithWhitespace(m30, maoM.rawMain));
        maoM.main.setData(padWithWhitespace(m30, maoM.rawMain));
        maoM.white.setData(padWithWhitespace(m30, maoM.rawWhite));
        maoM.white.setMarkers(maoM.markers);            // ← 화살표 복원
        maoM.zero.setData(m30.map(c => ({ time: c.time, value: 0 })));
        clearRSI_M(); clearDISP_M(); clearMACD_M();
        renderMAOLegendLong(lgMAOM);
        lgRSIM.style.display = lgDISPM.style.display = lgMACDM.style.display = 'none';
        posMAO_M(); dotDISPM.style.left = dotDISPM.style.top = '-9999px'; dotMACDM.style.left = dotMACDM.style.top = '-9999px';
    }
    function showD_RSI() {
        rsiD.line.setData(padWithWhitespace(dd, rsiD.data));
        rsiD.b30.setData(dd.map(c => ({ time: c.time, value: 30 })));
        rsiD.b70.setData(dd.map(c => ({ time: c.time, value: 70 })));
        clearMAO_D(); clearDISP_D(); clearMACD_D();
        renderRSILegend(lgRSID, 'RSI(14)', rsiD.data.at(-1)?.value);
        lgMAOD.style.display = lgDISPD.style.display = lgMACDD.style.display = 'none';
        posMAO_D(); dotDISPD.style.left = dotDISPD.style.top = '-9999px'; dotMACDD.style.left = dotMACDD.style.top = '-9999px';
    }
    function showM_RSI() {
        rsiM.line.setData(padWithWhitespace(m30, rsiM.data));
        rsiM.b30.setData(m30.map(c => ({ time: c.time, value: 30 })));
        rsiM.b70.setData(m30.map(c => ({ time: c.time, value: 70 })));
        clearMAO_M(); clearDISP_M(); clearMACD_M();
        renderRSILegend(lgRSIM, 'RSI(14)', rsiM.data.at(-1)?.value);
        lgMAOM.style.display = lgDISPM.style.display = lgMACDM.style.display = 'none';
        posMAO_M(); dotDISPM.style.left = dotDISPM.style.top = '-9999px'; dotMACDM.style.left = dotMACDM.style.top = '-9999px';
    }
    function showD_DISP() {
        dispD.base100.setData(dd.map(c => ({ time: c.time, value: 100 })));
        dispD.fill.setData(padWithWhitespace(dd, dispD.raw));
        dispD.line.setData(padWithWhitespace(dd, dispD.raw));
        clearMAO_D(); clearRSI_D(); clearMACD_D();
        renderDISPLegend(lgDISPD, 20, dispD.raw.at(-1)?.value);
        lgMAOD.style.display = lgRSID.style.display = lgMACDD.style.display = 'none';
        dotDO.style.left = dotDO.style.top = '-9999px'; dotMACDD.style.left = dotMACDD.style.top = '-9999px';
        posDISP_D();
    }
    function showM_DISP() {
        dispM.base100.setData(m30.map(c => ({ time: c.time, value: 100 })));
        dispM.fill.setData(padWithWhitespace(m30, dispM.raw));
        dispM.line.setData(padWithWhitespace(m30, dispM.raw));
        clearMAO_M(); clearRSI_M(); clearMACD_M();
        renderDISPLegend(lgDISPM, 20, dispM.raw.at(-1)?.value);
        lgMAOM.style.display = lgRSIM.style.display = lgMACDM.style.display = 'none';
        dotMO.style.left = dotMO.style.top = '-9999px'; dotMACDM.style.left = dotMACDM.style.top = '-9999px';
        posDISP_M();
    }
    function showD_MACD() {
        macdD.macdLine.setData(padWithWhitespace(dd, macdD.raw.macd));
        macdD.sigLine.setData(padWithWhitespace(dd, macdD.raw.signal));
        macdD.hist.setData(padWithWhitespace(dd, macdD.raw.histogram));
        clearMAO_D(); clearRSI_D(); clearDISP_D();
        renderMACDLegend(lgMACDD, macdD.raw.macd.at(-1)?.value, macdD.raw.signal.at(-1)?.value);
        lgMAOD.style.display = lgRSID.style.display = lgDISPD.style.display = 'none';
        dotDO.style.left = dotDO.style.top = '-9999px'; dotDISPD.style.left = dotDISPD.style.top = '-9999px';
        posMACD_D();
    }
    function showM_MACD() {
        macdM.macdLine.setData(padWithWhitespace(m30, macdM.raw.macd));
        macdM.sigLine.setData(padWithWhitespace(m30, macdM.raw.signal));
        macdM.hist.setData(padWithWhitespace(m30, macdM.raw.histogram));
        clearMAO_M(); clearRSI_M(); clearDISP_M();
        renderMACDLegend(lgMACDM, macdM.raw.macd.at(-1)?.value, macdM.raw.signal.at(-1)?.value);
        lgMAOM.style.display = lgRSIM.style.display = lgDISPM.style.display = 'none';
        dotMO.style.left = dotMO.style.top = '-9999px'; dotDISPM.style.left = dotDISPM.style.top = '-9999px';
        posMACD_M();
    }

    // 초기 보조: 둘 다 MAOSC
    showD_MAOSC(); showM_MAOSC();

    // 링크/축 동기화
    const linkD = linkTimeScalesOneWay(chDM, chDS);
    const linkM = linkTimeScalesOneWay(chM30, chMS);
    const paLeft = observeAndSyncPriceAxisWidth([{ chart: chDM, container: elDMain }, { chart: chDS, container: elDSub }]);
    const paRight = observeAndSyncPriceAxisWidth([{ chart: chM30, container: elMMain }, { chart: chMS, container: elMSub }]);

    // 초기 가시범위
    setInitialVisibleRange(chDM, dd, BARS_DAILY);
    setInitialVisibleRange(chDS, dd, BARS_DAILY);
    setInitialVisibleRange(chM30, m30, BARS_30M);
    setInitialVisibleRange(chMS, m30, BARS_30M);

    const onDailyDbl = () => { setInitialVisibleRange(chDM, dd, BARS_DAILY); setTimeout(() => { posMAO_D(); posDISP_D(); posMACD_D(); }, 0); };
    const onM30Dbl = () => { setInitialVisibleRange(chM30, m30, BARS_30M); setTimeout(() => { posMAO_M(); posDISP_M(); posMACD_M(); }, 0); };
    elDMain.addEventListener('dblclick', onDailyDbl);
    elMMain.addEventListener('dblclick', onM30Dbl);

    // 재배치 구독
    const unsubs = [];
    function bindReposition(subChart, fn) {
        try {
            const ts = subChart.timeScale();
            const onRange = () => fn();
            ts.subscribeVisibleTimeRangeChange(onRange);
            unsubs.push(() => ts.unsubscribeVisibleTimeRangeChange(onRange));
        } catch { }
        try {
            const ps = subChart.priceScale('right');
            if (ps?.subscribeSizeChange) {
                const onSize = () => fn();
                ps.subscribeSizeChange(onSize);
                unsubs.push(() => ps.unsubscribeSizeChange(onSize));
            }
        } catch { }
        const ro = new ResizeObserver(() => fn());
        try { ro.observe(subChart?.chartElement || subChart); } catch { }
        unsubs.push(() => { try { ro.disconnect(); } catch { } });
    }
    [[chDS, posMAO_D], [chMS, posMAO_M], [chDS, posDISP_D], [chMS, posDISP_M], [chDS, posMACD_D], [chMS, posMACD_M]]
        .forEach(([c, f]) => bindReposition(c, f));

    // 툴바
    const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
    const btnTrend = document.querySelector('.main-toolbar [data-action="trendline"]');
    const btnMAO = document.querySelector('.main-toolbar [data-action="ma_oscillator"]');
    const btnRSI = document.querySelector('.main-toolbar [data-action="rsi"]');
    const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');
    const btnMACD = document.querySelector('.main-toolbar [data-action="macd"]');

    const setActive = (btn, on) => { if (!btn) return; on ? btn.classList.add('active-preset') : btn.classList.remove('active-preset'); };
    function syncToolbarActive() {
        setActive(btnMAO, (subD === 'MAOSC' || subM === 'MAOSC'));
        setActive(btnRSI, (subD === 'RSI' || subM === 'RSI'));
        setActive(btnDISP, (subD === 'DISP' || subM === 'DISP'));
        setActive(btnMACD, (subD === 'MACD' || subM === 'MACD'));
    }
    syncToolbarActive();

    // 생명선/추세선 (일봉 메인의 MA20/MA60)
    const LIFE_RED = 'red', LIFE_YELLOW = '#FFD700';
    let lifeOn = false, lifeTimer = null, lifeFlip = false;
    function setLifeColor(c) { try { dm.lines.ma20.applyOptions({ color: c }); } catch { } }
    function startLife() {
        lifeOn = true; setActive(btnLife, true); setLifeColor(LIFE_YELLOW);
        lifeTimer = setInterval(() => { lifeFlip = !lifeFlip; setLifeColor(lifeFlip ? LIFE_RED : LIFE_YELLOW); }, 1500);
    }
    function stopLife() { lifeOn = false; setActive(btnLife, false); if (lifeTimer) { clearInterval(lifeTimer); lifeTimer = null; } setLifeColor(LIFE_RED); }
    const onLife = () => lifeOn ? stopLife() : startLife();

    const TREND_GREEN = 'green', TREND_LIGHT = '#7CFC00';
    let trendOn = false, trendTimer = null, trendFlip = false;
    function setTrendColor(c) { try { dm.lines.ma60.applyOptions({ color: c }); } catch { } }
    function startTrend() {
        trendOn = true; setActive(btnTrend, true); setTrendColor(TREND_LIGHT);
        trendTimer = setInterval(() => { trendFlip = !trendFlip; setTrendColor(trendFlip ? TREND_GREEN : TREND_LIGHT); }, 1500);
    }
    function stopTrend() { trendOn = false; setActive(btnTrend, false); if (trendTimer) { clearInterval(trendTimer); } trendTimer = null; setTrendColor(TREND_GREEN); }
    const onTrend = () => trendOn ? stopTrend() : startTrend();

    btnLife?.addEventListener('click', onLife);
    btnTrend?.addEventListener('click', onTrend);

    // 싱글/더블 클릭(싱글: 일+30분 동시 / 더블: 30분만)
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

    const offMAO = bindSingleVsDouble(
        btnMAO,
        () => { showD_MAOSC(); showM_MAOSC(); subD = 'MAOSC'; subM = 'MAOSC'; syncToolbarActive(); posMAO_D(); posMAO_M(); posDISP_D(); posDISP_M(); posMACD_D(); posMACD_M(); },
        () => { showM_MAOSC(); subM = 'MAOSC'; syncToolbarActive(); posMAO_M(); posDISP_M(); posMACD_M(); }
    );
    const offRSI = bindSingleVsDouble(
        btnRSI,
        () => { showD_RSI(); showM_RSI(); subD = 'RSI'; subM = 'RSI'; syncToolbarActive(); posMAO_D(); posMAO_M(); posDISP_D(); posDISP_M(); posMACD_D(); posMACD_M(); },
        () => { showM_RSI(); subM = 'RSI'; syncToolbarActive(); posMAO_M(); posDISP_M(); posMACD_M(); }
    );
    const offDISP = bindSingleVsDouble(
        btnDISP,
        () => { showD_DISP(); showM_DISP(); subD = 'DISP'; subM = 'DISP'; syncToolbarActive(); posDISP_D(); posDISP_M(); },
        () => { showM_DISP(); subM = 'DISP'; syncToolbarActive(); posDISP_M(); }
    );
    const offMACD = bindSingleVsDouble(
        btnMACD,
        () => { showD_MACD(); showM_MACD(); subD = 'MACD'; subM = 'MACD'; syncToolbarActive(); posMACD_D(); posMACD_M(); },
        () => { showM_MACD(); subM = 'MACD'; syncToolbarActive(); posMACD_M(); }
    );

    // 정리자
    return () => {
        btnLife?.removeEventListener('click', onLife);
        btnTrend?.removeEventListener('click', onTrend);
        offMAO?.(); offRSI?.(); offDISP?.(); offMACD?.();

        setActive(btnMAO, false); setActive(btnRSI, false); setActive(btnDISP, false); setActive(btnMACD, false);

        elDMain.removeEventListener('dblclick', onDailyDbl);
        elMMain.removeEventListener('dblclick', onM30Dbl);

        try { elDSub.removeChild(lgMAOD); } catch { }
        try { elMSub.removeChild(lgMAOM); } catch { }
        try { elDSub.removeChild(lgRSID); } catch { }
        try { elMSub.removeChild(lgRSIM); } catch { }
        try { elDSub.removeChild(lgDISPD); } catch { }
        try { elMSub.removeChild(lgDISPM); } catch { }
        try { elDSub.removeChild(lgMACDD); } catch { }
        try { elMSub.removeChild(lgMACDM); } catch { }

        try { elDSub.removeChild(dotDO); } catch { }
        try { elMSub.removeChild(dotMO); } catch { }
        try { elDSub.removeChild(dotDISPD); } catch { }
        try { elMSub.removeChild(dotDISPM); } catch { }
        try { elDSub.removeChild(dotMACDD); } catch { }
        try { elMSub.removeChild(dotMACDM); } catch { }

        try { linkD?.dispose?.(); } catch { }
        try { linkM?.dispose?.(); } catch { }
        try { paLeft?.dispose?.(); } catch { }
        try { paRight?.dispose?.(); } catch { }
        unsubs.forEach(fn => { try { fn(); } catch { } });

        try { chDM.remove(); } catch { }
        try { chDS.remove(); } catch { }
        try { chM30.remove(); } catch { }
        try { chMS.remove(); } catch { }
    };
}

export const presetKey = "krDualDaily30m";
