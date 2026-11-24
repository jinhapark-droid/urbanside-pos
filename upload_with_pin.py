#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import uuid
import requests

# Supabase 정보 (app.js에서 가져온 정보)
SB_URL = "https://owykoqnhwmdhpadxipes.supabase.co"
SB_KEY = "sb_publishable_Pgf79543Sk1FvB_PtWK5PA_2U9jlGbD"
PIN = "81515823"

# 초기 재고 데이터 로드
with open("receipts_init.json", "r", encoding="utf-8") as f:
    receipts = json.load(f)

print(f"📊 Supabase에 업로드할 데이터: {len(receipts)}건\n")
shop = "chungcheong"  # 더현대 충청

# RPC 함수 호출 (pos_put)
def call_pos_put(path, data):
    url = f"{SB_URL}/rest/v1/rpc/pos_put"
    headers = {
        "apikey": SB_KEY,
        "Content-Type": "application/json"
    }
    body = {
        "p_pin": PIN,
        "p_path": path,
        "p_data": data,
        "p_merge": False
    }

    response = requests.post(url, json=body, headers=headers)
    if response.status_code not in [200, 201]:
        raise Exception(f"HTTP {response.status_code}: {response.text}")
    return response.json()

print("📤 새 데이터 업로드 중...")
try:
    for i, receipt in enumerate(receipts):
        doc_id = str(uuid.uuid4())
        path = f"s/{shop}/receipts/{doc_id}"

        call_pos_put(path, receipt)

        if (i + 1) % 10 == 0 or i == len(receipts) - 1:
            print(f"  {i + 1}/{len(receipts)} 완료")

    print(f"\n✅ 총 {len(receipts)}건 업로드 완료!")
    print("🎉 POS를 새로고침하면 재고가 반영됩니다")
except Exception as e:
    print(f"❌ 업로드 오류: {e}")
    exit(1)
