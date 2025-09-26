// plugins/krStocks/preset/krTriple_MonthlyDaily30m.js
// KR 트리플(月/日/30m) — 상단 [월봉 | 일봉], 하단 [30분봉]
// - twChart.js 레이아웃/동작을 그대로 사용
// - 보조지표 없음(캔들 + 이동평균 + 거래량 20%)
// - MA 규칙
//   • 월봉: 72(흰,2) / 24(빨강,2) / 12(마젠타,3) / 6(다크오렌지, 점선,1) / 3(초록,2)
//   • 일봉: 240(마젠타,3) / 120(다크오렌지, 점선,1) / 60(초록,3) / 20(빨강,3, 수평선표시) / 5(흰,2)
//   • 30분: twChart의 2시간 규칙과 동일 (120 점선 등)

import { loadKRStockCandles } from "../data/dataLoader.js";
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import observeAndSyncPriceAxisWidth from "../../shared/sync/priceAxisSync.js";
import { baseChartOptions, createTitleOverlay, setInitialVisibleRange } from "../../crypto/preset/_common.js";

const BARS_MONTH = 72;
const BARS_DAILY = 160;
const BARS_30M = 380;

export default async function mount({ mainRoot, symbol = "삼성전자" } = {}) {
    const LWC = window.LightweightCharts;
    if (!LWC) { mainRoot.innerHTML = '<p style="color:#f66">LightweightCharts 로드 실패</p>'; return () => { }; }

    // ───────────────── 레이아웃 (twChart 동일 구조/ID 접두사)
    mainRoot.innerHTML = `
  <div id="twchart-root" style="display:grid;grid-template-rows:1fr 1fr;gap:6px;height:100%;">
    <div id="tw-top" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;min-height:120px;">
      <div id="tw-month" style="position:relative;">
        <div id="tw-month-pane" style="position:relative;width:100%;height:100%;"></div>
      </div>
      <div id="tw-daily" style="position:relative;">
        <div id="tw-daily-pane" style="position:relative;width:100%;height:100%;"></div>
      </div>
    </div>
    <div id="tw-30m" style="position:relative; min-height:120px;">
      <div id="tw-30m-pane" style="position:relative;width:100%;height:100%;"></div>
    </div>
  </div>`;

    const elMonth = mainRoot.querySelector('#tw-month');
    const elDaily = mainRoot.querySelector('#tw-daily');
    const el30m = mainRoot.querySelector('#tw-30m');

    // pane (가격축 폭 동기화는 pane 기준)
    const mPane = mainRoot.querySelector('#tw-month-pane');
    const dPane = mainRoot.querySelector('#tw-daily-pane');
    const hPane = mainRoot.querySelector('#tw-30m-pane');

    const base = baseChartOptions(LWC);

    // ───────────────── 차트 생성
    const chMonth = LWC.createChart(mPane, base);
    const chDaily = LWC.createChart(dPane, base);
    const ch30m = LWC.createChart(hPane, base);

    // 타이틀
    createTitleOverlay(elMonth, `${symbol} — 월봉`);
    createTitleOverlay(elDaily, `${symbol} — 일봉`);
    createTitleOverlay(el30m, `${symbol} — 30분봉`);

    // ───────────────── 데이터
    const [md, dd, hd] = await Promise.all([
        loadKRStockCandles({ name: symbol, timeframe: "monthly" }),
        loadKRStockCandles({ name: symbol, timeframe: "daily" }),
        loadKRStockCandles({ name: symbol, timeframe: "30m" }),
    ]);

    const UP = '#26a69a', DOWN = '#ef5350';

    // ───────────────── 공통 세트(볼륨 → MA들 → 캔들)
    function buildSet(chart, hostEl, candles, maDefs) {
        // 거래량(메인 하단 20%)
        const vol = chart.addHistogramSeries({
            priceScaleId: 'vol', priceFormat: { type: 'volume' },
            priceLineVisible: false, lastValueVisible: false
        });
        vol.setData(candles.map(c => ({ time: c.time, value: c.volume, color: (c.close >= c.open) ? 'rgba(38,166,154,0.6)' : 'rgba(239,83,80,0.6)' })));
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

        // 이동평균
        const lines = {};
        const seriesDataByPeriod = {};
        maDefs.forEach(def => {
            const s = chart.addLineSeries({
                color: def.color, lineWidth: def.w || 3,
                priceLineVisible: !!def.pl, priceLineStyle: 0, priceLineWidth: 1,
                priceLineColor: def.plColor || def.color,
                lastValueVisible: def.lastValueVisible !== false
            });
            const data = calculateSMA(candles, def.p);
            s.setData(data);
            lines[`ma${def.p}`] = s;
            seriesDataByPeriod[def.p] = data;
        });

        // 캔들(최상단)
        const candle = chart.addCandlestickSeries({
            upColor: UP, downColor: DOWN, borderDownColor: DOWN, borderUpColor: UP,
            wickDownColor: DOWN, wickUpColor: UP,
            priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1
        });
        candle.setData(candles);
        try {
            const last = candles[candles.length - 1];
            candle.applyOptions({ priceLineColor: (last && last.close >= last.open) ? UP : DOWN });
        } catch { }

        // 좌상단 레전드
        const legend = document.createElement('div');
        Object.assign(legend.style, {
            position: 'absolute', top: '6px', left: '8px',
            display: 'flex', gap: '12px', alignItems: 'center',
            fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
            textShadow: '0 0 4px rgba(0,0,0,0.5)', pointerEvents: 'none', zIndex: 7
        });
        const makeItem = (color, label) => {
            const w = document.createElement('div');
            w.style.display = 'flex'; w.style.alignItems = 'center'; w.style.gap = '6px';
            const dot = document.createElement('span');
            Object.assign(dot.style, { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color });
            const t = document.createElement('span'); t.textContent = label;
            w.appendChild(dot); w.appendChild(t);
            return w;
        };
        maDefs.forEach(def => legend.appendChild(makeItem(def.color, `MA${def.p}`)));
        hostEl.appendChild(legend);

        return { candle, vol, lines, legend, seriesDataByPeriod };
    }

    // 월봉 MA 세트
    const monthSet = buildSet(chMonth, elMonth, md, [
        { p: 72, color: 'white', w: 2, lastValueVisible: false },
        { p: 24, color: 'red', w: 2, lastValueVisible: false },
        { p: 12, color: 'magenta', w: 3 },
        { p: 6, color: 'darkorange', w: 1, lastValueVisible: false },
        { p: 3, color: 'green', w: 2 },
    ]);

    // 일봉 MA 세트
    const dailySet = buildSet(chDaily, elDaily, dd, [
        { p: 240, color: 'magenta', w: 3 },
        { p: 120, color: 'darkorange', w: 1, lastValueVisible: false },
        { p: 60, color: 'green', w: 3 },
        { p: 20, color: 'red', w: 3, pl: true },
        { p: 5, color: 'white', w: 2, lastValueVisible: false },
    ]);

    // 30분 MA 세트 (twChart의 2시간 규칙과 동일)
    const m30Set = buildSet(ch30m, el30m, hd, [
        { p: 240, color: 'magenta', w: 4 },
        { p: 120, color: 'darkorange', w: 1, lastValueVisible: false },
        { p: 60, color: 'green', w: 3, pl: true, plColor: 'green' },
        { p: 20, color: 'red', w: 3, pl: false },
        { p: 5, color: 'white', w: 2, lastValueVisible: false },
    ]);

    // 점선 적용 (월봉 MA6 / 일봉 MA120 / 30분 MA120)
    try { monthSet.lines.ma6?.applyOptions({ lineStyle: 2 }); } catch { }
    try { dailySet.lines.ma120?.applyOptions({ lineStyle: 2 }); } catch { }
    try { m30Set.lines.ma120?.applyOptions({ lineStyle: 2 }); } catch { }

    // ───────────────── 초기 가시 범위 + 더블클릭 복귀
    setInitialVisibleRange(chMonth, md, BARS_MONTH);
    setInitialVisibleRange(chDaily, dd, BARS_DAILY);
    setInitialVisibleRange(ch30m, hd, BARS_30M);

    const onMDbl = () => setInitialVisibleRange(chMonth, md, BARS_MONTH);
    const onDDbl = () => setInitialVisibleRange(chDaily, dd, BARS_DAILY);
    const onHDbl = () => setInitialVisibleRange(ch30m, hd, BARS_30M);
    elMonth.addEventListener('dblclick', onMDbl);
    elDaily.addEventListener('dblclick', onDDbl);
    el30m.addEventListener('dblclick', onHDbl);

    // ───────────────── 가격축 폭 동기화 (pane 기준)
    const paLink = observeAndSyncPriceAxisWidth([
        { chart: chMonth, container: mPane },
        { chart: chDaily, container: dPane },
        { chart: ch30m, container: hPane },
    ]);

    // ───────────────── 펄스 점(월: MA3, 일: MA5, 30m: MA5) — twChart 유지
    (function ensurePulseStyle() {
        const id = 'l2fm-ma-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            st.textContent = `
@keyframes l2fmPulse{0%{box-shadow:0 0 0 0 rgba(255,215,0,.65);opacity:1;}
70%{box-shadow:0 0 0 12px rgba(255,215,0,0);opacity:.85;}
100%{box-shadow:0 0 0 0 rgba(255,215,0,0);opacity:.85;}}`;
            document.head.appendChild(st);
        }
    })();

    function makePulse(host) {
        const d = document.createElement('div');
        Object.assign(d.style, {
            position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
            background: '#FFD700', pointerEvents: 'none', zIndex: 6,
            animation: 'l2fmPulse 1.6s ease-out infinite', left: '-9999px', top: '-9999px'
        });
        host.appendChild(d);
        return d;
    }
    const dotM = makePulse(elMonth);
    const dotD = makePulse(elDaily);
    const dotH = makePulse(el30m);

    function placeDot(chart, series, data, dot) {
        if (!data?.length) { dot.style.left = dot.style.top = '-9999px'; return; }
        const last = data[data.length - 1];
        const x = chart.timeScale()?.timeToCoordinate(last.time);
        const y = series.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            dot.style.left = (x - 4) + 'px';
            dot.style.top = (y - 4) + 'px';
        } else {
            dot.style.left = dot.style.top = '-9999px';
        }
    }
    const posM = () => placeDot(chMonth, monthSet.lines.ma3, monthSet.seriesDataByPeriod[3], dotM);
    const posD = () => placeDot(chDaily, dailySet.lines.ma5, dailySet.seriesDataByPeriod[5], dotD);
    const posH = () => placeDot(ch30m, m30Set.lines.ma5, m30Set.seriesDataByPeriod[5], dotH);
    posM(); posD(); posH();

    // 리사이즈/축 변경 시 재배치
    const unsubs = [];
    function bindReposition(chart, pos) {
        try {
            const ts = chart.timeScale();
            const onRange = () => pos();
            ts.subscribeVisibleTimeRangeChange(onRange);
            unsubs.push(() => ts.unsubscribeVisibleTimeRangeChange(onRange));
        } catch { }
        try {
            const ps = chart.priceScale('right');
            if (ps?.subscribeSizeChange) {
                const onSize = () => pos();
                ps.subscribeSizeChange(onSize);
                unsubs.push(() => ps.unsubscribeSizeChange(onSize));
            }
        } catch { }
    }
    bindReposition(chMonth, posM);
    bindReposition(chDaily, posD);
    bindReposition(ch30m, posH);

    // 초기 0×0 방지: 강제 리사이즈 2회 + ResizeObserver(mainRoot & #tw-top)
    const forceResize = () => {
        [[chMonth, mPane], [chDaily, dPane], [ch30m, hPane]].forEach(([ch, pane]) => {
            const w = pane.clientWidth, h = pane.clientHeight;
            if (w > 0 && h > 0) ch.resize(w, h);
        });
    };
    setTimeout(forceResize, 0);
    setTimeout(forceResize, 60);

    const ro = new ResizeObserver(forceResize);
    try { ro.observe(mainRoot); } catch { }
    try {
        const top = mainRoot.querySelector("#tw-top");
        if (top) ro.observe(top);
    } catch { }

    // ───────────────── 정리 함수
    return () => {
        try { ro.disconnect(); } catch { }
        try { paLink?.dispose?.(); } catch { }

        elMonth.removeEventListener('dblclick', onMDbl);
        elDaily.removeEventListener('dblclick', onDDbl);
        el30m.removeEventListener('dblclick', onHDbl);

        try { elMonth.removeChild(monthSet.legend); } catch { }
        try { elDaily.removeChild(dailySet.legend); } catch { }
        try { el30m.removeChild(m30Set.legend); } catch { }
        try { elMonth.removeChild(dotM); } catch { }
        try { elDaily.removeChild(dotD); } catch { }
        try { el30m.removeChild(dotH); } catch { }

        unsubs.forEach(fn => { try { fn(); } catch { } });

        try { chMonth.remove(); } catch { }
        try { chDaily.remove(); } catch { }
        try { ch30m.remove(); } catch { }
    };
}
