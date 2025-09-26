// plugins/krStocks/preset/krDualMonthlyDaily.js
// KR 듀얼(월/일) — 1×2(좌: 월봉 / 우: 일봉), 각 컬럼: 메인(캔들+MA+볼륨) + 보조(서브)
// 암호화폐 듀얼과 동일 로직/스타일 유지, FG Index만 제외
import { loadKRStockCandles } from "../data/dataLoader.js";
import { calculateSMA } from "../../crypto/indicators/movingAverage.js";
import { calculateMAOscillator } from "../../crypto/indicators/maOscillator.js";
import { calculateRSI } from "../../crypto/indicators/rsi.js";
import { calculateMACD } from "../../crypto/indicators/macd.js";
import observeAndSyncPriceAxisWidth from "../../shared/sync/priceAxisSync.js";
import {
    baseChartOptions,
    createTitleOverlay,
    setInitialVisibleRange,
    linkTimeScalesOneWay,
    padWithWhitespace,
} from "../../crypto/preset/_common.js";

const BARS_MONTH = 72;
const BARS_DAILY = 160;

export default async function mountKR_DualMonthlyDaily({
    mountId = "main-content-area",
    symbol = "삼성전자",
} = {}) {
    const LWC = window.LightweightCharts;
    const mainRoot = document.getElementById(mountId);
    if (!LWC || !mainRoot) return () => { };

    // 1×2: 좌/우 컬럼 각각 [메인 3fr + 서브 1fr]
    mainRoot.innerHTML = `
    <div id="kr-dual-root" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;height:100%;">
      <div id="dual-month" style="display:grid;grid-template-rows:3fr 1fr;gap:6px;min-height:120px;">
        <div id="dm-main" style="position:relative;"></div>
        <div id="dm-sub"  style="position:relative;"></div>
      </div>
      <div id="dual-daily" style="display:grid;grid-template-rows:3fr 1fr;gap:6px;min-height:120px;">
        <div id="dd-main" style="position:relative;"></div>
        <div id="dd-sub"  style="position:relative;"></div>
      </div>
    </div>
  `;

    // DOM
    const elMonthMain = mainRoot.querySelector("#dm-main");
    const elMonthSub = mainRoot.querySelector("#dm-sub");
    const elDayMain = mainRoot.querySelector("#dd-main");
    const elDaySub = mainRoot.querySelector("#dd-sub");

    // 타이틀
    createTitleOverlay(elMonthMain, `${symbol} 월봉`);
    createTitleOverlay(elDayMain, `${symbol} 일봉`);

    // 공통 옵션
    const base = baseChartOptions(LWC);

    // 차트 생성
    const chMM = LWC.createChart(elMonthMain, base);
    const chMS = LWC.createChart(elMonthSub, {
        ...base,
        rightPriceScale: { borderColor: "#2a2b31", scaleMargins: { top: 0.1, bottom: 0.1 } },
    });
    const chDM = LWC.createChart(elDayMain, base);
    const chDS = LWC.createChart(elDaySub, {
        ...base,
        rightPriceScale: { borderColor: "#2a2b31", scaleMargins: { top: 0.1, bottom: 0.1 } },
    });

    // 서브 차트는 사용자의 스크롤/스케일 비활성 (메인이 드라이브)
    [chMS, chDS].forEach((c) =>
        c.applyOptions({
            handleScroll: false,
            handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false },
        })
    );

    // 데이터 로드
    const [md, dd] = await Promise.all([
        loadKRStockCandles({ name: symbol, timeframe: "monthly" }),
        loadKRStockCandles({ name: symbol, timeframe: "daily" }),
    ]);

    const UP = "#26a69a",
        DOWN = "#ef5350";

    // ── 메인 세트(거래량 → MA들 → 캔들)
    function buildMainSet(chart, candles, maDefs) {
        const vol = chart.addHistogramSeries({
            priceScaleId: "vol",
            priceFormat: { type: "volume" },
            priceLineVisible: false,
            lastValueVisible: false,
        });
        vol.setData(
            candles.map((c) => ({
                time: c.time,
                value: c.volume,
                color: c.close >= c.open ? UP : DOWN,
            }))
        );
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false });

        const lines = {};
        maDefs.forEach((def) => {
            const s = chart.addLineSeries({
                color: def.color,
                lineWidth: def.w || 3,
                priceLineVisible: !!def.pl,
                priceLineStyle: 0,
                priceLineWidth: 1,
                priceLineColor: def.color,
                lastValueVisible: def.lastValueVisible !== false,
            });
            s.setData(calculateSMA(candles, def.p));
            lines[`ma${def.p}`] = s;
        });

        const candle = chart.addCandlestickSeries({
            upColor: UP,
            downColor: DOWN,
            borderDownColor: DOWN,
            borderUpColor: UP,
            wickDownColor: DOWN,
            wickUpColor: UP,
            priceFormat: { type: "price", precision: 2, minMove: 0.01 },
            priceLineVisible: true,
            priceLineStyle: 0,
            priceLineWidth: 1,
        });
        candle.setData(candles);
        try {
            const last = candles[candles.length - 1];
            candle.applyOptions({ priceLineColor: last && last.close >= last.open ? UP : DOWN });
        } catch { }

        return { candle, vol, lines };
    }

    // 월봉 메인: 72/24/12/6/3 (6은 점선)
    const mm = buildMainSet(chMM, md, [
        { p: 72, color: "white", w: 2, lastValueVisible: false },
        { p: 24, color: "red", w: 2, lastValueVisible: false },
        { p: 12, color: "magenta", w: 3 },
        { p: 6, color: "darkorange", w: 1, lastValueVisible: false },
        { p: 3, color: "green", w: 2 },
    ]);
    try {
        mm.lines.ma6?.applyOptions({ lineStyle: 2 });
    } catch { }

    // 일봉 메인: 240/120/60/20/5 (120은 점선, 20은 생명선)
    const dm = buildMainSet(chDM, dd, [
        { p: 240, color: "magenta", w: 4 },
        { p: 120, color: "darkorange", w: 1, lastValueVisible: false },
        { p: 60, color: "green", w: 3 },
        { p: 20, color: "red", w: 3, pl: true },
        { p: 5, color: "white", w: 2 },
    ]);
    try {
        dm.lines.ma120?.applyOptions({ lineStyle: 2 });
    } catch { }

    // MA 레전드
    function addLegend(el, items) {
        const box = document.createElement("div");
        Object.assign(box.style, {
            position: "absolute",
            top: "6px",
            left: "8px",
            display: "flex",
            gap: "12px",
            alignItems: "center",
            fontSize: "12px",
            fontWeight: "700",
            color: "#e8e8ea",
            textShadow: "0 0 4px rgba(0,0,0,0.5)",
            pointerEvents: "none",
            zIndex: 7,
        });
        const make = (color, label) => {
            const w = document.createElement("div");
            w.style.display = "flex";
            w.style.alignItems = "center";
            w.style.gap = "6px";
            const dot = document.createElement("span");
            Object.assign(dot.style, {
                display: "inline-block",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: color,
            });
            const t = document.createElement("span");
            t.textContent = label;
            w.appendChild(dot);
            w.appendChild(t);
            return w;
        };
        items.forEach((i) => box.appendChild(make(i.c, i.t)));
        el.appendChild(box);
        return box;
    }
    const lgMM = addLegend(elMonthMain, [
        { c: "white", t: "MA72" },
        { c: "red", t: "MA24" },
        { c: "magenta", t: "MA12" },
        { c: "darkorange", t: "MA6" },
        { c: "green", t: "MA3" },
    ]);
    const lgDM = addLegend(elDayMain, [
        { c: "magenta", t: "MA240" },
        { c: "darkorange", t: "MA120" },
        { c: "green", t: "MA60" },
        { c: "red", t: "MA20" },
        { c: "white", t: "MA5" },
    ]);

    // ─────────────────────────────
    // 보조: MA_Oscillator
    //   - 월봉: 기본(3–12)
    //   - 일봉: Mid(20–60), 5  ← 이 파일의 핵심 변경점
    // ─────────────────────────────

    // (월봉) 기본 MAO: 3–12
    function buildMAOsc(subChart, candles, fast, slow) {
        const base = subChart.addBaselineSeries({
            baseValue: { type: "price", price: 0 },
            topFillColor1: "rgba(0, 128, 0, 0.25)",
            topFillColor2: "rgba(0, 128, 0, 0.25)",
            bottomFillColor1: "rgba(255, 0, 0, 0.2)",
            bottomFillColor2: "rgba(255, 0, 0, 0.2)",
            topLineColor: "rgba(0,0,0,0)",
            bottomLineColor: "rgba(0,0,0,0)",
            priceLineVisible: false,
            lastValueVisible: false,
        });
        const zero = subChart.addLineSeries({
            color: "#FFD700",
            lineWidth: 1,
            lineStyle: 0,
            lastValueVisible: false,
            priceLineVisible: false,
        });
        const line = subChart.addLineSeries({ color: "green", lineWidth: 1 });

        const raw = calculateMAOscillator(candles, fast, slow);
        base.setData(padWithWhitespace(candles, raw));
        line.setData(padWithWhitespace(candles, raw));
        zero.setData(candles.map((c) => ({ time: c.time, value: 0 })));

        return { base, zero, line, raw };
    }
    const mo = buildMAOsc(chMS, md, 3, 12);
    try { mo.zero.applyOptions({ color: "magenta" }); } catch { }

    // (일봉) Mid 전용: 빨강=(20–60), 흰=(5–60), 0선=초록 — 모두 1px
    // 시리즈 준비
    const dMaoFill = chDS.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topFillColor1: "rgba(0, 128, 0, 0.25)",
        topFillColor2: "rgba(0, 128, 0, 0.25)",
        bottomFillColor1: "rgba(255, 0, 0, 0.2)",
        bottomFillColor2: "rgba(255, 0, 0, 0.2)",
        topLineColor: "rgba(0,0,0,0)",
        bottomLineColor: "rgba(0,0,0,0)",
        priceLineVisible: false,
        lastValueVisible: false,
    });
    const dMaoLine = chDS.addLineSeries({ color: "red", lineWidth: 1 });          // (20-60)
    const dMaoWhite = chDS.addLineSeries({ color: "#fff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); // (5-60)
    const dMaoZero = chDS.addLineSeries({ color: "green", lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });

    // Mid 데이터 생성 (US 일봉 단일차트와 동일 로직)
    const sma5 = calculateSMA(dd, 5);
    const sma20 = calculateSMA(dd, 20);
    const sma60 = calculateSMA(dd, 60);
    const toMap = (arr) => new Map(arr.filter(x => Number.isFinite(x?.value)).map(x => [x.time, x.value]));
    const m5 = toMap(sma5);
    const m20 = toMap(sma20);
    const m60 = toMap(sma60);

    // 빨강 본선 = (20-60), 흰 보조선 = (5-60)
    const midRed = dd.map(c => ({ time: c.time, value: (m20.get(c.time) ?? NaN) - (m60.get(c.time) ?? NaN) }))
        .filter(x => Number.isFinite(x.value));
    const midWhite = dd.map(c => ({ time: c.time, value: (m5.get(c.time) ?? NaN) - (m60.get(c.time) ?? NaN) }))
        .filter(x => Number.isFinite(x.value));

    // 교차 마커(흰-빨강의 부호변화)
    function makeCrossMarkers(whiteSeries, redSeries) {
        const redByTime = new Map(redSeries.map(x => [x.time, x.value]));
        const markers = [];
        const EPS = 1e-8;
        for (let i = 1; i < whiteSeries.length; i++) {
            const t = whiteSeries[i].time, t0 = whiteSeries[i - 1].time;
            if (!redByTime.has(t) || !redByTime.has(t0)) continue;
            const dPrev = whiteSeries[i - 1].value - redByTime.get(t0);
            const dCurr = whiteSeries[i].value - redByTime.get(t);
            if (dPrev <= EPS && dCurr > EPS) markers.push({ time: t, position: 'belowBar', color: '#16a34a', shape: 'arrowUp' }); // 골드
            if (dPrev >= -EPS && dCurr < -EPS) markers.push({ time: t, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown' }); // 데드
        }
        return markers;
    }
    const midMarkers = makeCrossMarkers(midWhite, midRed);

    // 시리즈에 데이터 주입
    dMaoFill.setData(padWithWhitespace(dd, midRed));
    dMaoLine.setData(padWithWhitespace(dd, midRed));
    dMaoWhite.setData(padWithWhitespace(dd, midWhite));
    dMaoZero.setData(dd.map(c => ({ time: c.time, value: 0 })));
    dMaoWhite.setMarkers(midMarkers);

    // 레전드(월/일)
    const legendBoxMO = document.createElement("div");
    Object.assign(legendBoxMO.style, {
        position: "absolute", top: "6px", left: "8px",
        display: "", gap: "8px", padding: "4px 6px",
        fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
        background: "rgba(0,0,0,0.0)", pointerEvents: "none", zIndex: 7,
    });
    legendBoxMO.innerHTML = `
    <span style="color:#ffffff">MA_Oscillator(</span>
    <span style="color:green">3</span>
    <span style="color:#ffffff">-</span>
    <span style="color:magenta">12</span>
    <span style="color:#ffffff">)</span>`;
    elMonthSub.appendChild(legendBoxMO);

    const legendBoxDO = document.createElement("div");
    Object.assign(legendBoxDO.style, {
        position: "absolute", top: "6px", left: "8px",
        display: "", gap: "8px", padding: "4px 6px",
        fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
        background: "rgba(0,0,0,0.0)", pointerEvents: "none", zIndex: 7,
    });
    legendBoxDO.innerHTML = `
    <span style="color:#ffffff">MA_Oscillator(</span>
    <span style="color:red">20</span>
    <span style="color:#ffffff">-</span>
    <span style="color:green">60</span>
    <span style="color:#ffffff">), </span><span style="color:#ffffff">5</span>`;
    elDaySub.appendChild(legendBoxDO);

    // ── RSI(월:9 / 일:14)
    const rsiM = {
        line: chMS.addLineSeries({ color: "#FFD700", lineWidth: 1 }),
        b30: chMS.addLineSeries({ color: "green", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }),
        b70: chMS.addLineSeries({ color: "red", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }),
        data: calculateRSI(md, 9),
    };
    const rsiD = {
        line: chDS.addLineSeries({ color: "#FFD700", lineWidth: 1 }),
        b30: chDS.addLineSeries({ color: "green", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }),
        b70: chDS.addLineSeries({ color: "red", lineStyle: 0, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }),
        data: calculateRSI(dd, 14),
    };
    function clearRSI_M() { rsiM.line.setData([]); rsiM.b30.setData([]); rsiM.b70.setData([]); }
    function clearRSI_D() { rsiD.line.setData([]); rsiD.b30.setData([]); rsiD.b70.setData([]); }

    const legendBoxRSIM = document.createElement("div");
    Object.assign(legendBoxRSIM.style, {
        position: "absolute", top: "6px", left: "8px",
        display: "none", gap: "8px", padding: "4px 6px",
        fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
        background: "rgba(0,0,0,0.0)", pointerEvents: "none", zIndex: 7,
    });
    elMonthSub.appendChild(legendBoxRSIM);

    const legendBoxRSID = document.createElement("div");
    Object.assign(legendBoxRSID.style, {
        position: "absolute", top: "6px", left: "8px",
        display: "none", gap: "8px", padding: "4px 6px",
        fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
        background: "rgba(0,0,0,0.0)", pointerEvents: "none", zIndex: 7,
    });
    elDaySub.appendChild(legendBoxRSID);

    function renderRSILegend(boxEl, label, lastVal) {
        if (!Number.isFinite(lastVal)) { boxEl.style.display = "none"; return; }
        boxEl.innerHTML = `
      <span>${label}: <span style="color:#FFD700">${lastVal.toFixed(1)}</span></span>
      <span style="margin:0 6px;">|</span>
      <span>Zones: <span style="color:green">30</span> / <span style="color:red">70</span></span>`;
        boxEl.style.display = "";
    }

    // ── Disparity(월:6 / 일:20)
    function buildDisparity(subChart, candles, maPeriod) {
        const base100 = subChart.addLineSeries({ color: "#FFD700", lineWidth: 1, lineStyle: 0, lastValueVisible: false, priceLineVisible: false });
        const fill = subChart.addBaselineSeries({
            baseValue: { type: "price", price: 100 },
            topFillColor1: "rgba(0, 128, 0, 0.25)", topFillColor2: "rgba(0, 128, 0, 0.25)",
            bottomFillColor1: "rgba(255, 0, 0, 0.2)", bottomFillColor2: "rgba(255, 0, 0, 0.2)",
            topLineColor: "rgba(0,0,0,0)", bottomLineColor: "rgba(0,0,0,0)",
            priceLineVisible: false, lastValueVisible: false,
        });
        const line = subChart.addLineSeries({ color: "#FF6F00", lineWidth: 1 });

        const ma = calculateSMA(candles, maPeriod);
        const closeMap = new Map(candles.map(c => [c.time, c.close]));
        const raw = ma.filter(m => Number.isFinite(m.value) && closeMap.has(m.time))
            .map(m => ({ time: m.time, value: (closeMap.get(m.time) / m.value) * 100 }));

        base100.setData(candles.map(c => ({ time: c.time, value: 100 })));
        fill.setData(padWithWhitespace(candles, raw));
        line.setData(padWithWhitespace(candles, raw));

        return { base100, fill, line, raw };
    }
    const dispM = buildDisparity(chMS, md, 6);
    const dispD = buildDisparity(chDS, dd, 20);

    const legendDispM = document.createElement("div");
    Object.assign(legendDispM.style, {
        position: "absolute", top: "6px", left: "8px",
        display: "none", gap: "8px", padding: "4px 6px",
        fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
        background: "rgba(0,0,0,0.0)", pointerEvents: "none", zIndex: 7,
    });
    legendDispM.innerHTML = `<span>Disparity(6) • Base <span style="color:#FFD700">100</span></span>`;
    elMonthSub.appendChild(legendDispM);

    const legendDispD = document.createElement("div");
    Object.assign(legendDispD.style, {
        position: "absolute", top: "6px", left: "8px",
        display: "none", gap: "8px", padding: "4px 6px",
        fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
        background: "rgba(0,0,0,0.0)", pointerEvents: "none", zIndex: 7,
    });
    legendDispD.innerHTML = `<span>Disparity(20) • Base <span style="color:#FFD700">100</span></span>`;
    elDaySub.appendChild(legendDispD);

    // ── MACD(월/일)
    function buildMACD(subChart, candles) {
        const macdLine = subChart.addLineSeries({ color: "red", lineWidth: 1 });
        const sigLine = subChart.addLineSeries({ color: "yellow", lineWidth: 1 });
        const hist = subChart.addHistogramSeries({});
        const { macd, signal, histogram } = calculateMACD(candles);

        const histColored = histogram.map(h => ({
            time: h.time, value: h.value,
            color: h.value >= 0 ? "rgba(0, 255, 0, 0.5)" : "rgba(239, 83, 80, 0.5)",
        }));

        macdLine.setData(padWithWhitespace(candles, macd));
        sigLine.setData(padWithWhitespace(candles, signal));
        hist.setData(padWithWhitespace(candles, histColored));

        return { macdLine, sigLine, hist, raw: { macd, signal, histogram: histColored } };
    }
    const macdM = buildMACD(chMS, md);
    const macdD = buildMACD(chDS, dd);

    const legendMACDM = document.createElement("div");
    Object.assign(legendMACDM.style, {
        position: "absolute", top: "6px", left: "8px",
        display: "none", gap: "8px", padding: "4px 6px",
        fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
        background: "rgba(0,0,0,0.0)", pointerEvents: "none", zIndex: 7,
    });
    elMonthSub.appendChild(legendMACDM);

    const legendMACDD = document.createElement("div");
    Object.assign(legendMACDD.style, {
        position: "absolute", top: "6px", left: "8px",
        display: "none", gap: "8px", padding: "4px 6px",
        fontSize: "12px", fontWeight: "700", color: "#e8e8ea",
        background: "rgba(0,0,0,0.0)", pointerEvents: "none", zIndex: 7,
    });
    elDaySub.appendChild(legendMACDD);

    function renderMACDLegend(boxEl, label, lastM, lastS) {
        if (!Number.isFinite(lastM) || !Number.isFinite(lastS)) { boxEl.style.display = "none"; return; }
        boxEl.innerHTML = `
      <span>${label}: <span style="color:red">${lastM.toFixed(2)}</span></span>
      <span style="margin:0 6px;">|</span>
      <span>Signal: <span style="color:yellow">${lastS.toFixed(2)}</span></span>`;
        boxEl.style.display = "";
    }

    // ── 펄스 스타일
    (function ensurePulseStyle() {
        const id = "l2fm-osc-pulse-style";
        if (!document.getElementById(id)) {
            const st = document.createElement("style");
            st.id = id;
            st.textContent = `
@keyframes l2fmOscPulse {
  0% { box-shadow:0 0 0 0 rgba(255,215,0,.65); opacity:1; }
  70%{ box-shadow:0 0 0 12px rgba(255,215,0,0); opacity:.85; }
 100%{ box-shadow:0 0 0 0 rgba(255,215,0,0); opacity:.85; } }`;
            document.head.appendChild(st);
        }
    })();
    (function ensureDispPulseStyle() {
        const id = "l2fm-disp-pulse-style";
        if (!document.getElementById(id)) {
            const st = document.createElement("style");
            st.id = id;
            st.textContent = `@keyframes l2fmDISPPulse{
  0%{box-shadow:0 0 0 0 rgba(255,183,77,.55);opacity:1;}
  70%{box-shadow:0 0 0 12px rgba(255,183,77,0);opacity:.85;}
  100%{box-shadow:0 0 0 0 rgba(255,183,77,0);opacity:.85;}}`;
            document.head.appendChild(st);
        }
    })();

    // dot 유틸
    function makeDot(hostEl, bg, anim) {
        const d = document.createElement("div");
        Object.assign(d.style, {
            position: "absolute",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: bg,
            pointerEvents: "none",
            zIndex: 6,
            animation: `${anim} 1.6s ease-out infinite`,
            left: "-9999px",
            top: "-9999px",
        });
        hostEl.appendChild(d);
        return d;
    }
    const dotMO = makeDot(elMonthSub, "#FFD700", "l2fmOscPulse"); // 월 RSI/MAO 공용
    const dotDO = makeDot(elDaySub, "#FFD700", "l2fmOscPulse"); // 일 RSI/MAO 공용
    const dotDISPM = makeDot(elMonthSub, "#FFB74D", "l2fmDISPPulse");
    const dotDISPD = makeDot(elDaySub, "#FFB74D", "l2fmDISPPulse");

    function placeDot(subChart, series, data, dot) {
        if (!data?.length) { dot.style.left = dot.style.top = "-9999px"; return; }
        const last = data[data.length - 1];
        const x = subChart.timeScale()?.timeToCoordinate(last.time);
        const y = series.priceToCoordinate?.(last.value);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            dot.style.left = x - 4 + "px";
            dot.style.top = y - 4 + "px";
        } else {
            dot.style.left = dot.style.top = "-9999px";
        }
    }

    // 상태
    let monthSubCurrent = "MAOSC";
    let daySubCurrent = "MAOSC";

    // dot 위치 갱신
    const posMO = () => {
        if (monthSubCurrent === "MAOSC") return placeDot(chMS, mo.line, mo.raw, dotMO);
        if (monthSubCurrent === "RSI") return placeDot(chMS, rsiM.line, rsiM.data, dotMO);
        dotMO.style.left = dotMO.style.top = "-9999px";
    };
    const posDO = () => {
        if (daySubCurrent === "MAOSC") return placeDot(chDS, dMaoLine, midRed, dotDO);
        if (daySubCurrent === "RSI") return placeDot(chDS, rsiD.line, rsiD.data, dotDO);
        dotDO.style.left = dotDO.style.top = "-9999px";
    };
    const posDISPM = () => {
        if (monthSubCurrent !== "DISP") { dotDISPM.style.left = dotDISPM.style.top = "-9999px"; return; }
        placeDot(chMS, dispM.line, dispM.raw, dotDISPM);
    };
    const posDISPD = () => {
        if (daySubCurrent !== "DISP") { dotDISPD.style.left = dotDISPD.style.top = "-9999px"; return; }
        placeDot(chDS, dispD.line, dispD.raw, dotDISPD);
    };

    posMO(); posDO(); posDISPM(); posDISPD();

    // 링크/동기화
    const linkM = linkTimeScalesOneWay(chMM, chMS);
    const linkD = linkTimeScalesOneWay(chDM, chDS);
    const paLeft = observeAndSyncPriceAxisWidth([
        { chart: chMM, container: elMonthMain },
        { chart: chMS, container: elMonthSub },
    ]);
    const paRight = observeAndSyncPriceAxisWidth([
        { chart: chDM, container: elDayMain },
        { chart: chDS, container: elDaySub },
    ]);

    // 초기 범위
    setInitialVisibleRange(chMM, md, BARS_MONTH);
    setInitialVisibleRange(chMS, md, BARS_MONTH);
    setInitialVisibleRange(chDM, dd, BARS_DAILY);
    setInitialVisibleRange(chDS, dd, BARS_DAILY);

    const onMonthDbl = () => {
        setInitialVisibleRange(chMM, md, BARS_MONTH);
        setTimeout(() => { posMO(); posDISPM(); }, 0);
    };
    const onDailyDbl = () => {
        setInitialVisibleRange(chDM, dd, BARS_DAILY);
        setTimeout(() => { posDO(); posDISPD(); }, 0);
    };
    elMonthMain.addEventListener("dblclick", onMonthDbl);
    elDayMain.addEventListener("dblclick", onDailyDbl);

    // 리사이즈/축 변경에 따른 dot 재배치
    const unsubs = [];
    function bindReposition(subChart, containerEl, posFn) {
        try {
            const ts = subChart.timeScale();
            const onRange = () => posFn();
            ts.subscribeVisibleTimeRangeChange(onRange);
            unsubs.push(() => ts.unsubscribeVisibleTimeRangeChange(onRange));
        } catch { }
        try {
            const ps = subChart.priceScale("right");
            if (ps?.subscribeSizeChange) {
                const onSize = () => posFn();
                ps.subscribeSizeChange(onSize);
                unsubs.push(() => ps.unsubscribeSizeChange(onSize));
            }
        } catch { }
        const ro = new ResizeObserver(() => posFn());
        try { if (containerEl) ro.observe(containerEl); } catch { }
        unsubs.push(() => { try { ro.disconnect(); } catch { } });
    }
    bindReposition(chMS, elMonthSub, posMO);
    bindReposition(chDS, elDaySub, posDO);
    bindReposition(chMS, elMonthSub, posDISPM);
    bindReposition(chDS, elDaySub, posDISPD);

    // ── 툴바
    const btnLife = document.querySelector('.main-toolbar [data-action="lifeline"]');
    const btnTrend = document.querySelector('.main-toolbar [data-action="trendline"]');
    const btnMAO = document.querySelector('.main-toolbar [data-action="ma_oscillator"]');
    const btnRSI = document.querySelector('.main-toolbar [data-action="rsi"]');
    const btnDISP = document.querySelector('.main-toolbar [data-action="disparity"]');
    const btnMACD = document.querySelector('.main-toolbar [data-action="macd"]');

    const setActive = (btn, on) => { if (!btn) return; on ? btn.classList.add("active-preset") : btn.classList.remove("active-preset"); };

    // 생명선/추세선(일봉 메인의 MA20/MA60 깜빡이)
    const LIFE_RED = "red", LIFE_YELLOW = "#FFD700";
    let lifeOn = false, lifeTimer = null, lifeFlip = false;
    function setLifeColor(c) { try { dm.lines.ma20.applyOptions({ color: c }); } catch { } }
    function startLife() {
        lifeOn = true; setActive(btnLife, true); setLifeColor(LIFE_YELLOW);
        lifeTimer = setInterval(() => { lifeFlip = !lifeFlip; setLifeColor(lifeFlip ? LIFE_RED : LIFE_YELLOW); }, 1500);
    }
    function stopLife() { lifeOn = false; setActive(btnLife, false); if (lifeTimer) { clearInterval(lifeTimer); lifeTimer = null; } setLifeColor(LIFE_RED); }
    const onLife = () => (lifeOn ? stopLife() : startLife());

    const TREND_GREEN = "green", TREND_LIGHT = "#7CFC00";
    let trendOn = false, trendTimer = null, trendFlip = false;
    function setTrendColor(c) { try { dm.lines.ma60.applyOptions({ color: c }); } catch { } }
    function startTrend() {
        trendOn = true; setActive(btnTrend, true); setTrendColor(TREND_LIGHT);
        trendTimer = setInterval(() => { trendFlip = !trendFlip; setTrendColor(trendFlip ? TREND_GREEN : TREND_LIGHT); }, 1500);
    }
    function stopTrend() { trendOn = false; setActive(btnTrend, false); if (trendTimer) { clearInterval(trendTimer); trendTimer = null; } setTrendColor(TREND_GREEN); }
    const onTrend = () => (trendOn ? stopTrend() : startTrend());

    btnLife?.addEventListener("click", onLife);
    btnTrend?.addEventListener("click", onTrend);

    // 싱글/더블클릭 유틸 (싱글: 월+일 동시, 더블: 일봉만)
    function bindSingleVsDouble(btn, onSingle, onDouble, delay = 220) {
        if (!btn) return () => { };
        let timer = null;
        const handler = () => {
            if (timer) { clearTimeout(timer); timer = null; onDouble?.(); return; }
            timer = setTimeout(() => { timer = null; onSingle?.(); }, delay);
        };
        btn.addEventListener("click", handler);
        return () => btn.removeEventListener("click", handler);
    }

    // 보조지표 토글
    function showMonthMAOSC() {
        mo.base.setData(padWithWhitespace(md, mo.raw));
        mo.line.setData(padWithWhitespace(md, mo.raw));
        mo.zero.setData(md.map((c) => ({ time: c.time, value: 0 })));
        clearRSI_M(); dispM.base100.setData([]); dispM.fill.setData([]); dispM.line.setData([]);
        macdM.macdLine.setData([]); macdM.sigLine.setData([]); macdM.hist.setData([]);
        legendBoxMO.style.display = ""; legendBoxRSIM.style.display = "none"; legendDispM.style.display = "none"; legendMACDM.style.display = "none";
        posMO(); dotDISPM.style.left = dotDISPM.style.top = "-9999px";
    }

    function showDayMAOSC() {
        dMaoFill.setData(padWithWhitespace(dd, midRed));
        dMaoLine.setData(padWithWhitespace(dd, midRed));
        dMaoWhite.setData(padWithWhitespace(dd, midWhite));
        dMaoZero.setData(dd.map(c => ({ time: c.time, value: 0 })));
        dMaoWhite.setMarkers(midMarkers);

        clearRSI_D(); dispD.base100.setData([]); dispD.fill.setData([]); dispD.line.setData([]);
        macdD.macdLine.setData([]); macdD.sigLine.setData([]); macdD.hist.setData([]);

        legendBoxDO.style.display = ""; legendBoxRSID.style.display = "none"; legendDispD.style.display = "none"; legendMACDD.style.display = "none";
        posDO(); dotDISPD.style.left = dotDISPD.style.top = "-9999px";
    }

    function showMonthRSI() {
        rsiM.line.setData(padWithWhitespace(md, rsiM.data));
        rsiM.b30.setData(md.map((c) => ({ time: c.time, value: 30 })));
        rsiM.b70.setData(md.map((c) => ({ time: c.time, value: 70 })));
        mo.base.setData([]); mo.line.setData([]); mo.zero.setData([]);
        dispM.base100.setData([]); dispM.fill.setData([]); dispM.line.setData([]);
        macdM.macdLine.setData([]); macdM.sigLine.setData([]); macdM.hist.setData([]);
        const last = rsiM.data?.at(-1)?.value; renderRSILegend(legendBoxRSIM, "RSI(9)", last);
        legendBoxMO.style.display = "none"; legendDispM.style.display = "none"; legendMACDM.style.display = "none";
        posMO(); dotDISPM.style.left = dotDISPM.style.top = "-9999px";
    }
    function showDayRSI() {
        rsiD.line.setData(padWithWhitespace(dd, rsiD.data));
        rsiD.b30.setData(dd.map((c) => ({ time: c.time, value: 30 })));
        rsiD.b70.setData(dd.map((c) => ({ time: c.time, value: 70 })));
        dMaoFill.setData([]); dMaoLine.setData([]); dMaoWhite.setData([]); dMaoZero.setData([]); dMaoWhite.setMarkers([]);
        dispD.base100.setData([]); dispD.fill.setData([]); dispD.line.setData([]);
        macdD.macdLine.setData([]); macdD.sigLine.setData([]); macdD.hist.setData([]);
        const last = rsiD.data?.at(-1)?.value; renderRSILegend(legendBoxRSID, "RSI(14)", last);
        legendBoxDO.style.display = "none"; legendDispD.style.display = "none"; legendMACDD.style.display = "none";
        posDO(); dotDISPD.style.left = dotDISPD.style.top = "-9999px";
    }

    function showMonthDISP() {
        dispM.base100.setData(md.map((c) => ({ time: c.time, value: 100 })));
        mo.base.setData([]); mo.line.setData([]); mo.zero.setData([]);
        clearRSI_M(); macdM.macdLine.setData([]); macdM.sigLine.setData([]); macdM.hist.setData([]);
        legendDispM.style.display = ""; legendBoxMO.style.display = "none"; legendBoxRSIM.style.display = "none"; legendMACDM.style.display = "none";
        dispM.fill.setData(padWithWhitespace(md, dispM.raw));
        dispM.line.setData(padWithWhitespace(md, dispM.raw));
        dotMO.style.left = dotMO.style.top = "-9999px"; posDISPM();
    }
    function showDayDISP() {
        dispD.base100.setData(dd.map((c) => ({ time: c.time, value: 100 })));
        dMaoFill.setData([]); dMaoLine.setData([]); dMaoWhite.setData([]); dMaoZero.setData([]); dMaoWhite.setMarkers([]);
        clearRSI_D(); macdD.macdLine.setData([]); macdD.sigLine.setData([]); macdD.hist.setData([]);
        legendDispD.style.display = ""; legendBoxDO.style.display = "none"; legendBoxRSID.style.display = "none"; legendMACDD.style.display = "none";
        dispD.fill.setData(padWithWhitespace(dd, dispD.raw));
        dispD.line.setData(padWithWhitespace(dd, dispD.raw));
        dotDO.style.left = dotDO.style.top = "-9999px"; posDISPD();
    }

    function clearMACD_M() { macdM.macdLine.setData([]); macdM.sigLine.setData([]); macdM.hist.setData([]); }
    function clearMACD_D() { macdD.macdLine.setData([]); macdD.sigLine.setData([]); macdD.hist.setData([]); }

    function showMonthMACD() {
        macdM.macdLine.setData(padWithWhitespace(md, macdM.raw.macd));
        macdM.sigLine.setData(padWithWhitespace(md, macdM.raw.signal));
        macdM.hist.setData(padWithWhitespace(md, macdM.raw.histogram));
        mo.base.setData([]); mo.line.setData([]); mo.zero.setData([]);
        clearRSI_M(); dispM.base100.setData([]); dispM.fill.setData([]); dispM.line.setData([]);
        const mLast = macdM.raw.macd.at(-1)?.value, sLast = macdM.raw.signal.at(-1)?.value;
        renderMACDLegend(legendMACDM, "MACD(12,26,9)", mLast, sLast);
        legendBoxMO.style.display = "none"; legendBoxRSIM.style.display = "none"; legendDispM.style.display = "none";
        dotMO.style.left = dotMO.style.top = "-9999px"; dotDISPM.style.left = dotDISPM.style.top = "-9999px";
    }
    function showDayMACD() {
        macdD.macdLine.setData(padWithWhitespace(dd, macdD.raw.macd));
        macdD.sigLine.setData(padWithWhitespace(dd, macdD.raw.signal));
        macdD.hist.setData(padWithWhitespace(dd, macdD.raw.histogram));
        dMaoFill.setData([]); dMaoLine.setData([]); dMaoWhite.setData([]); dMaoZero.setData([]); dMaoWhite.setMarkers([]);
        clearRSI_D(); dispD.base100.setData([]); dispD.fill.setData([]); dispD.line.setData([]);
        const mLast = macdD.raw.macd.at(-1)?.value, sLast = macdD.raw.signal.at(-1)?.value;
        renderMACDLegend(legendMACDD, "MACD(12,26,9)", mLast, sLast);
        legendBoxDO.style.display = "none"; legendBoxRSID.style.display = "none"; legendDispD.style.display = "none";
        dotDO.style.left = dotDO.style.top = "-9999px"; dotDISPD.style.left = dotDISPD.style.top = "-9999px";
    }

    // 초기: MAOSC 월/일 동시
    function syncToolbarActive() {
        setActive(btnMAO, monthSubCurrent === "MAOSC" || daySubCurrent === "MAOSC");
        setActive(btnRSI, monthSubCurrent === "RSI" || daySubCurrent === "RSI");
        setActive(btnDISP, monthSubCurrent === "DISP" || daySubCurrent === "DISP");
        setActive(btnMACD, monthSubCurrent === "MACD" || daySubCurrent === "MACD");
    }

    function showBothMAOSC() { showMonthMAOSC(); showDayMAOSC(); monthSubCurrent = "MAOSC"; daySubCurrent = "MAOSC"; syncToolbarActive(); posMO(); posDO(); posDISPM(); posDISPD(); }
    function showBothRSI() { showMonthRSI(); showDayRSI(); monthSubCurrent = "RSI"; daySubCurrent = "RSI"; syncToolbarActive(); posMO(); posDO(); posDISPM(); posDISPD(); }
    function showBothDISP() { showMonthDISP(); showDayDISP(); monthSubCurrent = "DISP"; daySubCurrent = "DISP"; syncToolbarActive(); posDISPM(); posDISPD(); }
    function showBothMACD() { showMonthMACD(); showDayMACD(); monthSubCurrent = "MACD"; daySubCurrent = "MACD"; syncToolbarActive(); posMO(); posDO(); posDISPM(); posDISPD(); }

    showBothMAOSC();

    // 버튼 바인딩(싱글: 월+일, 더블: 일봉만)
    const offMAO = bindSingleVsDouble(btnMAO, () => showBothMAOSC(), () => { showDayMAOSC(); daySubCurrent = "MAOSC"; syncToolbarActive(); posDO(); posDISPD(); });
    const offRSI = bindSingleVsDouble(btnRSI, () => showBothRSI(), () => { showDayRSI(); daySubCurrent = "RSI"; syncToolbarActive(); posDO(); posDISPD(); });
    const offDISP = bindSingleVsDouble(btnDISP, () => showBothDISP(), () => { showDayDISP(); daySubCurrent = "DISP"; syncToolbarActive(); posDISPD(); });
    const offMACD = bindSingleVsDouble(btnMACD, () => showBothMACD(), () => { showDayMACD(); daySubCurrent = "MACD"; syncToolbarActive(); posDO(); posDISPD(); });

    // 정리
    return () => {
        btnLife?.removeEventListener("click", onLife);
        btnTrend?.removeEventListener("click", onTrend);
        offMAO?.(); offRSI?.(); offDISP?.(); offMACD?.();

        setActive(btnMAO, false); setActive(btnRSI, false); setActive(btnDISP, false); setActive(btnMACD, false);

        elMonthMain.removeEventListener("dblclick", onMonthDbl);
        elDayMain.removeEventListener("dblclick", onDailyDbl);

        try { elMonthSub.removeChild(legendBoxMO); } catch { }
        try { elDaySub.removeChild(legendBoxDO); } catch { }
        try { elMonthSub.removeChild(legendBoxRSIM); } catch { }
        try { elDaySub.removeChild(legendBoxRSID); } catch { }
        try { elMonthSub.removeChild(legendDispM); } catch { }
        try { elDaySub.removeChild(legendDispD); } catch { }
        try { elMonthSub.removeChild(legendMACDM); } catch { }
        try { elDaySub.removeChild(legendMACDD); } catch { }

        try { elMonthSub.removeChild(dotMO); } catch { }
        try { elDaySub.removeChild(dotDO); } catch { }
        try { elMonthSub.removeChild(dotDISPM); } catch { }
        try { elDaySub.removeChild(dotDISPD); } catch { }

        try { elMonthMain.removeChild(lgMM); } catch { }
        try { elDayMain.removeChild(lgDM); } catch { }

        try { linkM?.dispose?.(); } catch { }
        try { linkD?.dispose?.(); } catch { }
        try { paLeft?.dispose?.(); } catch { }
        try { paRight?.dispose?.(); } catch { }
        unsubs.forEach((fn) => { try { fn(); } catch { } });

        try { chMM.remove(); } catch { }
        try { chMS.remove(); } catch { }
        try { chDM.remove(); } catch { }
        try { chDS.remove(); } catch { }
    };
}

export const presetKey = "krDualMonthlyDaily";
