// data/krStocks/catalog.js

export async function loadKRCatalog() {
  // 모듈 파일의 실제 위치를 기준으로 상대 경로 계산 (절대경로 금지)
  const jsonURL = new URL('./catalog.kr.json', import.meta.url);

  // 캐시 방지 쿼리
  const withBust = jsonURL.toString() + (jsonURL.search ? '&' : '?') + 'v=' + Date.now();

  const res = await fetch(withBust, { cache: 'no-store' });
  if (!res.ok) throw new Error(`catalog load failed: ${res.status}`);

  const json = await res.json();

  // 안전성 체크 (원래 쓰시던 로직 유지)
  if (!json?.markets) throw new Error('invalid catalog: markets missing');
  for (const mkt of ['kospi', 'kosdaq']) {
    if (!json.markets[mkt]) continue;
    json.markets[mkt].top ??= { limit: 20, items: [] };
    json.markets[mkt].singles ??= { codes: [] };
  }

  return json;
}

// (필요하다면) resolver 그대로 유지
export function resolveItem(lookup, code) {
  const meta = lookup?.[code];
  return {
    code,
    display: meta?.display || code,
    folder: meta?.folder || meta?.display || code,
    market: meta?.market || 'kospi',
  };
}
