// Listen2FM_Viewer/plugins/crypto/preset/singleMonthly.js

import { loadCrypto } from "../data/dataLoader.js";
import { calculateRSI } from "../indicators/rsi.js";
import { calculateMACD } from "../indicators/macd.js";
import { calculateSMA } from "../indicators/movingAverage.js";
import { calculateMAOscillator } from "../indicators/maOscillator.js"; // ← 추가
import observeAndSyncPriceAxisWidth from "../sync/priceAxisSync.js";

import {
    baseChartOptions, linkTimeScalesOneWay, padWithWhitespace,
    resyncAxisPadding, setInitialVisibleRange, createTitleOverlay
} from "./_common.js";

// FGI 월집계(각 월봉 시점보다 작거나 같은 가장 최신 FGI값을 사용)
async function loadFGIAlignedToMonthly() {
    try {
        const res = await fetch('data/crypto/fg_index/btc_feargreed_merged.json');
        if (!res.ok) throw new Error('FGI fetch failed');
        const daily = await res.json();
        return daily.map(r => ({ time: r.time, value: r.fg_value })).sort((a, b) => a.time - b.time);
    } catch (e) {
        console.error('FGI load error:', e);
        return [];
    }
}
function alignFGIToMonthlyCandles(monthlyCandles, fgiDaily) {
    if (!monthlyCandles?.length || !fgiDaily?.length) return [];
    const out = [];
    let j = 0;
    for (const c of monthlyCandles) {
        while (j < fgiDaily.length && fgiDaily[j].time <= c.time) j++;
        const pick = fgiDaily[j - 1];
        if (pick) out.push({ time: c.time, value: pick.value });
    }
    return out;
}

const NAME_KO = {
    BTC: "비트코인", ETH: "이더리움", SOL: "솔라나", XRP: "엑스알피",
    XLM: "스텔라루멘", HBAR: "헤데라", ADA: "에이다", AAVE: "에이브",
    LINK: "체인링크", DOGE: "도지코인", AVAX: "아발란체", DOT: "폴카닷",
    TRX: "트론", SUI: "수이", ONDO: "온도파이낸스", IOTA: "아이오타",
    VET: "비체인", POL: "폴리곤", APT: "앱토스", ARB: "아비트럼",
    NEO: "네오", SHIB: "시바이누",
};

const INITIAL_BARS_MONTHLY = 180;

export async function mountSingleMonthly({ mainRoot, symbol = "BTC", exchange = "upbit" }) {
    const LWC = window.LightweightCharts;
    if (!LWC) { mainRoot.innerHTML = '<p style="color:#f66">LightweightCharts 로드 실패</p>'; return () => { }; }

    mainRoot.innerHTML = `
    <div id="l2fm-singleMonthly" style="display:grid;grid-template-rows:4fr 1fr;gap:6px;height:100%;">
      <div id="smain" style="min-height:120px; position:relative;"></div>
      <div id="ssub"  style="min-height:90px;  position:relative;"></div>
    </div>`;
    const elMain = mainRoot.querySelector("#smain");
    const elSub = mainRoot.querySelector("#ssub");

    // 타이틀
    const ko = NAME_KO[symbol] || symbol;
    const quote = (exchange === 'upbit') ? 'KRW' : 'USDT';
    createTitleOverlay(elMain, `${ko} (${symbol}/${quote})`);

    const base = baseChartOptions(LWC);
    const mainChart = LWC.createChart(elMain, base);
    const subChart = LWC.createChart(elSub, {
        ...base,
        rightPriceScale: { borderColor: '#2a2b31', scaleMargins: { top: 0.1, bottom: 0.1 } }
    });
    subChart.applyOptions({
        handleScroll: false,
        handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false }
    });

    // 데이터
    const candles = await loadCrypto({ symbol, timeframe: "monthly", exchange });

    // ───────── 메인: 볼륨 먼저 추가 ─────────
    const UP = '#26a69a', DOWN = '#ef5350';
    const vol = mainChart.addHistogramSeries({
        priceScaleId: 'vol', priceFormat: { type: 'volume' },
        priceLineVisible: false, lastValueVisible: false,
    });
    vol.setData(candles.map(c => ({ time: c.time, value: c.volume, color: (c.close >= c.open) ? UP : DOWN })));
    mainChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.80, bottom: 0 }, visible: false });

    // ───── 월봉 이동평균선(선 먼저, 캔들을 마지막) ─────
    const ma072 = mainChart.addLineSeries({ color: 'white', lineWidth: 3, priceLineVisible: false });
    const ma024 = mainChart.addLineSeries({ color: 'red', lineWidth: 2, priceLineVisible: false }); // priceLine 숨김 유지
    const ma012 = mainChart.addLineSeries({ color: 'magenta', lineWidth: 3, priceLineVisible: false });
    const ma006 = mainChart.addLineSeries({ color: 'darkorange', lineWidth: 1, priceLineVisible: false });
    const ma003 = mainChart.addLineSeries({ color: 'green', lineWidth: 2, priceLineVisible: false });

    ma072.setData(calculateSMA(candles, 72));
    ma024.setData(calculateSMA(candles, 24));
    ma012.setData(calculateSMA(candles, 12));
    ma006.setData(calculateSMA(candles, 6));
    ma003.setData(calculateSMA(candles, 3));

    // 월봉 6개월선을 실선에서 점선으로 변경
    ma006.applyOptions({ lineStyle: 2 }); // 0=Solid, 1=Dotted(점선), 2=Dashed

    // 캔들을 마지막에 생성(항상 최상위 레이어)
    const candle = mainChart.addCandlestickSeries({
        upColor: UP, downColor: DOWN, borderDownColor: DOWN, borderUpColor: UP,
        wickDownColor: DOWN, wickUpColor: UP,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        priceLineVisible: true, priceLineStyle: 0, priceLineWidth: 1
    });
    candle.setData(candles);
    try {
        const last = candles[candles.length - 1];
        candle.applyOptions({ priceLineColor: last && last.close >= last.open ? UP : DOWN });
    } catch { }

    // ───────── MA Legend (좌측 상단) ─────────
    const maLegend = document.createElement('div');
    Object.assign(maLegend.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'flex', gap: '12px', alignItems: 'center',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        textShadow: '0 0 4px rgba(0,0,0,0.5)', pointerEvents: 'none', zIndex: 7
    });
    function makeMAItem(color, label) {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '6px';
        const dot = document.createElement('span');
        Object.assign(dot.style, { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color });
        const txt = document.createElement('span'); txt.textContent = label;
        item.appendChild(dot); item.appendChild(txt);
        return item;
    }
    maLegend.appendChild(makeMAItem('white', 'MA72'));
    maLegend.appendChild(makeMAItem('red', 'MA24'));
    maLegend.appendChild(makeMAItem('magenta', 'MA12'));
    maLegend.appendChild(makeMAItem('darkorange', 'MA6'));
    maLegend.appendChild(makeMAItem('green', 'MA3'));
    elMain.appendChild(maLegend);

    // ───────── 보조: RSI/MACD/FGI/MAOSC(월) + Disparity(6) ─────────
    // RSI
    const rsiLine = subChart.addLineSeries({ color: '#FFD700', lineWidth: 1 });
    const rsiBase30 = subChart.addLineSeries({ color: 'green', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const rsiBase70 = subChart.addLineSeries({ color: 'red', lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

    // MACD (월봉 전용 파라미터 3/12/5, 히스토그램 사용 안 함)
    const macdLine = subChart.addLineSeries({ color: 'green', lineWidth: 1 }); // MACD 라인
    const sigLine = subChart.addLineSeries({ color: 'red', lineWidth: 1 });    // 시그널 라인

    // FGI
    const fgLine = subChart.addLineSeries({ color: '#5ee0ff', lineWidth: 1 });
    const fg25 = subChart.addLineSeries({ color: '#7CFC00', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const fg75 = subChart.addLineSeries({ color: 'red', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

    // MA OSC (3M-12M)
    // (채움) 이격도와 동일한 색상 사용: 기준선 위(+) = 녹색 채움, 아래(-) = 붉은 채움
    const maoscFill = subChart.addBaselineSeries({
        baseValue: { type: 'price', price: 0 },
        topFillColor1: 'rgba(0, 128, 0, 0.25)',
        topFillColor2: 'rgba(0, 128, 0, 0.25)',
        bottomFillColor1: 'rgba(255, 0, 0, 0.2)',
        bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
        topLineColor: 'rgba(0,0,0,0)',
        bottomLineColor: 'rgba(0,0,0,0)',
        priceLineVisible: false,
        lastValueVisible: false,
    });
    // (선) 기존과 동일 — 직관을 위해 선은 계속 표시
    const maoscLine = subChart.addLineSeries({ color: 'green', lineWidth: 1 });
    // (기준선) 0선은 노란색 얇은 실선 유지
    const maoscZero = subChart.addLineSeries({ color: 'magenta', lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

    // === Disparity(6) ===
    // 1) 기준선 100 (Yellow 실선)
    const disparityBase100 = subChart.addLineSeries({
        color: '#FFD700',
        lineWidth: 1,
        lineStyle: 0,
        lastValueVisible: false,
        priceLineVisible: false
    });
    // 2) 상/하단 채움: BaselineSeries (기준값 100)
    const disparityFill = subChart.addBaselineSeries({
        baseValue: { type: 'price', price: 100 },
        topFillColor1: 'rgba(0, 128, 0, 0.25)',    // 기준선 위쪽(+)
        topFillColor2: 'rgba(0, 128, 0, 0.25)',
        bottomFillColor1: 'rgba(255, 0, 0, 0.2)',  // 기준선 아래(-)
        bottomFillColor2: 'rgba(255, 0, 0, 0.2)',
        topLineColor: 'rgba(0,0,0,0)',
        bottomLineColor: 'rgba(0,0,0,0)',
        priceLineVisible: false,
        lastValueVisible: false,
    });
    // 3) 이격도 선(딥 오렌지) — 채움 위에 얹는 라인
    const disparityLine = subChart.addLineSeries({ color: '#FF6F00', lineWidth: 1 });

    // 지표 데이터
    const rsiRaw = calculateRSI(candles, 9);
    const { macd: macdRaw, signal: sigRaw } = calculateMACD(candles, 3, 12, 5); // ← 3/12/5
    const maoscRaw = calculateMAOscillator(candles, 3, 12); // ← 3개월-12개월

    // Disparity(6) 계산: 100 * Close / MA6
    const ma6 = calculateSMA(candles, 6);
    const closeMap = new Map(candles.map(c => [c.time, c.close]));
    const dispRaw = ma6
        .filter(m => Number.isFinite(m.value) && closeMap.has(m.time))
        .map(m => ({ time: m.time, value: (closeMap.get(m.time) / m.value) * 100 }));

    // FGI 로드/정렬
    let fgAligned = [];
    try {
        const fgd = await loadFGIAlignedToMonthly();
        fgAligned = alignFGIToMonthlyCandles(candles, fgd);
    } catch { }

    // ===== 펄스 Dots =====
    // RSI dot
    (function ensurePulseStyle() {
        const id = 'l2fm-rsi-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            st.textContent = `@keyframes l2fmPulse{0%{box-shadow:0 0 0 0 rgba(255,215,0,.65);opacity:1;}
70%{box-shadow:0 0 0 12px rgba(255,215,0,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(255,215,0,0);opacity:.85;}}`;
            document.head.appendChild(st);
        }
    })();
    const rsiDot = document.createElement('div');
    Object.assign(rsiDot.style, { position: 'absolute', width: '8px', height: '8px', borderRadius: '50%', background: '#FFD700', pointerEvents: 'none', zIndex: '5', animation: 'l2fmPulse 1.6s ease-out infinite', left: '-9999px', top: '-9999px' });
    elSub.appendChild(rsiDot);
    function positionRSIDot() {
        if (current !== 'RSI' || !rsiRaw.length) { rsiDot.style.left = rsiDot.style.top = '-9999px'; return; }
        const last = rsiRaw[rsiRaw.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = rsiLine.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) { rsiDot.style.left = (x - 4) + 'px'; rsiDot.style.top = (y - 4) + 'px'; }
    }

    // FGI dot
    (function ensureFGPulseStyle() {
        const id = 'l2fm-fg-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            st.textContent = `@keyframes l2fmFGPulse{0%{box-shadow:0 0 0 0 rgba(94,224,255,.65);opacity:1;}
70%{box-shadow:0 0 0 12px rgba(94,224,255,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(94,224,255,0);opacity:.85;}}`;
            document.head.appendChild(st);
        }
    })();
    const fgDot = document.createElement('div');
    Object.assign(fgDot.style, { position: 'absolute', width: '8px', height: '8px', borderRadius: '50%', background: '#5ee0ff', pointerEvents: 'none', zIndex: '5', animation: 'l2fmFGPulse 1.6s ease-out infinite', left: '-9999px', top: '-9999px' });
    elSub.appendChild(fgDot);
    function positionFGDot() {
        if (current !== 'FG' || !fgAligned?.length) { fgDot.style.left = fgDot.style.top = '-9999px'; return; }
        const last = fgAligned[fgAligned.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = fgLine.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) { fgDot.style.left = (x - 4) + 'px'; fgDot.style.top = (y - 4) + 'px'; }
    }

    // MAOSC dot (green pulse)
    (function ensureMAOSCPulseStyle() {
        const id = 'l2fm-maosc-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            st.textContent = `@keyframes l2fmMAOSCPulse{0%{box-shadow:0 0 0 0 rgba(0,255,0,.55);opacity:1;}
70%{box-shadow:0 0 0 12px rgba(0,255,0,0);opacity:.85;}100%{box-shadow:0 0 0 0 rgba(0,255,0,0);opacity:.85;}}`;
            document.head.appendChild(st);
        }
    })();
    const maoscDot = document.createElement('div');
    Object.assign(maoscDot.style, { position: 'absolute', width: '8px', height: '8px', borderRadius: '50%', background: 'green', pointerEvents: 'none', zIndex: '5', animation: 'l2fmMAOSCPulse 1.6s ease-out infinite', left: '-9999px', top: '-9999px' });
    elSub.appendChild(maoscDot);
    function positionMAOSCDot() {
        if (current !== 'MAOSC' || !maoscRaw.length) { maoscDot.style.left = maoscDot.style.top = '-9999px'; return; }
        const last = maoscRaw[maoscRaw.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = maoscLine.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) { maoscDot.style.left = (x - 4) + 'px'; maoscDot.style.top = (y - 4) + 'px'; }
    }

    // Disparity dot (orange pulse)
    (function ensureDispPulseStyle() {
        const id = 'l2fm-disp-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            st.textContent = `@keyframes l2fmDISPPulse{
  0%{box-shadow:0 0 0 0 rgba(255,183,77,.55);opacity:1;}
  70%{box-shadow:0 0 0 12px rgba(255,183,77,0);opacity:.85;}
  100%{box-shadow:0 0 0 0 rgba(255,183,77,0);opacity:.85;}
}`;
            document.head.appendChild(st);
        }
    })();
    const dispDot = document.createElement('div');
    Object.assign(dispDot.style, {
        position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
        background: '#FFB74D', pointerEvents: 'none', zIndex: 5,
        animation: 'l2fmDISPPulse 1.6s ease-out infinite',
        left: '-9999px', top: '-9999px'
    });
    elSub.appendChild(dispDot);
    function positionDISPDot() {
        if (current !== 'DISP' || !dispRaw.length) { dispDot.style.left = dispDot.style.top = '-9999px'; return; }
        const last = dispRaw[dispRaw.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = disparityLine.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) { dispDot.style.left = (x - 4) + 'px'; dispDot.style.top = (y - 4) + 'px'; }
    }

    // MACD dot (yellow pulse on MACD line end)
    (function ensureMACDPulseStyle() {
        const id = 'l2fm-macd-pulse-style';
        if (!document.getElementById(id)) {
            const st = document.createElement('style');
            st.id = id;
            // 동일한 펄스 키프레임 사용(색상만 노란 원의 바탕으로 표현)
            st.textContent = `@keyframes l2fmMACDPulse{
  0%{box-shadow:0 0 0 0 rgba(255,215,0,.65);opacity:1;}
  70%{box-shadow:0 0 0 12px rgba(255,215,0,0);opacity:.90;}
  100%{box-shadow:0 0 0 0 rgba(255,215,0,0);opacity:.90;}
}`;
            document.head.appendChild(st);
        }
    })();
    const macdDot = document.createElement('div');
    Object.assign(macdDot.style, {
        position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
        background: '#FFD700', pointerEvents: 'none', zIndex: 5,
        animation: 'l2fmMACDPulse 1.6s ease-out infinite',
        left: '-9999px', top: '-9999px'
    });
    elSub.appendChild(macdDot);
    function positionMACDDot() {
        if (current !== 'MACD' || !macdRaw.length) { macdDot.style.left = macdDot.style.top = '-9999px'; return; }
        const last = macdRaw[macdRaw.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = macdLine.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) { macdDot.style.left = (x - 4) + 'px'; macdDot.style.top = (y - 4) + 'px'; }
    }

    // ===== FG 밴드 오버레이(0~25, 75~100) — 절대배치 =====
    const fgBandTop = document.createElement('div');     // 75~100 (붉은 톤)
    const fgBandBottom = document.createElement('div');  // 0~25  (녹색 톤)
    [fgBandTop, fgBandBottom].forEach(d => {
        Object.assign(d.style, {
            position: 'absolute',
            left: '0px',
            right: '0px',
            display: 'none',
            pointerEvents: 'none',
            zIndex: '3',                 // 차트 위, dot(5) 아래
            backdropFilter: '',          // 필요시 효과 추가 가능
        });
        elSub.appendChild(d);
    });
    fgBandTop.style.background = 'rgba(255, 0, 0, 0.12)';     // 상단 밴드 색
    fgBandBottom.style.background = 'rgba(0, 128, 0, 0.10)';  // 하단 밴드 색

    function renderFGBands() {
        if (current !== 'FG') {
            fgBandTop.style.display = 'none';
            fgBandBottom.style.display = 'none';
            return;
        }
        // 좌우는 전체폭, 위아래는 가격→좌표 변환으로 계산
        const y100 = fgLine.priceToCoordinate?.(100);
        const y75 = fgLine.priceToCoordinate?.(75);
        const y25 = fgLine.priceToCoordinate?.(25);
        const y0 = fgLine.priceToCoordinate?.(0);

        if (![y100, y75, y25, y0].every(Number.isFinite)) {
            fgBandTop.style.display = 'none';
            fgBandBottom.style.display = 'none';
            return;
        }
        // 상단: 75~100
        const topTop = Math.min(y100, y75);
        const topBottom = Math.max(y100, y75);
        const topH = topBottom - topTop;

        if (topH > 0) {
            fgBandTop.style.top = `${topTop}px`;
            fgBandTop.style.height = `${topH}px`;
            fgBandTop.style.display = '';
        } else {
            fgBandTop.style.display = 'none';
        }

        // 하단: 0~25
        const botTop = Math.min(y25, y0);
        const botBottom = Math.max(y25, y0);
        const botH = botBottom - botTop;

        if (botH > 0) {
            fgBandBottom.style.top = `${botTop}px`;
            fgBandBottom.style.height = `${botH}px`;
            fgBandBottom.style.display = '';
        } else {
            fgBandBottom.style.display = 'none';
        }
    }

    // ─────────────────────────────────────────────
    // 보조지표 레전드 (DISPARITY / MA_OSC / RSI) + MACD + FG (추가)
    // ─────────────────────────────────────────────
    const legendBoxDisp = document.createElement('div');
    Object.assign(legendBoxDisp.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elSub.appendChild(legendBoxDisp);
    function renderDisparityLegend() {
        if (current !== 'DISP') { legendBoxDisp.style.display = 'none'; return; }
        if (!dispRaw?.length) { legendBoxDisp.style.display = 'none'; return; }
        const last = dispRaw[dispRaw.length - 1]?.value;
        if (!Number.isFinite(last)) { legendBoxDisp.style.display = 'none'; return; }
        const curColor = last >= 100 ? 'green' : 'red';
        legendBoxDisp.innerHTML = `
          <span>Disparity(6): <span style="color:${curColor}">${last.toFixed(1)}%</span></span>
          <span style="margin:0 6px;">|</span>
          <span>Base: <span style="color:#FFD700">100</span></span>
        `;
        legendBoxDisp.style.display = '';
    }

    const legendBoxMAOSC = document.createElement('div');
    Object.assign(legendBoxMAOSC.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elSub.appendChild(legendBoxMAOSC);
    function renderMAOSCLegend() {
        if (current !== 'MAOSC') { legendBoxMAOSC.style.display = 'none'; return; }
        legendBoxMAOSC.innerHTML = `
          <span style="color:#ffffff">MA_Oscillator(</span>
          <span style="color:green">3</span>
          <span style="color:#ffffff">-</span>
          <span style="color:magenta">12</span>
          <span style="color:#ffffff">)</span>
        `;
        legendBoxMAOSC.style.display = '';
    }

    // ★ RSI 레전드
    const legendBoxRSI = document.createElement('div');
    Object.assign(legendBoxRSI.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elSub.appendChild(legendBoxRSI);
    function renderRSILegend() {
        if (current !== 'RSI') { legendBoxRSI.style.display = 'none'; return; }
        if (!rsiRaw?.length) { legendBoxRSI.style.display = 'none'; return; }
        const last = rsiRaw[rsiRaw.length - 1]?.value;
        if (!Number.isFinite(last)) { legendBoxRSI.style.display = 'none'; return; }
        legendBoxRSI.innerHTML = `
          <span>RSI(9): <span style="color:#FFD700">${last.toFixed(1)}</span></span>
          <span style="margin:0 6px;">|</span>
          <span>Base: <span style="color:green">30</span> / <span style="color:red">70</span></span>
        `;
        legendBoxRSI.style.display = '';
    }

    // ★ MACD 레전드 (추가)
    const legendBoxMACD = document.createElement('div');
    Object.assign(legendBoxMACD.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elSub.appendChild(legendBoxMACD);
    function renderMACDLegend() {
        if (current !== 'MACD') { legendBoxMACD.style.display = 'none'; return; }
        if (!macdRaw?.length || !sigRaw?.length) { legendBoxMACD.style.display = 'none'; return; }
        const macdV = macdRaw[macdRaw.length - 1]?.value;
        const sigV = sigRaw[sigRaw.length - 1]?.value;
        if (!Number.isFinite(macdV) || !Number.isFinite(sigV)) { legendBoxMACD.style.display = 'none'; return; }
        legendBoxMACD.innerHTML = `
          <span>MACD(3,12,5)</span>
          <span style="margin:0 6px;">|</span>
          <span>MACD: <span style="color:green">${macdV.toFixed(4)}</span></span>
          <span style="margin:0 6px;">|</span>
          <span>Signal: <span style="color:red">${sigV.toFixed(4)}</span></span>
        `;
        legendBoxMACD.style.display = '';
    }

    // ★ FG_Index 레전드 (추가)
    const legendBoxFG = document.createElement('div');
    Object.assign(legendBoxFG.style, {
        position: 'absolute', top: '6px', left: '8px',
        display: 'none', gap: '8px', padding: '4px 6px',
        fontSize: '12px', fontWeight: '700', color: '#e8e8ea',
        background: 'rgba(0,0,0,0.0)', pointerEvents: 'none', zIndex: 7
    });
    elSub.appendChild(legendBoxFG);
    function renderFGLegend() {
        if (current !== 'FG') { legendBoxFG.style.display = 'none'; return; }
        if (!fgAligned?.length) { legendBoxFG.style.display = 'none'; return; }
        const last = fgAligned[fgAligned.length - 1]?.value;
        if (!Number.isFinite(last)) { legendBoxFG.style.display = 'none'; return; }
        legendBoxFG.innerHTML = `
          <span>FG_Index: <span style="color:#5ee0ff">${last.toFixed(0)}</span></span>
          <span style="margin:0 6px;">|</span>
          <span>Bands: <span style="color:green">0–25</span> / <span style="color:red">75–100</span></span>
        `;
        legendBoxFG.style.display = '';
    }

    // 보조 토글
    let current = 'MAOSC'; // 초기값: MA_Oscillator
    const pairs = [{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }];

    function clearAllSub() {
        // RSI
        rsiLine.setData([]); rsiBase30.setData([]); rsiBase70.setData([]);
        // MACD
        macdLine.setData([]); sigLine.setData([]); macdDot.style.left = macdDot.style.top = '-9999px';
        // FGI
        fgLine.setData([]); fg25.setData([]); fg75.setData([]);
        // MAOSC
        if (typeof maoscFill?.setData === 'function') maoscFill.setData([]);
        maoscLine.setData([]); maoscZero.setData([]);
        // Disparity
        disparityFill.setData([]); disparityLine.setData([]); disparityBase100.setData([]);
        // dots
        rsiDot.style.left = rsiDot.style.top = '-9999px';
        fgDot.style.left = fgDot.style.top = '-9999px';
        maoscDot.style.left = maoscDot.style.top = '-9999px';
        dispDot.style.left = dispDot.style.top = '-9999px';
        // legends
        legendBoxDisp.style.display = 'none';
        legendBoxMAOSC.style.display = 'none';
        legendBoxRSI.style.display = 'none';
        legendBoxMACD.style.display = 'none';
        legendBoxFG.style.display = 'none';
        // FG bands
        fgBandTop.style.display = 'none';
        fgBandBottom.style.display = 'none';
    }

    function showRSI() {
        current = 'RSI'; clearAllSub();
        rsiLine.setData(padWithWhitespace(candles, rsiRaw));
        rsiBase30.setData(candles.map(c => ({ time: c.time, value: 30 })));
        rsiBase70.setData(candles.map(c => ({ time: c.time, value: 70 })));
        positionRSIDot();
        renderRSILegend();                 // RSI 레전드
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showMACD() {
        current = 'MACD'; clearAllSub();
        macdLine.setData(padWithWhitespace(candles, macdRaw));
        sigLine.setData(padWithWhitespace(candles, sigRaw));
        positionMACDDot();
        renderMACDLegend();                // MACD 레전드
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showFG() {
        current = 'FG'; clearAllSub();
        try {
            fgLine.setData(padWithWhitespace(candles, fgAligned));
            fg25.setData(candles.map(c => ({ time: c.time, value: 25 })));
            fg75.setData(candles.map(c => ({ time: c.time, value: 75 })));
            positionFGDot();
            renderFGBands();               // 밴드 표시
            renderFGLegend();              // FG 레전드
        } catch (e) { console.error('FG monthly setData error:', e); }
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showMAOSC() {
        current = 'MAOSC'; clearAllSub();
        // 채움 → 라인 → 기준선(0) 순서 (이격도와 동일 구조)
        maoscFill.setData(padWithWhitespace(candles, maoscRaw));           // 위/아래 채움
        maoscLine.setData(padWithWhitespace(candles, maoscRaw));           // 오실레이터 선
        maoscZero.setData(candles.map(c => ({ time: c.time, value: 0 }))); // 기준선 0 (노란 1px)
        positionMAOSCDot();
        renderMAOSCLegend();               // MAOSC 레전드
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }
    function showDISP() {
        current = 'DISP'; clearAllSub();
        // 채움 → 라인 → 기준선(100)
        disparityFill.setData(padWithWhitespace(candles, dispRaw));          // 상/하단 채움
        disparityLine.setData(padWithWhitespace(candles, dispRaw));          // 이격도 선
        disparityBase100.setData(candles.map(c => ({ time: c.time, value: 100 }))); // 기준선 100 (노란 실선)
        positionDISPDot();
        renderDisparityLegend();           // Disparity 레전드
        requestAnimationFrame(() => resyncAxisPadding(pairs));
    }

    // 초기: MA_Oscillator
    showMAOSC();
    // 툴바 활성 표시(기존 로직 유지 가정)
    function setToolbarActive(name) {
        const btns = {
            rsi: document.querySelector('.main-toolbar [data-action="rsi"]'),
            macd: document.querySelector('.main-toolbar [data-action="macd"]'),
            fg_index: document.querySelector('.main-toolbar [data-action="fg_index"]'),
            ma_oscillator: document.querySelector('.main-toolbar [data-action="ma_oscillator"]'),
            disparity: document.querySelector('.main-toolbar [data-action="disparity"]'),
            lifeline: document.querySelector('.main-toolbar [data-action="lifeline"]'),
            trendline: document.querySelector('.main-toolbar [data-action="trendline"]'),
        };
        Object.values(btns).forEach(b => b && b.classList.remove('active-preset'));
        if (name === 'RSI' && btns.rsi) btns.rsi.classList.add('active-preset');
        if (name === 'MACD' && btns.macd) btns.macd.classList.add('active-preset');
        if (name === 'FG' && btns.fg_index) btns.fg_index.classList.add('active-preset');
        if (name === 'MAOSC' && btns.ma_oscillator) btns.ma_oscillator.classList.add('active-preset');
        if (name === 'DISP' && btns.disparity) btns.disparity.classList.add('active-preset');
    }
    setToolbarActive('MAOSC');

    // 툴바 이벤트 연결
    const btnRSI = document.querySelector('.main-toolbar [data-action="rsi"]');
    const btnMACD = document.querySelector('.main-toolbar [data-action="macd"]');
    const btnFG = document.querySelector('.main-toolbar [data-action="fg_index"]');
    const btnMAO = document.querySelector('.main-toolbar [data-action="ma_oscillator"]');
    const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');

    const onRSI = () => { showRSI(); setToolbarActive('RSI'); };
    const onMACD = () => { showMACD(); setToolbarActive('MACD'); };
    const onFG = () => { showFG(); setToolbarActive('FG'); };
    const onMAO = () => { showMAOSC(); setToolbarActive('MAOSC'); };
    const onDISP = () => { showDISP(); setToolbarActive('DISP'); };

    btnRSI?.addEventListener('click', onRSI);
    btnMACD?.addEventListener('click', onMACD);
    btnFG?.addEventListener('click', onFG);
    btnMAO?.addEventListener('click', onMAO);
    btnDISP?.addEventListener('click', onDISP);

    // ─────────────────────────────────────
    // 파동선/추세선 깜빡이 (요청 반영, 원본 유지)
    // ─────────────────────────────────────
    // lifeline 버튼 라벨을 '파동선'으로 표시
    const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
    if (btnLife) btnLife.textContent = '파동선';

    // 파동선(MA3) 토글: green ↔ #7CFC00 (1.5s)
    const WAVE_BASE = 'green';
    const WAVE_ALT = '#7CFC00';
    let waveOn = false, waveTimer = null, waveFlip = false;
    const setWaveUI = (on) => { if (!btnLife) return; on ? btnLife.classList.add('active-preset') : btnLife.classList.remove('active-preset'); };
    const setWaveColor = (c) => { try { ma003.applyOptions({ color: c }); } catch { } };
    function startWave() {
        waveOn = true; setWaveUI(true);
        setWaveColor(WAVE_ALT);
        waveTimer = setInterval(() => {
            waveFlip = !waveFlip;
            setWaveColor(waveFlip ? WAVE_BASE : WAVE_ALT);
        }, 1500);
    }
    function stopWave() {
        waveOn = false; setWaveUI(false);
        if (waveTimer) { try { clearInterval(waveTimer); } catch { } waveTimer = null; }
        waveFlip = false; setWaveColor(WAVE_BASE);
    }
    const onWave = () => { if (waveOn) stopWave(); else startWave(); };
    btnLife?.addEventListener('click', onWave);

    // 추세선(MA12) 토글: magenta ↔ 반투명 빨강(50%) (1.5s)
    const btnTrend = document.querySelector('.main-toolbar [data-action="trendline"]');
    const TREND_BASE = 'magenta';
    const TREND_ALT = 'rgba(255,0,0,0.5)'; // 요청사항: 빨강(50% 투명)
    let trendOn = false, trendTimer = null, trendFlip = false;
    const setTrendUI = (on) => { if (!btnTrend) return; on ? btnTrend.classList.add('active-preset') : btnTrend.classList.remove('active-preset'); };
    const setTrendColor = (c) => { try { ma012.applyOptions({ color: c }); } catch { } };
    function startTrend() {
        trendOn = true; setTrendUI(true);
        setTrendColor(TREND_ALT);
        trendTimer = setInterval(() => {
            trendFlip = !trendFlip;
            setTrendColor(trendFlip ? TREND_BASE : TREND_ALT);
        }, 1500);
    }
    function stopTrend() {
        trendOn = false; setTrendUI(false);
        if (trendTimer) { try { clearInterval(trendTimer); } catch { } trendTimer = null; }
        trendFlip = false; setTrendColor(TREND_BASE);
    }
    const onTrend = () => { if (trendOn) stopTrend(); else startTrend(); };
    btnTrend?.addEventListener('click', onTrend);

    // 점/밴드 위치 갱신
    const unsub = [];
    try {
        const ts = subChart.timeScale();
        const onRange = () => { positionRSIDot(); positionFGDot(); positionMAOSCDot(); positionDISPDot(); positionMACDDot(); renderFGBands(); };
        ts.subscribeVisibleTimeRangeChange(onRange);
        unsub.push(() => ts.unsubscribeVisibleTimeRangeChange(onRange));
    } catch { }
    try {
        const ps = subChart.priceScale('right');
        if (ps?.subscribeSizeChange) {
            const onSize = () => { positionRSIDot(); positionFGDot(); positionMAOSCDot(); positionDISPDot(); positionMACDDot(); renderFGBands(); };
            ps.subscribeSizeChange(onSize);
            unsub.push(() => ps.unsubscribeSizeChange(onSize));
        }
    } catch { }
    const ro = new ResizeObserver(() => { positionRSIDot(); positionFGDot(); positionMAOSCDot(); positionDISPDot(); positionMACDDot(); renderFGBands(); });
    try { ro.observe(elSub); } catch { }

    // 메인↔보조 동기화 + 가격축 폭 동기화
    const tsLink = linkTimeScalesOneWay(mainChart, subChart);
    const paLink = observeAndSyncPriceAxisWidth([{ chart: mainChart, container: elMain }, { chart: subChart, container: elSub }]);

    // 초기 보기 & 더블클릭 복귀
    setInitialVisibleRange(mainChart, candles, INITIAL_BARS_MONTHLY);
    const onDblClick = () => setInitialVisibleRange(mainChart, candles, INITIAL_BARS_MONTHLY);
    elMain.addEventListener('dblclick', onDblClick);

    // 정리
    return () => {
        btnRSI?.removeEventListener('click', onRSI);
        btnMACD?.removeEventListener('click', onMACD);
        btnFG?.removeEventListener('click', onFG);
        btnMAO?.removeEventListener('click', onMAO);
        btnDISP?.removeEventListener('click', onDISP);

        // 파동선/추세선 타이머 및 이벤트 해제
        btnLife?.removeEventListener('click', onWave);
        btnTrend?.removeEventListener('click', onTrend);
        try { stopWave(); } catch { }
        try { stopTrend(); } catch { }

        elMain.removeEventListener('dblclick', onDblClick);

        try { ro.disconnect(); } catch { }
        unsub.forEach(fn => { try { fn(); } catch { } });

        try { elSub.removeChild(rsiDot); } catch { }
        try { elSub.removeChild(fgDot); } catch { }
        try { elSub.removeChild(maoscDot); } catch { }
        try { elSub.removeChild(dispDot); } catch { }
        try { elSub.removeChild(macdDot); } catch { }
        try { elSub.removeChild(fgBandTop); } catch { }      // 오버레이 제거
        try { elSub.removeChild(fgBandBottom); } catch { }   // 오버레이 제거
        try { elSub.removeChild(legendBoxDisp); } catch { }
        try { elSub.removeChild(legendBoxMAOSC); } catch { }
        try { elSub.removeChild(legendBoxRSI); } catch { }   // RSI 레전드 정리
        try { elSub.removeChild(legendBoxMACD); } catch { }  // MACD 레전드 정리
        try { elSub.removeChild(legendBoxFG); } catch { }    // FG 레전드 정리
        try { elMain.removeChild(maLegend); } catch { }
        try { tsLink?.dispose?.(); } catch { }
        try { paLink?.dispose?.(); } catch { }
        try { mainChart.remove(); } catch { }
        try { subChart.remove(); } catch { }
    };
}

export function dispose() { }
