// Listen2FM_Viewer/plugins/crypto/indicators/fgIndex.js

/**
 * FG Index 원시 데이터 로드
 * 기본 경로: data/crypto/fg_index/btc_feargreed_merged.json
 * 각 항목: { time:number, fg_value:number, ... }
 */
export async function loadFGIndexRaw(url = 'data/crypto/fg_index/btc_feargreed_merged.json') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FG Index fetch failed (${res.status})`);
    const json = await res.json();
    // time, fg_value만 사용
    return Array.isArray(json)
        ? json
            .filter(r => Number.isFinite(r.time) && Number.isFinite(r.fg_value))
            .map(r => ({ time: r.time, value: r.fg_value }))
        : [];
}

/**
 * 캔들 타임라인과 FG Index를 time 기준으로 맞춰서 반환
 * (동일 time만 취함, padWithWhitespace는 프리셋 쪽에서 수행)
 */
export function alignFGIndexToCandles(candles, fgRaw) {
    if (!Array.isArray(candles) || !candles.length || !Array.isArray(fgRaw)) return [];
    const fgMap = new Map(fgRaw.map(p => [p.time, p.value]));
    const out = [];
    for (const c of candles) {
        const v = fgMap.get(c.time);
        if (typeof v === 'number') out.push({ time: c.time, value: v });
    }
    return out;
}
