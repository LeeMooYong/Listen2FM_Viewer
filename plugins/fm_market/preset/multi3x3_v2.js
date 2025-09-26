// 금융시황 3x3 (초기 120개 바, 더블클릭 초기화, 5MA, 얕은 거래량)
// 1행: BTC / XRP / NVDA
// 2행: US10Y / XLM / KOSPI   ← PCE 완전 제거
// 3행: SPY / QQQ / SOXX

import { loadCrypto } from "../../crypto/data/dataLoader.js";
import { loadEquity } from "../../usStocks/data/dataLoader.js";
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import { baseChartOptions, createTitleOverlay } from "../../crypto/preset/_common.js";

console.info("[fm_market] multi3x3_v2 loaded", new Date().toISOString());

const UP = "#26a69a";
const DOWN = "#ef5350";
const INITIAL_BARS = 100;

function setInitialVisibleRange(chart, data, bars = INITIAL_BARS) {
    try {
        const total = data.length;
        const from = Math.max(0, total - bars);
        chart.timeScale().setVisibleLogicalRange({ from, to: total - 1 });
    } catch { }
}

function toUnixSec(t) {
    if (typeof t === "number") return t > 1e12 ? Math.floor(t / 1000) : t;
    if (typeof t === "string") {
        const d = new Date(t);
        if (!Number.isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
    }
    return t;
}

function normalizeCandles(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((r) => {
            if (!r) return null;
            const lower = (k) => Object.keys(r).find((x) => x.toLowerCase() === k);
            const tKey = lower("time") || lower("timestamp") || lower("date");
            const oKey = lower("open") || "open";
            const hKey = lower("high") || "high";
            const lKey = lower("low") || "low";
            const cKey = lower("close") || "close";
            const vKey = lower("volume") || "volume";
            const hasOHLC = r[oKey] != null && r[hKey] != null && r[lKey] != null && r[cKey] != null;
            if (!tKey || !hasOHLC) return null;
            return {
                time: toUnixSec(r[tKey]),
                open: Number(r[oKey]),
                high: Number(r[hKey]),
                low: Number(r[lKey]),
                close: Number(r[cKey]),
                volume: Number(r[vKey] ?? 0),
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);
}

function normalizeLine(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((r) => {
            if (!r) return null;
            const tKey =
                Object.keys(r).find((k) => ["time", "timestamp", "date"].includes(k.toLowerCase())) || null;
            const numericKeys = Object.keys(r).filter((k) => {
                if (k === tKey) return false;
                const v = r[k];
                return typeof v === "number" && Number.isFinite(v);
            });
            const vKey =
                numericKeys.find((k) =>
                    ["close", "value", "index", "yield", "price"].includes(k.toLowerCase())
                ) || numericKeys[0];
            if (!tKey || !vKey) return null;
            return { time: toUnixSec(r[tKey]), value: Number(r[vKey]) };
        })
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);
}

// 주석 포함 JSON 방어(//, /* */)
function stripJsonComments(txt) {
    let s = txt.replace(/\/\*[\s\S]*?\*\//g, "");
    s = s.replace(/(^|[^:])\/\/.*$/gm, "$1");
    return s;
}
async function fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    const txt = await res.text();
    try {
        return JSON.parse(txt);
    } catch {
        return JSON.parse(stripJsonComments(txt));
    }
}

function makeCandleChart(LWC, el, title, candles) {
    createTitleOverlay(el, title);
    const ch = LWC.createChart(el, baseChartOptions(LWC));

    // 얕은 거래량(위 92%는 본체)
    const vol = ch.addHistogramSeries({
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
    });
    vol.setData(
        candles.map((r) => ({
            time: r.time,
            value: r.volume ?? 0,
            color: r.close >= r.open ? UP : DOWN,
        }))
    );
    ch.priceScale("vol").applyOptions({
        scaleMargins: { top: 0.92, bottom: 0.0 },
        visible: false,
    });

    // 5MA (singleDaily.js와 동일 색)
    const ma240 = ch.addLineSeries({ color: "magenta", lineWidth: 4, priceLineVisible: false, lastValueVisible: false });
    const ma120 = ch.addLineSeries({ color: "darkorange", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const ma060 = ch.addLineSeries({ color: "green", lineWidth: 3, priceLineVisible: false, lastValueVisible: false });
    const ma020 = ch.addLineSeries({ color: "red", lineWidth: 3, priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1, priceLineColor: "red" });
    const ma005 = ch.addLineSeries({ color: "white", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });

    ma240.setData(calculateSMA(candles, 240));
    ma120.setData(calculateSMA(candles, 120));
    ma060.setData(calculateSMA(candles, 60));
    ma020.setData(calculateSMA(candles, 20));
    ma005.setData(calculateSMA(candles, 5));

    const cs = ch.addCandlestickSeries({
        upColor: UP, downColor: DOWN,
        borderUpColor: UP, borderDownColor: DOWN,
        wickUpColor: UP, wickDownColor: DOWN,
        priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1,
    });
    cs.setData(candles);
    try {
        const last = candles[candles.length - 1];
        cs.applyOptions({ priceLineColor: last && last.close >= last.open ? UP : DOWN });
    } catch { }

    setInitialVisibleRange(ch, candles, INITIAL_BARS);
    const onDblClick = () => setInitialVisibleRange(ch, candles, INITIAL_BARS);
    el.addEventListener("dblclick", onDblClick);

    return { chart: ch, cleanup: () => el.removeEventListener("dblclick", onDblClick) };
}

function makeLineChart(LWC, el, title, series) {
    createTitleOverlay(el, title);
    const ch = LWC.createChart(el, baseChartOptions(LWC));
    const ls = ch.addLineSeries({ color: "white", lineWidth: 2, priceLineVisible: true });
    ls.setData(series);

    setInitialVisibleRange(ch, series, INITIAL_BARS);
    const onDblClick = () => setInitialVisibleRange(ch, series, INITIAL_BARS);
    el.addEventListener("dblclick", onDblClick);

    return { chart: ch, cleanup: () => el.removeEventListener("dblclick", onDblClick) };
}

export async function mountMulti3x3({ mainRoot }) {
    const LWC = window.LightweightCharts;
    if (!LWC) {
        mainRoot.innerHTML = '<p style="color:#f66;padding:8px">LightweightCharts 로드 실패</p>';
        return () => { };
    }

    mainRoot.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr;gap:6px;height:100%;">
      <div id="c11" style="position:relative;"></div>
      <div id="c12" style="position:relative;"></div>
      <div id="c13" style="position:relative;"></div>

      <div id="c21" style="position:relative;"></div>
      <div id="c22" style="position:relative;"></div>
      <div id="c23" style="position:relative;"></div>

      <div id="c31" style="position:relative;"></div>
      <div id="c32" style="position:relative;"></div>
      <div id="c33" style="position:relative;"></div>
    </div>
  `;

    const charts = [];
    const cleanups = [];

    // 1행: BTC / XRP / NVDA
    try {
        const btc = await loadCrypto({ symbol: "BTC", timeframe: "daily", exchange: "upbit" });
        const { chart, cleanup } = makeCandleChart(LWC, mainRoot.querySelector("#c11"), "BTC (Daily)", btc);
        charts.push(chart); cleanups.push(cleanup);
    } catch (e) { console.error("BTC load failed:", e); }

    try {
        const xrp = await loadCrypto({ symbol: "XRP", timeframe: "daily", exchange: "upbit" });
        const { chart, cleanup } = makeCandleChart(LWC, mainRoot.querySelector("#c12"), "XRP (Daily)", xrp);
        charts.push(chart); cleanups.push(cleanup);
    } catch (e) { console.error("XRP load failed:", e); }

    try {
        const nvda = await loadEquity({ symbol: "NVDA", timeframe: "daily" });
        const { chart, cleanup } = makeCandleChart(LWC, mainRoot.querySelector("#c13"), "NVDA (Daily)", nvda);
        charts.push(chart); cleanups.push(cleanup);
    } catch (e) { console.error("NVDA load failed:", e); }

    // 2행: US 10Y / XLM / KOSPI
    try {
        const el = mainRoot.querySelector("#c21");
        const raw = await fetchJSON("data/economic/daily/ust10y_daily.json");
        const candles = normalizeCandles(raw);
        if (candles.length >= 5) {
            const { chart, cleanup } = makeCandleChart(LWC, el, "US 10Y Yield (Daily)", candles);
            charts.push(chart); cleanups.push(cleanup);
        } else {
            const line = normalizeLine(raw);
            const { chart, cleanup } = makeLineChart(LWC, el, "US 10Y Yield (Daily)", line);
            charts.push(chart); cleanups.push(cleanup);
        }
    } catch (e) { console.error("UST10Y load failed:", e); }

    try {
        const xlmRaw = await fetchJSON("data/crypto/upbit/XLM/XLM_daily.json");
        const xlm = normalizeCandles(xlmRaw);
        const { chart, cleanup } = makeCandleChart(LWC, mainRoot.querySelector("#c22"), "XLM (Daily)", xlm);
        charts.push(chart); cleanups.push(cleanup);
    } catch (e) { console.error("XLM load failed:", e); }

    try {
        const el = mainRoot.querySelector("#c23");
        const raw = await fetchJSON("data/crypto/upbit/BTC/kospi_market.json");
        const candles = normalizeCandles(raw);
        if (candles.length >= 5) {
            const { chart, cleanup } = makeCandleChart(LWC, el, "KOSPI", candles);
            charts.push(chart); cleanups.push(cleanup);
        } else {
            const line = normalizeLine(raw);
            const { chart, cleanup } = makeLineChart(LWC, el, "KOSPI", line);
            charts.push(chart); cleanups.push(cleanup);
        }
    } catch (e) { console.error("KOSPI load failed:", e); }

    // 3행: SPY / QQQ / SOXX
    try {
        const raw = await fetchJSON("data/usStocks/ETF/SPY/SPY_daily.json");
        const candles = normalizeCandles(raw);
        const { chart, cleanup } = makeCandleChart(LWC, mainRoot.querySelector("#c31"), "SPY (Daily)", candles);
        charts.push(chart); cleanups.push(cleanup);
    } catch (e) { console.error("SPY load failed:", e); }

    try {
        const raw = await fetchJSON("data/usStocks/ETF/QQQ/QQQ_daily.json");
        const candles = normalizeCandles(raw);
        const { chart, cleanup } = makeCandleChart(LWC, mainRoot.querySelector("#c32"), "QQQ (Daily)", candles);
        charts.push(chart); cleanups.push(cleanup);
    } catch (e) { console.error("QQQ load failed:", e); }

    try {
        const raw = await fetchJSON("data/usStocks/ETF/SOXX/SOXX_daily.json");
        const candles = normalizeCandles(raw);
        const { chart, cleanup } = makeCandleChart(LWC, mainRoot.querySelector("#c33"), "SOXX (Daily)", candles);
        charts.push(chart); cleanups.push(cleanup);
    } catch (e) { console.error("SOXX load failed:", e); }

    return () => {
        try { cleanups.forEach((fn) => fn && fn()); } catch { }
        try { charts.forEach((c) => c?.remove?.()); } catch { }
    };
}

export function dispose() { }
