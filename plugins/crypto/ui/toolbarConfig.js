// Listen2FM_Viewer/plugins/crypto/ui/toolbarConfig.js

// ─────────────────────────────────────────────
// 1) 주기/프리셋별 노출 버튼 목록
//    - 프로젝트 전역 규칙: 이 목록에 들어있는 data-action만 보임
// ─────────────────────────────────────────────
export const TOOLBAR_BY_TF = {
    // ── Crypto ──
    daily: ['lifeline', 'trendline', 'ma_oscillator', 'disparity', 'rsi', 'macd', 'fg_index'],
    '2h': ['lifeline', 'trendline', 'ma_oscillator', 'disparity', 'rsi', 'macd'],
    monthly: ['lifeline', 'trendline', 'ma_oscillator', 'rsi', 'macd', 'fg_index', 'disparity'],
    twChart: ['lifeline', 'trendline'],
    TW_Chart: ['lifeline', 'trendline'],
    dualMonthlyDaily: ['lifeline', 'trendline', 'ma_oscillator', 'disparity', 'rsi', 'macd', 'fg_index'],
    dualDay2H: ['lifeline', 'trendline', 'ma_oscillator', 'disparity', 'rsi', 'macd'],

    // 크립토 시황(3×3)
    concernedDaily3x3: ['lifeline', 'trendline', 'initialbars'],

    // ── Economic ──
    // 미국채 10Y (일봉): MA20 각도 버튼 정식 포함
    econUS10YDaily: ['ma20_angle', 'rsi', 'macd', 'ma_oscillator', 'disparity'],

    // Macro Pro View는 툴바 사용 안 함
    econMacroPro: [],
};

// ─────────────────────────────────────────────
// 2) 버튼이 존재하지 않으면 만들어 주는(필요 최소) 보조 생성기
//    - 프로젝트 기초 마크업에 없는 커스텀 버튼을 추가할 때 사용
//    - 여기선 'ma20_angle'만 생성 대상으로 등록
// ─────────────────────────────────────────────
const BUTTON_DEFS = {
    ma20_angle: { label: '20각도', title: 'MA20 기울기 색상 토글' },
};

// 툴바(.main-toolbar)에 필요한 커스텀 버튼이 없으면 생성
export function ensureToolbarButtons(root = document) {
    try {
        const bar = root.querySelector('.main-toolbar');
        if (!bar) return;

        Object.entries(BUTTON_DEFS).forEach(([action, def]) => {
            if (bar.querySelector(`[data-action="${action}"]`)) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-action', action);
            btn.textContent = def.label || action;
            if (def.title) btn.title = def.title;
            // (선택) 최소 여백만 — 프로젝트 CSS가 알아서 스타일링
            btn.style.marginLeft = '6px';
            bar.appendChild(btn);
        });
    } catch (e) {
        console.error('ensureToolbarButtons error:', e);
    }
}

// ─────────────────────────────────────────────
// 3) allowed 목록 외 버튼은 숨김
// ─────────────────────────────────────────────
export function applyToolbarVisibility(allowed = []) {
    try {
        // 커스텀 버튼이 필요하면 먼저 보장
        ensureToolbarButtons();

        const btns = document.querySelectorAll('.main-toolbar [data-action]');
        btns.forEach((btn) => {
            const key = btn.getAttribute('data-action');
            btn.style.display = allowed.includes(key) ? '' : 'none';
        });
    } catch (e) {
        console.error('applyToolbarVisibility error:', e);
    }
}
