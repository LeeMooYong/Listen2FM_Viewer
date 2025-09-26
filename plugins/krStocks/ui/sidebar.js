// Listen2FM_Viewer/plugins/krStocks/data/catalog.js
// KR 카탈로그 공용 로더 (GitHub Pages에서도 404 안 나게 상대경로 사용)

const CATALOG_PATH = "data/krStocks/catalog.kr.json";

/**
 * KR 카탈로그(JSON) 로드
 * - 항상 페이지 기준 상대경로로 요청
 * - 캐시 무력화를 위해 쿼리스트링에 타임스탬프 추가
 * - markets.kospi / markets.kosdaq 구조를 최소한 보정
 */
export async function loadKRCatalog(url = CATALOG_PATH) {
  const withBust = url.includes("?") ? `${url}&v=${Date.now()}` : `${url}?v=${Date.now()}`;
  const res = await fetch(withBust, { cache: "no-store" });
  if (!res.ok) throw new Error(`catalog load failed: HTTP ${res.status}`);

  const json = await res.json();

  // 안전 보정 (필드 없을 때 기본값 채워 넣기)
  for (const mkt of ["kospi", "kosdaq"]) {
    const m = json?.markets?.[mkt] ?? {};
    m.top = m.top ?? { limit: 20, items: [] };
    m.singles = m.singles ?? { codes: [] };
    json.markets = json.markets ?? {};
    json.markets[mkt] = m;
  }

  json.lookup = json.lookup ?? {};
  return json;
}
