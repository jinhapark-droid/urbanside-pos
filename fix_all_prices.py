#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import openpyxl
import json

sys.stdout.reconfigure(encoding='utf-8')

# 엑셀 파일 로드
file_path = r"C:\Users\hyoji\.claude\uploads\fbdd17c6-4be8-4934-af74-018fc52ccd3d\96c0f612-26.11_________.xlsx"
wb = openpyxl.load_workbook(file_path, data_only=True)
ws = wb.active

prices_dict = {}

for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):  # 헤더 스킵
    if len(row) < 12:
        continue

    product_name = row[3]  # D
    color = row[4]  # E
    normal = row[10]  # K
    discount = row[11]  # L

    if not product_name or product_name.startswith('='):
        continue

    try:
        normal_price = int(str(normal).replace(',', '')) if normal else 0
        discount_price = int(str(discount).replace(',', '')) if discount else 0
    except:
        normal_price = 0
        discount_price = 0

    if normal_price == 0:
        continue

    # 상품명 + 컬러로 키 만들기
    if color:
        full_name = f"[26FW] {product_name} {color}"
    else:
        full_name = f"[26FW] {product_name}"

    prices_dict[full_name] = {
        "normal": normal_price,
        "discount": discount_price
    }

# 테고 추가 (엑셀에 없으니 기존 가격 유지)
prices_dict["어반사이드 테고 1.5P (솔리드 이너텐트 포함) (티타늄 블루)"] = {
    "normal": 590000,
    "discount": 540000
}

# JSON 출력
print(json.dumps(prices_dict, ensure_ascii=False, indent=2))

# 파일로도 저장
with open('prices_corrected.json', 'w', encoding='utf-8') as f:
    json.dump(prices_dict, f, ensure_ascii=False, indent=2)

print("\n✅ prices_corrected.json 생성 완료", file=sys.stderr)
