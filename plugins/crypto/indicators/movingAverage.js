// Listen2FM_Viewer/plugins/crypto/indicators/movingAverage.js

/**
 * 단순 이동평균(SMA)을 계산하는 함수
 * @param {Array<{time:number, close:number}>} candles - 캔들 데이터 배열
 * @param {number} period - 계산 기간
 * @returns {Array<{time:number, value:number}>} - 이동평균 데이터 배열
 */
export function calculateSMA(candles, period) {
    if (!Array.isArray(candles) || candles.length < period) {
        return [];
    }

    const result = [];
    let sum = 0;

    // 초기 합계 계산
    for (let i = 0; i < period; i++) {
        sum += candles[i].close;
    }

    // 첫 번째 SMA 값
    result.push({
        time: candles[period - 1].time,
        value: sum / period,
    });

    // 나머지 값 계산
    for (let i = period; i < candles.length; i++) {
        sum += candles[i].close - candles[i - period].close;
        result.push({
            time: candles[i].time,
            value: sum / period,
        });
    }

    return result;
}