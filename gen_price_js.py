#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json

with open("price_table.json", "r", encoding="utf-8") as f:
    price_table = json.load(f)

# JavaScript 배열 형식으로 출력
print("// price_table.json에서 생성된 가격 데이터 (75개 상품)")
print("const PRICE_DATA = [")
for item in price_table:
    print(f'  {{ name: "{item["name"]}", normalPrice: {item["normalPrice"]}, promoPrice: {item["promoPrice"]}, discountRate: {item["discountRate"]} }},')
print("];")

# 복사할 텍스트 준비
print("\n// viewPrice() 함수의 priceData를 다음으로 대체:")
print("const priceData = PRICE_DATA;")
