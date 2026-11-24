#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pandas as pd

files = [
    (r'C:\Users\hyoji\Downloads\261118_어반사이드_입고(26FW 더현대 충청 DP 재고 사무실 출고요청) _자사_005941892 (1).xlsx', '261118_입고', 0, 1, 4),  # 헤더 행0, 데이터 행1~, 수량 열4
    (r'C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고_테고2ea)_자사_842829718.xlsx', '261124_테고2ea (0587)', 5, 6, 6),  # 헤더 행5, 데이터 행6~, 수량 열6
    (r'C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고)_자사_836503789.xlsx', '261124_일반 (테고2)', 5, 6, 6),  # 헤더 행5, 데이터 행6~, 수량 열6
]

total_qty = 0

print("📊 엑셀 3개 파일 실제 수량 검증\n")
print("=" * 60)

for filepath, name, header_row, data_start, qty_col in files:
    df = pd.read_excel(filepath, header=None)

    file_qty = 0

    print(f"\n📄 {name}:")
    print(f"   헤더 행: {df.iloc[header_row].tolist()[:8]}")

    for idx in range(data_start, len(df)):
        row = df.iloc[idx]

        # 첫 번째 열 확인
        if pd.isna(row[0]) or str(row[0]).strip() == "합계":
            break

        # 상품명과 수량 확인
        product_name = str(row[2]).strip() if len(row) > 2 and pd.notna(row[2]) else ""
        qty = row[qty_col] if len(row) > qty_col and pd.notna(row[qty_col]) else 0

        try:
            qty = int(float(qty))
        except:
            qty = 0

        if product_name and qty > 0:
            file_qty += qty

    print(f"   총 수량: {file_qty}개")
    total_qty += file_qty
    print(f"   첫 3행:")
    for idx in range(data_start, min(data_start + 3, len(df))):
        row = df.iloc[idx]
        product = str(row[2]).strip() if len(row) > 2 else "N/A"
        qty = row[qty_col] if len(row) > qty_col else 0
        print(f"      행{idx}: {product} - {int(float(qty)) if pd.notna(qty) else 0}개")

print("\n" + "=" * 60)
print(f"🎯 총 수량 합계: {total_qty}개")
print(f"✅ 사용자 말: 225개")
print(f"{'✓ 일치!' if total_qty == 225 else '✗ 불일치'}")
