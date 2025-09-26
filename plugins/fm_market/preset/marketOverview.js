// Listen2FM_Viewer/plugins/fm_market/preset/marketOverview.js

// 최소 동작용 프리셋: 이후 지수/환율/금리/뉴스 위젯을 이 파일에서 점진적으로 추가하세요.
export async function mountMarketOverview({ mainRoot }) {
  mainRoot.innerHTML = `
      <div style="padding:16px">
        <h2 style="margin:0 0 8px">금융시황</h2>
        <p style="opacity:.9;margin:0 0 16px">
          전세계 지수 / 환율 / 금리 / 상품 / 뉴스 등 시장 개관을 여기에 배치하세요.
        </p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div style="border:1px solid #2a2b31;border-radius:8px;padding:12px;min-height:120px;">
            <h3 style="margin:0 0 8px;font-size:15px;">주요 지수</h3>
            <div style="opacity:.7">S&P500, Nasdaq, Dow, KOSPI, Nikkei ...</div>
          </div>
          <div style="border:1px solid #2a2b31;border-radius:8px;padding:12px;min-height:120px;">
            <h3 style="margin:0 0 8px;font-size:15px;">환율/금리/원자재</h3>
            <div style="opacity:.7">DXY, USDKRW, US10Y, WTI, Gold ...</div>
          </div>
          <div style="border:1px solid #2a2b31;border-radius:8px;padding:12px;min-height:160px;">
            <h3 style="margin:0 0 8px;font-size:15px;">뉴스 헤드라인</h3>
            <div style="opacity:.7">API 연결 전까지는 플레이스홀더를 표기합니다.</div>
          </div>
          <div style="border:1px solid #2a2b31;border-radius:8px;padding:12px;min-height:160px;">
            <h3 style="margin:0 0 8px;font-size:15px;">메모</h3>
            <div style="opacity:.7">시장 메모/체크리스트 공간</div>
          </div>
        </div>
      </div>
    `;

  // 정리 함수(필요 시 리스너/타이머 해제 추가)
  return () => { };
}

export function dispose() { }
