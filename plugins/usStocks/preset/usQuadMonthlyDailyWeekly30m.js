// plugins/usStocks/preset/usQuadMonthlyDailyWeekly30m.js
import { loadEquity } from "../data/dataLoader.js";
import observeAndSyncPriceAxisWidth from "../../crypto/sync/priceAxisSync.js";
import { baseChartOptions, setInitialVisibleRange, createTitleOverlay } from "../../crypto/preset/_common.js";

const LWC = window.LightweightCharts;

// ── utils
function el(tag, attrs = {}, styles = {}) {
    const n = document.createElement(tag);
    Object.assign(n, attrs);
    Object.assign(n.style, styles);
    return n;
}

function calcSMA(line, p) {
    const out = []; let sum = 0;
    for (let i = 0; i < line.length; i++) {
        sum += line[i].value;
        if (i >= p) sum -= line[i - p].value;
        if (i >= p - 1) out.push({ time: line[i].time, value: sum / p });
    }
    return out;
}

function addLegendBox(hostEl, items) {
    const box = document.createElement("div");
    Object.assign(box.style, {
        position: "absolute", top: "6px", left: "8px",
        display: "flex", gap: "12px", alignItems: "center",
        fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
        textShadow: "0 0 4px rgba(0,0,0,.5)", pointerEvents: "none", zIndex: 7
    });
    const make = (c, t) => {
        const w = document.createElement("div");
        Object.assign(w.style, { display: "flex", alignItems: "center", gap: "6px" });
        const dot = document.createElement("span");
        Object.assign(dot.style, { display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: c });
        const s = document.createElement("span"); s.textContent = t;
        w.appendChild(dot); w.appendChild(s);
        return w;
    };
    items.forEach(i => box.appendChild(make(i.c, i.t)));
    hostEl.appendChild(box);
    return box;
}

function buildPane(root, title) {
    const wrap = el("div", {}, { position: "relative", width: "100%", height: "100%" });
    root.appendChild(wrap);
    const chart = LWC.createChart(wrap, baseChartOptions(LWC));
    createTitleOverlay(wrap, title);

    // 거래량 먼저
    const vol = chart.addHistogramSeries({
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

    // 캔들은 맨 뒤에 추가하여 MA 위에 오도록
    function addCandle(candles, { up = "#26a69a", down = "#ef5350" } = {}) {
        const candle = chart.addCandlestickSeries({
            upColor: up, downColor: down, borderUpColor: up, borderDownColor: down,
            wickUpColor: up, wickDownColor: down, priceLineVisible: true, priceLineWidth: 1
        });
        candle.setData(candles);
        const last = candles[candles.length - 1];
        if (last) candle.applyOptions({ priceLineColor: last.close >= last.open ? up : down });
        return candle;
    }

    return { wrap, chart, vol, addCandle };
}

function toCandles(rows) {
    const c = (rows || []).map(r => ({
        time: r.time, open: +r.open, high: +r.high, low: +r.low, close: +r.close, volume: +(r.volume ?? 0)
    })).filter(d => [d.open, d.high, d.low, d.close].every(Number.isFinite));
    const closeLine = c.map(d => ({ time: d.time, value: d.close }));
    return { c, closeLine };
}

function addMA(chart, line, { p, color, w = 2, dashed = false, lastValueVisible = true }) {
    const s = chart.addLineSeries({ lineWidth: w, color, lastValueVisible, priceLineVisible: false });
    if (dashed) s.applyOptions({ lineStyle: 2 });
    s.setData(calcSMA(line, p));
    return s;
}

// ── main
export default async function mount({ mainRoot, symbol = "SPY" } = {}) {
    // 2×2 레이아웃
    const root = el("div", {}, {
        position: "relative", width: "100%", height: "100%",
        display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: "10px"
    });
    mainRoot.innerHTML = "";
    mainRoot.appendChild(root);

    const pM = buildPane(root, `${symbol} (Monthly)`);
    const pD = buildPane(root, `${symbol} (Daily)`);
    const pW = buildPane(root, `${symbol} (Weekly)`);
    const pH = buildPane(root, `${symbol} (30m)`);

    const [m, d, w, h] = await Promise.all([
        loadEquity({ symbol, timeframe: "monthly" }),
        loadEquity({ symbol, timeframe: "daily" }),
        loadEquity({ symbol, timeframe: "weekly" }),
        loadEquity({ symbol, timeframe: "30m" }),
    ]);

    const M = toCandles(m), D = toCandles(d), W = toCandles(w), H = toCandles(h);

    const setVol = (p, data) => p.vol.setData(data.c.map(c => ({
        time: c.time, value: c.volume, color: c.close >= c.open ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)"
    })));
    [[pM, M], [pD, D], [pW, W], [pH, H]].forEach(([p, data]) => setVol(p, data));

    // MA들 먼저
    // Monthly: 72/24/12/6(점선)/3
    addMA(pM.chart, M.closeLine, { p: 72, color: "white", w: 2, lastValueVisible: false });
    addMA(pM.chart, M.closeLine, { p: 24, color: "red", w: 2, lastValueVisible: false });
    addMA(pM.chart, M.closeLine, { p: 12, color: "magenta", w: 3 });
    addMA(pM.chart, M.closeLine, { p: 6, color: "darkorange", w: 1, dashed: true, lastValueVisible: false });
    addMA(pM.chart, M.closeLine, { p: 3, color: "green", w: 2 });

    // Daily: 240/120(점선)/60/20/5
    addMA(pD.chart, D.closeLine, { p: 240, color: "magenta", w: 4 });
    addMA(pD.chart, D.closeLine, { p: 120, color: "darkorange", w: 1, dashed: true, lastValueVisible: false });
    addMA(pD.chart, D.closeLine, { p: 60, color: "green", w: 3 });
    addMA(pD.chart, D.closeLine, { p: 20, color: "red", w: 3 });
    addMA(pD.chart, D.closeLine, { p: 5, color: "white", w: 2, lastValueVisible: false });

    // Weekly: 104/52/26(점선)/12/4
    addMA(pW.chart, W.closeLine, { p: 104, color: "white", w: 4 });
    addMA(pW.chart, W.closeLine, { p: 52, color: "magenta", w: 4 });
    addMA(pW.chart, W.closeLine, { p: 26, color: "#FFB74D", w: 1, dashed: true });
    addMA(pW.chart, W.closeLine, { p: 12, color: "green", w: 3 });
    addMA(pW.chart, W.closeLine, { p: 4, color: "red", w: 2 });

    // 30m: daily와 동일
    addMA(pH.chart, H.closeLine, { p: 240, color: "magenta", w: 4 });
    addMA(pH.chart, H.closeLine, { p: 120, color: "darkorange", w: 1, dashed: true, lastValueVisible: false });
    addMA(pH.chart, H.closeLine, { p: 60, color: "green", w: 3 });
    addMA(pH.chart, H.closeLine, { p: 20, color: "red", w: 3 });
    addMA(pH.chart, H.closeLine, { p: 5, color: "white", w: 2, lastValueVisible: false });

    // 캔들을 맨 위에
    pM.addCandle(M.c); pD.addCandle(D.c); pW.addCandle(W.c); pH.addCandle(H.c);

    // 레전드
    const lgM = addLegendBox(pM.wrap, [
        { c: "white", t: "MA72" }, { c: "red", t: "MA24" }, { c: "magenta", t: "MA12" },
        { c: "darkorange", t: "MA6" }, { c: "green", t: "MA3" },
    ]);
    const lgD = addLegendBox(pD.wrap, [
        { c: "magenta", t: "MA240" }, { c: "darkorange", t: "MA120" }, { c: "green", t: "MA60" },
        { c: "red", t: "MA20" }, { c: "white", t: "MA5" },
    ]);
    const lgW = addLegendBox(pW.wrap, [
        { c: "white", t: "MA104" }, { c: "magenta", t: "MA52" }, { c: "#FFB74D", t: "MA26" },
        { c: "green", t: "MA12" }, { c: "red", t: "MA4" },
    ]);
    const lgH = addLegendBox(pH.wrap, [
        { c: "magenta", t: "MA240" }, { c: "darkorange", t: "MA120" }, { c: "green", t: "MA60" },
        { c: "red", t: "MA20" }, { c: "white", t: "MA5" },
    ]);

    // 초기 가시범위
    if (M.c.length) setInitialVisibleRange(pM.chart, M.c, 80);
    if (D.c.length) setInitialVisibleRange(pD.chart, D.c, 220);
    if (W.c.length) setInitialVisibleRange(pW.chart, W.c, 220);
    if (H.c.length) setInitialVisibleRange(pH.chart, H.c, 220);

    // 더블클릭 복귀
    const dbl = (p, data, bars) => p.wrap.addEventListener("dblclick", () => setInitialVisibleRange(p.chart, data, bars));
    dbl(pM, M.c, 180); dbl(pD, D.c, 360); dbl(pW, W.c, 220); dbl(pH, H.c, 360);

    // 가격축 폭 동기화
    let sync;
    try {
        sync = observeAndSyncPriceAxisWidth([
            { chart: pM.chart, container: pM.wrap },
            { chart: pD.chart, container: pD.wrap },
            { chart: pW.chart, container: pW.wrap },
            { chart: pH.chart, container: pH.wrap },
        ]);
    } catch { /* noop */ }

    // 리사이즈
    const ro = new ResizeObserver(() => {
        [pM, pD, pW, pH].forEach(p => {
            const w = p.wrap.clientWidth, h = p.wrap.clientHeight;
            if (w > 0 && h > 0) p.chart.resize(w, h);
        });
    });
    ro.observe(root);

    return async function dispose() {
        try { ro.disconnect(); } catch { }
        try { sync?.dispose?.(); } catch { }
        try { lgM?.remove(); } catch { }
        try { lgD?.remove(); } catch { }
        try { lgW?.remove(); } catch { }
        try { lgH?.remove(); } catch { }
        [pM, pD, pW, pH].forEach(p => { try { p.chart.remove(); } catch { } try { p.wrap.remove(); } catch { } });
        try { mainRoot.removeChild(root); } catch { }
    };
}
