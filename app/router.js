// Listen2FM_Viewer/app/router.js

// ── Crypto ─────────────────
import { mountSingleDaily, dispose as disposeSingleDaily } from "../plugins/crypto/preset/singleDaily.js";
import { mountSingle2H, dispose as disposeSingle2H } from "../plugins/crypto/preset/single2H.js";
import { mountSingleMonthly, dispose as disposeSingleMonthly } from "../plugins/crypto/preset/singleMonthly.js";
import { mountTWChart, dispose as disposeTW } from "../plugins/crypto/preset/twChart.js";
import { mountDualMonthlyDaily, dispose as disposeDualMonthlyDaily } from "../plugins/crypto/preset/dualMonthlyDaily.js";
import { mountDualDay2H, dispose as disposeDualDay2H } from "../plugins/crypto/preset/dualDay2H.js";

// ── US Stocks ──────────────
import { mountUSSingleDaily, dispose as disposeUSSingleDaily } from "../plugins/usStocks/preset/singleDaily.js";
import { mountUSSingleMonthly, dispose as disposeUSSingleMonthly } from "../plugins/usStocks/preset/singleMonthly.js";
import { mountUSDualMonthlyDaily, dispose as disposeUSDualMonthlyDaily } from "../plugins/usStocks/preset/dualMonthlyDaily.js";

// 동적 로더: KR / US 공용
let currentPresetDisposeFn = null;

/* ────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────── */
function renderNotFound(container, key) {
    container.innerHTML = `
    <div style="padding:18px;color:#bbb;font:600 20px/1.6 system-ui;
                border:1px solid #2a2b31;border-radius:10px;background:#121318">
      <div style="font-size:22px;margin-bottom:6px">프리셋을 찾을 수 없습니다.</div>
      <div style="opacity:.9">요청한 프리셋 키: <code style="color:#5ee0ff">${key}</code></div>
      <div style="margin-top:8px;font-weight:500;opacity:.8">메뉴에서 다른 프리셋을 선택해 주세요.</div>
    </div>`;
}

/** 모듈 내 마운트 함수를 유연하게 탐색 */
function resolveMount(mod, candidates = []) {
    if (!mod) return null;
    const keys = ["default", "mount", ...candidates];
    for (const k of keys) {
        const fn = k === "default" ? mod?.default : mod?.[k];
        if (typeof fn === "function") return fn;
    }
    return null;
}

async function disposeCurrent() {
    if (currentPresetDisposeFn) {
        try { await currentPresetDisposeFn(); } catch { /* noop */ }
        currentPresetDisposeFn = null;
    }
}

/** symbol 옵션이 문자열/객체/Promise 무엇이 와도 안전하게 꺼내기 */
async function resolveSymbolOption(raw, fallback = "삼성전자") {
    try {
        const v = await Promise.resolve(raw); // Promise 방어
        if (v == null) return fallback;
        if (typeof v === "string" || typeof v === "number") return String(v); // 문자열 / 숫자
        if (typeof v === "object") return v; // 프리셋이 객체도 받도록 허용
        return fallback;
    } catch {
        return fallback;
    }
}

/** KR 프리셋 공용 로더 (동적 import) */
async function mountKRDynamic(containerId, key, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const mod = await import(`../plugins/krStocks/preset/${key}.js?v=${Date.now()}`);
        const mount = mod?.default || mod?.mount || mod?.[`mount${key}`];
        if (typeof mount !== "function") throw new Error(`No mount function in ${key}`);

        const safeSymbol = await resolveSymbolOption(options.symbol, "삼성전자");

        currentPresetDisposeFn = await mount({
            mainRoot: container,
            mountId: containerId,
            symbol: safeSymbol,
            ...options,
        });
    } catch (e) {
        console.warn(`[router] KR preset load failed: ${key}`, e);
        renderNotFound(container, key);
        currentPresetDisposeFn = null;
    }
}

/** US 프리셋 공용 로더 (동적 import) */
async function mountUSDynamic(containerId, key, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const mod = await import(`../plugins/usStocks/preset/${key}.js?v=${Date.now()}`);
        const mount =
            mod?.default ||
            mod?.mount ||
            mod?.[`mount${key}`] ||
            mod?.[`mountUS${key.charAt(0).toUpperCase() + key.slice(1)}`];

        if (typeof mount !== "function") throw new Error(`No mount function in ${key}`);

        const safeSymbol = await resolveSymbolOption(options.symbol, "SPY");

        currentPresetDisposeFn = await mount({
            mainRoot: container,
            mountId: containerId,
            symbol: safeSymbol,
            ...options,
        });
    } catch (e) {
        console.warn(`[router] US preset load failed: ${key}`, e);
        renderNotFound(container, key);
        currentPresetDisposeFn = null;
    }
}

/* ────────────────────────────────────────────────────────────────
 * Main
 * ──────────────────────────────────────────────────────────────── */
export async function mountPreset(containerId, options = {}) {
    await disposeCurrent();

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID '${containerId}' not found.`);
        return;
    }

    switch (options.preset) {
        // ── 금융시황 (동적 import) ────────────────────────────────
        case "fmMulti3x3": {
            const mod = await import(`../plugins/fm_market/preset/multi3x3_v2.js?v=${Date.now()}`);
            currentPresetDisposeFn = await mod.mountMulti3x3({
                mainRoot: container,
                mountId: containerId,
                ...options
            });
            break;
        }
        case "fmDaily3x3": {
            const mod = await import(`../plugins/fm_market/preset/financialMarket_Daily3x3.js?v=${Date.now()}`);
            const mount = resolveMount(mod, ["mountFinancialDaily3x3", "mountConcernedDaily3x3"]);
            if (!mount) {
                console.warn("[router] fmDaily3x3: mount fn not found in financialMarket_Daily3x3.js");
                renderNotFound(container, "fmDaily3x3");
                currentPresetDisposeFn = null;
                break;
            }
            currentPresetDisposeFn = await mount({
                mainRoot: container,
                mountId: containerId,
                ...options
            });
            break;
        }
        case "fmDashboard": {
            try {
                const mod = await import(`../plugins/fm_market/preset/fmDashboard.js?v=${Date.now()}`);
                const mount = resolveMount(mod, ["mountFmDashboard"]);
                if (!mount) {
                    console.warn("[router] fmDashboard: mount fn not found in fmDashboard.js");
                    renderNotFound(container, "fmDashboard");
                    currentPresetDisposeFn = null;
                    break;
                }
                currentPresetDisposeFn = await mount({
                    mainRoot: container,
                    mountId: containerId,
                    ...options
                });
            } catch (e) {
                console.warn("[router] fmDashboard load failed", e);
                renderNotFound(container, "fmDashboard");
                currentPresetDisposeFn = null;
            }
            break;
        }

        // ── Crypto ────────────────────────────────────────────────
        case "singleDaily":
            currentPresetDisposeFn = await mountSingleDaily({ mainRoot: container, mountId: containerId, ...options });
            break;
        case "single2H":
            currentPresetDisposeFn = await mountSingle2H({ mainRoot: container, mountId: containerId, ...options });
            break;
        case "singleMonthly":
            currentPresetDisposeFn = await mountSingleMonthly({ mainRoot: container, mountId: containerId, ...options });
            break;
        case "twChart":
            currentPresetDisposeFn = await mountTWChart({ mainRoot: container, mountId: containerId, ...options });
            break;
        case "dualMonthlyDaily":
            currentPresetDisposeFn = await mountDualMonthlyDaily({ mainRoot: container, mountId: containerId, ...options });
            break;
        case "dualDay2H":
            currentPresetDisposeFn = await mountDualDay2H({ mainRoot: container, mountId: containerId, ...options });
            break;
        case "concernedDaily3x3": {
            const mod = await import(`../plugins/crypto/preset/concernedDaily3x3.js?v=${Date.now()}`);
            currentPresetDisposeFn = await mod.mountConcernedDaily3x3({
                mainRoot: container,
                mountId: containerId,
                ...options
            });
            break;
        }
        // ✅ 신규: 암호화폐 대시보드 3×3 (5D/20D/60D Price Performance)
        case "cryptoDashboard": {
            try {
                const mod = await import(`../plugins/crypto/preset/cryptoDashboard.js?v=${Date.now()}`);
                const mount = resolveMount(mod, ["mountCryptoPerformanceDaily3x3", "mount"]);
                if (!mount) {
                    console.warn("[router] cryptoDashboard: mount fn not found in cryptoDashboard.js");
                    renderNotFound(container, "cryptoDashboard");
                    currentPresetDisposeFn = null;
                    break;
                }
                currentPresetDisposeFn = await mount({
                    mainRoot: container,
                    mountId: containerId,
                    ...options
                });
            } catch (e) {
                console.warn("[router] cryptoDashboard load failed", e);
                renderNotFound(container, "cryptoDashboard");
                currentPresetDisposeFn = null;
            }
            break;
        }

        // ── US Stocks ────────────────────────────────────────────
        case "usSingleDaily":
            currentPresetDisposeFn = await mountUSSingleDaily({ mainRoot: container, mountId: containerId, ...options });
            break;
        case "usSingleMonthly":
            currentPresetDisposeFn = await mountUSSingleMonthly({ mainRoot: container, mountId: containerId, ...options });
            break;
        case "usDualMonthlyDaily":
            currentPresetDisposeFn = await mountUSDualMonthlyDaily({ mainRoot: container, mountId: containerId, ...options });
            break;

        case "usSingle30m": {
            await mountUSDynamic(containerId, "usSingle30m", options);
            break;
        }
        case "usSingle60m": {
            await mountUSDynamic(containerId, "usSingle60m", options);
            break;
        }
        case "usSingleWeekly": {
            await mountUSDynamic(containerId, "usSingleWeekly", options);
            break;
        }
        case "usDualDaily60m": {
            await mountUSDynamic(containerId, "usDualDaily60m", options);
            break;
        }
        case "usQuadMonthlyDailyWeekly60m": {
            await mountUSDynamic(containerId, "usQuadMonthlyDailyWeekly60m", options);
            break;
        }
        case "usQuadMonthlyDailyWeekly30m": {
            await mountUSDynamic(containerId, "usQuadMonthlyDailyWeekly30m", options);
            break;
        }

        // ── Economic (Macro) ─────────────────────────────────────
        case "econSingleViewer": {
            const mod = await import(`../plugins/economic/preset/singleViewer.js?v=${Date.now()}`);
            const mount = resolveMount(mod, [
                "mountEconSingleViewer",
                "mountSingleViewer",
                "mountEconViewer"
            ]);
            if (!mount) {
                console.warn("[router] econSingleViewer: mount fn not found in singleViewer.js");
                renderNotFound(container, "econSingleViewer");
                currentPresetDisposeFn = null;
                break;
            }
            currentPresetDisposeFn = await mount({ mainRoot: container, mountId: containerId, ...options });
            break;
        }

        case "econMacroPro": {
            const mod = await import(`../plugins/economic/preset/macroProView.js?v=${Date.now()}`);
            const mount = resolveMount(mod, [
                "mountEconMacroPro",
                "mountMacroProView",
                "mountMacroPro",
                "mountEconDashboard"
            ]);
            if (!mount) {
                console.warn("[router] econMacroPro: mount fn not found in macroProView.js");
                renderNotFound(container, "econMacroPro");
                currentPresetDisposeFn = null;
                break;
            }
            currentPresetDisposeFn = await mount({ mainRoot: container, mountId: containerId, ...options });
            break;
        }

        case "econUS10YDaily": {
            const mod = await import(`../plugins/economic/preset/singleDaily.js?v=${Date.now()}`);
            const mount = resolveMount(mod, [
                "mountEconUS10YDaily",
                "mountUS10YDaily",
                "mountEconSingleDaily"
            ]);
            if (!mount) {
                console.warn("[router] econUS10YDaily: mount fn not found in singleDaily.js");
                renderNotFound(container, "econUS10YDaily");
                currentPresetDisposeFn = null;
                break;
            }
            currentPresetDisposeFn = await mount({ mainRoot: container, mountId: containerId, ...options });
            break;
        }

        // ── KR Stocks ────────────────────────────────────────────
        case "krSingleDaily": {
            const mod = await import(`../plugins/krStocks/preset/krSingleDaily.js?v=${Date.now()}`);
            const mount = mod?.default || mod?.mount || mod?.mountkrSingleDaily;
            if (typeof mount !== "function") {
                renderNotFound(container, "krSingleDaily");
                currentPresetDisposeFn = null;
                break;
            }
            const safeSymbol = await resolveSymbolOption(options.symbol, "삼성전자");
            currentPresetDisposeFn = await mount({
                mainRoot: container,
                mountId: containerId,
                symbol: safeSymbol,
                ...options,
            });
            break;
        }

        case "krDualMonthlyDaily": {
            const mod = await import(`../plugins/krStocks/preset/krDualMonthlyDaily.js?v=${Date.now()}`);
            const mount = mod?.default || mod?.mount || mod?.mountkrDualMonthlyDaily;
            if (typeof mount !== "function") {
                renderNotFound(container, "krDualMonthlyDaily");
                currentPresetDisposeFn = null;
                break;
            }
            const safeSymbol = await resolveSymbolOption(options.symbol, "삼성전자");
            currentPresetDisposeFn = await mount({
                mainRoot: container,
                mountId: containerId,
                symbol: safeSymbol,
                ...options,
            });
            break;
        }

        case "krSingleMonthly":
        case "krSingleWeekly":
        case "krSingle30m":
        case "krDualDaily30m":
        case "krDual30m5m":
        case "krTriple_MonthlyDaily30m":
        case "krQuadruple_MonthlyDailyWeekly30m":
        case "krQuadMonthlyDailyWeekly30m":
        case "krMarket_Kospi_Daily30m":
        case "krMarket_Kosdaq_Daily30m": {
            await mountKRDynamic(containerId, options.preset, options);
            break;
        }

        default:
            renderNotFound(container, String(options.preset || ""));
            currentPresetDisposeFn = null;
    }
}
