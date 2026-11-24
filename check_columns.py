#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pandas as pd

files = [
    (r'C:\Users\hyoji\Downloads\261118_어반사이드_입고(26FW 더현대 충청 DP 재고 사무실 출고요청) _자사_005941892 (1).xlsx', '261118_입고', 0, 1),
    (r'C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고_테고2ea)_자사_842829718.xlsx', '261124_테고2ea', 5, 6),
    (r'C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고)_자사_836503789.xlsx', '261124_일반', 5, 6),
]

print("📊 Excel 파일 헤더 확인\n")

for filepath, name, header_row, data_start in files:
    df = pd.read_excel(filepath, header=None)

    print(f"{name}:")
    print(f"  헤더 행 ({header_row}): {list(df.iloc[header_row])[:8]}")  # 처음 8개만

    # 데이터 샘플
    print(f"  데이터 샘플 (첫 3행):")
    for i in range(data_start, min(data_start + 3, len(df))):
        row = df.iloc[i]
        print(f"    행{i}: {list(row)[:8]}")

    # 각 열의 데이터 타입 확인
    print(f"  출고수량 열 위치 찾기:")
    for col_idx, col_name in enumerate(df.iloc[header_row][:10]):
        if pd.notna(col_name):
            col_name_str = str(col_name).strip()
            if '수량' in col_name_str or '출고' in col_name_str:
                print(f"    [{col_idx}] {col_name_str}")

    print()
