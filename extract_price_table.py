#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import gspread
import json

# Google Sheets 접근
gc = gspread.oauth(
    scopes=[
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly'
    ],
    credentials_filename=r'C:\Users\hyoji\.gspread\jh_oauth_client.json',
    authorized_user_filename=r'C:\Users\hyoji\.gspread\jh_authorized_user.json'
)

# 프로모션 시트 열기
sheet = gc.open_by_key('1elpoQQ3CW4aNpcZfFJbu8q3ShUGKhNoZT2p3dGw4MFA')
promo_tab = sheet.worksheet('[국내_온라인] 어패럴_PriceTable')
promo_data = promo_tab.get_all_values()

# 상품 가격표 추출 (D열: 상품명, K열: 정가, L열: 블프 할인가)
price_table = []
for row in promo_data[2:]:  # 행2가 헤더, 행3부터 데이터
    if len(row) > 11:
        name = row[3].strip() if len(row) > 3 and row[3] else ""
        normal_str = row[10] if len(row) > 10 and row[10] else "0"  # K열 (인덱스 10)
        promo_str = row[11] if len(row) > 11 and row[11] else "0"   # L열 (인덱스 11)

        try:
            normal_price = int(float(normal_str.replace(",", "")))
            promo_price = int(float(promo_str.replace(",", "")))

            if name and normal_price > 0 and promo_price > 0:
                # 중복 제거 (이미 있으면 건너뜀)
                if not any(p["name"] == name for p in price_table):
                    discount_rate = round((1 - promo_price / normal_price) * 100)
                    price_table.append({
                        "name": name,
                        "normalPrice": normal_price,
                        "promoPrice": promo_price,
                        "discountRate": discount_rate
                    })
        except (ValueError, TypeError):
            pass

# 상품명으로 정렬
price_table.sort(key=lambda x: x["name"])

print(f"✅ 추출된 상품: {len(price_table)}개\n")
print("샘플:")
for item in price_table[:5]:
    print(f"  {item['name']}: {item['normalPrice']:,}원 → {item['promoPrice']:,}원 ({item['discountRate']}% 할인)")

# JSON으로 저장
with open("price_table.json", "w", encoding="utf-8") as f:
    json.dump(price_table, f, ensure_ascii=False, indent=2)

print(f"\n📁 price_table.json 저장됨 ({len(price_table)}개 상품)")
