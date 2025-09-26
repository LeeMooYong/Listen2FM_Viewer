// plugins/usStocks/data/dataLoader.js
// 개별종목 + ETF 통합 로더 (경로 스타일을 명시적으로 선택해 404를 없앰)

const ETF_SET = new Set([
    "SPY", "QQQ", "DIA", "IWM", "VTI", "VOO",
    "XLK", "XLF", "XLV", "XLE", "XLY", "XLI", "XLP", "XLU", "XLB", "XLRE", "SMH",
    "SPXL", "TQQQ", "SOXX", "SOXL",
]);

export function registerETFSymbols(symbols = []) {
    for (const s of symbols) if (s && typeof s === "string") ETF_SET.add(s.toUpperCase());
}

/* ───────────── 내부 유틸 ───────────── */

const TF_ALIAS = new Map([
    ["d", "daily"], ["1d", "daily"], ["day", "daily"], ["daily", "daily"],
    ["w", "weekly"], ["1w", "weekly"], ["week", "weekly"], ["weekly", "weekly"],
    ["m", "monthly"], ["1m", "monthly"], ["mon", "monthly"], ["monthly", "monthly"],
    ["60", "60m"], ["1h", "60m"], ["60m", "60m"], ["h1", "60m"],
    ["30", "30m"], ["30m", "30m"], ["m30", "30m"],
]);
function normTf(tf) { const k = String(tf || "daily").toLowerCase(); return TF_ALIAS.get(k) || "daily"; }

// 런타임 전환 가능한 데이터 루트/경로스타일
let __DATA_BASE__ = ".";
let __USSTOCKS_PATH_STYLE__ = "subfolder"; // "subfolder" | "root"
export function setDataBase(base = ".") { __DATA_BASE__ = String(base || ".").replace(/\/+$/, ""); }
export function setPathStyle(style = "subfolder") { __USSTOCKS_PATH_STYLE__ = (style === "root" ? "root" : "subfolder"); }

function dataBase() { return (typeof window !== "undefined" && window.__DATA_BASE__) || __DATA_BASE__; }
function pathStyle() { return (typeof window !== "undefined" && window.__USSTOCKS_PATH_STYLE__) || __USSTOCKS_PATH_STYLE__; }

async function fetchJSONSoft(url) {
    const withBust = url.includes("?") ? `${url}&v=${Date.now()}` : `${url}?v=${Date.now()}`;
    try {
        const res = await fetch(withBust, { cache: "no-store" });
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

/** 여러 후보 중 첫 성공 반환. 모두 실패하면 [] */
async function fetchFirst(paths) {
    for (const p of paths) {
        const json = await fetchJSONSoft(p);
        if (json && (Array.isArray(json) ? json.length : true)) return { data: json, url: p };
    }
    return { data: [], url: paths[0] };
}

// 숫자/정렬/중복 보정 + 간단 스키마 검증
function normalizeRows(raw) {
    const rows = Array.isArray(raw) ? raw : [];
    const out = rows.map(r => ({
        time: Number(r.time),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: r.volume != null ? Number(r.volume) : undefined,
    })).filter(d =>
        Number.isFinite(d.time) &&
        Number.isFinite(d.open) &&
        Number.isFinite(d.high) &&
        Number.isFinite(d.low) &&
        Number.isFinite(d.close)
    );
    out.sort((a, b) => a.time - b.time);
    const dedup = [];
    let prev = null;
    for (const row of out) {
        if (row.time !== prev) { dedup.push(row); prev = row.time; }
        else { dedup[dedup.length - 1] = row; } // 같은 time이면 마지막 값으로 교체
    }
    return dedup;
}
function lastInfo(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return { len: 0, ts: null, close: null };
    const r = rows[rows.length - 1]; return { len: rows.length, ts: Number(r.time) || null, close: r.close ?? null };
}
function toISO(ts) { return ts ? new Date(ts * 1000).toISOString().slice(0, 19) + "Z" : "N/A"; }

/* ───────────── 메인 로더 ───────────── */
/**
 * 통합 로더
 * @param {{symbol:string, timeframe?: "daily"|"weekly"|"monthly"|"60m"|"30m"}} param0
 * @returns {Promise<Array<{time:number, open:number, high:number, low:number, close:number, volume?:number}>>}
 */
export async function loadEquity({ symbol, timeframe = "daily" } = {}) {
    const sym = String(symbol || "").toUpperCase();
    const symLower = sym.toLowerCase();
    const tf = normTf(timeframe);

    const BASE = dataBase();
    const ETF_DIR = `${BASE}/data/usStocks/ETF`;
    const IND_DIR = `${BASE}/data/usStocks/individual_stocks`;
    const style = pathStyle();

    const etfSub = [
        `${ETF_DIR}/${sym}/${sym}_${tf}.json`,
        `${ETF_DIR}/${symLower}/${symLower}_${tf}.json`,
    ];
    const etfRoot = [`${ETF_DIR}/${sym}_${tf}.json`];
    const stkSub = [
        `${IND_DIR}/${sym}/${sym}_${tf}.json`,
        `${IND_DIR}/${symLower}/${symLower}_${tf}.json`,
    ];

    let candidates = ETF_SET.has(sym) ? (style === "root" ? etfRoot : etfSub) : stkSub;
    const typo = candidates.map(p => p.replace(/\.json(\?|$)/, ".josn$1"));

    const { data, url } = await fetchFirst([...candidates, ...typo]);
    const rows = normalizeRows(data);

    const info = lastInfo(rows);
    // 진단 로그: 어떤 경로에서 몇 건을 불러왔는지, 마지막 캔들 시각/종가
    // eslint-disable-next-line no-console
    console.log(`[US loadEquity] ${sym} ${tf}`, { url, length: info.len, lastISO: toISO(info.ts), lastClose: info.close });

    if (info.len === 0) {
        console.warn(`[US loadEquity] empty data for ${sym} ${tf} from ${url}`);
    }
    return rows;
}

/** (옵션) 일/월 최신성 교차검증 */
export async function loadEquityDailyMonthly({ symbol }) {
    const [d, m] = await Promise.all([
        loadEquity({ symbol, timeframe: "daily" }),
        loadEquity({ symbol, timeframe: "monthly" }),
    ]);
    const di = lastInfo(d), mi = lastInfo(m);
    if (di.ts && mi.ts && di.ts < mi.ts) {
        console.warn(`[US stale] daily older than monthly for ${symbol}: ${toISO(di.ts)} < ${toISO(mi.ts)}`);
    }
    return { daily: d, monthly: m };
}
