#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HD_CC261127-007만 남기고 나머지 주문 모두 삭제
"""
import requests
import json

# Supabase 정보
SB_URL = "https://owykoqnhwmdhpadxipes.supabase.co"
SB_KEY = "sb_publishable_Pgf79543Sk1FvB_PtWK5PA_2U9jlGbD"
PIN = "81515823"

def rpc_call(fn, body):
    """Supabase RPC 호출"""
    url = f"{SB_URL}/rest/v1/rpc/{fn}"
    headers = {"apikey": SB_KEY, "Content-Type": "application/json"}
    r = requests.post(url, json=body, headers=headers)
    if r.status_code not in [200, 201]:
        raise Exception(f"HTTP {r.status_code}: {r.text}")
    return r.json()

def delete_order(order_id):
    """주문 삭제"""
    try:
        rpc_call("pos_delete", {
            "p_path": f"s/chungcheong/sales/{order_id}",
            "p_pin": PIN
        })
        return True
    except Exception as e:
        print(f"  ❌ {order_id} 삭제 실패: {e}")
        return False

print("🗑️  HD_CC261127-007만 남기고 나머지 주문 삭제 중...\n")

shop = "chungcheong"

# 현재 sales 조회
try:
    result = rpc_call("pos_list", {
        "p_path": f"s/{shop}/sales/",
        "p_prefix_only": False,
        "p_pin": PIN
    })

    sales = result if isinstance(result, list) else []
    print(f"총 {len(sales)}개 주문 found\n")

    deleted_count = 0
    kept_count = 0

    for sale in sales:
        if isinstance(sale, dict):
            order_no = sale.get("orderNo", "")
            order_id = sale.get("id", "")
        else:
            # 간단한 문자열일 수도 있음
            continue

        print(f"주문: {order_no} (ID: {order_id})")

        if order_no == "HD_CC261127-007":
            print(f"  ✅ 유지")
            kept_count += 1
        else:
            if delete_order(order_id):
                print(f"  🗑️  삭제됨")
                deleted_count += 1

    print(f"\n✅ 완료!")
    print(f"  - 삭제: {deleted_count}건")
    print(f"  - 유지: {kept_count}건 (HD_CC261127-007)")

except Exception as e:
    print(f"❌ 오류: {e}")
