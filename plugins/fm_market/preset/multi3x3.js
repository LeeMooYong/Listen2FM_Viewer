// Listen2FM_Viewer/app/plugins/fm_market/preset/multi3x3.js
// 금융시황 3x3 멀티차트 (초기 120개 바 표시 + 더블클릭 초기화)
// ※ 기존 기능(상단 3개: BTC/XRP/NVDA) 유지, 2/3행 슬롯만 추가

import { loadCrypto } from "../../crypto/data/dataLoader.js";
import { loadEquity } from "../../usStocks/data/dataLoader.js";
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import { baseChartOptions, createTitleOverlay } from "../../crypto/preset/_common.js";

export async function mountMulti3x3({ mainRoot }) {
    const LWC = window.LightweightCharts;
    if (!LWC) {
        mainRoot.innerHTML = '<p style="color:#f66;padding:8px">LightweightCharts 로드 실패</p>';
        return () => { };
    }

    // ─────────────────────────────────────────────
    // 레이아웃(3x3)
    // ─────────────────────────────────────────────
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

    // ─────────────────────────────────────────────
    // 공통 유틸
    // ─────────────────────────────────────────────
    const charts = [];
    const disposers = [];

    const UP = "#26a69a";
    const DOWN = "#ef5350";
    const INITIAL_BARS = 120; // ★ 요청: 초기 120개 바

    function setInitialVisibleRange(chart, candles, bars = INITIAL_BARS) {
        try {
            const total = candles.length;
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

                // value 후보: close/value/index/yield/pce/price 등 숫자 하나 선택
                const numericKeys = Object.keys(r).filter((k) => {
                    if (k === tKey) return false;
                    const v = r[k];
                    return typeof v === "number" && Number.isFinite(v);
                });
                const vKey =
                    numericKeys.find((k) => ["close", "value", "index", "yield", "pce", "price"].includes(k.toLowerCase())) ||
                    numericKeys[0];

                if (!tKey || !vKey) return null;
                return { time: toUnixSec(r[tKey]), value: Number(r[vKey]) };
            })
            .filter(Boolean)
            .sort((a, b) => a.time - b.time);
    }

    // ─────────────────────────────────────────────
    // 공통: 캔들 차트(얕은 거래량 + 5MA + 캔들 최상단)
    // ─────────────────────────────────────────────
    function makeCandleChart(el, title, candles) {
        createTitleOverlay(el, title);
        const ch = LWC.createChart(el, baseChartOptions(LWC));
        charts.push(ch);

        // 거래량(아래쪽 8%만 사용)
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

        // 5개 이동평균 (singleDaily.js와 동일 스타일)
        const ma240 = ch.addLineSeries({ color: "magenta", lineWidth: 4, priceLineVisible: false, lastValueVisible: false });
        const ma120 = ch.addLineSeries({ color: "darkorange", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false }); // 점선
        const ma060 = ch.addLineSeries({ color: "green", lineWidth: 3, priceLineVisible: false, lastValueVisible: false });
        const ma020 = ch.addLineSeries({ color: "red", lineWidth: 3, priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1, priceLineColor: "red" });
        const ma005 = ch.addLineSeries({ color: "white", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });

        ma240.setData(calculateSMA(candles, 240));
        ma120.setData(calculateSMA(candles, 120));
        ma060.setData(calculateSMA(candles, 60));
        ma020.setData(calculateSMA(candles, 20));
        ma005.setData(calculateSMA(candles, 5));

        // 캔들을 마지막에 추가 → 최상단
        const cs = ch.addCandlestickSeries({
            upColor: UP,
            downColor: DOWN,
            borderUpColor: UP,
            borderDownColor: DOWN,
            wickUpColor: UP,
            wickDownColor: DOWN,
            priceLineVisible: true,
            priceLineStyle: 0,
            priceLineWidth: 1,
        });
        cs.setData(candles);
        try {
            const last = candles[candles.length - 1];
            cs.applyOptions({ priceLineColor: last && last.close >= last.open ? UP : DOWN });
        } catch { }

        // 초기 가시 구간 120개 + 더블클릭 초기화
        setInitialVisibleRange(ch, candles, INITIAL_BARS);
        const onDblClick = () => setInitialVisibleRange(ch, candles, INITIAL_BARS);
        el.addEventListener("dblclick", onDblClick);
        disposers.push(() => { try { el.removeEventListener("dblclick", onDblClick); } catch { } });

        return ch;
    }

    // ─────────────────────────────────────────────
    // 공통: 라인 차트(경제지표 등 단일값 시계열)
    // ─────────────────────────────────────────────
    function makeLineChart(el, title, series) {
        createTitleOverlay(el, title);
        const ch = LWC.createChart(el, baseChartOptions(LWC));
        charts.push(ch);

        const ls = ch.addLineSeries({ color: "white", lineWidth: 2, priceLineVisible: true });
        ls.setData(series);

        setInitialVisibleRange(ch, series, INITIAL_BARS);
        const onDblClick = () => setInitialVisibleRange(ch, series, INITIAL_BARS);
        el.addEventListener("dblclick", onDblClick);
        disposers.push(() => { try { el.removeEventListener("dblclick", onDblClick); } catch { } });

        return ch;
    }

    async function fetchJSON(path) {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`${path} ${res.status}`);
        return await res.json();
    }

    async function makeFromPath(el, title, path) {
        const raw = await fetchJSON(path);
        // OHLC 형태면 캔들, 아니면 라인
        const candles = normalizeCandles(raw);
        if (candles.length >= 5) return makeCandleChart(el, title, candles);
        const line = normalizeLine(raw);
        return makeLineChart(el, title, line);
    }

    // ─────────────────────────────────────────────
    // 1행: BTC / XRP / NVDA (기존 유지)
    // ─────────────────────────────────────────────
    try {
        const btc = await loadCrypto({ symbol: "BTC", timeframe: "daily", exchange: "upbit" });
        makeCandleChart(mainRoot.querySelector("#c11"), "BTC (Daily)", btc);
    } catch (e) {
        console.error("BTC load failed:", e);
    }

    try {
        const xrp = await loadCrypto({ symbol: "XRP", timeframe: "daily", exchange: "upbit" });
        makeCandleChart(mainRoot.querySelector("#c12"), "XRP (Daily)", xrp);
    } catch (e) {
        console.error("XRP load failed:", e);
    }

    try {
        const nvda = await loadEquity({ symbol: "NVDA", timeframe: "daily" });
        makeCandleChart(mainRoot.querySelector("#c13"), "NVDA (Daily)", nvda);
    } catch (e) {
        console.error("NVDA load failed:", e);
    }

    // ─────────────────────────────────────────────
    // 2행: 10Y / PCE / KOSPI  (지정 경로에서 직접 로드)
    // 웹서버 기준 상대경로: "data/..." 로 시작해야 합니다.
    // ─────────────────────────────────────────────
    try {
        await makeFromPath(
            mainRoot.querySelector("#c21"),
            "US 10Y Yield (Daily)",
            "data/economic/ust10y/ust10y_daily.json"
        );
    } catch (e) {
        console.error("UST10Y load failed:", e);
    }

    try {
        await makeFromPath(
            mainRoot.querySelector("#c22"),
            "PCE",
            "data/economic/pce/pce.json"
        );
    } catch (e) {
        console.error("PCE load failed:", e);
    }

    try {
        await makeFromPath(
            mainRoot.querySelector("#c23"),
            "KOSPI",
            "data/crypto/upbit/BTC/kospi_market.json"
        );
    } catch (e) {
        console.error("KOSPI load failed:", e);
    }

    // ─────────────────────────────────────────────
    // 3행: SPY / QQQ / SOXX (ETF, 지정 경로에서 직접 로드)
    // ─────────────────────────────────────────────
    try {
        await makeFromPath(
            mainRoot.querySelector("#c31"),
            "SPY (Daily)",
            "data/stocks/us/etf/SPY_daily.json"
        );
    } catch (e) {
        console.error("SPY load failed:", e);
    }

    try {
        await makeFromPath(
            mainRoot.querySelector("#c32"),
            "QQQ (Daily)",
            "data/stocks/us/etf/QQQ_daily.json"
        );
    } catch (e) {
        console.error("QQQ load failed:", e);
    }

    try {
        await makeFromPath(
            mainRoot.querySelector("#c33"),
            "SOXX (Daily)",
            "data/stocks/us/etf/SOXX_daily.json"
        );
    } catch (e) {
        console.error("SOXX load failed:", e);
    }

    // ─────────────────────────────────────────────
    // 정리
    // ─────────────────────────────────────────────
    return () => {
        disposers.forEach((fn) => {
            try { fn(); } catch { }
        });
        charts.forEach((ch) => {
            try { ch.remove(); } catch { }
        });
    };
}

export function dispose() { }
