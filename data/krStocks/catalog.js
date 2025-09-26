// /plugins/krStocks/data/catalog.js
// Bridge module to keep older imports working.
// ✅ Single source of truth JSON: /data/krStocks/catalog.kr.json

export async function loadKrCatalog(url = "data/krStocks/catalog.kr.json") {
  // 호출부가 "catalog.kr.json" 같은 파일명만 넘겨도 안전하게 보정
  if (!url.includes("/")) {
    url = `data/krStocks/${url}`;
  }

  // cache-busting 쿼리로 GitHub Pages/CDN 캐시 무력화
  const withBust = url.includes("?") ? `${url}&v=${Date.now()}` : `${url}?v=${Date.now()}`;

  const res = await fetch(withBust, { cache: "no-store" });
  if (res.ok !== true) throw new Error(`catalog load failed: ${res.status}`);

  const json = await res.json();

  // 최소 스키마 검증
  if (!json?.markets) throw new Error("invalid catalog: markets missing");

  // 필수 필드 기본값 채워 넣기 (방어코드)
  for (const mkt of ["kospi", "kosdaq"]) {
    if (!json.markets[mkt]) continue;
    json.markets[mkt].top ??= { limit: 20, items: [] };
    json.markets[mkt].singles ??= { codes: [] };
  }

  return json;
}

// 심볼/코드 메타 해석 유틸
export function resolveItem(lookup, code) {
  const meta = lookup?.[code];
  return {
    code,
    display: meta?.display || code,
    folder: meta?.folder || meta?.display || code,
    market: meta?.market || "kospi",
  };
}
