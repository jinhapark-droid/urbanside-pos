#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
225개 모든 초기재고 업로드 (가격 없어도)
"""
import pandas as pd
import gspread
import json
import requests
from datetime import datetime
import uuid

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

print("📊 225개 초기재고 추출 중...\n")

# Google Sheets 접근
gc = gspread.oauth(
    scopes=[
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly'
    ],
    credentials_filename=r'C:\Users\hyoji\.gspread\jh_oauth_client.json',
    authorized_user_filename=r'C:\Users\hyoji\.gspread\jh_authorized_user.json'
)

sheet = gc.open_by_key('1elpoQQ3CW4aNpcZfFJbu8q3ShUGKhNoZT2p3dGw4MFA')
promo_tab = sheet.worksheet('[국내_온라인] 어패럴_PriceTable')
promo_data = promo_tab.get_all_values()

# 상품명 → 가격 매핑
price_map = {}
for row in promo_data[2:]:
    if len(row) > 11:
        name = row[3].strip() if len(row) > 3 and row[3] else ""
        price_str = row[11] if len(row) > 11 and row[11] else "0"
        try:
            price = int(float(price_str.replace(",", "")))
            if name:
                price_map[name] = price
        except (ValueError, TypeError):
            pass

# 엑셀 파일 처리
files = [
    (r"C:\Users\hyoji\Downloads\261118_어반사이드_입고(26FW 더현대 충청 DP 재고 사무실 출고요청) _자사_005941892 (1).xlsx", 0, 1, 4),
    (r"C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고_테고2ea)_자사_842829718.xlsx", 5, 6, 6),
    (r"C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고)_자사_836503789.xlsx", 5, 6, 6),
]

receipts = []
total_qty = 0

for filepath, header_row, data_start, qty_col in files:
    df = pd.read_excel(filepath, header=None)
    filename = filepath.split("\\")[-1][:40]

    for idx in range(data_start, len(df)):
        row = df.iloc[idx]

        if pd.isna(row[0]) or str(row[0]).strip() == "합계":
            break

        product_name = str(row[2]).strip() if len(row) > 2 and pd.notna(row[2]) else ""
        qty = row[qty_col] if len(row) > qty_col and pd.notna(row[qty_col]) else 0
        try:
            qty = int(float(qty))
        except:
            qty = 0

        if not product_name or qty == 0:
            continue

        # 프리픽스 제거
        if "] " in product_name:
            product_name = product_name.split("] ", 1)[1]

        # 색상 제거
        colors = ["차콜", "브라운", "블랙", "화이트", "그레이", "네이비", "카키", "올리브", "베이지",
                 "다크 그레이", "라이트 그레이", "인디고"]
        for color in colors:
            if product_name.endswith(" " + color):
                product_name = product_name[:-len(" " + color)]
                break

        # 가격 조회
        base_price = price_map.get(product_name, 0)
        if base_price == 0:
            for sheet_name, sheet_price in price_map.items():
                if product_name in sheet_name or sheet_name in product_name:
                    base_price = sheet_price
                    break

        # 가격이 없어도 모두 업로드! (225개 전부)
        receipt_data = {
            "kind": "init",
            "label": "26FW_초기재고",
            "ts": datetime.now().isoformat(),
            "by": "system",
            "items": [{"bc": product_name, "name": product_name, "qty": qty, "unit": base_price}]
        }

        receipts.append(receipt_data)
        total_qty += qty

print(f"✅ 총 {len(receipts)}건 초기재고 추출 완료 ({total_qty}개 수량)\n")

# 업로드
print("📤 Supabase 업로드 중...\n")

shop = "chungcheong"
uploaded = 0
failed = 0

for i, receipt in enumerate(receipts, 1):
    try:
        path = f"s/{shop}/receipts/{uuid.uuid4()}"
        rpc_call("pos_put", {
            "p_data": receipt,
            "p_merge": False,
            "p_path": path,
            "p_pin": PIN
        })
        uploaded += 1
        if uploaded % 50 == 0:
            print(f"  {uploaded}/{len(receipts)} 완료")
    except Exception as e:
        failed += 1
        if failed <= 3:
            print(f"  ❌ {receipt['items'][0]['name']}: {e}")

print(f"\n✅ 총 {uploaded}건 업로드 완료! 🎉")
print(f"⚠️ 실패: {failed}건")
print(f"🎯 최종 재고: {total_qty}개 (225개 목표)")
