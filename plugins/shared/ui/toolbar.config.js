// plugins/shared/ui/toolbar.config.js
// Listen2FM_Viewer - Shared Toolbar Config

export const TOOLBAR_BUTTONS = {
    lifeline: { id: "lifeline", label: "생명선" },
    trendline: { id: "trendline", label: "추세선" },
    ma_oscillator: { id: "ma_oscillator", label: "MA Osc" },
    disparity: { id: "disparity", label: "이격도" },
    rsi: { id: "rsi", label: "RSI" },
    macd: { id: "macd", label: "MACD" },
    fg_index: { id: "fg_index", label: "FG" },
    initialbars: { id: "initialbars", label: "초기캔들" },
    ma20_angle: { id: "ma20_angle", label: "MA20 각도" }, // Economic 전용

    // ★ 대시보드 전용 버튼
    db_5d: { id: "db_5d", label: "D5" },
    db_20d: { id: "db_20d", label: "D20" },
    db_60d: { id: "db_60d", label: "D60" },
};

// 프리셋 키 정규화용 별칭
const ALIAS_MAP = {
    // crypto
    twChart: "TW_Chart",
    Tw_Chart: "TW_Chart",
    concerned_daily_3x3: "concernedDaily3x3",
    DualMonthlyDaily: "dualMonthlyDaily",
    dualDay2h: "dualDay2H",

    // us/kr 축약
    usdaily: "usSingleDaily",
    usweekly: "usSingleWeekly",
    usmonthly: "usSingleMonthly",
    us60m: "usSingle60m",
    us30m: "usSingle30m",
    usdualdaily60m: "usDualDaily60m",
    usdualmonthlydaily: "usDualMonthlyDaily",
    usquadmonthlydailyweekly60m: "usQuadMonthlyDailyWeekly60m",
    usquadmonthlydailyweekly30m: "usQuadMonthlyDailyWeekly30m",

    krdaily: "krSingleDaily",
    krweekly: "krSingleWeekly",
    krmonthly: "krSingleMonthly",
    kr30m: "krSingle30m",
    krdualmonthlydaily: "krDualMonthlyDaily",
    krdualdaily30m: "krDualDaily30m",
    krdual30m5m: "krDual30m5m",

    // 금융시황 별칭
    financialMarket_Daily3x3: "fmDaily3x3",
    financialmarket_daily3x3: "fmDaily3x3",
    FMDashboard: "fmDashboard",
    fm_dashboard: "fmDashboard",
    financialMarket_Dashboard: "fmDashboard",
};

export function resolveToolbarKey(raw) {
    if (!raw) return null;
    const key = String(raw);
    return ALIAS_MAP[key] || key;
}

/** 프리셋별 허용 버튼 목록 (Single Source of Truth) */
export const TOOLBAR_ALLOWLIST = {
    // --- Crypto ---
    daily: ["lifeline", "trendline", "ma_oscillator", "disparity", "rsi", "macd", "fg_index"],
    "2h": ["lifeline", "trendline", "ma_oscillator", "disparity", "rsi", "macd"],
    monthly: ["lifeline", "trendline", "ma_oscillator", "rsi", "macd", "fg_index", "disparity"],
    TW_Chart: ["lifeline", "trendline"],
    dualMonthlyDaily: ["lifeline", "trendline", "ma_oscillator", "disparity", "rsi", "macd", "fg_index"],
    dualDay2H: ["lifeline", "trendline", "ma_oscillator", "disparity", "rsi", "macd"],
    concernedDaily3x3: ["lifeline", "trendline", "initialbars"],

    // --- 금융시황 ---
    fmDaily3x3: ["lifeline", "trendline", "initialbars"],
    fmMulti3x3: ["lifeline", "trendline", "initialbars"],
    fmDashboard: ["db_5d", "db_20d", "db_60d"], // ★ 대시보드 기간 버튼만

    // --- Economic ---
    econMacroPro: [],
    econUS10YDaily: ["ma20_angle", "rsi", "macd", "ma_oscillator", "disparity"],

    // --- US ---
    usSingleDaily: ["lifeline", "trendline", "rsi", "macd", "ma_oscillator", "disparity"],
    usSingleWeekly: ["lifeline", "trendline", "rsi", "macd", "ma_oscillator", "disparity"],
    usSingleMonthly: ["lifeline", "trendline", "rsi", "macd", "ma_oscillator", "disparity"],
    usSingle60m: ["lifeline", "trendline", "rsi", "macd", "ma_oscillator", "disparity"],
    usSingle30m: ["lifeline", "trendline", "rsi", "macd", "ma_oscillator", "disparity"],
    usDualMonthlyDaily: ["lifeline", "trendline", "rsi", "macd", "ma_oscillator", "disparity"],
    usDualDaily60m: ["lifeline", "trendline", "rsi", "macd", "ma_oscillator", "disparity"],
    usQuadMonthlyDailyWeekly60m: [],
    usQuadMonthlyDailyWeekly30m: [],

    // --- KR ---
    krSingleDaily: ["lifeline", "trendline", "rsi", "macd", "ma_oscillator", "disparity", "initialbars"],
    krSingleWeekly: ["lifeline", "trendline", "rsi", "macd", "ma_oscillator", "disparity", "initialbars"],
    krSingleMonthly: ["lifeline", "trendline", "rsi", "macd", "ma_oscillator", "disparity", "initialbars"],
    krSingle30m: ["lifeline", "trendline", "rsi", "macd", "ma_oscillator", "disparity", "initialbars"],
    krDualMonthlyDaily: ["lifeline", "trendline", "rsi", "macd", "ma_oscillator", "disparity"],
    krDualDaily30m: ["lifeline", "trendline", "ma_oscillator", "disparity", "rsi", "macd"],
    krDual30m5m: ["lifeline", "trendline", "ma_oscillator", "disparity", "rsi", "macd"],
    krTriple_MonthlyDaily30m: [],
    krQuadMonthlyDailyWeekly30m: [],
    krMarket_Kospi_Daily30m: [],
    krMarket_Kosdaq_Daily30m: [],
};

// 중복 경고 억제
const WARNED = new Set();

export function getToolbarAllowlist(rawKey) {
    const key = resolveToolbarKey(rawKey);
    if (!key) return [];
    const allowed = TOOLBAR_ALLOWLIST[key];
    if (!allowed) {
        if (!WARNED.has(key)) {
            console.warn("[toolbar] Unknown key:", key, "(raw:", rawKey, ") — empty allowlist.");
            WARNED.add(key);
        }
        return [];
    }
    return allowed;
}

export function listCanonicalToolbarKeys() {
    return Object.keys(TOOLBAR_ALLOWLIST);
}
