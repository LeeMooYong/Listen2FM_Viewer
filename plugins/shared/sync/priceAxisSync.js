// Listen2FM_Viewer/plugins/crypto/sync/priceAxisSync.js

// 컨테이너 오른쪽에 패딩 div를 두어 모든 차트의 우측 가격축 폭을 동일화
function wrap(container) {
    if (container.__spWrapped) return;
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.width = '100%';
    wrap.style.height = '100%';

    const box = document.createElement('div');
    box.style.flex = '1 1 auto';
    box.style.minWidth = '0';
    box.style.height = '100%';

    const sp = document.createElement('div');
    sp.style.flex = '0 0 auto';
    sp.style.width = '0px';
    sp.style.height = '100%';

    const p = container.parentElement;
    p.insertBefore(wrap, container);
    wrap.appendChild(box);
    wrap.appendChild(sp);
    box.appendChild(container);

    container.__spWrapped = true;
    container.__spBox = box;
    container.__spRight = sp;
}

function axisWidth(entry) {
    try {
        const w = entry.chart.priceScale('right').width();
        return Number.isFinite(w) ? w : 0;
    } catch {
        return 0;
    }
}

function syncOnce(entries) {
    let target = 0;
    entries.forEach(e => { const w = axisWidth(e); if (w > target) target = w; });
    entries.forEach(e => {
        const pad = Math.max(0, target - axisWidth(e));
        if (e.container.__spRight) e.container.__spRight.style.width = pad + 'px';
    });
}

/**
 * 모든 차트의 우측 가격축 폭을 동기화
 * @param {Array<{chart:any, container:HTMLElement}>} pairs
 * @returns {{dispose:Function}}
 */
export function observeAndSyncPriceAxisWidth(pairs) {
    const es = pairs.filter(p => p?.container && p?.chart);
    es.forEach(e => wrap(e.container));

    const ro = new ResizeObserver(() => syncOnce(es));
    es.forEach(e => ro.observe(e.container));

    const unsub = [];
    es.forEach(e => {
        const api = e.chart.priceScale('right');
        if (api?.subscribeSizeChange) {
            const cb = () => syncOnce(es);
            api.subscribeSizeChange(cb);
            unsub.push(() => api.unsubscribeSizeChange(cb));
        }
    });

    requestAnimationFrame(() => syncOnce(es));

    return {
        dispose: () => {
            try { ro.disconnect(); } catch { }
            unsub.forEach(fn => { try { fn(); } catch { } });
        }
    };
}

// 기본 내보내기도 추가(호환성)
export default observeAndSyncPriceAxisWidth;
