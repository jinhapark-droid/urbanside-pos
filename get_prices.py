#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import gspread
import json

# UTF-8 encoding 설정
sys.stdout.reconfigure(encoding='utf-8')

gc = gspread.oauth(
    scopes=['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'],
    credentials_filename='C:\\Users\\hyoji\\.gspread\\jh_oauth_client.json',
    authorized_user_filename='C:\\Users\\hyoji\\.gspread\\jh_authorized_user.json'
)

sheet = gc.open_by_key("1elpoQQ3CW4aNpcZfFJbu8q3ShUGKhNoZT2p3dGw4MFA")
ws = sheet.worksheet("[국내_온라인] 어패럴_PriceTable")

all_rows = ws.get_all_values()

print("=" * 120)
print("7D Hoodie & Shell Hoodie Jacket Prices (D-L columns)")
print("=" * 120)

prices_dict = {}

for i, row in enumerate(all_rows[1:], start=2):
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

    prices_dict[product_name] = {"normal": normal_price, "discount": discount_price}

    if '7D' in product_name or 'Shell' in product_name or '쉘' in product_name:
        print(f"\nRow {i}: {product_name}")
        print(f"        Color: {color}")
        print(f"        Normal: {normal_price:,} | Discount: {discount_price:,}")

print("\n" + "=" * 120)
with open('prices_from_sheets.json', 'w', encoding='utf-8') as f:
    json.dump(prices_dict, f, ensure_ascii=False, indent=2)

print("Export complete!")
