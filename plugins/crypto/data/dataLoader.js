// Listen2FM_Viewer/plugins/crypto/data/dataLoader.js
const cache = new Map();

// --------- 유틸 ---------
function normSymbol(input = "BTC") {
    // "솔라나/KRW", "SOL/KRW", "KRW-SOL", "sol" → "SOL"
    if (!input) return "BTC";
    const s = String(input).trim();
    // 한글 라벨이 포함되면 영어 티커만 남도록 분리
    const parts = s.split(/[\/\s]+/); // "SOL/KRW" or "솔라나/KRW"
    const last = parts[parts.length - 1];
    // KRW-SOL 형태면 뒤쪽 토큰 사용
    const hy = last.split("-");
    const token = hy.length === 2 ? hy[1] : last;
    return token.toUpperCase();
}

function bust(url) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}t=${Date.now()}`;
}

async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" }); // 네트워크 캐시 우회
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    return res.json();
}

function lastInfo(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return { len: 0, ts: null, close: null };
    const r = rows[rows.length - 1];
    return { len: rows.length, ts: Number(r.time) || null, close: r.close ?? null };
}

function toISO(ts) {
    if (!ts) return "N/A";
    return new Date(ts * 1000).toISOString().slice(0, 19) + "Z";
}

// --------- 로더(공용) ---------
async function loadSeries(url, cacheKey) {
    // 캐시 히트 시 즉시 반환
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    // 캐시 버스터 붙여서 항상 최신 파일
    const urlNC = bust(url);
    const data = await fetchJSON(urlNC);

    // 간단한 스키마 확인 + 정렬(혹시 역순이면 복구)
    if (Array.isArray(data)) {
        data.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    }

    cache.set(cacheKey, data);
    return data;
}

/**
 * 암호화폐 데이터를 로드
 * 폴더 구조: data/crypto/{exchange}/{symbol}/{symbol}_{timeframe}.json
 * 예) data/crypto/upbit/BTC/BTC_daily.json
 */
export async function loadCrypto({ symbol = "BTC", timeframe = "daily", exchange = "upbit" } = {}) {
    const sym = normSymbol(symbol);               // ← 심볼 정규화
    const tf = (timeframe || "daily").toLowerCase(); // "daily" / "monthly" 등
    const ex = (exchange || "upbit").toLowerCase();

    const key = `${ex}:${sym}:${tf}`;
    const file = `${sym}_${tf}.json`;
    const url = `data/crypto/${ex}/${sym}/${file}`;

    try {
        const rows = await loadSeries(url, key);

        // 로딩 진단 로그(경로/개수/마지막 시각/종가)
        const { len, ts, close } = lastInfo(rows);
        // eslint-disable-next-line no-console
        console.log(`[loadCrypto] ${key}`, {
            url,
            length: len,
            lastISO: toISO(ts),
            lastClose: close,
        });

        // 빈 배열이면 즉시 반환(침묵 금지)
        if (len === 0) {
            console.warn(`[loadCrypto] empty data for ${key} from ${url}`);
        }

        return rows;
    } catch (e) {
        console.error(`Error loading data for ${key}:`, e);
        return [];
    }
}

/**
 * BTC Fear & Greed merged 데이터 로드
 * 파일: data/crypto/fg_index/btc_feargreed_merged.json
 */
export async function loadFGI() {
    const key = `FGI:BTC:daily`;
    if (cache.has(key)) return cache.get(key);
    const url = `data/crypto/fg_index/btc_feargreed_merged.json`;
    try {
        const raw = await fetchJSON(bust(url));
        cache.set(key, raw);
        return raw;
    } catch (e) {
        console.error(`Error loading FGI:`, e);
        return [];
    }
}

/**
 * 월/일 최신 시각 정합성 체크(옵션)
 * - 일봉 마지막 시각이 월봉 마지막 시각보다 오래되면 경고를 띄웁니다.
 */
export async function loadCryptoWithCheck({ symbol = "BTC", exchange = "upbit" } = {}) {
    const daily = await loadCrypto({ symbol, timeframe: "daily", exchange });
    const monthly = await loadCrypto({ symbol, timeframe: "monthly", exchange });

    const di = lastInfo(daily);
    const mi = lastInfo(monthly);

    if (di.ts && mi.ts && di.ts < mi.ts) {
        console.warn(`[stale] Daily is older than Monthly for ${normSymbol(symbol)}: daily=${toISO(di.ts)} < monthly=${toISO(mi.ts)}`);
    }
    return { daily, monthly };
}
