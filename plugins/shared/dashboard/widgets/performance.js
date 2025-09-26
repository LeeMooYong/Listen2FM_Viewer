import { fmtPct, buildPerformance } from '../utils.js';

const COLOR_UP_STROKE = '#36d399';
const COLOR_DN_STROKE = '#f87272';
const FILL_UP = 'rgba(54,211,153,0.10)';
const FILL_DN = 'rgba(248,114,114,0.10)';
const ZERO_COLOR = '#ffd400';

const ymd = (ts) => {
    const d = new Date(ts); // ts 는 ms
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${da}`;
};

// perfRaw: [{t(ms), p}], yDomain: {min,max} (선택)
function renderSparkline(container, perfRaw, yDomain) {
    const perf = (perfRaw || []).filter(d => Number.isFinite(d?.t) && Number.isFinite(d?.p));
    container.innerHTML = '';
    if (perf.length < 2) { container.textContent = '데이터 부족'; return; }

    const rect = container.getBoundingClientRect();
    let w = Math.floor(rect.width), h = Math.floor(rect.height || 100);
    if (w < 2) {
        if (!container.dataset.deferOnce) {
            container.dataset.deferOnce = '1';
            requestAnimationFrame(() => renderSparkline(container, perf, yDomain));
            return;
        }
        w = 240; h = 100;
    }

    // ── 스케일 (0을 반드시 포함)
    const xs = perf.map(d => d.t);
    const ys = perf.map(d => d.p);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    let minY = Math.min(0, ...ys), maxY = Math.max(0, ...ys);
    if (yDomain && Number.isFinite(yDomain.min) && Number.isFinite(yDomain.max)) {
        minY = Math.min(0, yDomain.min);
        maxY = Math.max(0, yDomain.max);
    }
    const pad = 4;
    const sx = x => pad + (w - pad * 2) * ((x - minX) / (maxX - minX || 1));
    const sy = y => (h - pad) - (h - pad * 2) * ((y - minY) / (maxY - minY || 1));

    // ── 0 교차점 보정
    const pts = [];
    pts.push({ x: sx(perf[0].t), y: sy(perf[0].p), v: perf[0].p });
    for (let i = 1; i < perf.length; i++) {
        const p1 = perf[i - 1], p2 = perf[i];
        if ((p1.p > 0 && p2.p < 0) || (p1.p < 0 && p2.p > 0)) {
            const ratio = (0 - p1.p) / (p2.p - p1.p);
            const tx = p1.t + (p2.t - p1.t) * ratio;
            pts.push({ x: sx(tx), y: sy(0), v: 0 });
        }
        pts.push({ x: sx(p2.t), y: sy(p2.p), v: p2.p });
    }

    // ── 부호 러닝
    const runs = [];
    let cur = { sign: Math.sign(pts[0].v) || 0, points: [pts[0]] };
    for (let i = 1; i < pts.length; i++) {
        const s = Math.sign(pts[i].v) || 0;
        if (s === cur.sign || pts[i].v === 0 || cur.sign === 0) {
            cur.points.push(pts[i]);
            if (cur.sign === 0 && s !== 0) cur.sign = s;
        } else {
            runs.push(cur);
            cur = { sign: s, points: [pts[i - 1], pts[i]] };
        }
    }
    runs.push(cur);

    // ── SVG 본체
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    // 음영
    for (const r of runs) {
        if (r.points.length < 2) continue;
        const onlyPos = r.points.some(p => p.v > 0) && !r.points.some(p => p.v < 0);
        const onlyNeg = r.points.some(p => p.v < 0) && !r.points.some(p => p.v > 0);
        if (!(onlyPos || onlyNeg)) continue;
        const fill = onlyPos ? FILL_UP : FILL_DN;
        const d0 = r.points.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
        const last = r.points[r.points.length - 1];
        const first = r.points[0];
        const dPoly = `${d0} L ${last.x} ${sy(0)} L ${first.x} ${sy(0)} Z`;
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', dPoly);
        path.setAttribute('fill', fill);
        path.setAttribute('stroke', 'none');
        svg.appendChild(path);
    }

    // 라인 1px (위=녹 / 아래=빨)
    for (const r of runs) {
        if (r.points.length < 2) continue;
        const onlyPos = r.points.some(p => p.v > 0) && !r.points.some(p => p.v < 0);
        const onlyNeg = r.points.some(p => p.v < 0) && !r.points.some(p => p.v > 0);
        const col = onlyPos ? COLOR_UP_STROKE : onlyNeg ? COLOR_DN_STROKE : '#cfd3d7';
        const d = r.points.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', col);
        path.setAttribute('stroke-width', '1');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);
    }

    // 0선(노란 실선)
    const zero = document.createElementNS(svg.namespaceURI, 'line');
    zero.setAttribute('x1', '0'); zero.setAttribute('x2', String(w));
    const zy = sy(0);
    zero.setAttribute('y1', String(zy)); zero.setAttribute('y2', String(zy));
    zero.setAttribute('stroke', ZERO_COLOR);
    zero.setAttribute('stroke-width', '1.25');
    svg.appendChild(zero);

    container.appendChild(svg);

    // 0% 라벨
    const zeroLbl = document.createElement('div');
    zeroLbl.className = 'l2fm-zero';
    zeroLbl.style.top = `${zy}px`;
    zeroLbl.textContent = '0%';
    container.appendChild(zeroLbl);

    // 마지막 점 펄스
    const last = perf[perf.length - 1];
    const pulse = document.createElement('div');
    pulse.className = 'l2fm-pulse';
    pulse.style.left = (sx(last.t)) + 'px';
    pulse.style.top = (sy(last.p)) + 'px';
    container.appendChild(pulse);

    // ── 하단 시작/현재 날짜 라벨
    const dates = document.createElement('div');
    dates.className = 'l2fm-db-dates';
    dates.innerHTML = `<span>${ymd(perf[0].t)}</span><span>${ymd(perf[perf.length - 1].t)}</span>`;
    container.appendChild(dates);

    // ── 툴팁(날짜/퍼포먼스)
    const tip = document.createElement('div');
    tip.className = 'l2fm-tip';
    tip.style.display = 'none';
    container.appendChild(tip);

    const onMove = (e) => {
        const bx = container.getBoundingClientRect();
        const x = e.clientX - bx.left;
        // 가장 가까운 포인트 찾기
        let bestI = 0, bestDx = Infinity;
        for (let i = 0; i < perf.length; i++) {
            const dx = Math.abs(sx(perf[i].t) - x);
            if (dx < bestDx) { bestDx = dx; bestI = i; }
        }
        const p = perf[bestI];
        tip.style.display = 'block';
        tip.style.left = `${sx(p.t)}px`;
        tip.style.top = `${sy(p.p)}px`;
        tip.innerHTML = `${ymd(p.t)}<br><b>${fmtPct(p.p)}</b>`;
    };
    const onLeave = () => { tip.style.display = 'none'; };

    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
}

export async function performanceCard({ container, symbol, candles, periodDays, precomputed, yDomain }) {
    const perfObj = precomputed || buildPerformance(candles, periodDays);

    const card = document.createElement('div');
    card.className = 'l2fm-db-card';

    const head = document.createElement('div');
    head.className = 'l2fm-db-head';
    const title = document.createElement('div');
    title.className = 'l2fm-db-title';
    title.innerHTML = `${symbol} · ${periodDays}D <span class="tip" title="기준: 최근 ${periodDays}개 일봉(자산 특성에 따라 거래일/달력일)">ⓘ</span>`;
    head.appendChild(title);
    card.appendChild(head);

    const kpis = document.createElement('div');
    kpis.className = 'l2fm-db-kpis';

    // 수익률
    const pct = document.createElement('div');
    pct.className = 'l2fm-db-kpi';
    if (perfObj && Number.isFinite(perfObj.retPct)) {
        const s = perfObj.retPct >= 0 ? 'l2fm-up' : 'l2fm-dn';
        const strong = Math.abs(perfObj.retPct) >= 0.1 ? ' l2fm-strong' : '';
        pct.innerHTML = `수익률 <span class="v ${s}${strong}">${fmtPct(perfObj.retPct)}</span>`;
    } else {
        pct.textContent = '수익률 —';
    }

    // 최고/최저
    const hi = document.createElement('div'); hi.className = 'l2fm-db-kpi';
    const lo = document.createElement('div'); lo.className = 'l2fm-db-kpi';
    let rangeAbs = 0;
    if (perfObj && Array.isArray(perfObj.perf) && perfObj.perf.length) {
        const ys = perfObj.perf.map(d => d.p).filter(Number.isFinite);
        if (ys.length) {
            const maxv = Math.max(...ys), minv = Math.min(...ys);
            hi.innerHTML = `최고 <span class="v">${fmtPct(maxv)}</span>`;
            lo.innerHTML = `최저 <span class="v">${fmtPct(minv)}</span>`;
            rangeAbs = Math.abs(maxv - minv);
        } else { hi.textContent = '최고 —'; lo.textContent = '최저 —'; }
    } else { hi.textContent = '최고 —'; lo.textContent = '최저 —'; }

    // 범위(변동폭)
    const rg = document.createElement('div'); rg.className = 'l2fm-db-kpi';
    rg.innerHTML = `범위 <span class="v">${(rangeAbs * 100).toFixed(2)}%p</span>`;

    kpis.appendChild(pct); kpis.appendChild(hi); kpis.appendChild(lo); kpis.appendChild(rg);
    card.appendChild(kpis);

    const spark = document.createElement('div');
    spark.className = 'l2fm-db-spark';
    card.appendChild(spark);

    container.appendChild(card);

    if (perfObj && Array.isArray(perfObj.perf)) {
        renderSparkline(spark, perfObj.perf, yDomain);
    } else {
        spark.textContent = '데이터 부족';
    }
}
