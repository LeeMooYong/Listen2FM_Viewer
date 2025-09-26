// data/krStocks/catalog.js

// KR 주식 카탈로그(JSON) 로드
export async function loadKRCatalog() {
  // 이 파일(catalog.js) 기준으로 JSON 경로 계산 → 서브폴더 배포에도 안전
  const url = new URL('./catalog.kr.json', import.meta.url);
  // 캐시 우회(개발/배포 갱신 강제)
  url.searchParams.set('v', Date.now().toString());

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`catalog load failed: ${res.status}`);

  const json = await res.json();
  if (!json?.markets) throw new Error('invalid catalog: markets missing');

  // markets 안전 초기화
  for (const mkt of Object.keys(json.markets)) {
    const m = json.markets[mkt] ?? {};
    m.top ??= { limit: 20, items: [] };
    m.singles ??= { codes: [] };
  }

  // lookup 안전 초기화
  json.lookup ??= {};
  for (const [code, meta] of Object.entries(json.lookup)) {
    json.lookup[code] = {
      code,
      display: meta?.display || code,
      folder: meta?.folder || code,
      market: meta?.market || 'kospi',
    };
  }

  return json;
}

// 심볼 메타 해석 유틸
export function resolveItem(lookup, code) {
  const meta = lookup?.[code] || {};
  return {
    code,
    display: meta.display || code,
    folder: meta.folder || code,
    market: meta.market || 'kospi',
  };
}

// 필요하면 기본 export도 함께 제공
export default { loadKRCatalog, resolveItem };
