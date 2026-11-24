#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
과거 데이터 완전 삭제 스크립트
- 모든 sales 기록 삭제
- kind != 'init'인 receipts 삭제
- 모든 requests 삭제
- 157건의 초기재고(kind='init')만 보존
"""
from supabase import create_client, Client
import json

# Supabase 연결
url = "https://owykoqnhwmdhpadxipes.supabase.co"
key = "sb_service_role_key_placeholder"  # 서비스 역할 키는 없으므로 다른 방법 필요

# 대신 HTTP API를 직접 사용하여 DELETE 실행
import requests

SB_URL = "https://owykoqnhwmdhpadxipes.supabase.co"
SB_KEY = "sb_publishable_Pgf79543Sk1FvB_PtWK5PA_2U9jlGbD"
PIN = "81515823"

def sql_query(query):
    """Supabase SQL 에디터에서 쿼리 실행 (HTTP API)"""
    headers = {
        "apikey": SB_KEY,
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SB_KEY}"
    }

    # Supabase SQL API 사용
    # 실제로는 내부 API이므로 작동하지 않을 수 있음
    # 대신 RPC나 직접 쿼리 사용
    pass

print("🗑️ 과거 데이터 삭제 중...\n")
print("삭제 대상:")
print("  ✅ 모든 sales 기록")
print("  ✅ kind != 'init'인 receipts")
print("  ✅ 모든 requests")
print("  🔒 157건의 초기재고(kind='init')는 보존")

shop = "chungcheong"

# Supabase 직접 접근 불가능하므로, Supabase 대시보드에서 수동으로 실행할 쿼리 제공
queries = [
    f"DELETE FROM pos_docs WHERE path LIKE 's/{shop}/sales/%'",
    f"DELETE FROM pos_docs WHERE path LIKE 's/{shop}/requests/%'",
    f"DELETE FROM pos_docs WHERE path LIKE 's/{shop}/receipts/%' AND CAST(data->>'kind' AS TEXT) != 'init'",
]

print("\n📋 Supabase 대시보드에서 실행할 SQL 쿼리:\n")
print("=" * 80)
for i, q in enumerate(queries, 1):
    print(f"{i}. {q}")
print("=" * 80)

print("\n🔗 Supabase 콘솔: https://supabase.com/dashboard/project/owykoqnhwmdhpadxipes/sql/new")
print("📌 위 쿼리를 SQL 에디터에 붙여넣고 실행하세요")
