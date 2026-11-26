#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
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

# 가격표 시트 열기 (gid=0)
price_sheet = gc.open_by_key('1elpoQQ3CW4aNpcZfFJbu8q3ShUGKhNoZT2p3dGw4MFA')
price_ws = price_sheet.worksheet('[국내_온라인] 어패럴_PriceTable')
price_data = price_ws.get_all_values()

# 가격 맵 생성 (H="26.11 블프"인 항목만, K=정상가, L=할인가)
# 열 인덱스: 0-A, 1-B, 2-C, 3-D, 4-E, 5-F, 6-G, 7-H, 8-I, 9-J, 10-K, 11-L
price_map = {}  # {상품명: (정상가, 할인가)}

for i, row in enumerate(price_data[2:], start=3):  # 헤더 2줄 제외
    if len(row) > 11:
        promo = row[7].strip() if len(row) > 7 else ""  # H열 (인덱스 7)

        # "26.11 블프"만 처리
        if "26.11" in promo and "블프" in promo:
            name = row[3].strip() if len(row) > 3 else ""  # D열 상품명
            normal_price_str = row[10] if len(row) > 10 else "0"  # K열 정상가
            discount_price_str = row[11] if len(row) > 11 else "0"  # L열 할인가

            try:
                normal_price = int(float(normal_price_str.replace(",", "").strip()))
                discount_price = int(float(discount_price_str.replace(",", "").strip()))

                if name and normal_price > 0:
                    price_map[name] = (normal_price, discount_price)
            except:
                pass

print(f"가격표에서 로드: {len(price_map)}개 상품 (26.11 블프)")

# stock.csv 처리해서 최종 가격표 생성
final_prices = {}  # {상품명: {"normal": 정상가, "discount": 할인가}}

with open('data/stock.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        name = row['상품명']
        color = row['색상']

        # 색상 제거
        base_name = name.replace('[26FW] ', '').strip()
        base_name_no_color = base_name.replace(f' {color}', '').strip()

        # 가격 찾기
        normal_price = 0
        discount_price = 0

        if base_name_no_color in price_map:
            normal_price, discount_price = price_map[base_name_no_color]
        elif base_name in price_map:
            normal_price, discount_price = price_map[base_name]
        elif name in price_map:
            normal_price, discount_price = price_map[name]

        if normal_price > 0:
            final_prices[name] = {"normal": normal_price, "discount": discount_price}

# 기본 가격맵에서 없는 항목들도 추가
for name, (normal, discount) in price_map.items():
    if name not in final_prices:
        final_prices[name] = {"normal": normal, "discount": discount}

# stock.csv 항목용 단순 가격 JSON도 생성 (app.js 호환성)
simple_prices = {}
for name, prices in final_prices.items():
    simple_prices[name] = prices["normal"]  # 기본으로 정상가 사용

# 저장
with open('data/price.json', 'w', encoding='utf-8') as f:
    json.dump(simple_prices, f, ensure_ascii=False, indent=2)

with open('data/prices_full.json', 'w', encoding='utf-8') as f:
    json.dump(final_prices, f, ensure_ascii=False, indent=2)

print(f"가격 매칭 완료: {len(final_prices)}개 상품")
print(f"  - price.json (정상가): {len(simple_prices)}개")
print(f"  - prices_full.json (정상가+할인가): {len(final_prices)}개")

# 메리노 확인
merino = {k: v for k, v in final_prices.items() if '메리노' in k}
print(f"\n메리노 상품: {len(merino)}개")
for name, prices in list(merino.items())[:3]:
    print(f"  {name}")
    print(f"    정상가: {prices['normal']:,}원, 할인가: {prices['discount']:,}원")
