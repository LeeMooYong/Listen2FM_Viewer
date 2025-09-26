// Listen2FM_Viewer/plugins/economic/preset/macroProView.js
// 요구 사항 반영:
//  - window.LightweightCharts (전역) 선 로드 가드
//  - 데이터 경로 고정: data/economic/monthly/pce_ffr.json, yields_10y_2y.json, usrec.json
//  - 컨테이너 방어/초기화, UNIX sec 변환, 라인 + 베이스라인(스프레드), 경기침체 밴드, 레전드 토글
//  - fitContent는 다음 프레임에서 호출

/* ──────────────────────────────────────────────────────────────
 * Public API (router는 {mainRoot, mountId, ...} 형태로 호출함)
 * ────────────────────────────────────────────────────────────── */
export async function mountEconMacroPro(opts = {}) {
    const LWC = window.LightweightCharts;
    const host = pickContainer(opts);
    if (!host) {
        console.warn("[macroProView] mount root not found");
        return async function dispose() { };
    }
    if (!LWC || typeof LWC.createChart !== "function") {
        host.innerHTML = `<div style="padding:12px;color:#f66">LightweightCharts 로드 실패</div>`;
        return async function dispose() { host.innerHTML = ""; };
    }

    // 1) 컨테이너 초기화 (이전 프리셋 DOM/스타일 제거)
    resetContainer(host);

    // 2) 데이터 로드 (캐시 버스터)
    const [pceFfrRaw, yieldsRaw, usrecRaw] = await Promise.all([
        fetchJSON("data/economic/monthly/pce_ffr.json"),
        fetchJSON("data/economic/monthly/yields_10y_2y.json"),
        fetchJSON("data/economic/monthly/usrec.json"),
    ]);

    // 3) 어댑터: YYYY-MM-DD → UNIX(sec)
    const toUnix = (ds) => toUnixSeconds(ds);

    // 4) 시리즈 데이터 변환
    const corePceYoy = toLineSeries(pceFfrRaw, "core_pce_yoy", toUnix);
    const fedFunds = toLineSeries(pceFfrRaw, "fed_funds", toUnix);
    const dgs2 = toLineSeries(yieldsRaw, "dgs2", toUnix);
    const dgs10 = toLineSeries(yieldsRaw, "dgs10", toUnix);
    const spread = toLineSeries(yieldsRaw, "spread", toUnix); // 10y-2y

    // 5) 경기침체 구간 (USREC==1) → 연속 밴드로 축약
    const recPoints = adaptRecessionPoints(usrecRaw, toUnix);
    const recBands = collapseMonthlyBands(recPoints);

    // 6) 차트 생성
    const chart = LWC.createChart(host, {
        height: 520,
        layout: {
            background: { type: "Solid", color: "#0b0e13" },
            textColor: "#dddddd",
        },
        grid: {
            vertLines: { color: "#222" },
            horzLines: { color: "#222" },
        },
        rightPriceScale: { borderVisible: false },
        timeScale: {
            borderVisible: false,
            timeVisible: false, // 월간 스케일은 눈금 최소화
        },
        crosshair: { mode: 0 },
    });

    // 제목 오버레이
    addChartTitle(host, "Macro Economic Viewer");

    // 7) 시리즈 등록
    const sCore = chart.addLineSeries({ title: "Core PCE YoY (%)", color: "#ff7f0e", lineWidth: 1 });
    const sFFR = chart.addLineSeries({ title: "Fed Funds (%)", color: "yellow", lineWidth: 2 });
    const s2Y = chart.addLineSeries({ title: "UST 2Y (%)", color: "#17becf", lineWidth: 1 });
    const s10Y = chart.addLineSeries({ title: "UST 10Y (%)", color: "magenta", lineWidth: 1 });

    // 스프레드(10Y-2Y)는 0 기준 BaselineSeries
    const sSpr = chart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topLineColor: "#17f134ff",
        topFillColor1: "transparent", topFillColor2: "transparent",
        bottomLineColor: "red",
        bottomFillColor1: "transparent", bottomFillColor2: "transparent",
        lineWidth: 2,
    });

    // 8) 데이터 주입
    sCore.setData(corePceYoy);
    sFFR.setData(fedFunds);
    s2Y.setData(dgs2);
    s10Y.setData(dgs10);
    sSpr.setData(spread);

    // 9) 기준선
    sCore.createPriceLine({ price: 2.0, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "2%" });
    sSpr.createPriceLine({ price: 0.0, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "0%" });

    // 10) 경기침체 밴드 오버레이
    const overlay = ensureOverlay(host);
    const drawBands = () => drawRecessionBands(overlay, chart, recBands);
    chart.timeScale().subscribeVisibleTimeRangeChange(drawBands);

    // 11) 좌상단 레전드 토글
    const legend = buildLegend([
        { name: "Core PCE YoY", series: sCore, on: true },
        { name: "Fed Funds", series: sFFR, on: true },
        { name: "UST 2Y", series: s2Y, on: true },
        { name: "UST 10Y", series: s10Y, on: true },
        { name: "Spread(10Y-2Y)", series: sSpr, on: true },
    ]);
    host.appendChild(legend);

    // 12) fitContent 타이밍을 다음 프레임으로 연기
    const allTimes = collectAllTimes([corePceYoy, fedFunds, dgs2, dgs10, spread]);
    if (allTimes.length) {
        requestAnimationFrame(() => {
            chart.timeScale().fitContent();
            drawBands();
        });
    } else {
        showEmptyHint(host);
    }

    // 13) dispose 반환 (라우터에서 호출)
    return async function dispose() {
        try { chart.timeScale().unsubscribeVisibleTimeRangeChange(drawBands); } catch { }
        try { chart.remove(); } catch { }
        try { host.innerHTML = ""; } catch { }
    };
}

/* 호환성을 위한 별칭 export */
export const mountMacroProView = mountEconMacroPro;
export const mountMacroPro = mountEconMacroPro;
export const mountEconDashboard = mountEconMacroPro;
export default mountEconMacroPro;

/* ──────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────── */

// router가 넘겨준 { mainRoot, mountId }에서 안전하게 컨테이너 선택
function pickContainer({ mainRoot, mountId } = {}) {
    if (mainRoot && typeof mainRoot.querySelector === "function") return mainRoot;
    if (mountId) {
        const el = document.getElementById(mountId);
        if (el) return el;
    }
    return document.getElementById("main-content-area") || null;
}

// 컨테이너 초기화 (안전)
function resetContainer(el) {
    if (!el) return;
    try { el.innerHTML = ""; } catch { }
    try {
        const cs = window.getComputedStyle(el);
        if (cs.position === "static" || !el.style.position) el.style.position = "relative";
    } catch {
        // style이 없다면 최소 객체 보장
        if (el && el.style) el.style.position = "relative";
    }
}

// 캐시 무력화를 포함한 JSON fetch
async function fetchJSON(path) {
    const res = await fetch(`${path}?v=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} @ ${path}`);
    return res.json();
}

// 날짜 문자열/숫자 → UNIX(sec)
function toUnixSeconds(ds) {
    if (ds == null) return undefined;
    if (typeof ds === "number") return ds > 1e11 ? Math.floor(ds / 1000) : Math.floor(ds);
    const t = Date.parse(String(ds));
    return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

// 단일 키를 가진 월간 라인 데이터 배열로 변환
function toLineSeries(raw, valueKey, toUnix) {
    const arr = Array.isArray(raw) ? raw : [];
    const out = [];
    for (const row of arr) {
        const t = toUnix(row.date ?? row.time);
        const v = Number(row[valueKey]);
        if (Number.isFinite(t) && Number.isFinite(v)) out.push({ time: t, value: v });
    }
    out.sort((a, b) => a.time - b.time);
    return out;
}

// 경기침체 플래그 포인트
function adaptRecessionPoints(raw, toUnix) {
    const arr = Array.isArray(raw) ? raw : [];
    return arr
        .map(r => ({ time: toUnix(r.date ?? r.time), flag: Number(r.usrec) }))
        .filter(r => Number.isFinite(r.time) && r.flag === 1)
        .sort((a, b) => a.time - b.time);
}

// 월 단위 연속 구간을 밴드로 병합
function collapseMonthlyBands(points) {
    const bands = [];
    let start = null, prev = null;
    for (const p of points) {
        if (start == null) { start = p.time; prev = p.time; continue; }
        // 월간 샘플: 40일 이하면 연속으로 간주
        if (p.time - prev <= 40 * 86400) {
            prev = p.time;
        } else {
            bands.push([start, prev]);
            start = p.time;
            prev = p.time;
        }
    }
    if (start != null) bands.push([start, prev]);
    return bands;
}

// 오버레이(경기침체 밴드) 컨테이너
function ensureOverlay(host) {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "absolute", left: "0", top: "0", right: "0", bottom: "0",
        pointerEvents: "none", zIndex: "1",
    });
    host.appendChild(overlay);
    return overlay;
}

function drawRecessionBands(overlay, chart, bands) {
    overlay.innerHTML = "";
    const ts = chart.timeScale();
    for (const [t0, t1] of bands) {
        const x0 = ts.timeToCoordinate(t0);
        const x1 = ts.timeToCoordinate(t1);
        if (x0 == null || x1 == null) continue;
        const d = document.createElement("div");
        Object.assign(d.style, {
            position: "absolute",
            left: `${Math.min(x0, x1)}px`,
            width: `${Math.abs(x1 - x0)}px`,
            top: "0", bottom: "0",
            background: "rgba(160,160,160,0.15)",
        });
        overlay.appendChild(d);
    }
}

// 좌상단 레전드(시리즈 토글)
function buildLegend(items) {
    const box = document.createElement("div");
    Object.assign(box.style, {
        position: "absolute",
        left: "6px", top: "4px",
        font: "12px system-ui, -apple-system, Segoe UI, Roboto",
        display: "grid", gridAutoFlow: "row", gap: "4px",
        background: "rgba(0,0,0,0.35)",
        padding: "8px 10px",
        borderRadius: "8px",
        userSelect: "none",
        zIndex: "10",
    });

    for (const it of items) {
        const btn = document.createElement("button");
        btn.textContent = it.name;
        Object.assign(btn.style, {
            padding: "4px 6px",
            borderRadius: "6px",
            border: "1px solid #444",
            background: it.on ? "#1e90ff44" : "#111",
            color: "#ddd",
            cursor: "pointer",
        });
        btn.onclick = () => {
            it.on = !it.on;
            it.series.applyOptions({ visible: it.on });
            btn.style.background = it.on ? "#1e90ff44" : "#111";
        };
        box.appendChild(btn);
    }
    return box;
}

// 모든 시리즈의 time 합치기
function collectAllTimes(seriesList) {
    const out = [];
    for (const s of seriesList) for (const p of s) out.push(p.time);
    return out;
}

// 데이터 없음 힌트
function showEmptyHint(host) {
    const hint = document.createElement("div");
    hint.textContent = "데이터가 비어 있습니다. (경로/스키마 확인)";
    Object.assign(hint.style, {
        position: "absolute",
        right: "12px",
        top: "8px",
        color: "#f66",
        zIndex: "10",
    });
    host.appendChild(hint);
}

// 차트 제목
function addChartTitle(host, text) {
    const title = document.createElement("div");
    Object.assign(title.style, {
        position: "absolute",
        top: "8px",
        left: "50%",
        transform: "translateX(-50%)",
        font: "700 26px system-ui, -apple-system, Segoe UI, Roboto",
        color: "#eaeaea",
        textShadow: "0 0 4px rgba(0,0,0,0.6)",
        zIndex: 15,
        pointerEvents: "none",
    });
    title.textContent = text;
    host.appendChild(title);
}
