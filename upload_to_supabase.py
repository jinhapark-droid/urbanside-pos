#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import uuid
from supabase import create_client, Client

# Supabase 연결 (app.js에서 가져온 정보)
url = "https://owykoqnhwmdhpadxipes.supabase.co"
key = "sb_publishable_Pgf79543Sk1FvB_PtWK5PA_2U9jlGbD"

supabase: Client = create_client(url, key)

# 초기 재고 데이터 로드
with open("receipts_init.json", "r", encoding="utf-8") as f:
    receipts = json.load(f)

print(f"📊 Supabase에 업로드할 데이터: {len(receipts)}건\n")
shop = "chungcheong"  # 더현대 충청

# 기존 "init" 종류 데이터 삭제
print("🗑️ 기존 초기 재고 데이터 삭제 중...")
try:
    # pos_docs 테이블에서 경로 기반으로 삭제
    table = supabase.table("pos_docs")
    # s/chungcheong/receipts 경로의 모든 "init" 종류 doc 삭제
    result = table.select("path", "data").ilike("path", f"s/{shop}/receipts/%").execute()

    for item in result.data:
        if isinstance(item.get("data"), dict) and item["data"].get("kind") == "init":
            table.delete().eq("path", item["path"]).execute()

    print("✅ 삭제 완료\n")
except Exception as e:
    print(f"⚠️ 삭제 중 오류 (무시 가능): {e}\n")

# 새 데이터 삽입
print("📤 새 데이터 업로드 중...")
try:
    for i, receipt in enumerate(receipts):
        doc_id = str(uuid.uuid4())
        path = f"s/{shop}/receipts/{doc_id}"

        supabase.table("pos_docs").insert({
            "path": path,
            "data": receipt
        }).execute()

        if (i + 1) % 10 == 0 or i == len(receipts) - 1:
            print(f"  {i + 1}/{len(receipts)} 완료")

    print(f"\n✅ 총 {len(receipts)}건 업로드 완료!")
    print("🎉 POS에서 재고를 확인하세요")
except Exception as e:
    print(f"❌ 업로드 오류: {e}")
    exit(1)
