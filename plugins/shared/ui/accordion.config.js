// plugins/shared/ui/accordion.config.js
// 좌측 사이드바(아코디언)에서 Upbit/Binance 블록을 찾아 "소유 탭(owner)"으로 태깅합니다.
// 이렇게 태깅해두면, 공용 표시/숨김 헬퍼가 탭에 맞춰 확실하게 가립니다.

const T = sel => Array.from(document.querySelectorAll(sel));
const getText = el => (el?.textContent || "").replace(/\s+/g, " ").trim();

function findLeftRoot() {
    // 좌측 사이드바 컨테이너 후보
    return document.getElementById("left-sidebar")
        || document.querySelector(".left-sidebar")
        || document.querySelector("#sidebar-left, .sidebar-left")
        || document.getElementById("upbit-coin-list")?.closest(".left-sidebar")
        || document.body;
}

function queryHeaderCandidates(scope) {
    // 헤더 텍스트가 select/option/label로만 존재하는 경우까지 포함
    return Array.from(scope.querySelectorAll(
        "button,[role='button'],.accordion-header,.accordion-title,h1,h2,h3,div,li,span,select,option,label"
    ));
}
function findHeaderByText(scope, rx) {
    for (const el of queryHeaderCandidates(scope)) {
        if (rx.test(getText(el))) return el;
    }
    return null;
}
function sectionFromHeader(hdr) {
    if (!hdr) return { header: null, container: null };
    // option이 잡혔다면 select를 헤더로 승격
    if (hdr.tagName === "OPTION") hdr = hdr.closest("select");
    // 아코디언/패널 컨테이너로 상승
    const cont = hdr.closest(".accordion-item,.accordion-section,.panel,.box,.acc-item")
        || hdr.parentElement;
    return { header: hdr, container: cont };
}

/**
 * Upbit/Binance 섹션을 찾아 각각 data-owner-tab="crypto" 로 태깅.
 * (여기서 태깅만 하고, 실제 표시/숨김은 visibility.helpers가 처리)
 */
export function tagLeftAccordionOwners() {
    const root = findLeftRoot();
    if (!root) return { root: null, up: null, bin: null };

    const upHdr = findHeaderByText(root, /업비트|Upbit/i);
    const upSec = sectionFromHeader(upHdr);
    if (upSec.container) upSec.container.dataset.ownerTab = "crypto";
    if (upSec.header) upSec.header.dataset.ownerTab = "crypto";
    // 업비트 본문 추정 UL에도 표시(있다면)
    const upUL = document.getElementById("upbit-coin-list");
    if (upUL) upUL.dataset.ownerTab = "crypto";

    const bnHdr = findHeaderByText(root, /바이낸스|Binance/i);
    const bnSec = sectionFromHeader(bnHdr);
    if (bnSec.container) bnSec.container.dataset.ownerTab = "crypto";
    if (bnSec.header) bnSec.header.dataset.ownerTab = "crypto";

    // 최초 1회 스타일(소유자 기반 숨김)을 주입
    ensureOwnerScopedStyle();

    return { root, up: upSec, bin: bnSec };
}

// 탭 소유 기반 CSS: 비-암호화 탭일 때 crypto 소유 아코디언을 숨김
let __styleInjected = false;
function ensureOwnerScopedStyle() {
    if (__styleInjected) return;
    const css = `
  body:not([data-active-menu="crypto"]) [data-owner-tab="crypto"] { display: none !important; }
  body[data-active-menu="crypto"] [data-owner-tab="crypto"] { display: initial !important; }
  `;
    const st = document.createElement("style");
    st.id = "l2fm-owner-scope-style";
    st.textContent = css;
    document.head.appendChild(st);
    __styleInjected = true;
}

// 외부에서 좌측 루트 필요할 때 사용
export function getLeftSidebarRoot() {
    return findLeftRoot();
}
