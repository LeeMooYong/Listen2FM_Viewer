// plugins/shared/ui/accordion.header.patch.js
// 목적: 좌측 사이드바의 "고정 Upbit 헤더"를 항상 현재 탭에 맞는 제목으로 바꾼다.
// - 탭 전환 시 main.js가 l2fm:tabchange 이벤트를 쏨
// - 본 모듈은 그 이벤트를 듣고, DOM 어디서 다시 생겨도 MutationObserver로 즉시 교체

let currentMenu = "home";
let obs = null;

function getLeftRoot() {
    return document.getElementById("left-sidebar")
        || document.querySelector(".left-sidebar")
        || document.querySelector("#sidebar-left, .sidebar-left")
        || document;
}

function isLikelyUpbitHeader(el) {
    if (!el || el.nodeType !== 1) return false;
    // 1) data-accordion="upbit"
    if (el.getAttribute("data-accordion") === "upbit") return true;
    // 2) class/id에 upbit 단어
    const id = (el.id || "").toLowerCase();
    const cl = (el.className || "").toString().toLowerCase();
    if (id.includes("upbit") || cl.includes("upbit")) return true;
    // 3) 텍스트에 '업비트' 또는 'Upbit'
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (/(업비트|upbit)\b/i.test(t)) return true;
    return false;
}

function findHeaderCandidate() {
    const root = getLeftRoot();
    if (!root) return null;

    // 가장 신뢰도 높은 순서대로 탐색
    // A) data-accordion="upbit"
    let el = root.querySelector('.accordion-header[data-accordion="upbit"], [data-accordion="upbit"]');
    if (el) return el;

    // B) upbit-coin-list 바로 위 형제
    const ul = document.getElementById("upbit-coin-list");
    if (ul) {
        let p = ul.previousSibling;
        while (p && p.nodeType !== 1) p = p.previousSibling;
        if (p && isLikelyUpbitHeader(p)) return p;
    }

    // C) 좌측 영역의 .accordion-header 중 텍스트/클래스로 업비트 판정
    const accs = root.querySelectorAll(".accordion-header, .accordion .header, .acc-header, [role='heading']");
    for (const n of accs) {
        if (isLikelyUpbitHeader(n)) return n;
    }

    // D) 마지막 보루: 좌측 영역의 제목 후보들에서 업비트 징후
    const candidates = root.querySelectorAll("h1,h2,h3,div,span,button,li,label,dt,dd,summary");
    for (const n of candidates) {
        if (isLikelyUpbitHeader(n)) return n;
    }
    return null;
}

function titleForMenu(menu) {
    switch ((menu || "").toLowerCase()) {
        case "crypto": return "업비트 (Upbit)";
        case "macro": return "주요 경제지표";
        case "us": return "US주식";
        case "kr": return "KR주식";
        default: return "사이드바";
    }
}

function setHeaderText(el, text) {
    if (!el) return;
    // 내부에 span이 있으면 span 사용, 없으면 자신에 텍스트
    const span = el.querySelector("span");
    if (span) span.textContent = text;
    else el.textContent = text;

    // 내가 바꿨다는 표시(다른 코드가 되돌리지 않도록)
    el.setAttribute("data-l2fm-retitled", "1");
    el.classList.add("accordion-header"); // 스타일 일관
}

function retitle(forceMenu) {
    const menu = (forceMenu || currentMenu || "home");
    const hdr = findHeaderCandidate();
    if (!hdr) return false;
    setHeaderText(hdr, titleForMenu(menu));
    return true;
}

// 외부에서 즉시 호출(탭 렌더 직후 한 번 더)
export function retitleAccordionNow(menu) {
    currentMenu = menu || currentMenu || "home";
    retitle(currentMenu);
}

// 초기화: 이벤트/감시자
export function initAccordionHeaderRetitle() {
    // 1) 탭 전환 이벤트 구독
    try {
        window.addEventListener("l2fm:tabchange", (e) => {
            currentMenu = e?.detail?.menu || currentMenu || "home";
            // 탭이 바뀌면 즉시 교체
            retitle(currentMenu);
        });
    } catch { }

    // 2) DOM 변경 감시(다른 코드가 헤더를 다시 그려도 곧장 교체)
    if (!obs) {
        obs = new MutationObserver(() => {
            retitle(currentMenu);
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    // 3) 최초 한 번 시도
    retitle(currentMenu);
}
