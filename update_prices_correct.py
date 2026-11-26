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

        # 색상 제거 (여러 방식 시도)
        base_name = name.replace('[26FW] ', '').replace('[26FW]', '').strip()

        # 정확한 색상명으로 제거
        base_name_no_color = base_name.replace(f' {color}', '').strip()

        # 마지막 단어 제거 (일반적인 색상)
        words = base_name.split()
        base_name_last_removed = ' '.join(words[:-1]) if len(words) > 1 else base_name

        # 가격 찾기 (여러 조합 시도)
        normal_price = 0
        discount_price = 0

        # 먼저 정확한 상품명으로 찾기
        if name in price_map:
            normal_price, discount_price = price_map[name]
        # 색상을 정확히 제거한 버전
        elif base_name_no_color in price_map:
            normal_price, discount_price = price_map[base_name_no_color]
        # 마지막 단어 제거 (일반적인 색상)
        elif base_name_last_removed in price_map:
            normal_price, discount_price = price_map[base_name_last_removed]
        # 기본 이름
        elif base_name in price_map:
            normal_price, discount_price = price_map[base_name]

        # 가격을 찾지 못했으면 색상 없는 기본 버전의 가격 사용
        if normal_price == 0:
            # 색상이 없는 상품명으로 다시 시도 (최대한 느슨한 매칭)
            if base_name_last_removed in price_map:
                normal_price, discount_price = price_map[base_name_last_removed]

        # 그래도 없으면 가장 가까운 상품의 가격 사용 (같은 카테고리)
        if normal_price == 0:
            for key, (n, d) in price_map.items():
                # 상품명의 처음 2-3 단어가 같으면 같은 상품으로 간주
                key_words = key.split()[:3]
                name_words = base_name.split()[:3]
                if key_words == name_words and n > 0:
                    normal_price, discount_price = n, d
                    break

        if normal_price > 0:
            final_prices[name] = {"normal": normal_price, "discount": discount_price}

# 기본 가격맵에서 없는 항목들도 추가
for name, (normal, discount) in price_map.items():
    if name not in final_prices:
        final_prices[name] = {"normal": normal, "discount": discount}

# 색상이 없는 버전도 추가 (stock.csv의 색상 제거 매칭용)
colorless_map = {}
for name, prices in final_prices.items():
    # "[26FW] " 제거 후 색상 제거
    base = name.replace('[26FW] ', '').replace('[26FW]', '').strip()

    # 마지막 단어가 색상일 가능성 높으므로 제거
    words = base.split()
    if len(words) > 1:
        # 마지막 단어 제거 (색상명)
        colorless = ' '.join(words[:-1])
        if colorless not in colorless_map:
            colorless_map[colorless] = prices

# colorless_map을 final_prices에 추가
for name, prices in colorless_map.items():
    if name not in final_prices:
        final_prices[name] = prices

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
