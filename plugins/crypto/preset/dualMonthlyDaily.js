// Listen2FM_Viewer/plugins/crypto/preset/dualMonthlyDaily.js
// 좌: 월봉(메인+MAOSC 3-12) / 우: 일봉(메인+MAOSC 20-60, + 5-60 보조선 & 5↔20 교차마커)
// 비트코인을 제외한 알트코인들은 변동성이 크고 60일선을 추세선으로 파악할 것

import { loadCrypto } from "../data/dataLoader.js";
import { calculateSMA } from "../indicators/movingAverage.js";
import { calculateMAOscillator } from "../indicators/maOscillator.js";
import { calculateRSI } from "../indicators/rsi.js";           // 유지
import { calculateMACD } from "../indicators/macd.js";          // [+] MACD 추가
import observeAndSyncPriceAxisWidth from "../sync/priceAxisSync.js";
import {
    baseChartOptions, createTitleOverlay, setInitialVisibleRange,
    linkTimeScalesOneWay, padWithWhitespace
} from "./_common.js";

const NAME_KO = {
    BTC: "비트코인", ETH: "이더리움", SOL: "솔라나", XRP: "엑스알피",
    XLM: "스텔라루멘", HBAR: "헤데라", ADA: "에이다", AAVE: "에이브",
    LINK: "체인링크", DOGE: "도지코인", AVAX: "아발란체", DOT: "폴카닷",
    TRX: "트론", SUI: "수이", ONDO: "온도파이낸스", IOTA: "아이오타",
    VET: "비체인", POL: "폴리곤", APT: "앱토스", ARB: "아비트럼",
    NEO: "네오", SHIB: "시바이누",
};

const BARS_MONTH = 72;
const BARS_DAILY = 160;

export async function mountDualMonthlyDaily({ mainRoot, symbol = "BTC", exchange = "upbit" }) {
    const LWC = window.LightweightCharts;
    if (!LWC) { mainRoot.innerHTML = '<p style="color:#f66">LightweightCharts 로드 실패</p>'; return () => { }; }

    mainRoot.innerHTML = `
  <div id="dual-root" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;height:100%;">
    <div id="dual-month" style="display:grid;grid-template-rows:3fr 1fr;gap:6px;min-height:120px;">
      <div id="dm-main" style="position:relative;"></div>
      <div id="dm-sub"  style="position:relative;"></div>
    </div>
    <div id="dual-daily" style="display:grid;grid-template-rows:3fr 1fr;gap:6px;min-height:120px;">
      <div id="dd-main" style="position:relative;"></div>
      <div id="dd-sub"  style="position:relative;"></div>
    </div>
  </div>`;

    const elMonthMain = mainRoot.querySelector('#dm-main');
    const elMonthSub = mainRoot.querySelector('#dm-sub');
    const elDayMain = mainRoot.querySelector('#dd-main');
    const elDaySub = mainRoot.querySelector('#dd-sub');

    const ko = NAME_KO[symbol] || symbol;
    const quote = exchange === 'upbit' ? 'KRW' : 'USDT';

    const base = baseChartOptions(LWC);

    // 차트 생성
    const chMM = LWC.createChart(elMonthMain, base);
    const chMS = LWC.createChart(elMonthSub, { ...base, rightPriceScale: { borderColor: '#2a2b31', scaleMargins: { top: 0.1, bottom: 0.1 } } });
    const chDM = LWC.createChart(elDayMain, base);
    const chDS = LWC.createChart(elDaySub, { ...base, rightPriceScale: { borderColor: '#2a2b31', scaleMargins: { top: 0.1, bottom: 0.1 } } });

    // 서브 차트는 사용자 스크롤/스케일 비활성
    [chMS, chDS].forEach(c => c.applyOptions({
        handleScroll: false,
        handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false }
    }));

    // 타이틀
    createTitleOverlay(elMonthMain, `${ko} 월봉 (${symbol}/${quote})`);
    createTitleOverlay(elDayMain, `${ko} 일봉 (${symbol}/${quote})`);

    // 데이터
    const [md, dd] = await Promise.all([
        loadCrypto({ symbol, timeframe: "monthly", exchange }),
        loadCrypto({ symbol, timeframe: "daily", exchange }),
    ]);

    const UP = '#26a69a', DOWN = '#ef5350';

    // ── 메인 세트
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
                priceLineVisible: !!def.pl, priceLineStyle: 0, priceLineWidth: 1,
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

    // 월봉 메인: 72/24/12/6/3
    const mm = buildMainSet(chMM, md, [
        { p: 72, color: 'white', w: 2, lastValueVisible: false },
        { p: 24, color: 'red', w: 2, lastValueVisible: false },
        { p: 12, color: 'magenta', w: 3 },
        { p: 6, color: 'darkorange', w: 1, lastValueVisible: false },
        { p: 3, color: 'green', w: 2 },
    ]);

    // 일봉 메인: 240/120/60/20/5
    const dm = buildMainSet(chDM, dd, [
        { p: 240, color: 'magenta', w: 4 },
        { p: 120, color: 'darkorange', w: 1, lastValueVisible: false },
        { p: 60, color: 'green', w: 3 },
        { p: 20, color: 'red', w: 3, pl: true },
        { p: 5, color: 'white', w: 2 },
    ]);

    try { mm.lines.ma6?.applyOptions({ lineStyle: 2 }); } catch { }   //월봉 6개월선을 굵은 점선으로 표현
    try { dm.lines.ma120?.applyOptions({ lineStyle: 2 }); } catch { } //일봉 120일선을 굵은 점선으로 표현

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
    const lgMM = addLegend(elMonthMain, [
        { c: 'white', t: 'MA72' }, { c: 'red', t: 'MA24' }, { c: 'magenta', t: 'MA12' }, { c: 'darkorange', t: 'MA6' }, { c: 'green', t: 'MA3' },
    ]);
    const lgDM = addLegend(elDayMain, [
        { c: 'magenta', t: 'MA240' }, { c: 'darkorange', t: 'MA120' }, { c: 'green', t: 'MA60' }, { c: 'red', t: 'MA20' }, { c: 'white', t: 'MA5' },
    ]);

    // ── 보조: MA_Oscillator (월:3-12, 일:20-60 + 5-60 라인 & 5↔20 마커)
    function buildMAOsc(subChart, candles, fast, slow) {
        const base = subChart.addBaselineSeries({
            baseValue: { type: 'price', price: 0 },
            topFillColor1: 'rgba(0, 128, 0, 0.25)',
            topFillColor2: 'rgba(0, 128, 0, 0.25)',
            bottomFillColor1: 'rgba(255, 0, 0, 0.2)',
            bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
            topLineColor: 'rgba(0,0,0,0)',
            bottomLineColor: 'rgba(0,0,0,0)',
            priceLineVisible: false,
            lastValueVisible: false
        });
        const zero = subChart.addLineSeries({
            color: '#FFD700', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false
        });
        const line = subChart.addLineSeries({ color: 'green', lineWidth: 1 });

        const raw = calculateMAOscillator(candles, fast, slow);
        base.setData(padWithWhitespace(candles, raw));
        line.setData(padWithWhitespace(candles, raw));
        zero.setData(candles.map(c => ({ time: c.time, value: 0 })));

        return { base, zero, line, raw };
    }

    // 월봉 MAOSC (3-12) — 기존 그대로
    const mo = buildMAOsc(chMS, md, 3, 12);
    try { mo.zero.applyOptions({ color: 'magenta' }); } catch { }
    const legendBoxMO = document.createElement('div');
    Object.assign(legendBoxMO.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: '', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    legendBoxMO.innerHTML = `
    <span style="color:#ffffff">MA_Oscillator(</span>
    <span style="color:green">3</span>
    <span style="color:#ffffff">-</span>
    <span style="color:magenta">12</span>
    <span style="color:#ffffff">)</span>
  `;
    elMonthSub.appendChild(legendBoxMO);

    // [수정] 일봉 MAOSC: 20-60(빨강) + 5-60(흰) + 5↔20 교차마커 + 0선(녹색)
    function buildDailyMAOsc(subChart, candles) {
        const base = subChart.addBaselineSeries({
            baseValue: { type: 'price', price: 0 },
            topFillColor1: 'rgba(0, 128, 0, 0.25)',
            topFillColor2: 'rgba(0, 128, 0, 0.25)',
            bottomFillColor1: 'rgba(255, 0, 0, 0.2)',
            bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
            topLineColor: 'rgba(0,0,0,0)',
            bottomLineColor: 'rgba(0,0,0,0)',
            priceLineVisible: false,
            lastValueVisible: false
        });
        const zero = subChart.addLineSeries({ color: 'green', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
        const redLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });          // 20-60
        const whiteLine = subChart.addLineSeries({ color: '#ffffff', lineWidth: 1 });    // 5-60

        // SMA 준비
        const sma5 = calculateSMA(candles, 5);
        const sma20 = calculateSMA(candles, 20);
        const sma60 = calculateSMA(candles, 60);
        const toMap = arr => new Map(arr.filter(x => Number.isFinite(x?.value)).map(x => [x.time, x.value]));
        const m5 = toMap(sma5), m20 = toMap(sma20), m60 = toMap(sma60);

        // 시리즈 계산
        const rawRed = candles
            .map(c => ({ time: c.time, value: (m20.get(c.time) ?? NaN) - (m60.get(c.time) ?? NaN) }))
            .filter(x => Number.isFinite(x.value));
        const rawWhite = candles
            .map(c => ({ time: c.time, value: (m5.get(c.time) ?? NaN) - (m60.get(c.time) ?? NaN) }))
            .filter(x => Number.isFinite(x.value));

        // 5-20 교차 마커
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
        const markers = makeCrossMarkers(rawWhite, rawRed);

        // 반영
        base.setData(padWithWhitespace(candles, rawRed));
        redLine.setData(padWithWhitespace(candles, rawRed));
        whiteLine.setData(padWithWhitespace(candles, rawWhite));
        whiteLine.setMarkers(markers);
        zero.setData(candles.map(c => ({ time: c.time, value: 0 })));

        return { base, zero, redLine, whiteLine, rawRed, rawWhite, markers };
    }

    const do_ = buildDailyMAOsc(chDS, dd);
    const legendBoxDO = document.createElement('div');
    Object.assign(legendBoxDO.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: '', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    legendBoxDO.innerHTML = `
    <span style="color:#ffffff">MA_Oscillator(</span>
    <span style="color:red">20</span>
    <span style="color:#ffffff">-</span>
    <span style="color:green">60</span>
    <span style="color:#ffffff">), </span><span style="color:#ffffff">5</span>
  `;
    elDaySub.appendChild(legendBoxDO);

    // ── RSI(월/일)
    const rsiM = {
        line: chMS.addLineSeries({ color: '#FFD700', lineWidth: 1 }),
        b30: chMS.addLineSeries({ color: 'green', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }),
        b70: chMS.addLineSeries({ color: 'red', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }),
        data: calculateRSI(md, 9)
    };
    const rsiD = {
        line: chDS.addLineSeries({ color: '#FFD700', lineWidth: 1 }),
        b30: chDS.addLineSeries({ color: 'green', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }),
        b70: chDS.addLineSeries({ color: 'red', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }),
        data: calculateRSI(dd, 14)
    };
    function clearRSI_M() { rsiM.line.setData([]); rsiM.b30.setData([]); rsiM.b70.setData([]); }
    function clearRSI_D() { rsiD.line.setData([]); rsiD.b30.setData([]); rsiD.b70.setData([]); }

    const legendBoxRSIM = document.createElement('div');
    Object.assign(legendBoxRSIM.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elMonthSub.appendChild(legendBoxRSIM);
    const legendBoxRSID = document.createElement('div');
    Object.assign(legendBoxRSID.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elDaySub.appendChild(legendBoxRSID);
    function renderRSILegend(boxEl, label, lastVal) {
        if (!Number.isFinite(lastVal)) { boxEl.style.display = 'none'; return; }
        boxEl.innerHTML = `
      <span>${label}: <span style="color:#FFD700">${lastVal.toFixed(1)}</span></span>
      <span style="margin:0 6px;">|</span>
      <span>Zones: <span style="color:green">30</span> / <span style="color:red">70</span></span>
    `;
        boxEl.style.display = '';
    }

    // ── Disparity(월:6, 일:20)
    function buildDisparity(subChart, candles, maPeriod) {
        const base100 = subChart.addLineSeries({
            color: '#FFD700', lineWidth: 1, lineStyle: 0,
            lastValueVisible: false, priceLineVisible: false
        });
        const fill = subChart.addBaselineSeries({
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
    const dispM = buildDisparity(chMS, md, 6);
    const dispD = buildDisparity(chDS, dd, 20);

    const legendDispM = document.createElement('div');
    Object.assign(legendDispM.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    legendDispM.innerHTML = `<span>Disparity(6) • Base <span style="color:#FFD700">100</span></span>`;
    elMonthSub.appendChild(legendDispM);

    const legendDispD = document.createElement('div');
    Object.assign(legendDispD.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    legendDispD.innerHTML = `<span>Disparity(20) • Base <span style="color:#FFD700">100</span></span>`;
    elDaySub.appendChild(legendDispD);

    // ── MACD (월/일)
    function buildMACD(subChart, candles) {
        const macdLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });
        const sigLine = subChart.addLineSeries({ color: 'yellow', lineWidth: 1 });
        const hist = subChart.addHistogramSeries({ base: 0 });
        const { macd, signal, histogram } = calculateMACD(candles);

        const histColored = histogram.map(h => ({
            time: h.time,
            value: h.value,
            color: (h.value >= 0) ? 'rgba(0, 255, 0, 0.5)' : 'rgba(239, 83, 80, 0.5)'
        }));

        macdLine.setData(padWithWhitespace(candles, macd));
        sigLine.setData(padWithWhitespace(candles, signal));
        hist.setData(padWithWhitespace(candles, histColored));

        return { macdLine, sigLine, hist, raw: { macd, signal, histogram: histColored } };
    }
    const macdM = buildMACD(chMS, md);
    const macdD = buildMACD(chDS, dd);

    const legendMACDM = document.createElement('div');
    Object.assign(legendMACDM.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elMonthSub.appendChild(legendMACDM);

    const legendMACDD = document.createElement('div');
    Object.assign(legendMACDD.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elDaySub.appendChild(legendMACDD);

    function renderMACDLegend(boxEl, label, lastM, lastS) {
        if (!Number.isFinite(lastM) || !Number.isFinite(lastS)) { boxEl.style.display = 'none'; return; }
        boxEl.innerHTML = `
      <span>${label}: <span style="color:red">${lastM.toFixed(2)}</span></span>
      <span style="margin:0 6px;">|</span>
      <span>Signal: <span style="color:yellow">${lastS.toFixed(2)}</span></span>
    `;
        boxEl.style.display = '';
    }

    // ── FG Index (월/일)  [데이터: 일봉 only → 월봉 정렬]
    let fgDataDaily = null;
    let fgDataMonthlyAligned = null;

    async function ensureFGData() {
        if (fgDataDaily) return fgDataDaily;
        try {
            const res = await fetch('data/crypto/fg_index/btc_feargreed_merged.json');
            const raw = await res.json();
            fgDataDaily = raw.map(r => ({ time: r.time, value: r.fg_value })).sort((a, b) => a.time - b.time);
        } catch (e) {
            console.error('FG Index load failed:', e);
            fgDataDaily = [];
        }
        return fgDataDaily;
    }
    function alignFGIToMonthlyCandles(monthlyCandles, fgiDaily) {
        if (!monthlyCandles?.length || !fgiDaily?.length) return [];
        const out = [];
        let j = 0;
        for (const c of monthlyCandles) {
            while (j < fgiDaily.length && fgiDaily[j].time <= c.time) j++;
            const pick = fgiDaily[j - 1];
            if (pick) out.push({ time: c.time, value: pick.value });
        }
        return out;
    }
    function buildFG(subChart) {
        const line = subChart.addLineSeries({ color: '#5ee0ff', lineWidth: 1 });
        const b25 = subChart.addLineSeries({ color: '#7CFC00', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        const b75 = subChart.addLineSeries({ color: 'red', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        return { line, b25, b75 };
    }
    const fgM = buildFG(chMS);
    const fgD = buildFG(chDS);

    const legendFGM = document.createElement('div');
    Object.assign(legendFGM.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elMonthSub.appendChild(legendFGM);

    const legendFGD = document.createElement('div');
    Object.assign(legendFGD.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elDaySub.appendChild(legendFGD);

    function renderFGLegend(boxEl, label, last) {
        if (!Number.isFinite(last)) { boxEl.style.display = 'none'; return; }
        boxEl.innerHTML = `
      <span>${label}: <span style="color:#5ee0ff">${last.toFixed(0)}</span></span>
      <span style="margin:0 6px;">|</span>
      <span>Bands: <span style="color:#7CFC00">25</span> / <span style="color:red">75</span></span>
    `;
        boxEl.style.display = '';
    }

    // ── 펄스(기존 MAOSC/RSI용)
    (function ensurePulseStyle() {
        const id = 'l2fm-osc-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            st.textContent = `
@keyframes l2fmOscPulse {
  0% { box-shadow:0 0 0 0 rgba(255,215,0,.65); opacity:1; }
  70%{ box-shadow:0 0 0 12px rgba(255,215,0,0); opacity:.85; }
 100%{ box-shadow:0 0 0 0 rgba(255,215,0,0); opacity:.85; } }`;
            document.head.appendChild(st);
        }
    })();

    // ── [신규] Disparity용 주황 펄스 스타일
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

    // ── [신규] FG_Index용 펄스 스타일 (하늘색)
    (function ensureFGPulseStyle() {
        const id = 'l2fm-fg-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            st.textContent = `@keyframes l2fmFGPulse{
  0%{box-shadow:0 0 0 0 rgba(94,224,255,.65);opacity:1;}
  70%{box-shadow:0 0 0 12px rgba(94,224,255,0);opacity:.85;}
  100%{box-shadow:0 0 0 0 rgba(94,224,255,0);opacity:.85;}
}`;
            document.head.appendChild(st);
        }
    })();

    function makeDot(hostEl) {
        const d = document.createElement('div');
        Object.assign(d.style, {
            position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
            background: '#FFD700', pointerEvents: 'none', zIndex: 6,
            animation: 'l2fmOscPulse 1.6s ease-out infinite', left: '-9999px', top: '-9999px'
        });
        hostEl.appendChild(d);
        return d;
    }
    // [신규] Disparity 전용 dot (주황)
    function makeDispDot(hostEl) {
        const d = document.createElement('div');
        Object.assign(d.style, {
            position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
            background: '#FFB74D', pointerEvents: 'none', zIndex: 6,
            animation: 'l2fmDISPPulse 1.6s ease-out infinite', left: '-9999px', top: '-9999px'
        });
        hostEl.appendChild(d);
        return d;
    }
    // [신규] FG 전용 dot (하늘색)
    function makeFGDot(hostEl) {
        const d = document.createElement('div');
        Object.assign(d.style, {
            position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
            background: '#5ee0ff', pointerEvents: 'none', zIndex: 6,
            animation: 'l2fmFGPulse 1.6s ease-out infinite', left: '-9999px', top: '-9999px'
        });
        hostEl.appendChild(d);
        return d;
    }

    const dotMO = makeDot(elMonthSub);
    const dotDO = makeDot(elDaySub);
    const dotDISPM = makeDispDot(elMonthSub);
    const dotDISPD = makeDispDot(elDaySub);
    // [신규] FG dots
    const dotFGM = makeFGDot(elMonthSub);
    const dotFGD = makeFGDot(elDaySub);

    function placeDot(subChart, series, data, dot) {
        if (!data?.length) { dot.style.left = dot.style.top = '-9999px'; return; }
        const last = data[data.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = series.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            dot.style.left = (x - 4) + 'px';
            dot.style.top = (y - 4) + 'px';
        } else {
            dot.style.left = dot.style.top = '-9999px';
        }
    }

    // 상태
    let monthSubCurrent = 'MAOSC';
    let daySubCurrent = 'MAOSC';

    // ▶ 펄스 위치 갱신(활성 보조지표)
    const posMO = () => {
        if (monthSubCurrent === 'MAOSC') return placeDot(chMS, mo.line, mo.raw, dotMO);
        if (monthSubCurrent === 'RSI') return placeDot(chMS, rsiM.line, rsiM.data, dotMO);
        dotMO.style.left = dotMO.style.top = '-9999px';
    };
    const posDO = () => {
        if (daySubCurrent === 'MAOSC') return placeDot(chDS, do_.redLine, do_.rawRed, dotDO); // 변경: 빨강선 기준
        if (daySubCurrent === 'RSI') return placeDot(chDS, rsiD.line, rsiD.data, dotDO);
        dotDO.style.left = dotDO.style.top = '-9999px';
    };
    // Disparity 전용 위치 갱신
    const posDISPM = () => {
        if (monthSubCurrent !== 'DISP') { dotDISPM.style.left = dotDISPM.style.top = '-9999px'; return; }
        placeDot(chMS, dispM.line, dispM.raw, dotDISPM);
    };
    const posDISPD = () => {
        if (daySubCurrent !== 'DISP') { dotDISPD.style.left = dotDISPD.style.top = '-9999px'; return; }
        placeDot(chDS, dispD.line, dispD.raw, dotDISPD);
    };
    // [신규] FG 전용 위치 갱신
    const posFGM = () => {
        if (monthSubCurrent !== 'FG' || !fgDataMonthlyAligned?.length) { dotFGM.style.left = dotFGM.style.top = '-9999px'; return; }
        placeDot(chMS, fgM.line, fgDataMonthlyAligned, dotFGM);
    };
    const posFGD = () => {
        if (daySubCurrent !== 'FG' || !fgDataDaily?.length) { dotFGD.style.left = dotFGD.style.top = '-9999px'; return; }
        placeDot(chDS, fgD.line, fgDataDaily, dotFGD);
    };

    posMO(); posDO(); posDISPM(); posDISPD(); posFGM(); posFGD();

    // ── 링크/동기화
    const linkM = linkTimeScalesOneWay(chMM, chMS);
    const linkD = linkTimeScalesOneWay(chDM, chDS);
    const paLeft = observeAndSyncPriceAxisWidth([{ chart: chMM, container: elMonthMain }, { chart: chMS, container: elMonthSub }]);
    const paRight = observeAndSyncPriceAxisWidth([{ chart: chDM, container: elDayMain }, { chart: chDS, container: elDaySub }]);

    // 초기 범위
    setInitialVisibleRange(chMM, md, BARS_MONTH);
    setInitialVisibleRange(chMS, md, BARS_MONTH);
    setInitialVisibleRange(chDM, dd, BARS_DAILY);
    setInitialVisibleRange(chDS, dd, BARS_DAILY);

    const onMonthDbl = () => { setInitialVisibleRange(chMM, md, BARS_MONTH); setTimeout(() => { posMO(); posDISPM(); posFGM(); }, 0); };
    const onDailyDbl = () => { setInitialVisibleRange(chDM, dd, BARS_DAILY); setTimeout(() => { posDO(); posDISPD(); posFGD(); }, 0); };
    elMonthMain.addEventListener('dblclick', onMonthDbl);
    elDayMain.addEventListener('dblclick', onDailyDbl);

    const unsubs = [];
    function bindReposition(subChart, posFn) {
        try {
            const ts = subChart.timeScale();
            const onRange = () => posFn();
            ts.subscribeVisibleTimeRangeChange(onRange);
            unsubs.push(() => ts.unsubscribeVisibleTimeRangeChange(onRange));
        } catch { }
        try {
            const ps = subChart.priceScale('right');
            if (ps?.subscribeSizeChange) {
                const onSize = () => posFn();
                ps.subscribeSizeChange(onSize);
                unsubs.push(() => ps.unsubscribeSizeChange(onSize));
            }
        } catch { }
        const ro = new ResizeObserver(() => posFn());
        try { ro.observe(subChart?.chartElement || subChart); } catch { }
        unsubs.push(() => { try { ro.disconnect(); } catch { } });
    }
    bindReposition(chMS, posMO);
    bindReposition(chDS, posDO);
    bindReposition(chMS, posDISPM);
    bindReposition(chDS, posDISPD);
    // [신규] FG 재배치 구독
    bindReposition(chMS, posFGM);
    bindReposition(chDS, posFGD);

    // ── 툴바
    const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
    const btnTrend = document.querySelector('.main-toolbar [data-action="trendline"]');
    const btnMAO = document.querySelector('.main-toolbar [data-action="ma_oscillator"]');
    const btnRSI = document.querySelector('.main-toolbar [data-action="rsi"]');
    const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');
    const btnMACD = document.querySelector('.main-toolbar [data-action="macd"]');     // [+]
    const btnFG = document.querySelector('.main-toolbar [data-action="fg_index"]'); // [+]

    const setActive = (btn, on) => { if (!btn) return; on ? btn.classList.add('active-preset') : btn.classList.remove('active-preset'); };

    // 생명선/추세선 (기존 유지)
    const LIFE_RED = 'red', LIFE_YELLOW = '#FFD700';
    let lifeOn = false, lifeTimer = null, lifeFlip = false;
    function setLifeColor(c) { try { dm.lines.ma20.applyOptions({ color: c }); } catch { } }
    function startLife() {
        lifeOn = true; setActive(btnLife, true); setLifeColor(LIFE_YELLOW);
        lifeTimer = setInterval(() => { lifeFlip = !lifeFlip; setLifeColor(lifeFlip ? LIFE_RED : LIFE_YELLOW); }, 1500);
    }
    function stopLife() {
        lifeOn = false; setActive(btnLife, false); if (lifeTimer) { clearInterval(lifeTimer); lifeTimer = null; }
        setLifeColor(LIFE_RED);
    }
    const onLife = () => lifeOn ? stopLife() : startLife();

    const TREND_GREEN = 'green', TREND_LIGHT = '#7CFC00';
    let trendOn = false, trendTimer = null, trendFlip = false;
    function setTrendColor(c) { try { dm.lines.ma60.applyOptions({ color: c }); } catch { } }
    function startTrend() {
        trendOn = true; setActive(btnTrend, true); setTrendColor(TREND_LIGHT);
        trendTimer = setInterval(() => { trendFlip = !trendFlip; setTrendColor(trendFlip ? TREND_GREEN : TREND_LIGHT); }, 1500);
    }
    function stopTrend() {
        trendOn = false; setActive(btnTrend, false); if (trendTimer) { clearInterval(trendTimer); } trendTimer = null;
        setTrendColor(TREND_GREEN);
    }
    const onTrend = () => trendOn ? stopTrend() : startTrend();

    // 실제 바인딩
    btnLife?.addEventListener('click', onLife);
    btnTrend?.addEventListener('click', onTrend);

    // ── 보조지표 표시/숨김 helper
    function showMonthMAOSC() {
        mo.base.setData(padWithWhitespace(md, mo.raw));
        mo.line.setData(padWithWhitespace(md, mo.raw));
        mo.zero.setData(md.map(c => ({ time: c.time, value: 0 })));
        clearRSI_M();
        // Disparity clear / MACD clear / FG clear
        dispM.base100.setData([]); dispM.fill.setData([]); dispM.line.setData([]);
        macdM.macdLine.setData([]); macdM.sigLine.setData([]); macdM.hist.setData([]);
        fgM.line.setData([]); fgM.b25.setData([]); fgM.b75.setData([]);
        legendBoxMO.style.display = '';
        legendBoxRSIM.style.display = 'none';
        legendDispM.style.display = 'none';
        legendMACDM.style.display = 'none';
        legendFGM.style.display = 'none';
        // dots
        posMO(); dotDISPM.style.left = dotDISPM.style.top = '-9999px'; dotFGM.style.left = dotFGM.style.top = '-9999px';
    }
    function showDayMAOSC() {
        // [변경] 일봉 MAOSC 복구 시 빨강/흰/0/마커 모두 복원
        do_.base.setData(padWithWhitespace(dd, do_.rawRed));
        do_.redLine.setData(padWithWhitespace(dd, do_.rawRed));
        do_.whiteLine.setData(padWithWhitespace(dd, do_.rawWhite));
        do_.whiteLine.setMarkers(do_.markers);
        do_.zero.setData(dd.map(c => ({ time: c.time, value: 0 })));
        clearRSI_D();
        dispD.base100.setData([]); dispD.fill.setData([]); dispD.line.setData([]);
        macdD.macdLine.setData([]); macdD.sigLine.setData([]); macdD.hist.setData([]);
        fgD.line.setData([]); fgD.b25.setData([]); fgD.b75.setData([]);
        legendBoxDO.style.display = '';
        legendBoxRSID.style.display = 'none';
        legendDispD.style.display = 'none';
        legendMACDD.style.display = 'none';
        legendFGD.style.display = 'none';
        posDO(); dotDISPD.style.left = dotDISPD.style.top = '-9999px'; dotFGD.style.left = dotFGD.style.top = '-9999px';
    }

    function showMonthRSI() {
        rsiM.line.setData(padWithWhitespace(md, rsiM.data));
        rsiM.b30.setData(md.map(c => ({ time: c.time, value: 30 })));
        rsiM.b70.setData(md.map(c => ({ time: c.time, value: 70 })));
        mo.base.setData([]); mo.line.setData([]); mo.zero.setData([]);
        dispM.base100.setData([]); dispM.fill.setData([]); dispM.line.setData([]);
        macdM.macdLine.setData([]); macdM.sigLine.setData([]); macdM.hist.setData([]);
        fgM.line.setData([]); fgM.b25.setData([]); fgM.b75.setData([]);
        const last = rsiM.data?.[rsiM.data.length - 1]?.value;
        renderRSILegend(legendBoxRSIM, 'RSI(9)', last);
        legendBoxMO.style.display = 'none';
        legendDispM.style.display = 'none';
        legendMACDM.style.display = 'none';
        legendFGM.style.display = 'none';
        // dots
        posMO(); dotDISPM.style.left = dotDISPM.style.top = '-9999px'; dotFGM.style.left = dotFGM.style.top = '-9999px';
    }
    function showDayRSI() {
        rsiD.line.setData(padWithWhitespace(dd, rsiD.data));
        rsiD.b30.setData(dd.map(c => ({ time: c.time, value: 30 })));
        rsiD.b70.setData(dd.map(c => ({ time: c.time, value: 70 })));
        // [변경] 일봉 MAOSC 모두 클리어 (line→red/white/markers로 대체)
        do_.base.setData([]); do_.redLine.setData([]); do_.whiteLine.setData([]); do_.whiteLine.setMarkers([]); do_.zero.setData([]);
        dispD.base100.setData([]); dispD.fill.setData([]); dispD.line.setData([]);
        macdD.macdLine.setData([]); macdD.sigLine.setData([]); macdD.hist.setData([]);
        fgD.line.setData([]); fgD.b25.setData([]); fgD.b75.setData([]);
        const last = rsiD.data?.[rsiD.data.length - 1]?.value;
        renderRSILegend(legendBoxRSID, 'RSI(14)', last);
        legendBoxDO.style.display = 'none';
        legendDispD.style.display = 'none';
        legendMACDD.style.display = 'none';
        legendFGD.style.display = 'none';
        posDO(); dotDISPD.style.left = dotDISPD.style.top = '-9999px'; dotFGD.style.left = dotFGD.style.top = '-9999px';
    }

    function showMonthDISP() {
        dispM.base100.setData(md.map(c => ({ time: c.time, value: 100 })));
        mo.base.setData([]); mo.line.setData([]); mo.zero.setData([]);
        clearRSI_M();
        macdM.macdLine.setData([]); macdM.sigLine.setData([]); macdM.hist.setData([]);
        fgM.line.setData([]); fgM.b25.setData([]); fgM.b75.setData([]);
        legendDispM.style.display = '';
        legendBoxMO.style.display = 'none';
        legendBoxRSIM.style.display = 'none';
        legendMACDM.style.display = 'none';
        legendFGM.style.display = 'none';
        // 이격도 라인/채움 (가시성)
        dispM.fill.setData(padWithWhitespace(md, dispM.raw));
        dispM.line.setData(padWithWhitespace(md, dispM.raw));
        // dots
        dotMO.style.left = dotMO.style.top = '-9999px';
        dotFGM.style.left = dotFGM.style.top = '-9999px';
        posDISPM();
    }
    function showDayDISP() {
        dispD.base100.setData(dd.map(c => ({ time: c.time, value: 100 })));
        // [변경] 일봉 MAOSC 클리어
        do_.base.setData([]); do_.redLine.setData([]); do_.whiteLine.setData([]); do_.whiteLine.setMarkers([]); do_.zero.setData([]);
        clearRSI_D();
        macdD.macdLine.setData([]); macdD.sigLine.setData([]); macdD.hist.setData([]);
        fgD.line.setData([]); fgD.b25.setData([]); fgD.b75.setData([]);
        legendDispD.style.display = '';
        legendBoxDO.style.display = 'none';
        legendBoxRSID.style.display = 'none';
        legendMACDD.style.display = 'none';
        legendFGD.style.display = 'none';
        dispD.fill.setData(padWithWhitespace(dd, dispD.raw));
        dispD.line.setData(padWithWhitespace(dd, dispD.raw));
        dotDO.style.left = dotDO.style.top = '-9999px';
        dotFGD.style.left = dotFGD.style.top = '-9999px';
        posDISPD();
    }

    // MACD
    function clearMACD_M() { macdM.macdLine.setData([]); macdM.sigLine.setData([]); macdM.hist.setData([]); }
    function clearMACD_D() { macdD.macdLine.setData([]); macdD.sigLine.setData([]); macdD.hist.setData([]); }
    function showMonthMACD() {
        macdM.macdLine.setData(padWithWhitespace(md, macdM.raw.macd));
        macdM.sigLine.setData(padWithWhitespace(md, macdM.raw.signal));
        macdM.hist.setData(padWithWhitespace(md, macdM.raw.histogram));
        mo.base.setData([]); mo.line.setData([]); mo.zero.setData([]);
        clearRSI_M();
        dispM.base100.setData([]); dispM.fill.setData([]); dispM.line.setData([]);
        fgM.line.setData([]); fgM.b25.setData([]); fgM.b75.setData([]);
        const mLast = macdM.raw.macd.at(-1)?.value, sLast = macdM.raw.signal.at(-1)?.value;
        renderMACDLegend(legendMACDM, 'MACD(12,26,9)', mLast, sLast);
        legendBoxMO.style.display = 'none';
        legendBoxRSIM.style.display = 'none';
        legendDispM.style.display = 'none';
        legendFGM.style.display = 'none';
        dotMO.style.left = dotMO.style.top = '-9999px';
        dotDISPM.style.left = dotDISPM.style.top = '-9999px';
        dotFGM.style.left = dotFGM.style.top = '-9999px';
    }
    function showDayMACD() {
        macdD.macdLine.setData(padWithWhitespace(dd, macdD.raw.macd));
        macdD.sigLine.setData(padWithWhitespace(dd, macdD.raw.signal));
        macdD.hist.setData(padWithWhitespace(dd, macdD.raw.histogram));
        // [변경] 일봉 MAOSC 클리어
        do_.base.setData([]); do_.redLine.setData([]); do_.whiteLine.setData([]); do_.whiteLine.setMarkers([]); do_.zero.setData([]);
        clearRSI_D();
        dispD.base100.setData([]); dispD.fill.setData([]); dispD.line.setData([]);
        fgD.line.setData([]); fgD.b25.setData([]); fgD.b75.setData([]);
        const mLast = macdD.raw.macd.at(-1)?.value, sLast = macdD.raw.signal.at(-1)?.value;
        renderMACDLegend(legendMACDD, 'MACD(12,26,9)', mLast, sLast);
        legendBoxDO.style.display = 'none';
        legendBoxRSID.style.display = 'none';
        legendDispD.style.display = 'none';
        legendFGD.style.display = 'none';
        dotDO.style.left = dotDO.style.top = '-9999px';
        dotDISPD.style.left = dotDISPD.style.top = '-9999px';
        dotFGD.style.left = dotFGD.style.top = '-9999px';
    }

    // FG
    function clearFG_M() { fgM.line.setData([]); fgM.b25.setData([]); fgM.b75.setData([]); }
    function clearFG_D() { fgD.line.setData([]); fgD.b25.setData([]); fgD.b75.setData([]); }
    async function showMonthFG() {
        const dataDaily = await ensureFGData();
        if (!fgDataMonthlyAligned) fgDataMonthlyAligned = alignFGIToMonthlyCandles(md, dataDaily);
        fgM.line.setData(padWithWhitespace(md, fgDataMonthlyAligned));
        fgM.b25.setData(md.map(c => ({ time: c.time, value: 25 })));
        fgM.b75.setData(md.map(c => ({ time: c.time, value: 75 })));
        mo.base.setData([]); mo.line.setData([]); mo.zero.setData([]);
        clearRSI_M(); clearMACD_M();
        dispM.base100.setData([]); dispM.fill.setData([]); dispM.line.setData([]);
        const last = fgDataMonthlyAligned.at(-1)?.value;
        renderFGLegend(legendFGM, 'FG Index', last);
        legendBoxMO.style.display = 'none';
        legendBoxRSIM.style.display = 'none';
        legendDispM.style.display = 'none';
        legendMACDM.style.display = 'none';
        // dots
        dotMO.style.left = dotMO.style.top = '-9999px';
        dotDISPM.style.left = dotDISPM.style.top = '-9999px';
        posFGM();
    }
    async function showDayFG() {
        const dataDaily = await ensureFGData();
        fgD.line.setData(padWithWhitespace(dd, dataDaily));
        fgD.b25.setData(dd.map(c => ({ time: c.time, value: 25 })));
        fgD.b75.setData(dd.map(c => ({ time: c.time, value: 75 })));
        // [변경] 일봉 MAOSC 클리어
        do_.base.setData([]); do_.redLine.setData([]); do_.whiteLine.setData([]); do_.whiteLine.setMarkers([]); do_.zero.setData([]);
        clearRSI_D(); clearMACD_D();
        dispD.base100.setData([]); dispD.fill.setData([]); dispD.line.setData([]);
        const last = dataDaily.at(-1)?.value;
        renderFGLegend(legendFGD, 'FG Index', last);
        legendBoxDO.style.display = 'none';
        legendBoxRSID.style.display = 'none';
        legendDispD.style.display = 'none';
        legendMACDD.style.display = 'none';
        // dots
        dotDO.style.left = dotDO.style.top = '-9999px';
        dotDISPD.style.left = dotDISPD.style.top = '-9999px';
        posFGD();
    }

    // 초기
    showMonthMAOSC();
    showDayMAOSC();

    // 활성표시
    function syncToolbarActive() {
        setActive(btnMAO, (monthSubCurrent === 'MAOSC' || daySubCurrent === 'MAOSC'));
        setActive(btnRSI, (monthSubCurrent === 'RSI' || daySubCurrent === 'RSI'));
        setActive(btnDISP, (monthSubCurrent === 'DISP' || daySubCurrent === 'DISP'));
        setActive(btnMACD, (monthSubCurrent === 'MACD' || daySubCurrent === 'MACD'));
        setActive(btnFG, (monthSubCurrent === 'FG' || daySubCurrent === 'FG'));
    }
    syncToolbarActive();

    // 싱글/더블 유틸
    function bindSingleVsDouble(btn, onSingle, onDouble, delay = 220) {
        if (!btn) return () => { };
        let timer = null;
        const handler = () => {
            if (timer) { clearTimeout(timer); timer = null; onDouble?.(); return; }
            timer = setTimeout(() => { timer = null; onSingle?.(); }, delay);
        };
        btn.addEventListener('click', handler);
        return () => btn.removeEventListener('click', handler);
    }

    // MA_Oscillator
    const offMAO = bindSingleVsDouble(
        btnMAO,
        () => { showMonthMAOSC(); showDayMAOSC(); monthSubCurrent = 'MAOSC'; daySubCurrent = 'MAOSC'; syncToolbarActive(); posMO(); posDO(); posDISPM(); posDISPD(); posFGM(); posFGD(); },
        () => { showDayMAOSC(); daySubCurrent = 'MAOSC'; syncToolbarActive(); posDO(); posDISPD(); posFGD(); }
    );

    // RSI
    const offRSI = bindSingleVsDouble(
        btnRSI,
        () => { showMonthRSI(); showDayRSI(); monthSubCurrent = 'RSI'; daySubCurrent = 'RSI'; syncToolbarActive(); posMO(); posDO(); posDISPM(); posDISPD(); posFGM(); posFGD(); },
        () => { showDayRSI(); daySubCurrent = 'RSI'; syncToolbarActive(); posDO(); posDISPD(); posFGD(); }
    );

    // Disparity
    const offDISP = bindSingleVsDouble(
        btnDISP,
        () => { showMonthDISP(); showDayDISP(); monthSubCurrent = 'DISP'; daySubCurrent = 'DISP'; syncToolbarActive(); posDISPM(); posDISPD(); },
        () => { showDayDISP(); daySubCurrent = 'DISP'; syncToolbarActive(); posDISPD(); }
    );

    // MACD
    const offMACD = bindSingleVsDouble(
        btnMACD,
        () => { showMonthMACD(); showDayMACD(); monthSubCurrent = 'MACD'; daySubCurrent = 'MACD'; syncToolbarActive(); posMO(); posDO(); posDISPM(); posDISPD(); posFGM(); posFGD(); },
        () => { showDayMACD(); daySubCurrent = 'MACD'; syncToolbarActive(); posDO(); posDISPD(); posFGD(); }
    );

    // FG Index
    const offFG = bindSingleVsDouble(
        btnFG,
        () => { showMonthFG(); showDayFG(); monthSubCurrent = 'FG'; daySubCurrent = 'FG'; syncToolbarActive(); posFGM(); posFGD(); },
        () => { showDayFG(); daySubCurrent = 'FG'; syncToolbarActive(); posFGD(); }
    );

    // 정리
    return () => {
        btnLife?.removeEventListener('click', onLife);
        btnTrend?.removeEventListener('click', onTrend);
        offMAO?.(); offRSI?.(); offDISP?.(); offMACD?.(); offFG?.();

        setActive(btnMAO, false);
        setActive(btnRSI, false);
        setActive(btnDISP, false);
        setActive(btnMACD, false);
        setActive(btnFG, false);

        elMonthMain.removeEventListener('dblclick', onMonthDbl);
        elDayMain.removeEventListener('dblclick', onDailyDbl);

        try { elMonthSub.removeChild(legendBoxMO); } catch { }
        try { elDaySub.removeChild(legendBoxDO); } catch { }
        try { elMonthSub.removeChild(legendBoxRSIM); } catch { }
        try { elDaySub.removeChild(legendBoxRSID); } catch { }
        try { elMonthSub.removeChild(legendDispM); } catch { }
        try { elDaySub.removeChild(legendDispD); } catch { }
        try { elMonthSub.removeChild(legendMACDM); } catch { }
        try { elDaySub.removeChild(legendMACDD); } catch { }
        try { elMonthSub.removeChild(legendFGM); } catch { }
        try { elDaySub.removeChild(legendFGD); } catch { }

        try { elMonthSub.removeChild(dotMO); } catch { }
        try { elDaySub.removeChild(dotDO); } catch { }
        try { elMonthSub.removeChild(dotDISPM); } catch { }
        try { elDaySub.removeChild(dotDISPD); } catch { }
        try { elMonthSub.removeChild(dotFGM); } catch { }
        try { elDaySub.removeChild(dotFGD); } catch { }

        try { elMonthMain.removeChild(lgMM); } catch { }
        try { elDayMain.removeChild(lgDM); } catch { }

        try { linkM?.dispose?.(); } catch { }
        try { linkD?.dispose?.(); } catch { }
        try { paLeft?.dispose?.(); } catch { }
        try { paRight?.dispose?.(); } catch { }
        unsubs.forEach(fn => { try { fn(); } catch { } });

        try { chMM.remove(); } catch { }
        try { chMS.remove(); } catch { }
        try { chDM.remove(); } catch { }
        try { chDS.remove(); } catch { }
    };
}

export function dispose() { }
