// plugins/usStocks/preset/usDualDaily60m.js
// US: 좌 = 일봉(메인+보조) / 우 = 60분봉(메인+보조)
// KR dualDaily30m을 1:1 이식, 로더만 loadEquity, 30m → 60m 로 교체

import { loadEquity } from "../data/dataLoader.js";
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import { calculateRSI } from "../../crypto/indicators/rsi.js";
import { calculateMACD } from "../../crypto/indicators/macd.js";
import observeAndSyncPriceAxisWidth from "../../shared/sync/priceAxisSync.js";
import {
    baseChartOptions, createTitleOverlay, setInitialVisibleRange,
    linkTimeScalesOneWay, padWithWhitespace
} from "../../crypto/preset/_common.js";

const BARS_DAILY = 160;
const BARS_60M = 320;
const EPS = 1e-8;

export default async function mountUSDualDaily60m({
    mountId = "main-content-area",
    symbol = "SPY",
} = {}) {
    const LWC = window.LightweightCharts;
    const mainRoot = document.getElementById(mountId);
    if (!LWC || !mainRoot) return () => { };

    // 레이아웃: 1×2 컬럼, 각 컬럼은 메인(3fr) + 서브(1fr)
    mainRoot.innerHTML = `
  <div id="us-dual-d-60m" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;height:100%;">
    <div id="col-daily" style="display:grid;grid-template-rows:3fr 1fr;gap:6px;min-height:120px;">
      <div id="d-main" style="position:relative;"></div>
      <div id="d-sub"  style="position:relative;"></div>
    </div>
    <div id="col-60m" style="display:grid;grid-template-rows:3fr 1fr;gap:6px;min-height:120px;">
      <div id="m60-main" style="position:relative;"></div>
      <div id="m60-sub"  style="position:relative;"></div>
    </div>
  </div>`;

    const elDMain = mainRoot.querySelector("#d-main");
    const elDSub = mainRoot.querySelector("#d-sub");
    const elMMain = mainRoot.querySelector("#m60-main");
    const elMSub = mainRoot.querySelector("#m60-sub");

    // 타이틀
    createTitleOverlay(elDMain, `${symbol} • 일봉`);
    createTitleOverlay(elMMain, `${symbol} • 60분봉`);

    const base = baseChartOptions(LWC);

    // 차트 생성
    const chDM = LWC.createChart(elDMain, base);
    const chDS = LWC.createChart(elDSub, { ...base, rightPriceScale: { borderColor: '#2a2b31', scaleMargins: { top: 0.1, bottom: 0.1 } } });
    const chM60 = LWC.createChart(elMMain, base);
    const chMS = LWC.createChart(elMSub, { ...base, rightPriceScale: { borderColor: '#2a2b31', scaleMargins: { top: 0.1, bottom: 0.1 } } });

    // 서브 차트 조작 비활성(단방향 링크)
    [chDS, chMS].forEach(c => c.applyOptions({
        handleScroll: false,
        handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false }
    }));

    // 데이터 로드
    const [dd, m60] = await Promise.all([
        loadEquity({ symbol, timeframe: "daily" }),
        loadEquity({ symbol, timeframe: "60m" }),
    ]);

    const UP = '#26a69a', DOWN = '#ef5350';

    // 공통 메인 세트(볼륨 + 이평 + 캔들)
    function buildMainSet(chart, candles, maDefs) {
        const vol = chart.addHistogramSeries({
            priceScaleId: 'vol', priceFormat: { type: 'volume' },
            priceLineVisible: false, lastValueVisible: false
        });
        vol.setData(candles.map(c => ({ time: c.time, value: c.volume ?? 0, color: (c.close >= c.open) ? UP : DOWN })));
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

    // 일봉 메인: 240/120/60/20/5
    const dm = buildMainSet(chDM, dd, [
        { p: 240, color: 'magenta', w: 4 },
        { p: 120, color: 'darkorange', w: 1, lastValueVisible: false },
        { p: 60, color: 'green', w: 3 },
        { p: 20, color: 'red', w: 3, pl: true },
        { p: 5, color: 'white', w: 2 },
    ]);
    try { dm.lines.ma120?.applyOptions({ lineStyle: 2 }); } catch { }

    // 60분 메인: 동일 팔레트/스택
    const mset = buildMainSet(chM60, m60, [
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

    /* ── 보조지표 세트(일/60분) — MAOSC, RSI(14), Disparity(20), MACD(12,26,9) ── */
    // 공통 pulse 스타일
    (function ensurePulseStyles() {
        const make = (id, css) => {
            if (!document.getElementById(id)) {
                const st = document.createElement('style'); st.id = id; st.textContent = css; document.head.appendChild(st);
            }
        };
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

    // ────────────── MA Oscillator (일봉=중기, 60분=장기) ──────────────
    function calcMAMaps(candles) {
        const m5 = calculateSMA(candles, 5);
        const m20 = calculateSMA(candles, 20);
        const m60 = calculateSMA(candles, 60);
        const m240 = calculateSMA(candles, 240);
        return {
            m5: new Map(m5.map(x => [x.time, x.value])),
            m20: new Map(m20.map(x => [x.time, x.value])),
            m60: new Map(m60.map(x => [x.time, x.value])),
            m240: new Map(m240.map(x => [x.time, x.value])),
        };
    }
    function buildCrossMarkers(white, main) {
        const W = new Map(white.map(p => [p.time, p.value]));
        const M = new Map(main.map(p => [p.time, p.value]));
        const keys = white.map(p => p.time).filter(t => M.has(t));
        const out = [];
        for (let i = 1; i < keys.length; i++) {
            const t0 = keys[i - 1], t1 = keys[i];
            const d0 = (W.get(t0) - M.get(t0));
            const d1 = (W.get(t1) - M.get(t1));
            if (!Number.isFinite(d0) || !Number.isFinite(d1)) continue;
            if (d0 < -EPS && d1 >= EPS) {
                out.push({ time: t1, position: "belowBar", shape: "arrowUp", color: "green" });   // 골드
            } else if (d0 > EPS && d1 <= -EPS) {
                out.push({ time: t1, position: "aboveBar", shape: "arrowDown", color: "#ef5350" }); // 데드
            }
        }
        return out;
    }
    function buildMAOsc(subChart, candles, mode /* 'mid' | 'long' */) {
        const base = subChart.addBaselineSeries({
            baseValue: { type: 'price', price: 0 },
            topFillColor1: 'rgba(0,128,0,0.25)', topFillColor2: 'rgba(0,128,0,0.25)',
            bottomFillColor1: 'rgba(255,0,0,0.2)', bottomFillColor2: 'rgba(255,0,0,0.2)',
            topLineColor: 'rgba(0,0,0,0)', bottomLineColor: 'rgba(0,0,0,0)',
            priceLineVisible: false, lastValueVisible: false
        });

        // 기준선/본선/보조선 색상
        const zeroColor = (mode === 'mid') ? 'green' : 'magenta';     // MA60 / MA240 색상
        const mainColor = (mode === 'mid') ? 'red' : 'green';         // 20-60 / 60-240
        const whiteColor = (mode === 'mid') ? 'white' : 'red';        // 5-60 / 20-240

        const zero = subChart.addLineSeries({ color: zeroColor, lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
        const main = subChart.addLineSeries({ color: mainColor, lineWidth: 1 });
        const white = subChart.addLineSeries({ color: whiteColor, lineWidth: 1 });

        // 데이터 생성
        const maps = calcMAMaps(candles);
        const times = candles.map(c => c.time);

        let mainRaw = [];
        let whiteRaw = [];
        if (mode === 'mid') {
            // 본선: 20-60(빨강), 보조: 5-60(흰)
            mainRaw = times.map(t => {
                const a = maps.m20.get(t), b = maps.m60.get(t);
                return { time: t, value: (Number.isFinite(a) && Number.isFinite(b)) ? (a - b) : NaN };
            });
            whiteRaw = times.map(t => {
                const a = maps.m5.get(t), b = maps.m60.get(t);
                return { time: t, value: (Number.isFinite(a) && Number.isFinite(b)) ? (a - b) : NaN };
            });
        } else {
            // 본선: 60-240(초록), 보조: 20-240(빨강)
            mainRaw = times.map(t => {
                const a = maps.m60.get(t), b = maps.m240.get(t);
                return { time: t, value: (Number.isFinite(a) && Number.isFinite(b)) ? (a - b) : NaN };
            });
            whiteRaw = times.map(t => {
                const a = maps.m20.get(t), b = maps.m240.get(t);
                return { time: t, value: (Number.isFinite(a) && Number.isFinite(b)) ? (a - b) : NaN };
            });
        }

        // 세팅
        base.setData(padWithWhitespace(candles, mainRaw));
        main.setData(padWithWhitespace(candles, mainRaw));
        white.setData(padWithWhitespace(candles, whiteRaw));
        zero.setData(candles.map(c => ({ time: c.time, value: 0 })));

        // 교차 마커(텍스트 없음)
        try {
            const markers = buildCrossMarkers(whiteRaw, mainRaw);
            white.setMarkers(markers);
        } catch { }

        return { base, zero, main, white, mainRaw, whiteRaw, mode };
    }

    const maoD = buildMAOsc(chDS, dd, 'mid');   // 일봉 = 중기
    const maoM = buildMAOsc(chMS, m60, 'long'); // 60분 = 장기

    // RSI
    function buildRSI(subChart, candles, period = 14) {
        const line = subChart.addLineSeries({ color: '#FFD700', lineWidth: 1 });
        const b30 = subChart.addLineSeries({ color: 'green', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        const b70 = subChart.addLineSeries({ color: 'red', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        const data = calculateRSI(candles, period);
        return { line, b30, b70, data };
    }
    const rsiD = buildRSI(chDS, dd, 14);
    const rsiM = buildRSI(chMS, m60, 14);

    // Disparity(20) = 100 * Close / MA20
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
    const dispM = buildDisparity(chMS, m60, 20);

    // MACD
    function buildMACD(subChart, candles) {
        const macdLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });
        const sigLine = subChart.addLineSeries({ color: 'yellow', lineWidth: 1 });
        const hist = subChart.addHistogramSeries({ base: 0 });
        const { macd, signal, histogram } = (function calcMACDLocal() { return calculateMACD(candles); })();
        const histColored = histogram.map(h => ({ time: h.time, value: h.value, color: (h.value >= 0) ? 'rgba(0,255,0,0.5)' : 'rgba(239,83,80,0.5)' }));
        macdLine.setData(padWithWhitespace(candles, macd));
        sigLine.setData(padWithWhitespace(candles, signal));
        hist.setData(padWithWhitespace(candles, histColored));
        return { macdLine, sigLine, hist, raw: { macd, signal, histogram: histColored } };
    }
    const macdD = buildMACD(chDS, dd);
    const macdM = buildMACD(chMS, m60);

    // 서브 레전드(싱글톤: 패널별 하나만 보임)
    const mkLegend = (host) => {
        const box = document.createElement('div');
        Object.assign(box.style, {
            position: 'absolute', top: '6px', left: '8px',
            display: 'none', gap: '8px', padding: '4px 6px',
            fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
            background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7,
            whiteSpace: 'nowrap', textShadow: '0 0 4px rgba(0,0,0,.4)'
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

    const renderMAOLegend = (box, mode) => {
        if (mode === 'mid') {
            // (20-60) / Signal 5
            box.innerHTML = `
              <span>MA Oscillator(</span>
              <span style="color:red">20</span><span>-</span><span style="color:green">60</span><span>)</span>
              <span>/</span><span>Signal </span><span style="color:white">5</span>`;
        } else {
            // (60-240) / Signal 20
            box.innerHTML = `
              <span>MA Oscillator(</span>
              <span style="color:green">60</span><span>-</span><span style="color:magenta">240</span><span>)</span>
              <span>/</span><span>Signal </span><span style="color:red">20</span>`;
        }
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

    // 도트 위치 헬퍼(본선 마지막 좌표)
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
    let subM = 'MAOSC';   // 60분 서브 현재

    const posMAO_D = () => (subD === 'MAOSC') ? placeDot(chDS, maoD.main, maoD.mainRaw, dotDO) : (dotDO.style.left = dotDO.style.top = '-9999px');
    const posMAO_M = () => (subM === 'MAOSC') ? placeDot(chMS, maoM.main, maoM.mainRaw, dotMO) : (dotMO.style.left = dotMO.style.top = '-9999px');
    const posDISP_D = () => (subD === 'DISP') ? placeDot(chDS, dispD.line, dispD.raw, dotDISPD) : (dotDISPD.style.left = dotDISPD.style.top = '-9999px');
    const posDISP_M = () => (subM === 'DISP') ? placeDot(chMS, dispM.line, dispM.raw, dotDISPM) : (dotDISPM.style.left = dotDISPM.style.top = '-9999px');
    const posMACD_D = () => (subD === 'MACD') ? placeDot(chDS, macdD.macdLine, macdD.raw.macd, dotMACDD) : (dotMACDD.style.left = dotMACDD.style.top = '-9999px');
    const posMACD_M = () => (subM === 'MACD') ? placeDot(chMS, macdM.macdLine, macdM.raw.macd, dotMACDM) : (dotMACDM.style.left = dotMACDM.style.top = '-9999px');

    // 표시/숨김 유틸
    function clearRSI_D() { rsiD.line.setData([]); rsiD.b30.setData([]); rsiD.b70.setData([]); }
    function clearRSI_M() { rsiM.line.setData([]); rsiM.b30.setData([]); rsiM.b70.setData([]); }
    function clearMAO_D() { maoD.base.setData([]); maoD.main.setData([]); maoD.white.setData([]); maoD.zero.setData([]); maoD.white.setMarkers([]); }
    function clearMAO_M() { maoM.base.setData([]); maoM.main.setData([]); maoM.white.setData([]); maoM.zero.setData([]); maoM.white.setMarkers([]); }
    function clearDISP_D() { dispD.base100.setData([]); dispD.fill.setData([]); dispD.line.setData([]); }
    function clearDISP_M() { dispM.base100.setData([]); dispM.fill.setData([]); dispM.line.setData([]); }
    function clearMACD_D() { macdD.macdLine.setData([]); macdD.sigLine.setData([]); macdD.hist.setData([]); }
    function clearMACD_M() { macdM.macdLine.setData([]); macdM.sigLine.setData([]); macdM.hist.setData([]); }

    function showD_MAOSC() {
        maoD.base.setData(padWithWhitespace(dd, maoD.mainRaw));
        maoD.main.setData(padWithWhitespace(dd, maoD.mainRaw));
        maoD.white.setData(padWithWhitespace(dd, maoD.whiteRaw));
        maoD.zero.setData(dd.map(c => ({ time: c.time, value: 0 })));
        // 교차 마커 재설정
        try { maoD.white.setMarkers(buildCrossMarkers(maoD.whiteRaw, maoD.mainRaw)); } catch { }
        clearRSI_D(); clearDISP_D(); clearMACD_D();
        renderMAOLegend(lgMAOD, 'mid'); // Signal 5
        lgRSID.style.display = lgDISPD.style.display = lgMACDD.style.display = 'none';
        posMAO_D(); dotDISPD.style.left = dotDISPD.style.top = '-9999px'; dotMACDD.style.left = dotMACDD.style.top = '-9999px';
    }
    function showM_MAOSC() {
        maoM.base.setData(padWithWhitespace(m60, maoM.mainRaw));
        maoM.main.setData(padWithWhitespace(m60, maoM.mainRaw));
        maoM.white.setData(padWithWhitespace(m60, maoM.whiteRaw));
        maoM.zero.setData(m60.map(c => ({ time: c.time, value: 0 })));
        try { maoM.white.setMarkers(buildCrossMarkers(maoM.whiteRaw, maoM.mainRaw)); } catch { }
        clearRSI_M(); clearDISP_M(); clearMACD_M();
        renderMAOLegend(lgMAOM, 'long'); // Signal 20
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
        rsiM.line.setData(padWithWhitespace(m60, rsiM.data));
        rsiM.b30.setData(m60.map(c => ({ time: c.time, value: 30 })));
        rsiM.b70.setData(m60.map(c => ({ time: c.time, value: 70 })));
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
        dispM.base100.setData(m60.map(c => ({ time: c.time, value: 100 })));
        dispM.fill.setData(padWithWhitespace(m60, dispM.raw));
        dispM.line.setData(padWithWhitespace(m60, dispM.raw));
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
        macdM.macdLine.setData(padWithWhitespace(m60, macdM.raw.macd));
        macdM.sigLine.setData(padWithWhitespace(m60, macdM.raw.signal));
        macdM.hist.setData(padWithWhitespace(m60, macdM.raw.histogram));
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
    const linkM = linkTimeScalesOneWay(chM60, chMS);
    const paLeft = observeAndSyncPriceAxisWidth([{ chart: chDM, container: elDMain }, { chart: chDS, container: elDSub }]);
    const paRight = observeAndSyncPriceAxisWidth([{ chart: chM60, container: elMMain }, { chart: chMS, container: elMSub }]);

    // 초기 가시범위
    setInitialVisibleRange(chDM, dd, BARS_DAILY);
    setInitialVisibleRange(chDS, dd, BARS_DAILY);
    setInitialVisibleRange(chM60, m60, BARS_60M);
    setInitialVisibleRange(chMS, m60, BARS_60M);

    const onDailyDbl = () => { setInitialVisibleRange(chDM, dd, BARS_DAILY); setTimeout(() => { posMAO_D(); posDISP_D(); posMACD_D(); }, 0); };
    const onM60Dbl = () => { setInitialVisibleRange(chM60, m60, BARS_60M); setTimeout(() => { posMAO_M(); posDISP_M(); posMACD_M(); }, 0); };
    elDMain.addEventListener('dblclick', onDailyDbl);
    elMMain.addEventListener('dblclick', onM60Dbl);

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

    // 생명선(일봉 MA20), 추세선(일봉 MA60) 깜빡이
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

    // 싱글/더블 클릭 유틸(싱글: 일+60분 동시 / 더블: 60분만)
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
        elMMain.removeEventListener('dblclick', onM60Dbl);

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
        try { chM60.remove(); } catch { }
        try { chMS.remove(); } catch { }
    };
}

export const presetKey = "usDualDaily60m";
