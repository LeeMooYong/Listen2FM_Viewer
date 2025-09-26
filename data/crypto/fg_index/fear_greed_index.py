import requests
import json
import pathlib

# API 호출
url = "https://api.alternative.me/fng/?limit=0"
res = requests.get(url)
raw_data = res.json()["data"]

# 최신순 → 오래된 순으로 정렬
sorted_data = sorted(raw_data, key=lambda x: int(x["timestamp"]))

# 포맷 변환 및 숫자형 변환
cleaned_data = []
for item in sorted_data:
    cleaned_data.append({
        "time": int(item["timestamp"]),
        "value": float(item["value"]),
        "value_classification": item["value_classification"]
    })

# 고정 저장 경로
OUT_PATH = pathlib.Path(r"D:\Listen2FM_Viewer\data\crypto\fg_index\fear_greed_all.json")
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)  # 경로 없으면 생성

# JSON 저장
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(cleaned_data, f, indent=2, ensure_ascii=False)

print(f"✔️ 저장 완료: {OUT_PATH} (총 {len(cleaned_data)}일치)")
