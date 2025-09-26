// 심볼 → JSON 경로 매핑 (financialMarket_Daily3x3.js와 동일)
function versionSuffix() { return `?v=${Date.now()}`; }

const PATHS = {
    UST10Year: `data/economic/daily/ust10y_daily.json`,
    VIXY: `data/economic/daily/vixy_daily.json`,
    DXY: `data/economic/daily/dxy_daily.json`,
    SPY: `data/usStocks/ETF/SPY/SPY_daily.json`,
    QQQ: `data/usStocks/ETF/QQQ/QQQ_daily.json`,
    SOXX: `data/usStocks/ETF/SOXX/SOXX_daily.json`,
    BTC: `data/crypto/upbit/BTC/BTC_daily.json`,
    GOLD: `data/economic/daily/gold_daily.json`,
    WTI: `data/economic/daily/wti_daily.json`,
};

// ➜ 모든 time 을 "epoch-밀리초(ms)" 로 표준화
function toEpochMs(t) {
    if (t == null) return NaN;
    if (typeof t === 'number') {
        // 13자리면 이미 ms, 10~11자리면 s로 보고 ×1000
        return t > 1e12 ? Math.floor(t) : Math.floor(t * 1000);
    }
    if (typeof t === 'string') {
        const ms = Date.parse(t);        // 'YYYY-MM-DD' / ISO 모두 ms 반환
        return Number.isFinite(ms) ? ms : NaN;
    }
    return NaN;
}

function toNum(x) {
    const v = typeof x === 'string' ? parseFloat(x) : x;
    return Number.isFinite(v) ? v : NaN;
}

// 파일 기반 fetch (동일 도메인에서 서빙된다고 가정)
export async function fetchCandles(symbol, { timeframe = 'daily' } = {}) {
    const base = PATHS[symbol];
    if (!base) throw new Error(`[dataHub] unknown symbol: ${symbol}`);
    const url = `${base}${versionSuffix()}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`[dataHub] fetch failed ${symbol}: ${res.status}`);
    const json = await res.json();

    // 스키마 표준화 → time(ms) 사용
    let candles;
    if (Array.isArray(json) && json.length && json[0].value != null) {
        // {time,value} → 의사 캔들
        candles = json.map(d => ({
            time: toEpochMs(d.time),
            open: toNum(d.value),
            high: toNum(d.value),
            low: toNum(d.value),
            close: toNum(d.value),
            volume: 0
        }));
    } else {
        candles = (Array.isArray(json) ? json : []).map(d => ({
            time: toEpochMs(d.time),
            open: toNum(d.open),
            high: toNum(d.high),
            low: toNum(d.low),
            close: toNum(d.close),
            volume: toNum(d.volume)
        }));
    }

    // 잘못된 포인트 제거 + 정렬
    candles = candles
        .filter(c => Number.isFinite(c.time) && Number.isFinite(c.close))
        .sort((a, b) => a.time - b.time);

    return candles;
}
