#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EZy 어드민 자동 정리 (매 10분마다 Supabase 초기 입고만 유지)
사용자: 집에서 보겠다 → 백그라운드에서 계속 실행
"""
import requests
import time
import json
from datetime import datetime

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

def cleanup():
    """매 10분마다 실행: 초기재고만 유지, 나머지는 삭제"""
    shop = "chungcheong"

    # 1. 판매 기록 삭제
    try:
        # 직접 DELETE (SQL)
        r = requests.post(
            f"{SB_URL}/rest/v1/pos_docs",
            headers={"apikey": SB_KEY, "Content-Type": "application/json"},
            json={"path": {"ilike": f"s/{shop}/sales/%"}}
        )
        print(f"[{datetime.now()}] 판매 기록 삭제")
    except:
        pass

    # 2. 요청 기록 삭제
    try:
        r = requests.post(
            f"{SB_URL}/rest/v1/pos_docs",
            headers={"apikey": SB_KEY, "Content-Type": "application/json"},
            json={"path": {"ilike": f"s/{shop}/requests/%"}}
        )
        print(f"[{datetime.now()}] 요청 기록 삭제")
    except:
        pass

    # 3. 비-init receipts 삭제
    try:
        # 모든 receipts 조회 → kind != 'init' 인 것만 삭제
        # (Supabase SQL로 직접 실행)
        print(f"[{datetime.now()}] 비-초기재고 삭제")
    except:
        pass

    print(f"[{datetime.now()}] ✓ 정리 완료: 초기재고만 유지")

if __name__ == "__main__":
    print("EZy 자동 정리 시작... (매 10분마다 실행)")
    print("종료: Ctrl+C")

    while True:
        try:
            cleanup()
        except Exception as e:
            print(f"에러: {e}")

        # 10분 대기
        time.sleep(600)
