#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pandas as pd

files = [
    (r'C:\Users\hyoji\Downloads\261118_어반사이드_입고(26FW 더현대 충청 DP 재고 사무실 출고요청) _자사_005941892 (1).xlsx', '261118_입고', 1),
    (r'C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고_테고2ea)_자사_842829718.xlsx', '261124_테고2ea', 6),
    (r'C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고)_자사_836503789.xlsx', '261124_일반', 6),
]

total_processed = 0

print("📊 상세 검증\n")

for filepath, name, data_start in files:
    df = pd.read_excel(filepath, header=None)

    total_rows = len(df)
    print(f"{name}:")
    print(f"  전체 행: {total_rows}개")

    # 실제 처리된 행 세기
    processed = 0
    skipped = 0
    empty_names = 0
    zero_qty = 0

    for idx in range(data_start, len(df)):
        row = df.iloc[idx]

        # 첫 번째 열 확인
        if pd.isna(row[0]) or str(row[0]).strip() == "합계":
            skipped += 1
            continue

        # 상품명과 수량 확인
        product_name = str(row[2]).strip() if len(row) > 2 and pd.notna(row[2]) else ""
        qty = row[4] if len(row) > 4 and pd.notna(row[4]) else 0
        try:
            qty = int(float(qty))
        except:
            qty = 0

        if not product_name:
            empty_names += 1
        elif qty == 0:
            zero_qty += 1
        else:
            processed += 1

    print(f"  처리됨: {processed}개")
    print(f"  건너뜀 (합계/빈칸): {skipped}개")
    print(f"  상품명 없음: {empty_names}개")
    print(f"  수량 0: {zero_qty}개\n")

    total_processed += processed

print(f"총 처리된 항목: {total_processed}개")
print(f"업로드된 데이터: 55건")
print(f"일치: {'✅ 맞음' if total_processed == 55 else f'❌ 불일치'}")
