// Listen2FM_Viewer/plugins/crypto/sync/timeScaleLinker.js
// 논리 범위만 동기화 (타임 범위/중복 구독 제거)

export function linkTimeScales(...charts) {
    const timeScales = charts.map(c => c.timeScale());
    let syncing = false;

    const apply = (srcIdx, logicalRange) => {
        if (!logicalRange || syncing) return;
        syncing = true;
        try {
            timeScales.forEach((ts, i) => {
                if (i === srcIdx) return;
                try { ts.setVisibleLogicalRange(logicalRange); } catch { }
            });
        } finally { syncing = false; }
    };

    const unsubs = timeScales.map((ts, idx) => {
        const onLogical = r => apply(idx, r);
        ts.subscribeVisibleLogicalRangeChange(onLogical);
        return () => { try { ts.unsubscribeVisibleLogicalRangeChange(onLogical); } catch { } };
    });

    // 초기: 첫 차트 범위를 복사
    try {
        const r = timeScales[0].getVisibleLogicalRange?.();
        if (r) apply(0, r);
    } catch { }

    return { dispose: () => unsubs.forEach(u => { try { u(); } catch { } }) };
}
