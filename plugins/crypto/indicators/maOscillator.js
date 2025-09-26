// Listen2FM_Viewer/plugins/crypto/indicators/maOscillator.js
import { calculateSMA } from "./movingAverage.js";

/**
 * MA Oscillator = SMA(fast) - SMA(slow)
 * 기본: fast=20, slow=60
 * @param {Array<{time:number, close:number}>} candles
 * @param {number} fast
 * @param {number} slow
 * @returns {Array<{time:number, value:number}>}
 */
export function calculateMAOscillator(candles, fast = 20, slow = 60) {
    if (!Array.isArray(candles) || candles.length < Math.max(fast, slow)) return [];

    const smaFast = calculateSMA(candles, fast);
    const smaSlow = calculateSMA(candles, slow);

    // time 기준으로 정렬/매칭
    const slowMap = new Map(smaSlow.map(p => [p.time, p.value]));
    const out = [];
    for (const f of smaFast) {
        const sv = slowMap.get(f.time);
        if (typeof sv === "number") out.push({ time: f.time, value: f.value - sv });
    }
    return out;
}
