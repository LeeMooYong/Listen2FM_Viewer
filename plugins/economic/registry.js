// Listen2FM_Viewer/plugins/economic/registry.js
// 경제지표 메타데이터(카테고리/경로/주기/키/색상)를 한곳에 정의

export const ECON_CATEGORIES = [
    '금리',
    '물가',
    '고용',
    '유동성',
    '성장',
    '심리/여건',
    '원자재/대체자산',
];

/**
 * 각 지표 정의:
 * - id: 내부 식별자
 * - name: 표시명
 * - categories: 아코디언 카테고리
 * - frequencies: ["daily"] | ["monthly"] | ["daily","monthly"]
 * - paths: { daily?, monthly? }  // 프런트에서 fetch할 정적 JSON 경로
 * - valueKeyByFreq: 주기별 값 키 이름(예: 월 데이터가 {date,value} 또는 {date,dgs10} 등)
 * - unit: 표기단위(선택)
 * - color: 기본 라인 색상(선택)
 * - disabled: 데이터 준비 전 잠정 비활성
 */
export const ECON_INDICATORS = [
    // ─────────────────────────────────────────────────────────────
    // 금리 (UST 10Y / 2Y / 스프레드)
    // ─────────────────────────────────────────────────────────────
    {
        id: 'ust10y',
        name: '미국채 10Y',
        categories: ['금리'],
        frequencies: ['daily', 'monthly'],
        paths: {
            daily: 'data/economic/daily/ust10y_daily.json',                 // 현재 {date,value} 스키마 가정
            monthly: 'data/economic/monthly/yields_10y_2y.json',            // {date,dgs10,dgs2,spread}
        },
        valueKeyByFreq: {
            daily: 'value',
            monthly: 'dgs10',
        },
        unit: '%',
        color: '#0055aa',
    },
    {
        id: 'ust2y',
        name: '미국채 2Y',
        categories: ['금리'],
        frequencies: ['daily', 'monthly'],
        paths: {
            daily: 'data/economic/daily/ust2y_daily.json',
            monthly: 'data/economic/monthly/yields_10y_2y.json',
        },
        valueKeyByFreq: {
            daily: 'value',
            monthly: 'dgs2',
        },
        unit: '%',
        color: '#17becf',
    },
    {
        id: 'spread10y2y',
        name: '10Y-2Y 스프레드',
        categories: ['금리'],
        frequencies: ['daily', 'monthly'],
        paths: {
            daily: 'data/economic/daily/ust_spread_daily.json',             // {date,value}
            monthly: 'data/economic/monthly/yields_10y_2y.json',
        },
        valueKeyByFreq: {
            daily: 'value',
            monthly: 'spread',
        },
        unit: 'pp',
        color: '#111111',
    },

    // ─────────────────────────────────────────────────────────────
    // 물가 (CPI / Core CPI / PPI) — cpi_ppi.json 번들
    // ─────────────────────────────────────────────────────────────
    {
        id: 'cpi',
        name: 'CPI YoY',
        categories: ['물가'],
        frequencies: ['monthly'],
        paths: { monthly: 'data/economic/monthly/cpi_ppi.json' },
        valueKeyByFreq: { monthly: 'cpi_yoy' },
        unit: '%',
        color: '#1f77b4',
    },
    {
        id: 'core_cpi',
        name: 'Core CPI YoY',
        categories: ['물가'],
        frequencies: ['monthly'],
        paths: { monthly: 'data/economic/monthly/cpi_ppi.json' },
        valueKeyByFreq: { monthly: 'core_cpi_yoy' },
        unit: '%',
        color: '#ff7f0e',
    },
    {
        id: 'ppi',
        name: 'PPI YoY',
        categories: ['물가'],
        frequencies: ['monthly'],
        paths: { monthly: 'data/economic/monthly/cpi_ppi.json' },
        valueKeyByFreq: { monthly: 'ppi_yoy' },
        unit: '%',
        color: '#2ca02c',
    },

    // ─────────────────────────────────────────────────────────────
    // 유동성 (M2 YoY) — 단일 시리즈는 {date,value}로 통일
    // ─────────────────────────────────────────────────────────────
    {
        id: 'm2yoy',
        name: 'M2 YoY',
        categories: ['유동성'],
        frequencies: ['monthly'],
        paths: { monthly: 'data/economic/monthly/m2.json' },              // {date,value}
        valueKeyByFreq: { monthly: 'value' },
        unit: '%',
        color: '#9467bd',
    },

    // ─────────────────────────────────────────────────────────────
    // 고용 (실업률) — 단일 시리즈 {date,value}로 통일
    // ─────────────────────────────────────────────────────────────
    {
        id: 'unemployment',
        name: '실업률',
        categories: ['고용'],
        frequencies: ['monthly'],
        paths: { monthly: 'data/economic/monthly/unemployment.json' },    // {date,value}
        valueKeyByFreq: { monthly: 'value' },
        unit: '%',
        color: '#d62728',
        // 필요시: disabled: true,
    },

    // ─────────────────────────────────────────────────────────────
    // 심리/여건 (VIXY ETF) — Daily: OHLC 중 close / Monthly: {date,value}
    // ─────────────────────────────────────────────────────────────
    {
        id: 'vixy',
        name: 'VIXY (ETF)',
        categories: ['심리/여건'],
        frequencies: ['daily', 'monthly'],
        paths: {
            daily: 'data/economic/daily/vixy_daily.json',                   // {time,open,high,low,close,volume?}
            monthly: 'data/economic/monthly/vixy_monthly.json',             // {date,value}
        },
        valueKeyByFreq: { daily: 'close', monthly: 'value' },
        unit: 'USD',
        color: '#17becf',
    },

    // ─────────────────────────────────────────────────────────────
    // 원자재/대체자산 (DXY, WTI, Gold) — Daily: OHLC / Monthly: {date,value}
    // ─────────────────────────────────────────────────────────────
    {
        id: 'dxy',
        name: '달러인덱스 (DXY)',
        categories: ['원자재/대체자산'],
        frequencies: ['daily', 'monthly'],
        paths: {
            daily: 'data/economic/daily/dxy_daily.json',                    // {time,open,high,low,close}
            monthly: 'data/economic/monthly/dxy_monthly.json',              // {date,value}
        },
        valueKeyByFreq: { daily: 'close', monthly: 'value' },
        unit: 'index',
        color: '#8c564b',
    },
    {
        id: 'wti',
        name: 'WTI 원유',
        categories: ['원자재/대체자산'],
        frequencies: ['daily', 'monthly'],
        paths: {
            daily: 'data/economic/daily/wti_daily.json',
            monthly: 'data/economic/monthly/wti_monthly.json',
        },
        valueKeyByFreq: { daily: 'close', monthly: 'value' },
        unit: 'USD/bbl',
        color: '#bcbd22',
    },
    {
        id: 'gold',
        name: 'Gold(온스당)',
        categories: ['원자재/대체자산'],
        frequencies: ['daily', 'monthly'],
        paths: {
            daily: 'data/economic/daily/gold_daily.json',
            monthly: 'data/economic/monthly/gold_monthly.json',
        },
        valueKeyByFreq: { daily: 'close', monthly: 'value' },
        unit: 'USD/oz',
        color: '#e377c2',
    },

    // (BTC는 암호화폐 탭에서 별도 주기로 운영하므로 이 레지스트리에는 등록하지 않음)
];
