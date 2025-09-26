// /plugins/krStocks/data/catalog.js
export async function loadKRCatalog(url = "/data/krStocks/catalog.kr.json") {
    const withBust = url.includes("?") ? `${url}&v=${Date.now()}` : `${url}?v=${Date.now()}`;
    const res = await fetch(withBust, { cache: "no-store" });
    if (!res.ok) throw new Error(`catalog load failed: ${res.status}`);
    const json = await res.json();

    if (!json?.markets) throw new Error("invalid catalog: markets missing");
    for (const mkt of ["kospi", "kosdaq"]) {
        if (!json.markets[mkt]) continue;
        json.markets[mkt].top ??= { limit: 20, items: [] };
        json.markets[mkt].singles ??= { codes: [] };
    }
    json.lookup ??= {};
    return json;
}

export function resolveItem(lookup, code) {
    const meta = lookup?.[code];
    return {
        code,
        display: meta?.display || code,
        folder: meta?.folder || meta?.display || code,
        market: meta?.market || "kospi",
    };
}
