// Listen2FM_Viewer/plugins/crypto/ui/sidebar.js
import { mountPreset } from "../../../app/router.js";

const coinNamesKorean = {
    "BTC": "비트코인",
    "ETH": "이더리움",
    "SOL": "솔라나",
    "XRP": "엑스알피",
    "XLM": "스텔라루멘",
    "HBAR": "헤데라",
    "ADA": "에이다",
    "AAVE": "에이브",
    "LINK": "체인링크",
    "DOGE": "도지코인",
    "AVAX": "아발란체",
    "DOT": "폴카닷",
    "TRX": "트론",
    "SUI": "수이",
    "ONDO": "온도파이낸스",
    "IOTA": "아이오타",
    "VET": "비체인",
    "POL": "폴리곤",
    "APT": "앱토스",
    "ARB": "아비트럼",
    "NEO": "네오",
    "SHIB": "시바이누",
};

// 요청하신 순서 그대로 표시
const initialUpbitCoins = [
    "BTC", "ETH", "SOL", "XRP", "XLM", "HBAR", "ADA", "AAVE", "LINK", "DOGE",
    "AVAX", "DOT", "TRX", "SUI", "ONDO", "IOTA", "VET", "POL", "APT", "ARB", "NEO", "SHIB"
];

// 현재 선택 강조용
let activeLi = null;

// (내부) 캔들주기 → 프리셋 매핑 (사이드바 클릭 시에도 현재 주기를 반영)
function mapTfToPreset(tf) {
    switch (tf) {
        case 'daily': return 'singleDaily';
        case '2h': return 'single2H';
        case 'monthly': return 'singleMonthly';
        case 'TW_Chart': return 'twChart';
        case 'dualDay2H': return 'dualDay2H';
        case 'dualMonthlyDaily': return 'dualMonthlyDaily';
        default: return 'singleDaily';
    }
}

// 좌측 목록 채우기
function populateCoinList(ulId, coins, exchangeType, doSort = false) {
    const ul = document.getElementById(ulId);
    if (!ul) return;

    ul.innerHTML = "";
    let coinsToDisplay = [...coins];

    if (doSort) {
        coinsToDisplay.sort((a, b) => {
            const nameA = coinNamesKorean[a] || a;
            const nameB = coinNamesKorean[b] || b;
            return nameA.localeCompare(nameB, "ko-KR");
        });
    }

    coinsToDisplay.forEach((coin, idx) => {
        const li = document.createElement("li");
        const displayName = coinNamesKorean[coin] || coin;
        li.textContent = `${displayName}/${exchangeType === "upbit" ? "KRW" : "USDT"}`;
        li.dataset.symbol = coin;
        li.dataset.exchange = exchangeType;
        li.tabIndex = 0;

        li.addEventListener("click", async () => {
            try {
                // 선택 강조
                if (activeLi) activeLi.classList.remove("focused");
                li.classList.add("focused");
                activeLi = li;

                // 현재 선택된 캔들주기 읽어서 해당 프리셋으로 마운트
                const tfSel = document.getElementById('timeframe-select');
                const tf = tfSel?.value || 'daily';

                await mountPreset('main-content-area', {
                    preset: mapTfToPreset(tf),
                    symbol: coin,
                    exchange: exchangeType
                });
            } catch (e) {
                console.error("Preset mount failed:", e);
            }
        });

        ul.appendChild(li);

        // 초기 첫 항목에 포커스 강조(선택은 하지 않음)
        if (idx === 0 && !activeLi) {
            li.classList.add("focused");
            activeLi = li;
        }
    });
}

// 아코디언 메뉴와 코인 리스트를 렌더링
export function renderLeftSidebar() {
    populateCoinList("upbit-coin-list", initialUpbitCoins, "upbit", false);
}

// TODO: 바이낸스 등 다른 거래소도 동일 패턴으로 확장 예정
