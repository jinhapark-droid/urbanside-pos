#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pandas as pd

files = [
    (r'C:\Users\hyoji\Downloads\261118_어반사이드_입고(26FW 더현대 충청 DP 재고 사무실 출고요청) _자사_005941892 (1).xlsx', '261118_입고'),
    (r'C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고_테고2ea)_자사_842829718.xlsx', '261124_테고2ea'),
    (r'C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고)_자사_836503789.xlsx', '261124_일반'),
]

total = 0
print("📊 Excel 파일 검증\n")

for filepath, name in files:
    try:
        df = pd.read_excel(filepath, header=None)

        # 파일별 데이터 행 수 확인
        if '261118' in filepath:
            # 헤더: 행0, 데이터: 행1~
            data_rows = df.iloc[1:].dropna(subset=[0])
            data_rows = data_rows[data_rows[0].astype(str).str.strip() != '합계']
        else:
            # 헤더: 행5, 데이터: 행6~
            data_rows = df.iloc[6:].dropna(subset=[0])
            data_rows = data_rows[data_rows[0].astype(str).str.strip() != '합계']

        count = len(data_rows)
        total += count
        print(f"{name}: {count}건")
    except Exception as e:
        print(f"{name}: 오류 - {e}")

print(f"\n총합: {total}건")
print(f"업로드된 데이터: 55건")
if total == 55:
    print("✅ 일치합니다!")
else:
    print(f"❌ 불일치 ({total}건 vs 55건)")
