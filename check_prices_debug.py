#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

import gspread

gc = gspread.oauth(
    scopes=['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    credentials_filename=r'C:\Users\hyoji\.gspread\jh_oauth_client.json',
    authorized_user_filename=r'C:\Users\hyoji\.gspread\jh_authorized_user.json'
)

sheet = gc.open_by_key('1elpoQQ3CW4aNpcZfFJbu8q3ShUGKhNoZT2p3dGw4MFA')
ws = sheet.worksheet('[국내_온라인] 어패럴_PriceTable')
values = ws.get_all_values()

# 헤더 행 찾기
header_row_idx = 2  # Row 3 (index 2)
headers = values[header_row_idx]

print("헤더 행 (Row 3):")
for i, h in enumerate(headers):
    print(f"  {chr(65+i)}({i}): {h}")

print("\n" + "="*70)

# 에일러론 울트라 1000 SUL 7D 후드 다운 재킷 찾기
target_name = "에일러론 울트라 1000 SUL 7D 후드 다운 재킷"

print(f"\n검색: {target_name}\n")

for row_idx, row in enumerate(values[3:], 3):  # Row 4부터
    if len(row) > 3 and target_name in str(row[3]):
        print(f"Row {row_idx}: {row[3]}")
        for i in range(len(row)):
            col_letter = chr(65 + i)
            print(f"  {col_letter}({i}): {row[i] if i < len(row) else ''}")
        print()

# 바라클라바도 확인
print("="*70)
target_name2 = "바라클라바"
print(f"\n검색: {target_name2}\n")

for row_idx, row in enumerate(values[3:], 3):
    if len(row) > 3 and target_name2 in str(row[3]):
        print(f"Row {row_idx}: {row[3]}")
        for i in range(len(row)):
            col_letter = chr(65 + i)
            print(f"  {col_letter}({i}): {row[i] if i < len(row) else ''}")
        print()
