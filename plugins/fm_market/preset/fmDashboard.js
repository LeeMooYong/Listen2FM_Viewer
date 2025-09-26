// plugins/fm_market/preset/fmDashboard.js
// 3×3 대시보드: 개별/공통 스케일 토글, 정렬(고정/수익률/변동성), 기간 변경에 따른 리렌더
import '../../shared/dashboard/style.js';
import { fetchCandles } from '../../shared/dashboard/adapters/dataHub.js';
import { performanceCard } from '../../shared/dashboard/widgets/performance.js';
import * as DB from '../../shared/dashboard/state.js';
import { buildPerformance } from '../../shared/dashboard/utils.js';

const SYMBOLS = ['UST10Year', 'VIXY', 'DXY', 'SPY', 'QQQ', 'SOXX', 'BTC', 'GOLD', 'WTI'];
const PERIOD_DAYS = { '5D': 5, '20D': 20, '60D': 60 };

function fitGridHeight(grid) {
    const top = grid.getBoundingClientRect().top;
    const h = Math.max(320, Math.floor(window.innerHeight - top - 16));
    grid.style.minHeight = h + 'px';
    const rowH = Math.max(140, Math.floor((h - 24) / 3));
    grid.style.gridTemplateRows = `repeat(3, minmax(${rowH}px, 1fr))`;
}

async function prepareData(period) {
    const days = PERIOD_DAYS[period] || 5;
    const items = await Promise.all(SYMBOLS.map(async sym => {
        try {
            const candles = await fetchCandles(sym, { timeframe: 'daily' });
            const perfObj = buildPerformance(candles, days);
            return { sym, candles, perfObj };
        } catch (e) {
            console.warn('[fmDashboard] load fail:', sym, e);
            return { sym, candles: [], perfObj: null };
        }
    }));
    return { days, items };
}

function computeDomainIfCommon(items) {
    let min = 0, max = 0;
    for (const it of items) {
        const arr = it.perfObj?.perf || [];
        for (const p of arr) {
            if (!Number.isFinite(p?.p)) continue;
            min = Math.min(min, p.p);
            max = Math.max(max, p.p);
        }
    }
    return { min, max };
}

function sortItems(items, mode) {
    const arr = items.slice();
    // ✅ 고정 순서: 정렬하지 않고 원래 로드된 순서(SYMBOLS) 유지
    if (mode === 'fixed') return arr;

    if (mode === 'retAsc') {
        arr.sort((a, b) => (a.perfObj?.retPct ?? -Infinity) - (b.perfObj?.retPct ?? -Infinity));
    } else if (mode === 'volDesc') {
        const vol = (it) => {
            const ys = (it.perfObj?.perf || []).map(d => d.p).filter(Number.isFinite);
            if (!ys.length) return -Infinity;
            return Math.abs(Math.max(...ys) - Math.min(...ys));
        };
        arr.sort((a, b) => vol(b) - vol(a));
    } else { // retDesc
        arr.sort((a, b) => (b.perfObj?.retPct ?? -Infinity) - (a.perfObj?.retPct ?? -Infinity));
    }
    return arr;
}

async function renderGrid(grid) {
    grid.innerHTML = '';
    const period = DB.getPeriod();
    const scale = DB.getScaleMode();
    const sort = DB.getSortMode();

    const { days, items } = await prepareData(period);
    const domain = (scale === 'common') ? computeDomainIfCommon(items) : null;
    const sorted = sortItems(items, sort);

    for (const it of sorted) {
        const cell = document.createElement('div');
        grid.appendChild(cell);
        await performanceCard({
            container: cell,
            symbol: it.sym,
            candles: it.candles,
            periodDays: days,
            precomputed: it.perfObj,
            yDomain: domain
        });
    }
}

export async function mount({ mainRoot, mountId } = {}) {
    const host = document.getElementById(mountId) || mainRoot;
    if (!host) return () => { };

    host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'l2fm-db-root';
    const grid = document.createElement('div');
    grid.className = 'l2fm-db-grid';
    root.appendChild(grid);
    host.appendChild(root);

    const onResize = () => fitGridHeight(grid);
    onResize(); window.addEventListener('resize', onResize);

    // 첫 렌더
    await renderGrid(grid);

    // 상태 변경 구독 (기간/스케일/정렬)
    const off1 = DB.onPeriodChange(() => renderGrid(grid));
    const off2 = DB.onScaleChange(() => renderGrid(grid));
    const off3 = DB.onSortChange(() => renderGrid(grid));

    return () => {
        window.removeEventListener('resize', onResize);
        off1?.(); off2?.(); off3?.();
        host.innerHTML = '';
    };
}

export default { mount };
