// Listen2FM_Viewer/plugins/krStocks/ui/rightPanel.js
// KR 오른쪽 사이드바: 즉시 내용 표시(아이콘 없이) + 심볼 브리지

let _root = null;
let _symbol = "삼성전자";
let _code = "005930";

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function pill(text) {
  const s = el("span", "l2fm-pill", text);
  return s;
}

function renderCard_Header(container) {
  const card = el("div", "rp-card");
  const h = el("div", "rp-card-title");
  const name = el("span", "rp-name", `${_symbol} (KR)`);
  const code = el("span", "rp-code", _code || "");
  h.appendChild(name);
  if (_code) h.appendChild(code);

  const sub = el("div", "rp-sub");
  sub.append(
    pill("시가총액: —"),
    pill("PER: —"),
    pill("PBR: —"),
  );

  const ma = el("div", "rp-line");
  ma.append(
    pill("MA5"), pill("MA20"), pill("MA60"), pill("MA120"), pill("MA240")
  );

  card.append(h, sub, ma);
  container.appendChild(card);
}

function renderCard_Indicators(container) {
  const card = el("div", "rp-card");
  const h = el("div", "rp-card-title");
  h.textContent = "차트 요약 (샘플)";
  const grid = el("div", "rp-grid");

  const main = el("div", "rp-box");
  main.innerHTML = `
    <div class="rp-box-title">메인 차트</div>
    <div class="rp-row"><span>추세</span><strong>—</strong></div>
    <div class="rp-row"><span>저항/지지</span><strong>—</strong></div>
    <div class="rp-row"><span>패턴</span><strong>—</strong></div>
  `;

  const osc = el("div", "rp-box");
  osc.innerHTML = `
    <div class="rp-box-title">보조지표</div>
    <div class="rp-row"><span>MACD</span><strong>—</strong></div>
    <div class="rp-row"><span>RSI</span><strong>—</strong></div>
    <div class="rp-row"><span>Stoch</span><strong>—</strong></div>
  `;

  grid.append(main, osc);
  card.append(h, grid);
  container.appendChild(card);
}

function ensureCSS() {
  if (document.getElementById("l2fm-rightpanel-css")) return;
  const s = document.createElement("style");
  s.id = "l2fm-rightpanel-css";
  s.textContent = `
  aside.right, #right-sidebar {
    /* 오른쪽 사이드바 폭을 CSS에서 240px로 이미 키우셨습니다. */
    /* 이 파일은 내용 스타일만 담당합니다. */
  }
  .rp-card {
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: 10px;
    padding: 10px;
    margin: 6px 0;
  }
  .rp-card-title {
    font-weight: 800;
    margin-bottom: 6px;
  }
  .rp-name { color: var(--text); margin-right: 8px; }
  .rp-code { color: var(--muted); font-weight: 600; }
  .rp-sub { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .l2fm-pill {
    display: inline-block;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: #1b1c22;
    border: 1px solid var(--border);
    color: var(--text);
  }
  .rp-line { display:flex; flex-wrap: wrap; gap: 6px; }
  .rp-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
  .rp-box {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    background: #131419;
  }
  .rp-box-title {
    font-weight: 700;
    margin-bottom: 6px;
    color: var(--accent);
  }
  .rp-row {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 12px; padding: 4px 0; border-bottom: 1px dashed #23242a;
  }
  .rp-row:last-child { border-bottom: none; }
  `;
  document.head.appendChild(s);
}

function renderAll() {
  if (!_root) return;
  _root.innerHTML = "";

  // 상단 여백 약간
  const spacer = el("div"); spacer.style.height = "4px";
  _root.appendChild(spacer);

  renderCard_Header(_root);
  renderCard_Indicators(_root);
}

/** 외부에서 호출: 초기 렌더 */
export function renderKRRightPanel(root) {
  _root = root || document.querySelector("aside.right") || document.querySelectorAll("aside")[1];
  if (!_root) return;
  ensureCSS();
  renderAll();

  // 브리지: 좌측 종목 클릭 시 업데이트 가능
  window.L2FM_setKRSymbol = (name, code) => {
    if (name) _symbol = String(name);
    if (code) _code = String(code);
    renderAll();
  };
}
