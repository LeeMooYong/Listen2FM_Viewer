// Listen2FM_Viewer/plugins/krStocks/krController.js
// KR 주식 탭 전용 컨트롤러: 프리셋/심볼 상태관리 + 안전한 마운트/언마운트 + 경합/역주행 방지(강화)

import { loadKRCatalog } from "./data/catalog.js";

// ────────────────────────────────────────────────────────────────
// 0) 프리셋 레지스트리(키 → 동적 import 경로)
const PRESET_REGISTRY = {
    krQuadMonthlyDailyWeekly30m: () =>
        import(`./preset/krQuadMonthlyDailyWeekly30m.js?v=${Date.now()}`),
    krSingleMonthly: () =>
        import(`./preset/krSingleMonthly.js?v=${Date.now()}`),
    krSingleDaily: () =>
        import(`./preset/krSingleDaily.js?v=${Date.now()}`),
    krSingleWeekly: () =>
        import(`./preset/krSingleWeekly.js?v=${Date.now()}`),
    krDualMonthlyDaily: () =>
        import(`./preset/krDualMonthlyDaily.js?v=${Date.now()}`),
    krDualDaily30m: () =>
        import(`./preset/krDualDaily30m.js?v=${Date.now()}`),
    krDual30m5m: () =>
        import(`./preset/krDual30m5m.js?v=${Date.now()}`),
    krTriple_MonthlyDaily30m: () =>
        import(`./preset/krTriple_MonthlyDaily30m.js?v=${Date.now()}`),
    krTriple_Daily30m5m: () =>
        import(`./preset/krTriple_Daily30m5m.js?v=${Date.now()}`),
};

// ────────────────────────────────────────────────────────────────
// 1) 상태 저장소 (localStorage + 메모리)
const LS_KEY = "krStocks:lastState";
const DEFAULT_PRESET = "krQuadMonthlyDailyWeekly30m";

function readLS() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
    catch { return {}; }
}
function writeLS(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj || {})); }
    catch { }
}

const state = {
    presetKey: DEFAULT_PRESET,
    symbol: null,
    market: "kospi",

    _disposer: null,
    _loadTicket: 0,

    // 부트 보호
    _userChangedPreset: false,
    _reassertTimers: [],
    _guardInterval: null,

    // presetKey는 복원하지 않음(항상 기본으로 시작)
    loadFromLS() {
        const s = readLS();
        if (s.symbol) this.symbol = s.symbol;
        if (s.market) this.market = s.market;
    },
    saveToLS() {
        writeLS({ symbol: this.symbol, market: this.market });
    },
    setPreset(key) {
        if (PRESET_REGISTRY[key]) this.presetKey = key;
    },
    setSymbol({ code, market }) {
        if (code) this.symbol = code;
        if (market) this.market = market;
        this.saveToLS();
    },
    setDisposer(d) {
        try { this._disposer?.(); } catch { }
        this._disposer = (typeof d === "function") ? d : null;
    },
    nextTicket() { this._loadTicket += 1; return this._loadTicket; },
    isTicketAlive(ticket) { return ticket === this._loadTicket; },

    _clearReassertTimers() {
        this._reassertTimers.forEach(id => { try { clearTimeout(id); } catch { } });
        this._reassertTimers = [];
    },
    _stopGuard() {
        if (this._guardInterval) { try { clearInterval(this._guardInterval); } catch { } }
        this._guardInterval = null;
    }
};

// ────────────────────────────────────────────────────────────────
// 2) 기본 심볼 결정
async function resolveDefaultSymbol() {
    const catalog = await loadKRCatalog("/data/krStocks/catalog.kr.json");
    if (state.symbol) return state.symbol;
    const top = catalog?.markets?.kospi?.top?.items;
    if (Array.isArray(top) && top.length) return top[0];
    const keys = Object.keys(catalog.lookup || {});
    return keys[0] || "005930";
}

// ────────────────────────────────────────────────────────────────
// 3) 코드/표시명 정규화
let _catalogCache = null;
async function getCatalog() {
    if (_catalogCache) return _catalogCache;
    _catalogCache = await loadKRCatalog("/data/krStocks/catalog.kr.json");
    return _catalogCache;
}
async function normalizeSymbolToDisplayName(maybeCodeOrName) {
    if (!maybeCodeOrName || typeof maybeCodeOrName !== "string") return "삼성전자";
    const isCode = /^[0-9]{6}$/.test(maybeCodeOrName);
    if (!isCode) return maybeCodeOrName.trim();
    try {
        const catalog = await getCatalog();
        const meta = catalog.lookup?.[maybeCodeOrName];
        return (meta?.display || meta?.folder || maybeCodeOrName).trim();
    } catch {
        return maybeCodeOrName;
    }
}

// ────────────────────────────────────────────────────────────────
function renderLoading(mainRoot, presetKey, symbol) {
    mainRoot.innerHTML = `
  <div style="padding:16px;color:#9aa">
    Loading <b>${presetKey}</b> • <b>${symbol}</b> ...
  </div>`;
}
function renderError(mainRoot, title, err) {
    mainRoot.innerHTML = `
  <div style="padding:16px;color:#f77">
    ${title}<br/>
    <small>${String(err?.message || err)}</small>
  </div>`;
}

// ────────────────────────────────────────────────────────────────
// 4) 안전한 프리셋 로더(경합 방지)
async function mountPreset({ mainRoot, presetKey, symbolDisplay }) {
    const ticket = state.nextTicket();

    renderLoading(mainRoot, presetKey, symbolDisplay);
    state.setDisposer(null);

    const factory = PRESET_REGISTRY[presetKey];
    if (!factory) {
        renderError(mainRoot, `프리셋을 찾을 수 없습니다: <b>${presetKey}</b>`, null);
        return;
    }

    let mod;
    try {
        mod = await factory();
    } catch (e) {
        if (!state.isTicketAlive(ticket)) return;
        renderError(mainRoot, `프리셋 로드 실패: <b>${presetKey}</b>`, e);
        return;
    }
    if (!state.isTicketAlive(ticket)) return;

    try {
        const mount =
            mod?.default ||
            mod?.mount ||
            mod?.[`mount${presetKey}`] ||
            mod?.mountSingleMonthly;

        if (typeof mount !== "function") throw new Error("mount 함수 export를 찾을 수 없습니다.");

        const disposer = await mount({ mainRoot, symbol: symbolDisplay });

        if (!state.isTicketAlive(ticket)) {
            try { disposer?.(); } catch { }
            return;
        }
        state.setDisposer(disposer);
    } catch (e) {
        renderError(mainRoot, `프리셋 실행 실패: <b>${presetKey}</b>`, e);
    }
}

// ────────────────────────────────────────────────────────────────
// 5) 외부에서 사용하는 API

/** KR 탭이 처음 열릴 때 무조건 한 번 호출 */
export async function initKRTab({ mainRoot }) {
    // 부트 보호 초기화
    state._clearReassertTimers();
    state._stopGuard();
    state._userChangedPreset = false;

    state.loadFromLS();
    if (!state.symbol) state.symbol = await resolveDefaultSymbol();

    // 항상 기본 프리셋으로 시작
    state.presetKey = DEFAULT_PRESET;
    state.saveToLS();

    const display = await normalizeSymbolToDisplayName(state.symbol);

    // ① 즉시 마운트
    await mountPreset({
        mainRoot,
        presetKey: DEFAULT_PRESET,
        symbolDisplay: display,
    });

    // ② 아주 짧은 지연으로 2회 재확인(툴바 초기 change 등)
    const scheduleReassert = (delayMs) => {
        const id = setTimeout(async () => {
            if (state._userChangedPreset) return;
            state.presetKey = DEFAULT_PRESET;
            const disp = await normalizeSymbolToDisplayName(state.symbol);
            await mountPreset({ mainRoot, presetKey: DEFAULT_PRESET, symbolDisplay: disp });
        }, delayMs);
        state._reassertTimers.push(id);
    };
    scheduleReassert(60);
    scheduleReassert(180);

    // ③ 2초간 감시 가드: 외부에서 월봉 싱글로 덮어쓸 경우 즉시 복구
    //    (krSingleMonthly는 #l2fm-kr-singleMonthly 컨테이너를 갖습니다)
    try {
        let elapsed = 0;
        state._guardInterval = setInterval(async () => {
            if (state._userChangedPreset) { state._stopGuard(); return; }
            elapsed += 100;
            const monthlyNode = mainRoot.querySelector?.("#l2fm-kr-singleMonthly");
            if (monthlyNode) {
                state.presetKey = DEFAULT_PRESET;
                const disp = await normalizeSymbolToDisplayName(state.symbol);
                await mountPreset({ mainRoot, presetKey: DEFAULT_PRESET, symbolDisplay: disp });
            }
            if (elapsed >= 2000) state._stopGuard(); // 2초 후 종료
        }, 100);
    } catch { }
}

/** 프리셋 변경(툴바/드롭다운) — 심볼은 유지 */
export async function selectPreset({ mainRoot, presetKey }) {
    // 사용자의 명시적 변경 → 모든 부트 보호 해제
    state._userChangedPreset = true;
    state._clearReassertTimers();
    state._stopGuard();

    state.setPreset(presetKey);
    const display = await normalizeSymbolToDisplayName(state.symbol);
    await mountPreset({
        mainRoot,
        presetKey: state.presetKey,
        symbolDisplay: display,
    });
}

/** 심볼 변경(사이드바) — 프리셋은 유지 */
export async function selectSymbol({ mainRoot, code, market }) {
    state.setSymbol({ code, market });
    const display = await normalizeSymbolToDisplayName(state.symbol);
    await mountPreset({
        mainRoot,
        presetKey: state.presetKey,
        symbolDisplay: display,
    });
}

/** KR 탭 떠날 때 정리 */
export function disposeKRTab() {
    try { state._disposer?.(); } catch { }
    state._disposer = null;
    state._clearReassertTimers();
    state._stopGuard();
    state._userChangedPreset = false;
}

// (디버깅용)
export function getKRState() {
    return {
        presetKey: state.presetKey,
        symbol: state.symbol,
        market: state.market,
        _loadTicket: state._loadTicket,
        userChangedPreset: state._userChangedPreset,
    };
}
