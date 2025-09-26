// Listen2FM_Viewer/plugins/economic/ui/sidebar.js
import { mountPreset } from "../../../app/router.js";
import { ECON_CATEGORIES, ECON_INDICATORS } from "../../economic/registry.js";

let currentFreq = "monthly";

export function renderEconomicSidebar(root) {
  if (!root) return;
  root.innerHTML = "";

  const header = document.createElement("div");
  header.className = "accordion-header";
  header.textContent = "주요 경제지표";
  Object.assign(header.style, {
    fontWeight: "700", color: "#e8e8ea", padding: "8px 10px",
    borderBottom: "1px solid #2a2b31", userSelect: "none",
  });
  root.appendChild(header);

  // 주기 스위치
  const bar = document.createElement("div");
  Object.assign(bar.style, {
    width: "100%", display: "flex", gap: "8px", alignItems: "center", justifyContent: "center",
    padding: "8px 10px", borderBottom: "1px solid #2a2b31", color: "#ddd",
    font: "12px system-ui,-apple-system,Segoe UI,Roboto", background: "rgba(0,0,0,0.2)", marginBottom: "6px",
  });
  const mkBtn = (value, text) => {
    const b = document.createElement("button");
    b.type = "button"; // 폼 submit 방지
    b.textContent = text;
    Object.assign(b.style, {
      display: "inline-flex", justifyContent: "center", alignItems: "center",
      padding: "4px 10px", borderRadius: "6px", border: "1px solid #444",
      background: currentFreq === value ? "#1e90ff44" : "#111",
      color: "#ddd", cursor: "pointer", minWidth: "72px",
    });
    b.addEventListener("click", (e) => {
      e.preventDefault();
      currentFreq = value;
      Array.from(bar.querySelectorAll("button")).forEach(btn => {
        btn.style.background = (btn.textContent === text) ? "#1e90ff44" : "#111";
      });
    });
    return b;
  };
  bar.appendChild(mkBtn("daily", "Daily"));
  bar.appendChild(mkBtn("monthly", "Monthly"));
  root.appendChild(bar);

  // 카테고리/항목
  ECON_CATEGORIES.forEach(cat => {
    const items = ECON_INDICATORS.filter(x => x.categories.includes(cat));
    if (!items.length) return;

    const h = document.createElement("div");
    h.className = "accordion-header";
    h.textContent = `▸ ${cat}`;
    Object.assign(h.style, {
      fontWeight: "700", color: "#e8e8ea", padding: "6px 8px",
      borderTop: "1px solid #2a2b31", cursor: "pointer", userSelect: "none",
    });
    root.appendChild(h);

    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.margin = "0";
    ul.style.padding = "0 0 8px 0";
    ul.style.display = "none";
    root.appendChild(ul);

    h.addEventListener("click", () => {
      const open = ul.style.display !== "none";
      ul.style.display = open ? "none" : "";
      h.textContent = (open ? "▸ " : "▾ ") + cat;
    });

    items.forEach(ind => {
      const li = document.createElement("li");
      li.textContent = ind.name + (ind.disabled ? " (준비중)" : "");
      li.dataset.indicatorId = ind.id;
      Object.assign(li.style, {
        padding: "6px 10px", color: ind.disabled ? "#777" : "#ddd",
        cursor: ind.disabled ? "not-allowed" : "pointer",
      });

      li.addEventListener("click", async () => {
        if (ind.disabled) return;
        if (!ind.frequencies.includes(currentFreq)) {
          alert(`"${ind.name}"는 ${currentFreq} 데이터를 지원하지 않습니다.`);
          return;
        }
        await mountPreset("main-content-area", {
          preset: "econSingleViewer",
          indicatorId: ind.id,
          frequency: currentFreq,
        });
      });

      li.tabIndex = 0;
      li.addEventListener("keydown", ev => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); li.click(); }
      });

      ul.appendChild(li);
    });
  });
}
