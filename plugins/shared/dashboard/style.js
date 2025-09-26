// plugins/shared/dashboard/style.js
// 공통 스타일(카드/스파크라인/펄스/날짜라벨/툴팁/버튼)

const CSS = `
.l2fm-db-root{ display:flex; flex-direction:column; height:100%; min-height:300px; }
.l2fm-db-grid{
  display:grid; gap:12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  grid-auto-rows: 1fr; width:100%; height:100%;
  align-content:stretch; align-items:stretch;
}
.l2fm-db-card{
  background: var(--panel, #121417);
  border:1px solid var(--border,#2a2b31);
  border-radius:12px; padding:12px;
  display:flex; flex-direction:column;
  height:100%; min-height:120px;
}
.l2fm-db-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.l2fm-db-title{ font-size:13px; color: var(--text,#e8e8ea); opacity:.9; }
.l2fm-db-title .tip{ margin-left:6px; opacity:.6; cursor:help; font-weight:700; }
.l2fm-db-kpis{ display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-bottom:6px; } /* 범위 추가 대비 3→4 */
.l2fm-db-kpi{ font-size:12px; color:#cfd3d7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.l2fm-db-kpi .v{ font-weight:700; }
.l2fm-up{ color:#36d399; } .l2fm-dn{ color:#f87272; }
.l2fm-strong{ filter:brightness(1.25); }

/* 스파크라인 영역 최대 확장 */
.l2fm-db-spark{ position:relative; flex:1; min-height:100px; }
.l2fm-db-spark svg{ width:100%; height:100%; overflow:visible; }

/* 하단 날짜 라벨 — 항상 읽히도록 미세 배경 */
.l2fm-db-dates{
  position:absolute; left:0; right:0; bottom:4px;
  display:flex; justify-content:space-between; pointer-events:none;
  padding:0 6px; font:600 11px/1.4 system-ui; color:#e8e8ea; opacity:.9;
}
.l2fm-db-dates span{
  background: rgba(0,0,0,.35);
  padding:1px 4px; border-radius:4px;
  text-shadow:0 1px 0 rgba(0,0,0,.5);
}

/* 펄스 포인트 */
.l2fm-pulse{
  position:absolute; width:10px; height:10px; border-radius:50%;
  background:#5ee0ff; transform:translate(-50%, -50%);
  box-shadow:0 0 0 0 rgba(94,224,255,.7); animation:l2fm-pulse 1.6s infinite;
}
@keyframes l2fm-pulse{
  0%{ box-shadow:0 0 0 0 rgba(94,224,255,.7);}
  70%{ box-shadow:0 0 0 12px rgba(94,224,255,0);}
  100%{ box-shadow:0 0 0 0 rgba(94,224,255,0);}
}

/* 툴팁 */
.l2fm-tip{
  position:absolute; z-index:2; pointer-events:none;
  background:rgba(20,22,28,.95); color:#e8e8ea;
  border:1px solid #2a2b31; border-radius:8px; padding:6px 8px;
  font:600 11px/1.4 system-ui; white-space:nowrap;
  transform:translate(-50%, -100%); margin-top:-8px;
  box-shadow:0 6px 14px rgba(0,0,0,.35);
}

/* 0% 기준 라벨 */
.l2fm-zero{
  position:absolute; left:6px;
  padding:1px 5px; border-radius:6px; font:700 10px/1 system-ui;
  color:#111; background:#ffd400; transform:translateY(-50%);
  box-shadow:0 1px 0 rgba(0,0,0,.4);
}

/* ── 대시보드 툴바 버튼 ── */
.l2fm-db-btn{
  display:inline-flex; align-items:center; justify-content:center;
  padding:2px 10px; margin-left:6px; min-width:38px; height:24px; box-sizing:border-box;
  font:600 12px/1 system-ui; color:#e8e8ea;
  background:#191b20; border:1px solid #2a2b31; border-radius:8px; cursor:pointer;
}
.l2fm-db-btn:hover{ background:#1f232c; }
.l2fm-db-btn.active{ background:#2a3442; border-color:#3b82f6; color:#dbeafe; }
`;
(function ensure() {
  if (document.getElementById('l2fm-dashboard-css')) return;
  const el = document.createElement('style'); el.id = 'l2fm-dashboard-css'; el.textContent = CSS;
  document.head.appendChild(el);
})();
