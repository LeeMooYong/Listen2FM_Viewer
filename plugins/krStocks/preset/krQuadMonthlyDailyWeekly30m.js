// plugins/krStocks/preset/krQuadMonthlyDailyWeekly30m.js
// 2x2 KR 멀티차트: 좌상=월봉, 우상=일봉, 좌하=주봉, 우하=30분봉
// - 보조지표 미사용 (메인: 캔들+거래량+이동평균선만)
// - 이동평균선 규칙: 월/일은 듀얼(월/일) 프리셋과 동일, 30분봉은 일봉과 동일
// - 주봉: 104/52/26/12/4 순서(큰 주기 뒤, 작은 주기 앞) + 레전드 동일 순서
// - 가격축 폭 동기화(4개 차트 동일), 타임스케일 링크 없음
// - 각 차트 좌상단 MA 레전드 포함
// - ✅ 캔들이 MA 위에 오도록 "시리즈 추가 순서" 재구성

import { loadKRStockCandles } from "../data/dataLoader.js";
import observeAndSyncPriceAxisWidth from "../../crypto/sync/priceAxisSync.js";
import {
    baseChartOptions, setInitialVisibleRange, createTitleOverlay,
} from "../../crypto/preset/_common.js";

const LWC = window.LightweightCharts;

// ────────────────────────── Utils ──────────────────────────
function el(tag, attrs = {}, styles = {}) {
    const n = document.createElement(tag);
    Object.assign(n, attrs);
    Object.assign(n.style, styles);
    return n;
}

// 간단 SMA (로컬 계산)
function calcSMA(closeLine, period) {
    const out = [];
    let sum = 0;
    for (let i = 0; i < closeLine.length; i++) {
        sum += closeLine[i].value;
        if (i >= period) sum -= closeLine[i - period].value;
        if (i >= period - 1) out.push({ time: closeLine[i].time, value: sum / period });
    }
    return out;
}

// 레전드(좌상단) 유틸 — 컬러 점 + 텍스트
function addLegendBox(hostEl, items) {
    const box = document.createElement('div');
    Object.assign(box.style, {
        position: 'absolute',
        top: '6px',
        left: '8px',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        fontSize: '12px',
        fontWeight: '700',
        color: '#e8e8ea',
        textShadow: '0 0 4px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
        zIndex: 7,
    });

    const make = (color, label) => {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '6px';
        const dot = document.createElement('span');
        Object.assign(dot.style, {
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: color,
        });
        const t = document.createElement('span');
        t.textContent = label;
        wrap.appendChild(dot);
        wrap.appendChild(t);
        return wrap;
    };

    items.forEach(i => box.appendChild(make(i.c, i.t)));
    hostEl.appendChild(box);
    return box;
}

// 메인 pane 빌더 (⚠️ 캔들은 나중에 추가: addCandle)
function buildPane(root, titleText) {
    const wrap = el("div", {}, { position: "relative", width: "100%", height: "100%" });
    root.appendChild(wrap);
    const chart = LWC.createChart(wrap, baseChartOptions(LWC));

    // 타이틀
    createTitleOverlay(wrap, titleText);

    // 거래량 (먼저 추가)
    const vol = chart.addHistogramSeries({
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
    });
    // 볼륨 스케일: 하단 20%
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

    // 캔들은 마지막에 추가해서 MA 위에 오도록
    function addCandle(candles, { up = "#26a69a", down = "#ef5350" } = {}) {
        const candle = chart.addCandlestickSeries({
            upColor: up, downColor: down,
            borderUpColor: up, borderDownColor: down,
            wickUpColor: up, wickDownColor: down,
            priceLineVisible: true, priceLineWidth: 1, priceLineStyle: 0,
        });
        candle.setData(candles);
        try {
            const last = candles[candles.length - 1];
            candle.applyOptions({ priceLineColor: (last && last.close >= last.open) ? up : down });
        } catch { }
        return candle;
    }

    return { wrap, chart, vol, addCandle };
}

function toCandles(rows) {
    const c = (rows || []).map(r => ({
        time: r.time,
        open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
        volume: Number(r.volume ?? 0),
    })).filter(d =>
        Number.isFinite(d.open) && Number.isFinite(d.high) &&
        Number.isFinite(d.low) && Number.isFinite(d.close)
    );
    const closeLine = c.map(d => ({ time: d.time, value: d.close }));
    return { c, closeLine };
}

function addMA(chart, closeLine, { p, color, w = 2, dashed = false, lastValueVisible = true }) {
    const series = chart.addLineSeries({
        lineWidth: w,
        lastValueVisible,
        priceLineVisible: false,
        color,
    });
    if (dashed) series.applyOptions({ lineStyle: 2 });
    series.setData(calcSMA(closeLine, p));
    return series;
}

// ────────────────────────── Main ──────────────────────────
export default async function mount({
    mainRoot,
    symbol = "삼성전자",
} = {}) {
    // 레이아웃: 2x2
    const root = el("div", {}, {
        position: "relative",
        width: "100%",
        height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: "10px",
    });
    mainRoot.innerHTML = "";
    mainRoot.appendChild(root);

    // 4개 판넬
    const pMonthly = buildPane(root, `${symbol} — 월봉`);
    const pDaily = buildPane(root, `${symbol} — 일봉`);
    const pWeekly = buildPane(root, `${symbol} — 주봉`);
    const p30m = buildPane(root, `${symbol} — 30분봉`);

    // 데이터 로딩
    const [rowsMonthly, rowsDaily, rowsWeekly, rows30m] = await Promise.all([
        loadKRStockCandles({ name: symbol, symbol, timeframe: "monthly" }),
        loadKRStockCandles({ name: symbol, symbol, timeframe: "daily" }),
        loadKRStockCandles({ name: symbol, symbol, timeframe: "weekly" }),
        loadKRStockCandles({ name: symbol, symbol, timeframe: "30m" }),
    ]);

    const M = toCandles(rowsMonthly);
    const D = toCandles(rowsDaily);
    const W = toCandles(rowsWeekly);
    const H = toCandles(rows30m);

    // 거래량 세팅 (색상 포함)
    function setVolume(pane, data) {
        pane.vol.setData(data.c.map(c => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)"
        })));
    }
    setVolume(pMonthly, M);
    setVolume(pDaily, D);
    setVolume(pWeekly, W);
    setVolume(p30m, H);

    // ── 이동평균선 (⚠️ MA를 먼저 추가) ─────────────────────────
    // [월봉] 72/24/12/6(점선)/3
    addMA(pMonthly.chart, M.closeLine, { p: 72, color: "white", w: 2, lastValueVisible: false });
    addMA(pMonthly.chart, M.closeLine, { p: 24, color: "red", w: 2, lastValueVisible: false });
    addMA(pMonthly.chart, M.closeLine, { p: 12, color: "magenta", w: 3 });
    addMA(pMonthly.chart, M.closeLine, { p: 6, color: "darkorange", w: 1, dashed: true, lastValueVisible: false });
    addMA(pMonthly.chart, M.closeLine, { p: 3, color: "green", w: 2 });

    // [일봉] 240/120(점선)/60/20/5
    addMA(pDaily.chart, D.closeLine, { p: 240, color: "magenta", w: 4 });
    addMA(pDaily.chart, D.closeLine, { p: 120, color: "darkorange", w: 1, dashed: true, lastValueVisible: false });
    addMA(pDaily.chart, D.closeLine, { p: 60, color: "green", w: 3 });
    addMA(pDaily.chart, D.closeLine, { p: 20, color: "red", w: 3 });
    addMA(pDaily.chart, D.closeLine, { p: 5, color: "white", w: 2, lastValueVisible: false });

    // [주봉] **순서 수정**: 104/52/26(점선)/12/4   (큰 주기 → 작은 주기)
    addMA(pWeekly.chart, W.closeLine, { p: 104, color: "white", w: 4 });
    addMA(pWeekly.chart, W.closeLine, { p: 52, color: "magenta", w: 4 });
    addMA(pWeekly.chart, W.closeLine, { p: 26, color: "#FFB74D", w: 1, dashed: true });
    addMA(pWeekly.chart, W.closeLine, { p: 12, color: "green", w: 3 });
    addMA(pWeekly.chart, W.closeLine, { p: 4, color: "red", w: 2 });

    // [30분봉] (일봉과 동일 규칙)
    addMA(p30m.chart, H.closeLine, { p: 240, color: "magenta", w: 4 });
    addMA(p30m.chart, H.closeLine, { p: 120, color: "darkorange", w: 1, dashed: true, lastValueVisible: false });
    addMA(p30m.chart, H.closeLine, { p: 60, color: "green", w: 3 });
    addMA(p30m.chart, H.closeLine, { p: 20, color: "red", w: 3 });
    addMA(p30m.chart, H.closeLine, { p: 5, color: "white", w: 2, lastValueVisible: false });

    // ── ⚠️ 마지막에 캔들 추가(항상 맨 위로) ─────────────────────
    const candleM = pMonthly.addCandle(M.c);
    const candleD = pDaily.addCandle(D.c);
    const candleW = pWeekly.addCandle(W.c);
    const candleH = p30m.addCandle(H.c);

    // ── 레전드 (주봉 순서도 104/52/26/12/4로 변경) ─────────────
    const lgMonthly = addLegendBox(pMonthly.wrap, [
        { c: 'white', t: 'MA72' },
        { c: 'red', t: 'MA24' },
        { c: 'magenta', t: 'MA12' },
        { c: 'darkorange', t: 'MA6' },
        { c: 'green', t: 'MA3' },
    ]);

    const lgDaily = addLegendBox(pDaily.wrap, [
        { c: 'magenta', t: 'MA240' },
        { c: 'darkorange', t: 'MA120' },
        { c: 'green', t: 'MA60' },
        { c: 'red', t: 'MA20' },
        { c: 'white', t: 'MA5' },
    ]);

    const lgWeekly = addLegendBox(pWeekly.wrap, [
        { c: 'white', t: 'MA104' },
        { c: 'magenta', t: 'MA52' },
        { c: '#FFB74D', t: 'MA26' },
        { c: 'green', t: 'MA12' },
        { c: 'red', t: 'MA4' },
    ]);

    const lg30m = addLegendBox(p30m.wrap, [
        { c: 'magenta', t: 'MA240' },
        { c: 'darkorange', t: 'MA120' },
        { c: 'green', t: 'MA60' },
        { c: 'red', t: 'MA20' },
        { c: 'white', t: 'MA5' },
    ]);

    // 초기 가시범위
    if (M.c.length) setInitialVisibleRange(pMonthly.chart, M.c, 80);
    if (D.c.length) setInitialVisibleRange(pDaily.chart, D.c, 220);
    if (W.c.length) setInitialVisibleRange(pWeekly.chart, W.c, 220);
    if (H.c.length) setInitialVisibleRange(p30m.chart, H.c, 220);

    // 더블클릭 → 해당 차트만 초기화
    function attachDblReset(pane, data, bars) {
        pane.wrap.addEventListener("dblclick", () => setInitialVisibleRange(pane.chart, data, bars));
    }
    attachDblReset(pMonthly, M.c, 180);
    attachDblReset(pDaily, D.c, 360);
    attachDblReset(pWeekly, W.c, 220);
    attachDblReset(p30m, H.c, 360);

    // 가격축 폭 동기화
    let axisSyncDisposer = null;
    try {
        axisSyncDisposer = observeAndSyncPriceAxisWidth([
            { chart: pMonthly.chart, container: pMonthly.wrap },
            { chart: pDaily.chart, container: pDaily.wrap },
            { chart: pWeekly.chart, container: pWeekly.wrap },
            { chart: p30m.chart, container: p30m.wrap },
        ]);
    } catch (e) {
        console.warn("[krQuadMonthlyDailyWeekly30m] axis sync skipped:", e);
    }

    // 리사이즈
    function resizeAll() {
        [pMonthly, pDaily, pWeekly, p30m].forEach(p => {
            const w = p.wrap.clientWidth, h = p.wrap.clientHeight;
            if (w > 0 && h > 0) p.chart.resize(w, h);
        });
    }
    const ro = new ResizeObserver(resizeAll);
    ro.observe(root);
    resizeAll();

    // dispose
    async function dispose() {
        try { ro.disconnect(); } catch { }
        try { axisSyncDisposer?.dispose?.(); } catch { }
        // 레전드 DOM 제거
        try { lgMonthly?.remove(); } catch { }
        try { lgDaily?.remove(); } catch { }
        try { lgWeekly?.remove(); } catch { }
        try { lg30m?.remove(); } catch { }

        for (const p of [pMonthly, pDaily, pWeekly, p30m]) {
            try { p.chart?.remove(); } catch { }
            try { p.wrap?.remove(); } catch { }
        }
        try { mainRoot?.removeChild(root); } catch { }
    }

    return dispose;
}
