// Listen2FM_Viewer/data/krStocks/catalog.js
// 카탈로그 로더(상대경로로 JSON을 읽음)

export async function loadKRCatalog(url = "data/krStocks/catalog.kr.json") {
  const withBust = url.includes("?") ? `${url}&v=${Date.now()}` : `${url}?v=${Date.now()}`;
  const res = await fetch(withBust, { cache: "no-store" });
  if (!res.ok) throw new Error(`catalog load failed: ${res.status}`);

  const json = await res.json();

  // 필수 필드 보정(없으면 기본값 채움)
  for (const mkt of ["kospi", "kosdaq"]) {
    const m = json?.markets?.[mkt];
    if (!m) continue;
    m.top     = m.top     ?? { limit: 20, items: [] };
    m.singles = m.singles ?? { codes: [] };
  }
  return json;
}
