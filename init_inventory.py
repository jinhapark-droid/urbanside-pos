#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pandas as pd
import json

# Excel 파일들
files = [
    r"C:\Users\hyoji\Downloads\261118_어반사이드_입고(26FW 더현대 충청 DP 재고 사무실 출고요청) _자사_005941892 (1).xlsx",
    r"C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고)_자사_836503789.xls",
    r"C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고_테고2ea)_자사_842829718.xls",
]

inventory = {}

for file_path in files:
    try:
        engine = "openpyxl" if file_path.endswith(".xlsx") else "xlrd"
        df = pd.read_excel(file_path, sheet_name=0, header=None, engine=engine)
        filename = file_path.split("\\")[-1]
        print(f"\n📄 {filename}")
        print(f"   크기: {df.shape[0]}행 × {df.shape[1]}열")

        for idx, row in df.iloc[1:].iterrows():
            if pd.isna(row[0]) or str(row[0]).strip() == "":
                continue

            code = str(row[0]).strip()
            qty = row[2] if len(row) > 2 else 0

            if code and pd.notna(qty):
                try:
                    qty = int(float(qty))
                    if code not in inventory:
                        inventory[code] = 0
                    inventory[code] += qty
                    if idx < 3:
                        print(f"   {code}: +{qty}")
                except (ValueError, TypeError):
                    pass
    except Exception as e:
        print(f"❌ {filename} 오류: {e}")

print(f"\n✅ 총 {len(inventory)}개 상품 처리됨")
if inventory:
    items = list(inventory.items())[:3]
    for code, qty in items:
        print(f"   {code}: {qty}개")

with open("inventory.json", "w", encoding="utf-8") as f:
    json.dump(inventory, f, ensure_ascii=False, indent=2)
print("\n📁 inventory.json 저장됨")
