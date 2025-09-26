// Listen2FM_Viewer/plugins/crypto/indicators/macd.js
// MACD 계산: EMA(fast) - EMA(slow), Signal = EMA(MACD, signalPeriod)
// ✅ 히스토그램(time 정렬) 수정: Signal[i]는 macd[i + (signalPeriod - 1)]와 동일 시점

/**
 * candlesOrSeries: Array<{ time:number, close?:number, value?:number }>
 * 반환: Array<{ time:number, value:number }>
 */
function emaFrom(candlesOrSeries, period) {
    if (!Array.isArray(candlesOrSeries) || period <= 0) return [];
    const n = candlesOrSeries.length;
    if (n < period) return [];

    const getVal = (r) => (Number.isFinite(r?.close) ? r.close : r?.value);

    // 초기 SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
        const v = getVal(candlesOrSeries[i]);
        if (!Number.isFinite(v)) return [];
        sum += v;
    }
    const out = [];
    let prevEma = sum / period;
    const firstTime = candlesOrSeries[period - 1]?.time;
    out.push({ time: firstTime, value: prevEma });

    const k = 2 / (period + 1);
    for (let i = period; i < n; i++) {
        const v = getVal(candlesOrSeries[i]);
        if (!Number.isFinite(v)) continue;
        prevEma = v * k + prevEma * (1 - k);
        out.push({ time: candlesOrSeries[i].time, value: prevEma });
    }
    return out;
}

/**
 * MACD 계산
 * fastPeriod, slowPeriod, signalPeriod는 일반적으로 12/26/9
 * (월봉 전용 등 다른 파라미터도 지원)
 */
export function calculateMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!Array.isArray(candles)) return { macd: [], signal: [], histogram: [] };

    // 데이터 충분성 체크
    const minLen = Math.max(slowPeriod + signalPeriod, fastPeriod + signalPeriod);
    if (candles.length < minLen) {
        return { macd: [], signal: [], histogram: [] };
    }

    // EMA(fast), EMA(slow) — 둘 다 candle close 기준
    const fastEma = emaFrom(candles, fastPeriod);
    const slowEma = emaFrom(candles, slowPeriod);

    // MACD 라인: slowEma 타임라인에 fastEma를 맞춰서 계산
    const macd = [];
    // slowEma[0]는 candles[slowPeriod-1] 시점
    // fastEma는 candles[fastPeriod-1]부터 시작 → 인덱스 보정 필요
    const offsetFast = slowPeriod - fastPeriod; // slowEma[i] ↔ fastEma[i + offsetFast]
    for (let i = 0; i < slowEma.length; i++) {
        const feIdx = i + offsetFast;
        if (feIdx < 0 || feIdx >= fastEma.length) continue;
        const mVal = fastEma[feIdx].value - slowEma[i].value;
        macd.push({ time: slowEma[i].time, value: mVal });
    }

    // 시그널: MACD에 대해 EMA(signalPeriod)
    const signal = emaFrom(macd, signalPeriod);

    // ✅ 히스토그램 정렬
    // signal[0]는 macd[signalPeriod-1]와 같은 시점이므로,
    // histogram[i] = macd[i + (signalPeriod - 1)] - signal[i]
    const histogram = [];
    const macdShift = signalPeriod - 1;
    for (let i = 0; i < signal.length; i++) {
        const m = macd[i + macdShift];
        if (!m) break;
        histogram.push({ time: signal[i].time, value: m.value - signal[i].value });
    }

    return { macd, signal, histogram };
}

export default calculateMACD;
