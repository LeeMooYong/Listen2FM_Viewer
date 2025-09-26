// Listen2FM_Viewer/plugins/usStocks/ui/sidebar.js
// US 주식탭 사이드바 — 클릭 수 최소화를 위해 ETF와 동일하게 M7도 '평탄 목록 + 배지 색상'으로 표시
// - ETF: 1x / 3x / -3x 색상 구분
// - M7: 1x / 2x / -2x 색상 구분
// - 헤더에 '배지 범례(legend)' 추가 → 색 의미를 한눈에 안내
// - 데이터 없음: "준비중" 배지 + 클릭 방지 + 토스트 안내
// - 개별종목: 심볼 직접 입력 섹션 추가
//
// 불변조건: 프리셋 결정/마운트/active 표시 로직 유지
// 변경점: 선택(active) 처리 시 "배경색 미변경" — 테두리/굵기만 변경

import { mountPreset } from "../../../app/router.js";
import { registerETFSymbols } from "../data/dataLoader.js";

/** ──────────────────────────────────────────────────────────────
 * 가용 심볼 (현재 데이터가 준비된 항목만 클릭 허용)
 * ────────────────────────────────────────────────────────────── */
const AVAILABLE_ETF = new Set(["SPY", "SPXL", "QQQ", "TQQQ", "SOXX", "SOXL"]);
const AVAILABLE_M7 = new Set(["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA"]);

// 로더(ETF_SET)와 동기화
registerETFSymbols([...AVAILABLE_ETF]);

/** ──────────────────────────────────────────────────────────────
 * 표시명 사전
 * ────────────────────────────────────────────────────────────── */
const NAME = {
    SPY: "S&P500 1x", SPXL: "S&P500 3x Long", SPXS: "S&P500 -3x Inverse",
    QQQ: "Nasdaq100 1x", TQQQ: "Nasdaq100 3x Long", SQQQ: "Nasdaq100 -3x Inverse",
    SOXX: "Semiconductors 1x", SOXL: "Semiconductors 3x Long", SOXS: "Semiconductors -3x Inverse",

    AAPL: "Apple", MSFT: "Microsoft", NVDA: "NVIDIA",
    AMZN: "Amazon", META: "Meta", GOOGL: "Alphabet", TSLA: "Tesla",

    NVDL: "NVIDIA 2x Long", NVDS: "NVIDIA 2x Inverse",
};

/** ──────────────────────────────────────────────────────────────
 * ETF / M7 평탄 목록
 * ────────────────────────────────────────────────────────────── */
const ETF_LIST = [
    { sym: "SPY", tier: "1x" },
    { sym: "QQQ", tier: "1x" },
    { sym: "SOXX", tier: "1x" },

    { sym: "SPXL", tier: "3x" },
    { sym: "TQQQ", tier: "3x" },
    { sym: "SOXL", tier: "3x" },

    { sym: "SQQQ", tier: "-3x" }, // 준비중
];

const M7_FLAT = [
    { sym: "AAPL", tier: "1x" }, { sym: "MSFT", tier: "1x" }, { sym: "NVDA", tier: "1x" },
    { sym: "AMZN", tier: "1x" }, { sym: "META", tier: "1x" }, { sym: "GOOGL", tier: "1x" }, { sym: "TSLA", tier: "1x" },

    { sym: "NVDL", tier: "2x" },
    { sym: "NVDS", tier: "-2x" },
];

/** ──────────────────────────────────────────────────────────────
 * 공용 스타일
 * ────────────────────────────────────────────────────────────── */
function styleHeader(el, { pad = "10px 12px" } = {}) {
    Object.assign(el.style, {
        fontWeight: "700",
        color: "#e8e8ea",
        padding: pad,
        borderBottom: "1px solid #2a2b31",
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
        background: "rgba(255,255,255,0.02)",
    });
}
function caretSpan() {
    const s = document.createElement("span");
    s.textContent = "▸";
    Object.assign(s.style, { opacity: "0.7", transition: "transform .15s" });
    return s;
}
function styleSectionContainer(el) {
    Object.assign(el.style, { borderBottom: "1px solid #1c1d22" });
}
function styleList(ul) {
    ul.style.listStyle = "none";
    ul.style.margin = "0";
    ul.style.padding = "6px 0 8px";
}

/** 기본 아이템 스타일(배경/글자색은 외부에서 지정) */
function styleItemBase(li) {
    Object.assign(li.style, {
        padding: "6px 12px",
        cursor: "pointer",
        borderRadius: "6px",
        margin: "2px 6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        transition: "box-shadow .12s ease, transform .03s ease",
    });
}

/** 선택 표시만 담당 — 배경은 절대 건드리지 않음 */
function applyActiveVisual(li, active) {
    if (active) {
        li.style.boxShadow = "inset 0 0 0 2px #66ccff";
        li.style.fontWeight = "700";
    } else {
        li.style.boxShadow = "none";
        li.style.fontWeight = "500";
    }
}

function makeBadge(text, bg, fg) {
    const b = document.createElement("span");
    b.textContent = text;
    Object.assign(b.style, {
        fontSize: "11px",
        padding: "2px 6px",
        borderRadius: "999px",
        background: bg,
        color: fg,
        lineHeight: "14px",
    });
    return b;
}
function colorForTier(tier) {
    // ETF: 1x=연녹, 3x=연파, -3x=연핑크
    // M7: 1x=연녹, 2x=연파, -2x=연핑크 (체계 동일)
    if (tier === "1x") return { bg: "#dff3df", fg: "#0b0e11" };
    if (tier === "3x" || tier === "2x") return { bg: "#d7eaff", fg: "#0b0e11" };
    if (tier === "-3x" || tier === "--3x" || tier === "−3x" || tier === "-2x")
        return { bg: "#fde2e2", fg: "#7a1f1f" };
    return { bg: "transparent", fg: "#ddd" };
}

/** 헤더에 '배지 범례(legend)' 추가 */
function appendTierLegendToHeader(header, tokens) {
    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "8px";

    const legend = document.createElement("div");
    legend.style.display = "flex";
    legend.style.gap = "6px";
    legend.style.flexWrap = "wrap";

    tokens.forEach(({ text, tier }) => {
        const { bg, fg } = colorForTier(tier);
        const b = makeBadge(text, bg, fg);
        b.style.fontSize = "10px";
        legend.appendChild(b);
    });

    const caret = caretSpan();
    right.appendChild(legend);
    right.appendChild(caret);
    header.appendChild(right);
    return caret;
}

/** 프리셋 결정 로직 (기존 유지) */
function resolveUSPresetFromToolbar() {
    const sel = document.getElementById("timeframe-select");
    const val = sel?.value || "usDualMonthlyDaily";
    if (val === "usSingleMonthly") return "usSingleMonthly";
    if (val === "usSingleDaily") return "usSingleDaily";
    if (val === "usSingle60m") return "usSingle60m";
    if (val === "usSingle30m") return "usSingle30m";
    if (val === "usQuadMonthlyDailyWeekly60m") return "usQuadMonthlyDailyWeekly60m";
    if (val === "usQuadMonthlyDailyWeekly30m") return "usQuadMonthlyDailyWeekly30m";
    if (val === "usDualDaily60m") return "usDualDaily60m";
    return "usDualMonthlyDaily";
}

/** 토스트 */
function toast(msg = "", ms = 1800) {
    const t = document.createElement("div");
    Object.assign(t.style, {
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(20,20,24,0.95)",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: "8px",
        fontSize: "12px",
        zIndex: 99999,
        boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
    });
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
}

/** 마운트 & active 표시 — 배경 유지 */
async function mountForSymbol(sym, ul) {
    const preset = resolveUSPresetFromToolbar();
    try {
        await mountPreset("main-content-area", { preset, symbol: sym });
    } catch (err) {
        console.error(err);
        toast(`데이터를 불러오지 못했습니다: ${sym}`);
        return;
    }
    if (ul) {
        ul.querySelectorAll("li.active").forEach(n => {
            n.classList.remove("active");
            applyActiveVisual(n, false);   // 배경 건드리지 않음
        });
        const target = ul.querySelector(`li[data-symbol="${sym}"]`);
        if (target) {
            target.classList.add("active");
            applyActiveVisual(target, true); // 테두리/굵기만
            target.scrollIntoView({ block: "nearest" });
        }
    }
}

/** (A) ETF — 평탄 섹션 */
function makeETFFlatSection() {
    const section = document.createElement("section");
    styleSectionContainer(section);

    const header = document.createElement("div");
    styleHeader(header);
    header.textContent = "지수 ETF";
    const caret = appendTierLegendToHeader(header, [
        { text: "1x", tier: "1x" },
        { text: "3x", tier: "3x" },
        { text: "-3x", tier: "-3x" },
    ]);

    const ul = document.createElement("ul");
    styleList(ul);
    ul.style.display = "none";

    ETF_LIST.forEach(({ sym, tier }) => {
        const li = document.createElement("li");
        li.dataset.symbol = sym;

        // 의미 색상 고정
        const { bg, fg } = colorForTier(tier);
        styleItemBase(li);
        li.style.background = bg;
        li.style.color = fg;
        li.style.border = "1px solid rgba(255,255,255,0.06)";

        const left = document.createElement("span");
        left.textContent = `${sym} (${NAME[sym] || sym})`;

        const rightWrap = document.createElement("span");
        rightWrap.style.display = "flex";
        rightWrap.style.gap = "6px";
        rightWrap.style.alignItems = "center";

        const tierBadge = makeBadge(tier, fg, bg);
        rightWrap.appendChild(tierBadge);

        const hasData = AVAILABLE_ETF.has(sym);
        if (!hasData) {
            const pending = makeBadge("준비중", "rgba(255,255,255,0.10)", "#ddd");
            rightWrap.appendChild(pending);
            li.style.opacity = "0.55";
            li.style.cursor = "not-allowed";
            li.addEventListener("click", () => toast(`${sym} 데이터 준비중입니다.`));
        } else {
            li.addEventListener("click", () => mountForSymbol(sym, ul));
        }

        li.appendChild(left);
        li.appendChild(rightWrap);
        ul.appendChild(li);
    });

    header.addEventListener("click", () => {
        const open = ul.style.display !== "none";
        ul.style.display = open ? "none" : "";
        caret.style.transform = open ? "rotate(0deg)" : "rotate(90deg)";
    });

    section.appendChild(header);
    section.appendChild(ul);
    return section;
}

/** (B) M7 — 평탄 섹션 */
function makeM7FlatSection() {
    const section = document.createElement("section");
    styleSectionContainer(section);

    const header = document.createElement("div");
    styleHeader(header);
    header.textContent = "빅테크";
    const caret = appendTierLegendToHeader(header, [
        { text: "1x", tier: "1x" },
        { text: "2x", tier: "2x" },
        { text: "-2x", tier: "-2x" },
    ]);

    const ul = document.createElement("ul");
    styleList(ul);
    ul.style.display = "none";

    M7_FLAT.forEach(({ sym, tier }) => {
        const li = document.createElement("li");
        li.dataset.symbol = sym;

        const { bg, fg } = colorForTier(tier);
        styleItemBase(li);
        li.style.background = bg;   // 배경 고정
        li.style.color = fg;
        li.style.border = "1px solid rgba(255,255,255,0.06)";

        const left = document.createElement("span");
        const label = NAME[sym] ? `${sym} (${NAME[sym]})` : sym;
        left.textContent = label;

        const rightWrap = document.createElement("span");
        rightWrap.style.display = "flex";
        rightWrap.style.gap = "6px";
        rightWrap.style.alignItems = "center";

        const tierBadge = makeBadge(tier, fg, bg);
        rightWrap.appendChild(tierBadge);

        const hasData = AVAILABLE_M7.has(sym);
        if (!hasData) {
            const pending = makeBadge("준비중", "rgba(255,255,255,0.10)", "#ddd");
            rightWrap.appendChild(pending);
            li.style.opacity = "0.55";
            li.style.cursor = "not-allowed";
            li.addEventListener("click", () => toast(`${sym} 데이터 준비중입니다.`));
        } else {
            li.addEventListener("click", () => mountForSymbol(sym, ul));
        }

        li.appendChild(left);
        li.appendChild(rightWrap);
        ul.appendChild(li);
    });

    header.addEventListener("click", () => {
        const open = ul.style.display !== "none";
        ul.style.display = open ? "none" : "";
        caret.style.transform = open ? "rotate(0deg)" : "rotate(90deg)";
    });

    section.appendChild(header);
    section.appendChild(ul);
    return section;
}

/** (C) 개별종목 — 심볼 직접 입력 섹션 */
function makeManualSymbolSection() {
    const section = document.createElement("section");
    styleSectionContainer(section);

    const header = document.createElement("div");
    styleHeader(header);
    header.textContent = "개별종목 (심볼 직접 입력)";
    const caret = caretSpan();
    header.appendChild(caret);

    const box = document.createElement("div");
    box.style.display = "none";
    Object.assign(box.style, { padding: "10px 12px" });

    const input = document.createElement("input");
    Object.assign(input, { type: "text", placeholder: "예: NVDA, AAPL, TSLA…" });
    Object.assign(input.style, {
        width: "100%", padding: "8px 10px", borderRadius: "8px",
        border: "1px solid #333", background: "#15161a", color: "#e8e8ea",
        outline: "none",
    });

    const btn = document.createElement("button");
    btn.textContent = "열기";
    Object.assign(btn.style, {
        marginTop: "8px", width: "100%", padding: "8px 10px",
        borderRadius: "8px", border: "1px solid #2a2b31",
        background: "#1f6feb", color: "#fff", cursor: "pointer",
    });

    const run = () => {
        const sym = (input.value || "").trim().toUpperCase();
        if (!sym) return;
        mountForSymbol(sym, null); // 직접 입력은 가용성 체크 없이 시도 → 실패 시 토스트
    };
    btn.addEventListener("click", run);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });

    box.appendChild(input);
    box.appendChild(btn);

    header.addEventListener("click", () => {
        const open = box.style.display !== "none";
        box.style.display = open ? "none" : "block";
        caret.style.transform = open ? "rotate(0deg)" : "rotate(90deg)";
    });

    section.appendChild(header);
    section.appendChild(box);
    return section;
}

/** 외부 진입점 */
export function renderUSSidebar(root) {
    if (!root) return;
    root.innerHTML = "";

    // 최상단 타이틀
    const title = document.createElement("div");
    title.className = "accordion-header";
    title.textContent = "ETF / 빅테크 / 개별종목";
    styleHeader(title, { pad: "14px" });
    Object.assign(title.style, {
        textAlign: "center",
        fontSize: "12px",
        background: "#0aa82cff",
        justifyContent: "center",
    });
    root.appendChild(title);

    // [ETF] 평탄 섹션
    root.appendChild(makeETFFlatSection());

    // [M7] 평탄 섹션
    root.appendChild(makeM7FlatSection());

    // [개별종목] 직접 입력 섹션
    root.appendChild(makeManualSymbolSection());

    // 초기: ETF와 M7 섹션만 펼침
    const headers = root.querySelectorAll("section > div");
    headers.forEach((hdr, idx) => {
        if (idx === 0 || idx === 1) hdr?.click?.();
    });
}
