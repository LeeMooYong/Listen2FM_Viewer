// Listen2FM_Viewer/plugins/economic/data/dataLoader.js

// 미국 10년물 국채금리 (일봉)
// 입력 JSON이 OHLC 형태이든 value(종가)만 있든 안전하게 처리
// ✅ 데이터 경로: data/economic/daily/ust10y_daily.json
export async function loadUST10YDaily() {
    const baseUrl = 'data/economic/daily/ust10y_daily.json';
    const url = `${baseUrl}?v=${Date.now()}`; // 캐시 방지

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();

        // time 또는 date(YYYY-MM-DD/ISO) 모두 허용
        const toUnix = (tLike) => {
            if (tLike == null) return undefined;
            if (typeof tLike === 'number') {
                // 초 단위 그대로, 밀리초(10^12 이상)면 변환
                return tLike > 1e11 ? Math.floor(tLike / 1000) : Math.floor(tLike);
            }
            if (typeof tLike === 'string') {
                const ms = Date.parse(tLike);
                return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
            }
            return undefined;
        };

        const toNum = (v) => (v == null ? undefined : Number(v));

        // 다양한 스키마 지원
        const arr = Array.isArray(raw) ? raw : [];
        const candles = arr.map((r) => {
            const t = toUnix(r.time ?? r.date);
            const open = r.open ?? r.o;
            const high = r.high ?? r.h;
            const low = r.low ?? r.l;
            const close = r.close ?? r.c;
            const vol = r.volume ?? r.v ?? 0;

            const hasOHLC = (open != null && high != null && low != null && close != null);

            if (hasOHLC) {
                return {
                    time: t,
                    open: toNum(open),
                    high: toNum(high),
                    low: toNum(low),
                    close: toNum(close),
                    volume: toNum(vol) || 0,
                };
            } else {
                const v = toNum(r.value ?? close);
                return {
                    time: t,
                    open: v,
                    high: v,
                    low: v,
                    close: v,
                    volume: 0,
                };
            }
        }).filter(c => Number.isFinite(c.time) && Number.isFinite(c.close));

        candles.sort((a, b) => a.time - b.time);
        return candles;
    } catch (e) {
        console.error('[economic/loadUST10YDaily] fetch failed:', url, e);
        return [];
    }
}
