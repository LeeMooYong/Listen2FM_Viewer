// Listen2FM_Viewer/plugins/crypto/indicators/rsi.js

/**
 * RSI(Relative Strength Index) 계산
 * @param {Array<{time:number, close:number}>} candles
 * @param {number} period 기본 14
 * @returns {Array<{time:number, value:number}>}
 */
export function calculateRSI(candles, period = 14) {
    if (!Array.isArray(candles) || candles.length < period + 1) return [];
    const out = [];
    let avgGain = 0, avgLoss = 0;

    // 초기 평균
    for (let i = 1; i <= period; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        if (diff > 0) avgGain += diff;
        else avgLoss -= diff;
    }
    avgGain /= period;
    avgLoss /= period;

    const firstTime = candles[period].time;
    const firstRS = avgLoss === 0 ? Infinity : (avgGain / avgLoss);
    out.push({ time: firstTime, value: 100 - (100 / (1 + firstRS)) });

    // Wilder’s smoothing
    for (let i = period + 1; i < candles.length; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;

        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;

        const rs = avgLoss === 0 ? Infinity : (avgGain / avgLoss);
        out.push({ time: candles[i].time, value: 100 - (100 / (1 + rs)) });
    }
    return out;
}
