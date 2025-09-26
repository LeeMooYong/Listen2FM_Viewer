// Listen2FM_Viewer/plugins/crypto/preset/twChart.js
// 상단: 좌(월봉) + 우(일봉), 하단: 2시간 — 보조지표 없음 (기존 기능 유지)
// 월봉은 커다란 추세이고 캔들이 중요, 일봉은 추세에 따른 파동역할로 20일선파동 60일선 중추세, 2시간봉 차트는 일봉의 5일선/20일선의 패턴을 선행해서 감시하는 역할

import { loadCrypto } from "../data/dataLoader.js";
import { calculateSMA } from "../indicators/movingAverage.js";
import observeAndSyncPriceAxisWidth from "../sync/priceAxisSync.js";
import { baseChartOptions, createTitleOverlay, setInitialVisibleRange } from "./_common.js";

const NAME_KO = {
    BTC: "비트코인", ETH: "이더리움", SOL: "솔라나", XRP: "엑스알피",
    XLM: "스텔라루멘", HBAR: "헤데라", ADA: "에이다", AAVE: "에이브",
    LINK: "체인링크", DOGE: "도지코인", AVAX: "아발란체", DOT: "폴카닷",
    TRX: "트론", SUI: "수이", ONDO: "온도파이낸스", IOTA: "아이오타",
    VET: "비체인", POL: "폴리곤", APT: "앱토스", ARB: "아비트럼",
    NEO: "네오", SHIB: "시바이누",
};

// 초기 가시 범위(요청값)
const BARS_MONTH = 72;
const BARS_DAILY = 160;
const BARS_2H = 380;

export async function mountTWChart({ mainRoot, symbol = "BTC", exchange = "upbit" }) {
    const LWC = window.LightweightCharts;
    if (!LWC) { mainRoot.innerHTML = '<p style="color:#f66">LightweightCharts 로드 실패</p>'; return () => { }; }

    // ───────────────── 레이아웃
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
    <div id="tw-2h" style="position:relative; min-height:120px;">
      <div id="tw-2h-pane" style="position:relative;width:100%;height:100%;"></div>
    </div>
  </div>`;

    const elMonth = mainRoot.querySelector('#tw-month');
    const elDaily = mainRoot.querySelector('#tw-daily');
    const el2H = mainRoot.querySelector('#tw-2h');

    // 내부 pane (가격축 폭 동기화는 pane 기준)
    const mPane = mainRoot.querySelector('#tw-month-pane');
    const dPane = mainRoot.querySelector('#tw-daily-pane');
    const hPane = mainRoot.querySelector('#tw-2h-pane');

    const ko = NAME_KO[symbol] || symbol;
    const quote = (exchange === 'upbit') ? 'KRW' : 'USDT';
    const base = baseChartOptions(LWC);

    // ───────────────── 차트 생성
    const chMonth = LWC.createChart(mPane, base);
    const chDaily = LWC.createChart(dPane, base);
    const ch2H = LWC.createChart(hPane, base);

    // 타이틀
    createTitleOverlay(elMonth, `${ko} 월봉 (${symbol}/${quote})`);
    createTitleOverlay(elDaily, `${ko} 일봉 (${symbol}/${quote})`);
    createTitleOverlay(el2H, `${ko} 2시간 (${symbol}/${quote})`);

    // 데이터
    const [md, dd, hd] = await Promise.all([
        loadCrypto({ symbol, timeframe: "monthly", exchange }),
        loadCrypto({ symbol, timeframe: "daily", exchange }),
        loadCrypto({ symbol, timeframe: "2h", exchange }),
    ]);

    const UP = '#26a69a', DOWN = '#ef5350';

    // ───────────────── 공통 세트(볼륨 → MA들 → 캔들[최상단])
    function buildSet(chart, hostEl, candles, maDefs) {
        // 거래량
        const vol = chart.addHistogramSeries({
            priceScaleId: 'vol', priceFormat: { type: 'volume' },
            priceLineVisible: false, lastValueVisible: false
        });
        vol.setData(candles.map(c => ({ time: c.time, value: c.volume, color: (c.close >= c.open) ? UP : DOWN })));
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

        // 이동평균
        const lines = {};
        const seriesDataByPeriod = {};
        maDefs.forEach(def => {
            const s = chart.addLineSeries({
                color: def.color,
                lineWidth: def.w || 3,
                // 현재가 수평선 ON/OFF (요청 유지)
                priceLineVisible: !!def.pl,
                priceLineStyle: 0,
                priceLineWidth: 1,
                priceLineColor: def.plColor || def.color,
                // ★ 가격 라벨(마지막 값 라벨) 가시성 제어 — 기본 true, 명시적으로 false 줄 수 있음
                lastValueVisible: def.lastValueVisible !== false
            });
            const data = calculateSMA(candles, def.p);
            s.setData(data);
            lines[`ma${def.p}`] = s;
            seriesDataByPeriod[def.p] = data;
        });

        // 캔들 (최상단)
        const candle = chart.addCandlestickSeries({
            upColor: UP, downColor: DOWN, borderDownColor: DOWN, borderUpColor: UP,
            wickDownColor: DOWN, wickUpColor: UP,
            priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
            priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1
        });
        candle.setData(candles);
        try {
            const last = candles[candles.length - 1];
            candle.applyOptions({ priceLineColor: (last && last.close >= last.open) ? UP : DOWN });
        } catch { }

        // 좌상단 레전드(원+텍스트)
        const legend = document.createElement('div');
        Object.assign(legend.style, {
            position: 'absolute', top: '6px', left: '8px',
            display: 'flex', gap: '12px', alignItems: 'center',
            fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
            textShadow: '0 0 4px rgba(0,0,0,0.5)', pointerEvents: 'none', zIndex: 7
        });
        function makeItem(color, label) {
            const w = document.createElement('div');
            w.style.display = 'flex'; w.style.alignItems = 'center'; w.style.gap = '6px';
            const dot = document.createElement('span');
            Object.assign(dot.style, { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color });
            const t = document.createElement('span'); t.textContent = label;
            w.appendChild(dot); w.appendChild(t);
            return w;
        }
        maDefs.forEach(def => legend.appendChild(makeItem(def.color, `MA${def.p}`)));
        hostEl.appendChild(legend);

        return { candle, vol, lines, legend, seriesDataByPeriod };
    }

    // 월봉: 72/24/12/6/3  →  **72/24/6 라벨 숨김**
    const monthSet = buildSet(chMonth, elMonth, md, [
        { p: 72, color: 'white', w: 2, lastValueVisible: false },
        { p: 24, color: 'red', w: 2, lastValueVisible: false },
        { p: 12, color: 'magenta', w: 3 },
        { p: 6, color: 'darkorange', w: 1, lastValueVisible: false },
        { p: 3, color: 'green', w: 2 },
    ]);

    // 일봉: 240/120/60/20/5  →  **120/5 라벨 숨김, 20 현재가 수평선 표시 유지**
    const dailySet = buildSet(chDaily, elDaily, dd, [
        { p: 240, color: 'magenta', w: 3 },
        { p: 120, color: 'darkorange', w: 1, lastValueVisible: false },
        { p: 60, color: 'green', w: 3 },
        { p: 20, color: 'red', w: 3, pl: true },
        { p: 5, color: 'white', w: 2, lastValueVisible: false },
    ]);

    // 2시간: 240/120/60/20/5 → **120/5 라벨 숨김, 60 현재가 수평선 표시 유지 / 20 수평선 숨김 유지**
    const h2Set = buildSet(ch2H, el2H, hd, [
        { p: 240, color: 'magenta', w: 4 },
        { p: 120, color: 'orange', w: 1, lastValueVisible: false },
        { p: 60, color: 'green', w: 3, pl: true, plColor: 'green' },
        { p: 20, color: 'red', w: 3, pl: false },
        { p: 5, color: 'white', w: 2, lastValueVisible: false },
    ]);
    // ───────────── 요청 반영: 특정 이동평균선을 '점선(대시)'로 변경 (색상 유지) ─────────────
    // Lightweight Charts LineStyle: 0=Solid, 1=Dotted, 2=Dashed, ...
    try { monthSet.lines.ma6?.applyOptions({ lineStyle: 2 }); } catch { }
    try { dailySet.lines.ma120?.applyOptions({ lineStyle: 2 }); } catch { }
    try { h2Set.lines.ma120?.applyOptions({ lineStyle: 2 }); } catch { }

    // ───────────────── 초기 가시 범위 + 더블클릭(개별 복귀)
    setInitialVisibleRange(chMonth, md, BARS_MONTH);
    setInitialVisibleRange(chDaily, dd, BARS_DAILY);
    setInitialVisibleRange(ch2H, hd, BARS_2H);

    const onMDbl = () => setInitialVisibleRange(chMonth, md, BARS_MONTH);
    const onDDbl = () => setInitialVisibleRange(chDaily, dd, BARS_DAILY);
    const onHDbl = () => setInitialVisibleRange(ch2H, hd, BARS_2H);

    elMonth.addEventListener('dblclick', onMDbl);
    elDaily.addEventListener('dblclick', onDDbl);
    el2H.addEventListener('dblclick', onHDbl);

    // ───────────────── 가격축 폭 동기화 (pane 기준)
    const paLink = observeAndSyncPriceAxisWidth([
        { chart: chMonth, container: mPane },
        { chart: chDaily, container: dPane },
        { chart: ch2H, container: hPane },
    ]);

    // ───────────────── 툴바 토글(생명선/추세선) + 버튼 하이라이트 (기존 동작 유지)
    const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
    const btnTrend = document.querySelector('.main-toolbar [data-action="trendline"]');
    const setActive = (btn, on) => { if (!btn) return; on ? btn.classList.add('active-preset') : btn.classList.remove('active-preset'); };

    // 생명선: MA20 (일봉+2시간 동시에 토글)
    const LIFE_RED = 'red', LIFE_YELLOW = '#FFD700';
    let lifelineOn = false, lifelineTimer = null, lifeFlip = false;
    function setLifeColor(c) {
        try { dailySet.lines.ma20.applyOptions({ color: c }); } catch { }
        try { h2Set.lines.ma20.applyOptions({ color: c }); } catch { }
    }
    function startLifeline() {
        lifelineOn = true; setActive(btnLife, true);
        setLifeColor(LIFE_YELLOW);
        lifelineTimer = setInterval(() => { lifeFlip = !lifeFlip; setLifeColor(lifeFlip ? LIFE_RED : LIFE_YELLOW); }, 1500);
    }
    function stopLifeline() {
        lifelineOn = false; setActive(btnLife, false);
        if (lifelineTimer) { clearInterval(lifelineTimer); lifelineTimer = null; }
        setLifeColor(LIFE_RED);
    }
    const onLife = () => lifelineOn ? stopLifeline() : startLifeline();

    // 추세선: MA60 (일봉+2시간 동시에 토글)
    const TREND_GREEN = 'green', TREND_LIGHT = '#7CFC00';
    let trendOn = false, trendTimer = null, trendFlip = false;
    function setTrendColor(c) {
        try { dailySet.lines.ma60.applyOptions({ color: c }); } catch { }
        try { h2Set.lines.ma60.applyOptions({ color: c }); } catch { }
    }
    function startTrend() {
        trendOn = true; setActive(btnTrend, true);
        setTrendColor(TREND_LIGHT);
        trendTimer = setInterval(() => { trendFlip = !trendFlip; setTrendColor(trendFlip ? TREND_GREEN : TREND_LIGHT); }, 1500);
    }
    function stopTrend() {
        trendOn = false; setActive(btnTrend, false);
        if (trendTimer) { clearInterval(trendTimer); trendTimer = null; }
        setTrendColor(TREND_GREEN);
    }
    const onTrend = () => trendOn ? stopTrend() : startTrend();

    btnLife?.addEventListener('click', onLife);
    btnTrend?.addEventListener('click', onTrend);

    // ───────────────── 펄스 점(월: MA3, 일: MA5, 2H: MA5) — 유지
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
    const dotH = makePulse(el2H);

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
    const posH = () => placeDot(ch2H, h2Set.lines.ma5, h2Set.seriesDataByPeriod[5], dotH);
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
    bindReposition(ch2H, posH);

    // ───────────────── 정리 함수
    return () => {
        btnLife?.removeEventListener('click', onLife);
        btnTrend?.removeEventListener('click', onTrend);
        try { if (lifelineTimer) clearInterval(lifelineTimer); } catch { }
        try { if (trendTimer) clearInterval(trendTimer); } catch { }

        elMonth.removeEventListener('dblclick', onMDbl);
        elDaily.removeEventListener('dblclick', onDDbl);
        el2H.removeEventListener('dblclick', onHDbl);

        try { elMonth.removeChild(monthSet.legend); } catch { }
        try { elDaily.removeChild(dailySet.legend); } catch { }
        try { el2H.removeChild(h2Set.legend); } catch { }

        try { elMonth.removeChild(dotM); } catch { }
        try { elDaily.removeChild(dotD); } catch { }
        try { el2H.removeChild(dotH); } catch { }

        unsubs.forEach(fn => { try { fn(); } catch { } });
        try { paLink?.dispose?.(); } catch { }

        try { chMonth.remove(); } catch { }
        try { chDaily.remove(); } catch { }
        try { ch2H.remove(); } catch { }
    };
}

export function dispose() { }
