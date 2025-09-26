// Listen2FM_Viewer/plugins/crypto/preset/_common.js

// 공통 옵션
export function baseChartOptions(LWC) {
    return {
        layout: { background: { type: 'solid', color: '#0e0f13' }, textColor: '#e8e8ea' },
        grid: { vertLines: { color: '#2a2b31' }, horzLines: { color: '#2a2b31' } },
        rightPriceScale: { borderColor: '#2a2b31' },
        timeScale: { borderColor: '#2a2b31', rightOffset: 2 },
        crosshair: { mode: LWC.CrosshairMode.Normal },
        autoSize: true
    };
}

// 메인→보조 단방향 링크
export function linkTimeScalesOneWay(mainChart, subChart) {
    const mainTs = mainChart.timeScale();
    const subTs = subChart.timeScale();

    const apply = (r) => { if (r) { try { subTs.setVisibleLogicalRange(r); } catch { } } };
    const onLog = (r) => apply(r);

    mainTs.subscribeVisibleLogicalRangeChange(onLog);
    try { const cur = mainTs.getVisibleLogicalRange?.(); if (cur) apply(cur); } catch { }

    return { dispose() { try { mainTs.unsubscribeVisibleLogicalRangeChange(onLog); } catch { } } };
}

// 보조지표 타임라인 캔들에 정렬(앞 공백 채우기)
export function padWithWhitespace(fullCandles, seriesData) {
    if (!Array.isArray(seriesData) || !seriesData.length) return [];
    const firstIdx = fullCandles.findIndex(c => c.time === seriesData[0].time);
    if (firstIdx <= 0) return seriesData;
    const pad = [];
    for (let k = 0; k < firstIdx; k++) pad.push({ time: fullCandles[k].time });
    return pad.concat(seriesData);
}

// 가격축 폭 재정렬(보강)
export function resyncAxisPadding(pairs) {
    const getW = (c) => { try { const w = c.priceScale('right').width(); return Number.isFinite(w) ? w : 0; } catch { return 0; } };
    const widths = pairs.map(p => getW(p.chart));
    const target = Math.max(...widths, 0);
    pairs.forEach((p, i) => {
        const pad = Math.max(0, target - widths[i]);
        if (p.container.__spRight) p.container.__spRight.style.width = pad + 'px';
    });
}

// 초기 바 수 설정 (ex. 360)
export function setInitialVisibleRange(chart, candles, bars = 360) {
    try {
        const ts = chart.timeScale();
        const total = candles.length;
        const from = Math.max(0, total - bars);
        ts.setVisibleLogicalRange({ from, to: total - 1 });
    } catch { }
}

// 타이틀 오버레이
export function createTitleOverlay(elMain, text) {
    const titleEl = document.createElement('div');
    Object.assign(titleEl.style, {
        position: 'absolute',
        top: '20px',
        left: 0, right: 0,
        textAlign: 'center',
        fontWeight: '700',
        fontSize: '20px',
        color: '#e8e8ea',
        textShadow: '0 0 6px rgba(0,0,0,0.6)',
        pointerEvents: 'none',
        zIndex: 6
    });
    titleEl.textContent = String(text ?? '');
    elMain.appendChild(titleEl);
    return titleEl;
}

/**
 * 심볼/메타 → 표시 문자열로 안전 변환
 * - 문자열: 그대로
 * - 객체: display > folder > code > name 순으로 사용
 * - 그 외/undefined: 빈 문자열
 * (router에서 Promise는 이미 해제되지만, 혹시 모를 실수를 대비해 방어)
 */
export function labelOfSymbol(sym) {
    try {
        if (sym == null) return '';
        if (typeof sym === 'string' || typeof sym === 'number') return String(sym);
        if (typeof sym === 'object') {
            return (
                sym.display ||
                sym.folder ||
                sym.code ||
                sym.name ||
                ''
            );
        }
        return String(sym);
    } catch {
        return '';
    }
}
