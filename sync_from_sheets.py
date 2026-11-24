#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Google Sheets에서 초기재고 데이터를 JSON으로 변환하여 저장
"""
import gspread
import json

# Google Sheets 연결
gc = gspread.oauth(
    scopes=['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'],
    credentials_filename=r'C:\Users\hyoji\.gspread\jh_oauth_client.json',
    authorized_user_filename=r'C:\Users\hyoji\.gspread\jh_authorized_user.json'
)

# 초기재고 시트 열기
sheet = gc.open_by_key('1mMSqaT1S-wt9HH1t6vXYScCBud4K5l3q9Kg06d69f4A')
ws = sheet.worksheet('초기재고')
data = ws.get_all_values()

# 가격표 가져오기
price_sheet = gc.open_by_key('1elpoQQ3CW4aNpcZfFJbu8q3ShUGKhNoZT2p3dGw4MFA')
price_ws = price_sheet.worksheet('[국내_온라인] 어패럴_PriceTable')
price_data = price_ws.get_all_values()

# 가격 맵 생성
price_map = {}
for row in price_data[2:]:
    if len(row) > 11:
        name = row[3].strip() if len(row) > 3 else ""
        price_str = row[11] if len(row) > 11 else "0"
        try:
            price = int(float(price_str.replace(",", "")))
            if name:
                price_map[name] = price
        except:
            pass

# 초기재고 JSON 생성
init_stock = {}
for row in data[1:]:  # 헤더 제외
    if len(row) >= 2:
        name = row[0].strip()
        qty_str = row[1].strip()
        try:
            qty = int(float(qty_str))
            if name and qty > 0:
                price = price_map.get(name, 0)
                if name not in init_stock:
                    init_stock[name] = {"qty": 0, "price": price}
                init_stock[name]["qty"] += qty
        except:
            pass

# stock.json 저장 (클라이언트가 사용할 형식)
stock_json = {}
for name, data in init_stock.items():
    stock_json[name] = data["price"]  # 가격만 저장 (클라이언트는 CSV에서 qty를 가져옴)

with open('data/stock.json', 'w', encoding='utf-8') as f:
    json.dump(stock_json, f, ensure_ascii=False, indent=2)

# stock.csv도 저장
with open('data/stock.csv', 'w', encoding='utf-8') as f:
    f.write('상품명,수량\n')
    for name, data in init_stock.items():
        f.write(f'{name},{data["qty"]}\n')

print(f"✅ {len(init_stock)}개 상품 동기화 완료")
print(f"  - data/stock.csv: {sum(d['qty'] for d in init_stock.values())}개 수량")
print(f"  - data/stock.json: 가격 정보")
