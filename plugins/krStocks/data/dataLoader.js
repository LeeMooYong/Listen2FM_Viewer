// Listen2FM_Viewer/plugins/krStocks/data/dataLoader.js
import { loadKRCatalog, resolveItem } from "./catalog.js";

const BASE = "/data/krStocks"; // 정적 데이터 루트
const TF_MAP = {
    monthly: "monthly", months: "monthly", month: "monthly",
    weekly: "weekly", week: "weekly",
    daily: "daily", day: "daily",
    "30m": "30m", "60m": "60m", "1h": "60m",
    "5m": "5m"
};
const INDEX_FOLDERS = new Set(["kospi", "kosdaq"]); // market_analysis 하위

let _catalogCache = null;
async function getCatalog() {
    if (_catalogCache) return _catalogCache;
    _catalogCache = await loadKRCatalog(`${BASE}/catalog.kr.json`);
    return _catalogCache;
}

function asString(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    return "";
}

/** 진단용 */
function lastInfo(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return { len: 0, ts: null, close: null };
    const r = rows[rows.length - 1];
    return { len: rows.length, ts: Number(r.time) || null, close: r.close ?? null };
}
function toISO(ts) { return ts ? new Date(ts * 1000).toISOString().slice(0, 19) + "Z" : "N/A"; }

/**
 * 다양한 형태의 입력을 안전하게 정규화
 * - 허용 입력:
 *   - code: "005930" | 5930
 *   - symbol/name: "삼성전자"
 *   - meta 객체: { code, display, folder, market }
 *     → 단, 이 중 최소 하나라도 유효해야 "메타로 인정"
 */
export async function normalizeKRInput(params = {}) {
    let { code, symbol, name, folder, display, market } = params;

    // 0) folder/display가 직접 넘어오면 그 자체로 사용
    const directFolder = asString(folder);
    const directDisplay = asString(display);
    const directMarket = asString(market);
    if (directFolder || directDisplay) {
        return {
            code: asString(code),
            display: directDisplay || directFolder,
            folder: directFolder || directDisplay,
            market: directMarket || "kospi",
        };
    }

    // 1) symbol이 객체로 넘어온 경우
    if (symbol && typeof symbol === "object") {
        const m = symbol;
        const mCode = asString(m.code);
        const mDisplay = asString(m.display) || asString(m.name);
        const mFolder = asString(m.folder) || mDisplay;
        const mMarket = asString(m.market) || "kospi";
        const hasAny = mCode || mDisplay || mFolder;
        if (hasAny) {
            return { code: mCode, display: mDisplay || mFolder, folder: mFolder || mDisplay, market: mMarket };
        }
    }

    // 2) 코드 우선
    const rawCode = asString(code);
    if (rawCode) {
        const catalog = await getCatalog();
        const meta = resolveItem(catalog.lookup, rawCode);
        return { code: meta.code, display: meta.display, folder: meta.folder, market: meta.market };
    }

    // 3) 이름/심볼 문자열
    const rawName = asString(symbol) || asString(name);
    if (rawName) {
        const lower = rawName.toLowerCase();
        if (INDEX_FOLDERS.has(lower)) return { code: "", display: lower, folder: lower, market: "kospi" };

        const catalog = await getCatalog();
        // display 기준 정확 매칭
        for (const [k, v] of Object.entries(catalog.lookup || {})) {
            if (v?.display === rawName) {
                const meta = resolveItem(catalog.lookup, k);
                return { code: meta.code, display: meta.display, folder: meta.folder, market: meta.market };
            }
        }
        // 못 찾으면 이름 자체를 폴더/표시로 가정(초기 호환)
        return { code: "", display: rawName, folder: rawName, market: "kospi" };
    }

    // 4) 완전 빈 입력 → 기본값(삼성전자)
    const catalog = await getCatalog();
    const fallback = resolveItem(catalog.lookup, "005930");
    return { code: fallback.code, display: fallback.display, folder: fallback.folder, market: fallback.market };
}

/** 실제 파일 경로 구성 (디렉터리 트리와 일치) */
export function buildURL(meta, timeframe) {
    const tf = TF_MAP[(timeframe || "daily").toLowerCase()] || "daily";

    // 시장 지수
    if (INDEX_FOLDERS.has((meta.folder || "").toLowerCase())) {
        const f = encodeURIComponent((meta.folder || "").toLowerCase());
        return `${BASE}/market_analysis/${f}/${f}_${tf}.json?v=${Date.now()}`;
        // 예: /data/krStocks/market_analysis/kospi/kospi_daily.json
    }

    // 개별 종목
    const folder = encodeURIComponent(meta.folder || "");
    const fname = encodeURIComponent(meta.display || meta.folder || "");
    return `${BASE}/individual_stocks/${folder}/${fname}_${tf}.json?v=${Date.now()}`;
}

/** 공용 fetch(JSON) */
async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
}

/** 메인: KR 주식 캔들 로더 */
export async function loadKRStockCandles(params = {}) {
    const meta = await normalizeKRInput(params);
    const url = buildURL(meta, params.timeframe || "daily");
    const raw = await fetchJSON(url);

    // 숫자/정렬/중복 보정
    const out = (raw || []).map(r => ({
        time: Number(r.time), // 문자열로 와도 정수화
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

    // 정렬(보장)
    out.sort((a, b) => a.time - b.time);

    // 같은 time 중복 제거(마지막 값 우선)
    const dedup = [];
    let prevT = null;
    for (const row of out) {
        if (row.time !== prevT) {
            dedup.push(row);
            prevT = row.time;
        } else {
            dedup[dedup.length - 1] = row; // 중복이면 최신으로 교체
        }
    }

    // 진단 로그
    const info = lastInfo(dedup);
    // eslint-disable-next-line no-console
    console.log(`[loadKRStockCandles] ${meta.folder} ${params.timeframe || "daily"}`, {
        url, length: info.len, lastISO: toISO(info.ts), lastClose: info.close
    });

    if (info.len === 0) {
        console.warn(`[loadKRStockCandles] empty data: ${url}`);
    }

    return dedup;
}

// 과거 호환 별칭
export const loadKRStocks = loadKRStockCandles;
export const loadKRStock = loadKRStockCandles;
export const loadKR = loadKRStockCandles;
export const loadKRCandles = loadKRStockCandles;
export const loadKRCandlesSafe = loadKRStockCandles;
