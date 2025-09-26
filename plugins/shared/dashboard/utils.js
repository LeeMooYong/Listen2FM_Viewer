export function periodToDays(p) {
    if (p === '5D') return 5;
    if (p === '20D') return 20;
    if (p === '60D') return 60;
    return 5;
}

export function buildPerformance(candles, days) {
    if (!Array.isArray(candles) || candles.length < 2) return null;
    const arr = [...candles].sort((a, b) => a.time - b.time);
    const tail = arr.slice(-Math.max(days + 1, 2));
    const base = tail[0];
    const last = tail[tail.length - 1];
    const retPct = base.close === 0 ? 0 : ((last.close - base.close) / Math.abs(base.close)) * 100;

    const perf = tail.map(c => ({
        t: c.time,
        p: base.close === 0 ? 0 : ((c.close - base.close) / Math.abs(base.close)) * 100
    }));
    return { retPct, perf, base, last };
}

// 간단 숫자 포맷 (원하면 프로젝트 공통 포맷터로 교체)
export const fmtPct = (x) => (x == null || isNaN(x) ? '—' : `${x.toFixed(2)}%`);
