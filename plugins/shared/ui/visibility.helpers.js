// plugins/shared/ui/visibility.helpers.js
// 탭 전환 시, 좌측 사이드바에서 "소유자 기반"으로 표시/숨김을 확정합니다.
// 필요 시(테마/레이어 문제로 헤더가 뚫고 나올 때) 고정 오버레이 마스크도 사용.

import { tagLeftAccordionOwners, getLeftSidebarRoot } from "./accordion.config.js";

let maskEl = null;

function ensureFixedMask() {
    if (maskEl) return maskEl;
    maskEl = document.createElement("div");
    maskEl.id = "l2fm-left-fixed-mask";
    Object.assign(maskEl.style, {
        position: "fixed",
        left: "0px", top: "0px", width: "0px", height: "0px",
        zIndex: "2147483647", // 최상단
        background: "#111",
        opacity: "1",
        display: "none",
        pointerEvents: "auto",
    });
    document.body.appendChild(maskEl);
    return maskEl;
}
function placeMaskOver(el) {
    const m = ensureFixedMask();
    if (!el) { m.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    m.style.left = `${Math.max(0, r.left)}px`;
    m.style.top = `${Math.max(0, r.top)}px`;
    m.style.width = `${Math.max(0, r.width)}px`;
    m.style.height = `${Math.max(0, r.height)}px`;
    m.style.display = "";
}

export function showSidebarForTab(activeMenu) {
    // 1) Upbit/Binance 섹션에 소유자 태깅(최초 1회 안전)
    const { root } = tagLeftAccordionOwners();

    // 2) body에 현재 탭 기록 → owner-scope CSS가 자동 적용
    document.body.dataset.activeMenu = activeMenu;

    // 3) 추가 보호막:
    // 일부 테마에서 헤더가 별도 레이어로 떠 있을 수 있어, 비-크립토 탭에는
    // 좌측 루트 영역 전체를 "고정 마스크"로 한 번 더 덮어줍니다.
    if (activeMenu === "crypto") {
        if (maskEl) maskEl.style.display = "none";
        return;
    }
    const leftRoot = root || getLeftSidebarRoot();
    if (!leftRoot) return;
    placeMaskOver(leftRoot);

    // 뷰포트 변화에 맞춰 마스크 위치 갱신
    const resync = () => placeMaskOver(leftRoot);
    window.addEventListener("resize", resync, { passive: true });
    window.addEventListener("scroll", resync, { passive: true });
}
