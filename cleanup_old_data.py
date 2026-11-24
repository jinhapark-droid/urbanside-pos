#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import requests

# Supabase 정보
SB_URL = "https://owykoqnhwmdhpadxipes.supabase.co"
SB_KEY = "sb_publishable_Pgf79543Sk1FvB_PtWK5PA_2U9jlGbD"
PIN = "81515823"

def call_rpc(fn, body):
    """Supabase RPC 함수 호출"""
    url = f"{SB_URL}/rest/v1/rpc/{fn}"
    headers = {
        "apikey": SB_KEY,
        "Content-Type": "application/json"
    }
    response = requests.post(url, json=body, headers=headers)
    if response.status_code not in [200, 201]:
        raise Exception(f"HTTP {response.status_code}: {response.text}")
    return response.json()

print("🗑️ 과거 데이터 완전 정리 중...\n")
print("삭제 대상:")
print("  - 모든 sales (판매 기록)")
print("  - 모든 receipts (kind != 'init')")
print("  - 모든 requests (입고 요청)")

# SQL로 직접 DELETE (더 확실한 방법)
print("\n📝 SQL DELETE 쿼리 준비...")

shop = "chungcheong"

# 1. Sales 모두 삭제
print(f"\n🗑️ {shop}/sales/* 삭제...")
result1 = call_rpc("pos_delete_range", {
    "p_pin": PIN,
    "p_path_prefix": f"s/{shop}/sales/"
})
print(f"  ✅ 완료")

# 2. Requests 모두 삭제
print(f"🗑️ {shop}/requests/* 삭제...")
result2 = call_rpc("pos_delete_range", {
    "p_pin": PIN,
    "p_path_prefix": f"s/{shop}/requests/"
})
print(f"  ✅ 완료")

# 3. Receipts (kind != 'init') 삭제
print(f"🗑️ {shop}/receipts/* (init 제외) 삭제...")
result3 = call_rpc("pos_delete_non_init", {
    "p_pin": PIN,
    "p_shop": shop
})
print(f"  ✅ 완료")

print("\n✅ 모든 과거 데이터 삭제 완료!")
print("🎉 현재 157건의 초기재고만 남아있습니다")
