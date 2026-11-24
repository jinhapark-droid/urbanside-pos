#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import requests
import json

# Supabase 정보
SB_URL = "https://owykoqnhwmdhpadxipes.supabase.co"
SB_KEY = "sb_publishable_Pgf79543Sk1FvB_PtWK5PA_2U9jlGbD"
PIN = "81515823"
shop = "chungcheong"

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

def get_docs(path_prefix):
    """경로 기반으로 문서 조회"""
    url = f"{SB_URL}/rest/v1/pos_docs?path=ilike.{path_prefix}*"
    headers = {"apikey": SB_KEY}
    response = requests.get(url, headers=headers)
    if response.status_code not in [200, 201]:
        raise Exception(f"HTTP {response.status_code}: {response.text}")
    return response.json()

print("📊 현재 데이터 조회 중...\n")

# sales 데이터
print("🔍 판매 기록 조회...")
sales = get_docs(f"s/{shop}/sales/")
print(f"  - 총 {len(sales)}건\n")

# receipts (init 제외)
print("🔍 입고/기타 기록 조회...")
receipts = get_docs(f"s/{shop}/receipts/")
init_count = sum(1 for r in receipts if r.get("data", {}).get("kind") == "init")
other_count = len(receipts) - init_count
print(f"  - 초기재고(init): {init_count}건")
print(f"  - 기타 기록: {other_count}건\n")

# requests 데이터
print("🔍 입고 요청 조회...")
requests_data = get_docs(f"s/{shop}/requests/")
print(f"  - 총 {len(requests_data)}건\n")

# 삭제할 개수 계산
total_to_delete = len(sales) + other_count + len(requests_data)
print(f"💡 삭제할 데이터: {total_to_delete}건")
print(f"✅ 유지할 데이터: 초기재고 {init_count}건\n")

if total_to_delete == 0:
    print("ℹ️  삭제할 데이터가 없습니다.")
else:
    # 삭제 진행
    print("🗑️ 데이터 삭제 중...\n")

    deleted = 0

    # sales 모두 삭제
    if len(sales) > 0:
        print(f"  판매 기록: {len(sales)}건 삭제 중...")
        for doc in sales:
            call_rpc("pos_delete_doc", {"p_pin": PIN, "p_path": doc["path"]})
            deleted += 1
        print(f"    ✅ {len(sales)}건 삭제 완료")

    # receipts (init 제외) 모두 삭제
    if other_count > 0:
        print(f"  기타 기록: {other_count}건 삭제 중...")
        for doc in receipts:
            if doc.get("data", {}).get("kind") != "init":
                call_rpc("pos_delete_doc", {"p_pin": PIN, "p_path": doc["path"]})
                deleted += 1
        print(f"    ✅ {other_count}건 삭제 완료")

    # requests 모두 삭제
    if len(requests_data) > 0:
        print(f"  입고 요청: {len(requests_data)}건 삭제 중...")
        for doc in requests_data:
            call_rpc("pos_delete_doc", {"p_pin": PIN, "p_path": doc["path"]})
            deleted += 1
        print(f"    ✅ {len(requests_data)}건 삭제 완료")

    print(f"\n✅ 총 {deleted}건 삭제 완료!")
    print("🎉 초기재고만 남았습니다. POS를 새로고침하세요.")
