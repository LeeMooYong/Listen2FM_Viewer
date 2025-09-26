// plugins/krStocks/preset/krTriple_Daily30m5m.js
// KR 트리플(일/30/5) — 상단: [일봉 | 30분봉], 하단: [5분봉(2열 스팬)]
// - 보조지표 없음 (캔들 + 거래량 + 이동평균선만)
// - MA(세 차트 동일): 240(마젠타, 4), 120(오렌지 점선, 1), 60(초록, 3), 20(빨강, 3), 5(흰, 2)
// - 거래량은 메인 차트 하단 20% 영역에 표시

import { loadKRStockCandles } from "../data/dataLoader.js";
import observeAndSyncPriceAxisWidth from "../../crypto/sync/priceAxisSync.js";
import {
    baseChartOptions, setInitialVisibleRange, createTitleOverlay,
} from "../../crypto/preset/_common.js";

const LWC = window.LightweightCharts;

/* ───────────────────────────── Utils ───────────────────────────── */
function el(tag, attrs = {}, styles = {}) {
    const n = document.createElement(tag);
    Object.assign(n, attrs);
    Object.assign(n.style, styles);
    return n;
}

// 간단 SMA
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

function addMA(chart, closeLine, { p, color, w = 2, dashed = false }) {
    const series = chart.addLineSeries({
        lineWidth: w,
        lastValueVisible: true,
        priceLineVisible: false,
    });
    series.applyOptions({ color, ...(dashed ? { lineStyle: 2 } : null) });
    series.setData(calcSMA(closeLine, p));
    return series;
}

// 좌상단 레전드
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
        wrap.appendChild(dot); wrap.appendChild(t);
        return wrap;
    };

    items.forEach(i => box.appendChild(make(i.c, i.t)));
    hostEl.appendChild(box);
    return box;
}

// 차트 Pane (캔들 + 거래량)
function buildPane(root, titleText, areaName) {
    const wrap = el("div", {}, {
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "120px",
        gridArea: areaName,
    });
    root.appendChild(wrap);
    const chart = LWC.createChart(wrap, baseChartOptions(LWC));

    // 타이틀
    createTitleOverlay(wrap, titleText);

    // 캔들
    const UP = "#26a69a", DOWN = "#ef5350";
    const candle = chart.addCandlestickSeries({
        upColor: UP, downColor: DOWN,
        borderUpColor: UP, borderDownColor: DOWN,
        wickUpColor: UP, wickDownColor: DOWN,
        priceLineVisible: true, priceLineWidth: 1, priceLineStyle: 0,
    });

    // 거래량 (하단 20%)
    const vol = chart.addHistogramSeries({
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

    return { wrap, chart, candle, vol, UP, DOWN };
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

/* ───────────────────────────── Mount ───────────────────────────── */
export default async function mount({
    mainRoot,
    symbol = "삼성전자",
} = {}) {
    // 레이아웃: 그리드 영역을 명시하여 배치 모호성 제거
    const root = el("div", {}, {
        position: "relative",
        width: "100%",
        height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gridTemplateAreas: `
      "daily thirty"
      "five  five"
    `,
        gap: "10px",
    });
    mainRoot.innerHTML = "";
    mainRoot.appendChild(root);

    // 상단 좌: 일봉, 상단 우: 30분, 하단 전체: 5분
    const pDaily = buildPane(root, `${symbol} — 일봉`, "daily");
    const p30m = buildPane(root, `${symbol} — 30분봉`, "thirty");

    const p5mWrap = el("div", {}, {
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "120px",
        gridArea: "five",
    });
    root.appendChild(p5mWrap);
    const p5m = (() => {
        const chart = LWC.createChart(p5mWrap, baseChartOptions(LWC));
        createTitleOverlay(p5mWrap, `${symbol} — 5분봉`);
        const UP = "#26a69a", DOWN = "#ef5350";
        const candle = chart.addCandlestickSeries({
            upColor: UP, downColor: DOWN,
            borderUpColor: UP, borderDownColor: DOWN,
            wickUpColor: UP, wickDownColor: DOWN,
            priceLineVisible: true, priceLineWidth: 1, priceLineStyle: 0,
        });
        const vol = chart.addHistogramSeries({
            priceScaleId: "vol",
            priceFormat: { type: "volume" },
            priceLineVisible: false,
            lastValueVisible: false,
        });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });
        return { wrap: p5mWrap, chart, candle, vol, UP, DOWN };
    })();

    // 데이터 로딩
    const [rowsDaily, rows30m, rows5m] = await Promise.all([
        loadKRStockCandles({ name: symbol, symbol, timeframe: "daily" }),
        loadKRStockCandles({ name: symbol, symbol, timeframe: "30m" }),
        loadKRStockCandles({ name: symbol, symbol, timeframe: "5m" }),
    ]);

    if (!rows30m?.length) {
        console.warn("[krTriple_Daily30m5m] 30분 데이터가 비어있습니다. (symbol=%s)", symbol);
    }

    const D = toCandles(rowsDaily);
    const H = toCandles(rows30m);
    const F = toCandles(rows5m); // F = five-minute

    // 데이터 세팅 + 볼륨 색
    function setMainData(pane, data) {
        pane.candle.setData(data.c);
        pane.vol.setData(data.c.map(c => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)"
        })));
    }
    setMainData(pDaily, D);
    setMainData(p30m, H);
    setMainData(p5m, F);

    // MA(세 차트 동일 규칙: 일봉 기준)
    const addAllMAs = (pane, closeLine) => {
        addMA(pane.chart, closeLine, { p: 240, color: "magenta", w: 4 });
        addMA(pane.chart, closeLine, { p: 120, color: "darkorange", w: 1, dashed: true });
        addMA(pane.chart, closeLine, { p: 60, color: "green", w: 3 });
        addMA(pane.chart, closeLine, { p: 20, color: "red", w: 3 });
        addMA(pane.chart, closeLine, { p: 5, color: "white", w: 2 });
    };
    addAllMAs(pDaily, D.closeLine);
    addAllMAs(p30m, H.closeLine);
    addAllMAs(p5m, F.closeLine);

    // 레전드(좌상단) — 동일 항목
    const legendItems = [
        { c: 'magenta', t: 'MA240' },
        { c: 'darkorange', t: 'MA120' },
        { c: 'green', t: 'MA60' },
        { c: 'red', t: 'MA20' },
        { c: 'white', t: 'MA5' },
    ];
    const lgDaily = addLegendBox(pDaily.wrap, legendItems);
    const lg30m = addLegendBox(p30m.wrap, legendItems);
    const lg5m = addLegendBox(p5m.wrap, legendItems);

    // 초기 가시범위
    if (D.c.length) setInitialVisibleRange(pDaily.chart, D.c, 360);
    if (H.c.length) setInitialVisibleRange(p30m.chart, H.c, 360);
    if (F.c.length) setInitialVisibleRange(p5m.chart, F.c, 360);

    // 더블클릭 → 해당 차트만 초기화
    function attachDblReset(pane, data, bars) {
        pane.wrap.addEventListener("dblclick", () => setInitialVisibleRange(pane.chart, data, bars));
    }
    attachDblReset(pDaily, D.c, 360);
    attachDblReset(p30m, H.c, 360);
    attachDblReset(p5m, F.c, 360);

    // 가격축 폭 동기화 (세 차트 동일 폭)
    let axisSyncDisposer = null;
    try {
        axisSyncDisposer = observeAndSyncPriceAxisWidth([
            { chart: pDaily.chart, container: pDaily.wrap },
            { chart: p30m.chart, container: p30m.wrap },
            { chart: p5m.chart, container: p5m.wrap },
        ]);
    } catch (e) {
        console.warn("[krTriple_Daily30m5m] axis sync skipped:", e);
    }

    // 리사이즈 — DOM 배치 완료 후 강제 1회 + ResizeObserver
    function resizeAll() {
        [pDaily, p30m, p5m].forEach(p => {
            const w = p.wrap.clientWidth, h = p.wrap.clientHeight;
            if (w > 0 && h > 0) p.chart.resize(w, h);
        });
    }
    const ro = new ResizeObserver(resizeAll);
    ro.observe(root);

    // 배치 직후 강제 리사이즈 (타이틀/레전드 부착 후)
    setTimeout(resizeAll, 0);

    // dispose
    async function dispose() {
        try { ro.disconnect(); } catch { }
        try { axisSyncDisposer?.dispose?.(); } catch { }

        try { lgDaily?.remove(); } catch { }
        try { lg30m?.remove(); } catch { }
        try { lg5m?.remove(); } catch { }

        for (const p of [pDaily, p30m, p5m]) {
            try { p.chart?.remove(); } catch { }
            try { p.wrap?.remove?.(); } catch { }
        }
        try { mainRoot?.removeChild(root); } catch { }
    }

    return dispose;
}
