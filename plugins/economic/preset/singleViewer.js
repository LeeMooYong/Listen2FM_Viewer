// Listen2FM_Viewer/plugins/economic/preset/singleViewer.js
// Econ Single Viewer — value-only → synthetic OHLC 로 캔들 표시 + MA
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import { baseChartOptions, createTitleOverlay } from "../../crypto/preset/_common.js";

const UP = "#26a69a";
const DOWN = "#ef5350";
const V = () => `?v=${Date.now()}`;

// ───────── helpers ─────────
function toUnixSec(t) {
    if (t == null) return undefined;
    if (typeof t === "number") return t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
    if (typeof t === "string") {
        const ms = Date.parse(t);
        return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
    }
    return undefined;
}
function stripJsonComments(txt) {
    let s = txt.replace(/\/\*[\s\S]*?\*\//g, "");
    s = s.replace(/(^|[^:])\/\/.*$/gm, "$1");
    return s;
}
async function fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { return JSON.parse(stripJsonComments(txt)); }
}

/** any→candles : OHLC가 있으면 그대로, 없으면 O=H=L=C 로 합성 */
function asCandles(raw) {
    const arr = Array.isArray(raw) ? raw : [];
    const out = arr.map(r => {
        if (!r) return null;
        const keys = Object.keys(r);
        const tk = keys.find(k => ["time", "timestamp", "date"].includes(k.toLowerCase()));
        const ok = keys.find(k => ["open", "o"].includes(k.toLowerCase()));
        const hk = keys.find(k => ["high", "h"].includes(k.toLowerCase()));
        const lk = keys.find(k => ["low", "l"].includes(k.toLowerCase()));
        const ck = keys.find(k => ["close", "c", "value", "yield", "price", "index"].includes(k.toLowerCase()));
        const t = toUnixSec(r[tk]);
        // 진짜 OHLC
        if (ok != null && hk != null && lk != null && ck != null && r[ok] != null && r[hk] != null && r[lk] != null && r[ck] != null) {
            return {
                time: t,
                open: Number(r[ok]),
                high: Number(r[hk]),
                low: Number(r[lk]),
                close: Number(r[ck]),
            };
        }
        // value-only → synthetic OHLC
        if (ck != null && r[ck] != null) {
            const v = Number(r[ck]);
            return { time: t, open: v, high: v, low: v, close: v };
        }
        return null;
    }).filter(Boolean).filter(c => Number.isFinite(c.time) && Number.isFinite(c.close))
        .sort((a, b) => a.time - b.time);
    return out;
}

function setInitialRange(chart, data, bars = 400) {
    try {
        const total = data.length;
        const from = Math.max(0, total - bars);
        chart.timeScale().setVisibleLogicalRange({ from, to: total - 1 });
    } catch { }
}

function titleFromId(id, freq) {
    const m = {
        ust10y: "미국채 10Y",
        ust2y: "미국채 2Y",
        dxy: "달러인덱스 (DXY)",
        wti: "WTI 원유",
        gold: "Gold(온스당)",
    };
    return `${m[id] || id} (${freq})`;
}

function pathFor(id, freq) {
    // 프로젝트의 실제 경로 규칙에 맞춰 daily/monthly 폴더 사용
    // 예: data/economic/daily/ust10y_daily.json
    const key = id.toLowerCase();
    const base = `data/economic/${freq}/${key}_${freq}.json`;
    return `${base}${V()}`;
}

// ───────── chart ─────────
function makeCandleChart(LWC, el, title, candles) {
    createTitleOverlay(el, title);
    const ch = LWC.createChart(el, baseChartOptions(LWC));

    // 이동평균 (거래량 없음)
    const ma240 = ch.addLineSeries({ color: "magenta", lineWidth: 4, priceLineVisible: false, lastValueVisible: false });
    const ma120 = ch.addLineSeries({ color: "darkorange", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const ma060 = ch.addLineSeries({ color: "green", lineWidth: 3, priceLineVisible: false, lastValueVisible: false });
    const ma020 = ch.addLineSeries({ color: "white", lineWidth: 2, priceLineVisible: false, lastValueVisible: false }); // econ은 20을 흰색으로

    ma240.setData(calculateSMA(candles, 240));
    ma120.setData(calculateSMA(candles, 120));
    ma060.setData(calculateSMA(candles, 60));
    ma020.setData(calculateSMA(candles, 20));

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

    setInitialRange(ch, candles, 500);
    const onDbl = () => setInitialRange(ch, candles, 500);
    el.addEventListener("dblclick", onDbl);

    return {
        chart: ch,
        cleanup: () => el.removeEventListener("dblclick", onDbl),
    };
}

// ───────── mount ─────────
async function _mount({ mainRoot, indicatorId = "ust10y", frequency = "daily" }) {
    const LWC = window.LightweightCharts;
    if (!LWC) {
        mainRoot.innerHTML = '<p style="color:#f66;padding:8px">LightweightCharts 로드 실패</p>';
        return () => { };
    }

    mainRoot.innerHTML = `<div id="econ-single" style="position:relative; height:100%;"></div>`;
    const host = mainRoot.querySelector("#econ-single");

    try {
        const path = pathFor(indicatorId, frequency);
        const raw = await fetchJSON(path);
        const candles = asCandles(raw);

        // value-only이면 합성 캔들로, OHLC면 그대로 캔들로
        const { cleanup } = makeCandleChart(LWC, host, titleFromId(indicatorId, frequency), candles);

        return () => {
            try { cleanup?.(); } catch { }
            try { host?.parentElement && (host.innerHTML = ""); } catch { }
        };
    } catch (e) {
        console.error("[econ/singleViewer] load failed:", indicatorId, frequency, e);
        host.innerHTML = `<div style="color:#f66; position:absolute; top:8px; left:8px;">데이터 로드 실패</div>`;
        return () => { };
    }
}

// 라우터 호환: 여러 이름으로 export
export async function mountSingleViewer(opts) { return _mount(opts); }
export async function mountEconSingleViewer(opts) { return _mount(opts); }
export async function mountEconViewer(opts) { return _mount(opts); }
export function dispose() { }
