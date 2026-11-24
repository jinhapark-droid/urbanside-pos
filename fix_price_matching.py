#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
stock.csv의 상품명과 price.json의 상품명 매칭 개선
부분 일치를 사용해서 가격을 더 정확하게 매칭
"""
import json
import csv

# price.json 로드
with open('data/price.json', 'r', encoding='utf-8') as f:
    price_data = json.load(f)

# stock.csv의 고유 상품명 추출
unique_products = set()
with open('data/stock.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row.get('상품명'):
            unique_products.add(row['상품명'].strip())

print(f"stock.csv 고유 상품: {len(unique_products)}개")
print(f"price.json 상품: {len(price_data)}개\n")

# 정확한 매칭 찾기
exact_matches = {}
price_keys = list(price_data.keys())

for product in sorted(unique_products):
    # 먼저 정확한 일치 찾기
    if product in price_data:
        exact_matches[product] = price_data[product]
        continue

    # 부분 일치 찾기
    matches = []
    for price_key in price_keys:
        if product.lower() in price_key.lower() or price_key.lower() in product.lower():
            matches.append((price_key, price_data[price_key]))

    if len(matches) == 1:
        exact_matches[product] = matches[0][1]
    elif len(matches) > 1:
        # 가장 짧은 키(가장 정확한 매칭)를 선택
        shortest = min(matches, key=lambda x: len(x[0]))
        exact_matches[product] = shortest[1]
        if len(matches) > 1:
            print(f"⚠️ '{product}' - 복수 매칭: {[m[0] for m in matches[:2]]}...")
    else:
        print(f"❌ '{product}' - 매칭 없음")

print(f"\n✅ 매칭된 상품: {len(exact_matches)}개")
print(f"❌ 매칭 실패: {len(unique_products) - len(exact_matches)}개")

# 개선된 price.json 저장
with open('data/price_fixed.json', 'w', encoding='utf-8') as f:
    json.dump(exact_matches, f, ensure_ascii=False, indent=2)

print(f"\n📁 data/price_fixed.json 저장 완료")
