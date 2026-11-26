#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import os
sys.stdout.reconfigure(encoding='utf-8')

import gspread
import json
import csv

# Google Sheets 연결
gc = gspread.oauth(
    scopes=['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'],
    credentials_filename=r'C:\Users\hyoji\.gspread\jh_oauth_client.json',
    authorized_user_filename=r'C:\Users\hyoji\.gspread\jh_authorized_user.json'
)

# 가격표 시트 열기
price_sheet = gc.open_by_key('1elpoQQ3CW4aNpcZfFJbu8q3ShUGKhNoZT2p3dGw4MFA')
price_ws = price_sheet.worksheet('[국내_온라인] 어패럴_PriceTable')
price_data = price_ws.get_all_values()

# 가격 맵 생성 (4열=상품명, 12열=가격)
price_map = {}
for i, row in enumerate(price_data[2:], start=3):  # 헤더 2줄 제외
    if len(row) > 11:
        name = row[3].strip() if len(row) > 3 else ""
        price_str = row[11] if len(row) > 11 else "0"
        try:
            price = int(float(price_str.replace(",", "").strip()))
            if name and price > 0:
                price_map[name] = price
        except:
            pass

# stock.csv 처리해서 최종 가격표 생성
final_prices = dict(price_map)  # 기본 가격 복사

with open('data/stock.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        name = row['상품명']
        color = row['색상']

        # 색상 제거
        base_name = name.replace('[26FW] ', '').strip()
        base_name_no_color = base_name.replace(f' {color}', '').strip()

        # 가격 찾기
        price = 0
        if base_name_no_color in price_map:
            price = price_map[base_name_no_color]
        elif base_name in price_map:
            price = price_map[base_name]
        elif name in price_map:
            price = price_map[name]

        if price > 0:
            final_prices[name] = price

# 저장
with open('data/price.json', 'w', encoding='utf-8') as f:
    json.dump(final_prices, f, ensure_ascii=False, indent=2)

print(f"✅ Google Sheets 가격표 로드 완료: {len(final_prices)}개 항목")

# 메리노 가격 확인
merino_prices = {k: v for k, v in final_prices.items() if '메리노' in k}
print(f"메리노 상품: {len(merino_prices)}개")
for name, price in list(merino_prices.items())[:3]:
    print(f"  {name}: {price:,}원")
