// Listen2FM_Viewer/plugins/economic/preset/singleDaily.js

import { loadUST10YDaily } from "../data/dataLoader.js";
import { calculateRSI } from "../../crypto/indicators/rsi.js";
import { calculateMACD } from "../../crypto/indicators/macd.js";
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import { calculateMAOscillator } from "../../crypto/indicators/maOscillator.js";
import observeAndSyncPriceAxisWidth from "../../crypto/sync/priceAxisSync.js";

// 공용 차트 유틸 (_common.js를 나중에 shared로 옮겨도 됨)
import {
    baseChartOptions, linkTimeScalesOneWay, padWithWhitespace,
    setInitialVisibleRange, createTitleOverlay
} from "../../crypto/preset/_common.js";

// ★ 변경: 초기 화면에서 최근 360봉 고정
const INITIAL_BARS = 360;

// ─────────────────────────────────────────────
// MA20 기울기(각도) 분류 설정 (원하시면 조절)
// lookback: 기울기 계산 간격(봉 수), tol: 수평 판단 허용 오차
// ─────────────────────────────────────────────
const MA20_ANGLE_LOOKBACK = 1;
const MA20_ANGLE_TOL = 0.0015; // 약 0.0015포인트(수평 판단 허용치)

export async function mountEconSingleDaily({ mainRoot }) {
    const LWC = window.LightweightCharts;
    if (!LWC) { mainRoot.innerHTML = '<p style="color:#f66">LightweightCharts 로드 실패</p>'; return () => { }; }

    mainRoot.innerHTML = `
    <div style="display:grid;grid-template-rows:4fr 1fr;gap:6px;height:100%;">
      <div id="econ-main" style="min-height:120px; position:relative;"></div>
      <div id="econ-sub"  style="min-height:90px;  position:relative;"></div>
    </div>`;
    const elMain = mainRoot.querySelector('#econ-main');
    const elSub = mainRoot.querySelector('#econ-sub');

    createTitleOverlay(elMain, '미국 10년물 국채금리 (US10Y)');

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

    const candles = await loadUST10YDaily();
    const UP = '#26a69a', DOWN = '#ef5350';

    // 볼륨
    const vol = mainChart.addHistogramSeries({
        priceScaleId: 'vol', priceFormat: { type: 'volume' },
        priceLineVisible: false, lastValueVisible: false,
    });
    vol.setData(candles.map(c => ({ time: c.time, value: c.volume || 0, color: (c.close >= c.open) ? UP : DOWN })));
    mainChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

    // MA
    const ma240 = mainChart.addLineSeries({ color: 'magenta', lineWidth: 4, priceLineVisible: false });
    const ma120 = mainChart.addLineSeries({ color: 'darkorange', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const ma060 = mainChart.addLineSeries({ color: 'green', lineWidth: 3, priceLineVisible: false });
    const ma020 = mainChart.addLineSeries({ color: 'red', lineWidth: 3, priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1, priceLineColor: 'red' });
    const ma005 = mainChart.addLineSeries({ color: 'white', lineWidth: 2, priceLineVisible: false });

    ma240.setData(calculateSMA(candles, 240));
    ma120.setData(calculateSMA(candles, 120));
    ma060.setData(calculateSMA(candles, 60));
    // ★ 동일 배열 재사용: 분산 계산/각도 색상 모두에서 활용
    const ma20Arr = calculateSMA(candles, 20);
    ma020.setData(ma20Arr);
    ma005.setData(calculateSMA(candles, 5));

    // 120일선 점선
    ma120.applyOptions({ lineStyle: 2 });

    // ★ 추가: 메인차트 좌측 상단 MA 레전드
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

    // 캔들
    const candle = mainChart.addCandlestickSeries({
        upColor: UP, downColor: DOWN, borderDownColor: DOWN, borderUpColor: UP,
        wickDownColor: DOWN, wickUpColor: UP,
        priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
        priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1
    });
    candle.setData(candles);
    try {
        const last = candles[candles.length - 1];
        candle.applyOptions({ priceLineColor: last && last.close >= last.open ? UP : DOWN });
    } catch { }

    // ─────────────────────────────────────────────
    // ★★★ MA20 각도 색상 시리즈(세그먼트) 준비 — 처음엔 숨김
    // up(우상향)=초록, flat(수평)=회색, down(우하향)=빨강
    // ─────────────────────────────────────────────
    const ma20UpSeries = mainChart.addLineSeries({ color: '#22c55e', lineWidth: 3, priceLineVisible: false, visible: false });
    const ma20FlatSeries = mainChart.addLineSeries({ color: '#9ca3af', lineWidth: 3, priceLineVisible: false, visible: false });
    const ma20DownSeries = mainChart.addLineSeries({ color: '#ef4444', lineWidth: 3, priceLineVisible: false, visible: false });

    // 분류용 헬퍼: whitespace 데이터로 “단절”을 만들어 브릿지 방지
    function buildMa20AngleSegments(ma, lookback = MA20_ANGLE_LOOKBACK, tol = MA20_ANGLE_TOL) {
        const up = [], flat = [], down = [];
        for (let i = 0; i < ma.length; i++) {
            const t = ma[i].time;
            const v = ma[i].value;
            const prev = i >= lookback ? ma[i - lookback].value : undefined;

            if (!Number.isFinite(v) || !Number.isFinite(prev)) {
                up.push({ time: t });
                flat.push({ time: t });
                down.push({ time: t });
                continue;
            }

            const dv = v - prev;
            if (dv > tol) {
                up.push({ time: t, value: v });
                flat.push({ time: t });
                down.push({ time: t });
            } else if (dv < -tol) {
                up.push({ time: t });
                flat.push({ time: t });
                down.push({ time: t, value: v });
            } else {
                up.push({ time: t });
                flat.push({ time: t, value: v });
                down.push({ time: t });
            }
        }
        return { up, flat, down };
    }

    let angleOn = false;
    function enableMa20AngleColoring() {
        const { up, flat, down } = buildMa20AngleSegments(ma20Arr);
        ma20UpSeries.setData(up);
        ma20FlatSeries.setData(flat);
        ma20DownSeries.setData(down);

        ma020.applyOptions({ visible: false });         // 원본 MA20 숨김
        ma20UpSeries.applyOptions({ visible: true });
        ma20FlatSeries.applyOptions({ visible: true });
        ma20DownSeries.applyOptions({ visible: true });
    }
    function disableMa20AngleColoring() {
        ma20UpSeries.applyOptions({ visible: false });
        ma20FlatSeries.applyOptions({ visible: false });
        ma20DownSeries.applyOptions({ visible: false });
        ma020.applyOptions({ visible: true });          // 원본 MA20 복귀
    }

    // 보조지표
    const rsiLine = subChart.addLineSeries({ color: '#FFD700', lineWidth: 1 });
    const rsiB30 = subChart.addLineSeries({ color: 'green', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const rsiB70 = subChart.addLineSeries({ color: 'red', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

    const macdLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });
    const sigLine = subChart.addLineSeries({ color: 'yellow', lineWidth: 1 });
    const hist = subChart.addHistogramSeries({ base: 0 });

    const maoscFill = subChart.addBaselineSeries({
        baseValue: { type: 'price', price: 0 },
        topFillColor1: 'rgba(0, 128, 0, 0.25)',
        topFillColor2: 'rgba(0, 128, 0, 0.25)',
        bottomFillColor1: 'rgba(255, 0, 0, 0.2)',
        bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
        topLineColor: 'rgba(0,0,0,0)',
        bottomLineColor: 'rgba(0,0,0,0)',
        priceLineVisible: false, lastValueVisible: false,
    });
    const maoscLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });
    const maoscZero = subChart.addLineSeries({ color: 'green', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

    const dispBase100 = subChart.addLineSeries({ color: '#FFD700', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
    const dispFill = subChart.addBaselineSeries({
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
    const dispLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });

    // 계산
    const rsiRaw = calculateRSI(candles, 14);
    const { macd: macdRaw, signal: sigRaw, histogram: histRaw } = calculateMACD(candles);
    const maoscRaw = calculateMAOscillator(candles, 20, 60);

    // ★ 여기서도 위에서 계산한 동일한 ma20Arr을 재사용
    const cMap = new Map(candles.map(c => [c.time, c.close]));
    const dispRaw = ma20Arr
        .filter(m => Number.isFinite(m.value) && cMap.has(m.time))
        .map(m => ({ time: m.time, value: (cMap.get(m.time) / m.value) * 100 }));

    const mapHistColors = items => items.map(h => ({
        time: h.time,
        value: h.value,
        color: (h.value >= 0) ? 'rgba(0, 255, 0, 0.5)' : 'rgba(239, 83, 80, 0.5)',
    }));

    // === ★ 추가: 보조지표 RSI 레전드 + 펄스 점 ===
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

    let current = 'RSI'; // 기본 표시 RSI
    const rsiDot = document.createElement('div');
    Object.assign(rsiDot.style, {
        position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
        background: '#FFD700', pointerEvents: 'none', zIndex: '5',
        animation: 'l2fmPulse 1.6s ease-out infinite',
        left: '-9999px', top: '-9999px'
    });
    elSub.appendChild(rsiDot);

    function positionRSIDot() {
        if (current !== 'RSI' || !rsiRaw.length) { rsiDot.style.left = rsiDot.style.top = '-9999px'; return; }
        const last = rsiRaw[rsiRaw.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = rsiLine.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            rsiDot.style.left = (x - 4) + 'px';
            rsiDot.style.top = (y - 4) + 'px';
        } else {
            rsiDot.style.left = rsiDot.style.top = '-9999px';
        }
    }

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

    // 기본 표시는 RSI
    rsiLine.setData(padWithWhitespace(candles, rsiRaw));
    rsiB30.setData(candles.map(c => ({ time: c.time, value: 30 })));
    rsiB70.setData(candles.map(c => ({ time: c.time, value: 70 })));
    positionRSIDot();
    renderRSILegend();

    function clearSub() {
        rsiLine.setData([]); rsiB30.setData([]); rsiB70.setData([]);
        macdLine.setData([]); sigLine.setData([]); hist.setData([]);
        maoscFill.setData([]); maoscLine.setData([]); maoscZero.setData([]);
        dispFill.setData([]); dispLine.setData([]); dispBase100.setData([]);
        rsiDot.style.left = rsiDot.style.top = '-9999px';
        legendBoxRSI.style.display = 'none';
    }
    function showRSI() {
        current = 'RSI';
        clearSub();
        rsiLine.setData(padWithWhitespace(candles, rsiRaw));
        rsiB30.setData(candles.map(c => ({ time: c.time, value: 30 })));
        rsiB70.setData(candles.map(c => ({ time: c.time, value: 70 })));
        positionRSIDot();
        renderRSILegend();
    }
    function showMACD() {
        current = 'MACD';
        clearSub();
        macdLine.setData(padWithWhitespace(candles, macdRaw));
        sigLine.setData(padWithWhitespace(candles, sigRaw));
        hist.setData(padWithWhitespace(candles, mapHistColors(histRaw)));
    }
    function showMAOSC() {
        current = 'MAOSC';
        clearSub();
        maoscFill.setData(padWithWhitespace(candles, maoscRaw));
        maoscLine.setData(padWithWhitespace(candles, maoscRaw));
        maoscZero.setData(candles.map(c => ({ time: c.time, value: 0 })));
    }
    function showDISP() {
        current = 'DISP';
        clearSub();
        dispFill.setData(padWithWhitespace(candles, dispRaw));
        dispLine.setData(padWithWhitespace(candles, dispRaw));
        dispBase100.setData(candles.map(c => ({ time: c.time, value: 100 })));
    }

    // 툴바 연결(경제지표에서 필요한 버튼만 노출했다고 가정)
    const btnRSI = document.querySelector('.main-toolbar [data-action="rsi"]');
    const btnMACD = document.querySelector('.main-toolbar [data-action="macd"]');
    const btnMAO = document.querySelector('.main-toolbar [data-action="ma_oscillator"]');
    const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');

    // ★★★ "20각도" 버튼: toolbarConfig.js에서 생성/표시 → 여기서는 바인딩만
    const btnAngle = document.querySelector('.main-toolbar [data-action="ma20_angle"]');
    const onAngleToggle = () => {
        angleOn = !angleOn;
        if (angleOn) {
            enableMa20AngleColoring();
            if (btnAngle) btnAngle.style.background = 'rgba(46,229,90,0.25)';
        } else {
            disableMa20AngleColoring();
            if (btnAngle) btnAngle.style.background = '';
        }
    };

    const onRSI = () => showRSI();
    const onMACD = () => showMACD();
    const onMAO = () => showMAOSC();
    const onDISP = () => showDISP();

    btnRSI?.addEventListener('click', onRSI);
    btnMACD?.addEventListener('click', onMACD);
    btnMAO?.addEventListener('click', onMAO);
    btnDISP?.addEventListener('click', onDISP);
    btnAngle?.addEventListener('click', onAngleToggle);

    // 초기 가시범위: 최근 360봉
    setInitialVisibleRange(mainChart, candles, INITIAL_BARS);

    // 더블클릭 시 초기 화면(최근 360봉)으로 복귀
    const onDblClick = () => setInitialVisibleRange(mainChart, candles, INITIAL_BARS);
    elMain.addEventListener('dblclick', onDblClick);

    const tsLink = linkTimeScalesOneWay(mainChart, subChart);
    const paLink = observeAndSyncPriceAxisWidth([{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }]);

    // 화면/축 변화에 따른 RSI 점 재배치
    const unsub = [];
    try {
        const ts = subChart.timeScale();
        const onRange = () => { positionRSIDot(); };
        ts.subscribeVisibleTimeRangeChange(onRange);
        unsub.push(() => ts.unsubscribeVisibleTimeRangeChange(onRange));
    } catch { }
    try {
        const ps = subChart.priceScale('right');
        if (ps?.subscribeSizeChange) {
            const onSize = () => { positionRSIDot(); };
            ps.subscribeSizeChange(onSize);
            unsub.push(() => ps.unsubscribeSizeChange(onSize));
        }
    } catch { }
    const ro = new ResizeObserver(() => { positionRSIDot(); });
    try { ro.observe(elSub); } catch { }

    return () => {
        btnRSI?.removeEventListener('click', onRSI);
        btnMACD?.removeEventListener('click', onMACD);
        btnMAO?.removeEventListener('click', onMAO);
        btnDISP?.removeEventListener('click', onDISP);
        btnAngle?.removeEventListener('click', onAngleToggle);

        try { elMain.removeEventListener('dblclick', onDblClick); } catch { }

        unsub.forEach(fn => { try { fn(); } catch { } });
        try { ro.disconnect(); } catch { }

        try { elSub.removeChild(legendBoxRSI); } catch { }
        try { elSub.removeChild(rsiDot); } catch { }

        try { tsLink?.dispose?.(); } catch { }
        try { paLink?.dispose?.(); } catch { }
        try { mainChart.remove(); } catch { }
        try { subChart.remove(); } catch { }
    };
}

export function dispose() { }
