// plugins/crypto/preset/cryptoDashboard.js
// Crypto 3×3 Price Performance Dashboard (5D/20D/60D, 개별/공통 스케일, 정렬 fixed/retDesc/retAsc/volDesc)

import '../../shared/dashboard/style.js';
import * as DB from '../../shared/dashboard/state.js';
import { buildPerformance } from '../../shared/dashboard/utils.js';
import { performanceCard } from '../../shared/dashboard/widgets/performance.js';

// ───────────────────────────── 설정 ─────────────────────────────
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'AAVE', 'XRP', 'LINK', 'ADA', 'XLM', 'HBAR'];
const PERIOD_DAYS = { '5D': 5, '20D': 20, '60D': 60 };

// crypto 전용 파일 경로(일봉)
const pathOf = (sym) => `data/crypto/upbit/${sym}/${sym}_daily.json`;

// 표준화 유틸(퍼포먼스 모듈은 time=ms 기준)
const toEpochMs = (t) => {
    if (t == null) return NaN;
    if (typeof t === 'number') return t > 1e12 ? Math.floor(t) : Math.floor(t * 1000);
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms : NaN;
};
const toNum = (x) => {
    const v = typeof x === 'string' ? parseFloat(x) : x;
    return Number.isFinite(v) ? v : NaN;
};

// cache bust + no-store
async function fetchJSON(url) {
    const bust = url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now();
    const res = await fetch(bust, { cache: 'no-store' });
    if (!res.ok) throw new Error(`[cryptoDashboard] HTTP ${res.status} ${url}`);
    return res.json();
}

// 암호화폐 일봉 로더(→ time=ms 로 표준화)
async function fetchCryptoCandles(sym) {
    const raw = await fetchJSON(pathOf(sym));
    const rows = (Array.isArray(raw) ? raw : []).map(d => ({
        time: toEpochMs(d.time),
        open: toNum(d.open),
        high: toNum(d.high),
        low: toNum(d.low),
        close: toNum(d.close),
        volume: toNum(d.volume),
    }))
        .filter(r =>
            Number.isFinite(r.time) &&
            Number.isFinite(r.open) &&
            Number.isFinite(r.high) &&
            Number.isFinite(r.low) &&
            Number.isFinite(r.close)
        )
        .sort((a, b) => a.time - b.time);
    return rows;
}

// ───────────────────────────── 내부 로직 ─────────────────────────────
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
            const candles = await fetchCryptoCandles(sym);
            const perfObj = buildPerformance(candles, days);
            return { sym, candles, perfObj };
        } catch (e) {
            console.warn('[cryptoDashboard] load fail:', sym, e);
            return { sym, candles: [], perfObj: null };
        }
    }));
    return { days, items };
}

function computeDomainIfCommon(items) {
    let min = 0, max = 0; // 0% 반드시 포함
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
    if (mode === 'fixed') return arr;
    if (mode === 'retAsc') {
        arr.sort((a, b) => (a.perfObj?.retPct ?? -Infinity) - (b.perfObj?.retPct ?? -Infinity));
    } else if (mode === 'volDesc') {
        const vol = (it) => {
            const ys = (it.perfObj?.perf || []).map(d => d.p).filter(Number.isFinite);
            if (!ys.length) return -Infinity;
            return Math.abs(Math.max(...ys) - Math.min(...ys)); // 간단 변동폭 기준
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
            candles: it.candles,     // ms 타임스탬프
            periodDays: days,
            precomputed: it.perfObj, // buildPerformance 결과 그대로 전달
            yDomain: domain          // 공통 스케일용 min/max(%) 범위
        });
    }
}

// ───────────────────────────── public API ─────────────────────────────
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

    await renderGrid(grid);

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
