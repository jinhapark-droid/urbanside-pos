#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pandas as pd
import gspread
import json
from datetime import datetime

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

print("📊 사용 가능한 탭:")
for ws in sheet.worksheets():
    print(f"  - {ws.title}")

promo_tab = sheet.worksheet('[국내_온라인] 어패럴_PriceTable')
promo_data = promo_tab.get_all_values()

# 첫 10행 확인 (헤더 위치 파악)
print(f"\n📋 첫 10행 확인:")
for row_idx in range(min(10, len(promo_data))):
    row = promo_data[row_idx]
    # 행이 비어있지 않은지 확인
    has_content = any(str(cell).strip() for cell in row[:15])
    if has_content:
        print(f"  행{row_idx}: ", end="")
        for i in range(min(15, len(row))):
            if row[i]:
                print(f"{row[i][:15]}|", end="")
        print()

# 상품명 → 가격 매핑 (D열: 상품명, L열: 판매가 = 26.11 프로모션 할인가)
price_map = {}
for row in promo_data[2:]:  # 행2가 헤더, 행3부터 데이터
    if len(row) > 11:  # L열(인덱스 11)까지 필요
        name = row[3].strip() if len(row) > 3 and row[3] else ""  # D열 (인덱스 3): 상품명
        price_str = row[11] if len(row) > 11 and row[11] else "0"  # L열 (인덱스 11): 26.11 할인가
        try:
            # 쉼표 제거 후 정수로 변환
            price = int(float(price_str.replace(",", "")))
            if name:
                price_map[name] = price
        except (ValueError, TypeError):
            pass

print(f"\n검색: 메리노, 에일러론 포함 상품:")
for name, price in price_map.items():
    if "메리노" in name or "에일러론" in name:
        print(f"  '{name}' → {price}원")

print(f"✅ Google Sheets에서 {len(price_map)}개 상품 가격 로드됨")
print("\n📌 로드된 상품명 샘플:")
for name, price in list(price_map.items())[:10]:
    print(f"  '{name}' → {price}원")

# Excel 파일들
files = [
    (r"C:\Users\hyoji\Downloads\261118_어반사이드_입고(26FW 더현대 충청 DP 재고 사무실 출고요청) _자사_005941892 (1).xlsx", "입고"),
    (r"C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고_테고2ea)_자사_842829718.xlsx", "입고"),
    (r"C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고)_자사_836503789.xlsx", "입고"),
]

receipts = []
unmatched = []

for filepath, receipt_type in files:
    try:
        df = pd.read_excel(filepath, header=None)
        filename = filepath.split("\\")[-1][:40]
        print(f"\n📄 {filename}")

        # 파일 타입별로 헤더 위치 결정
        if "261118" in filepath:
            header_row = 0  # 첫 번째 행이 헤더
            data_start = 1
        else:
            header_row = 5  # 6번째 행이 헤더
            data_start = 6

        # 데이터 추출
        for idx in range(data_start, len(df)):
            row = df.iloc[idx]
            if pd.isna(row[0]) or str(row[0]).strip() == "합계":
                break

            try:
                product_name = str(row[2]).strip() if len(row) > 2 and pd.notna(row[2]) else ""
                # 261118은 row[4], 261124는 row[6]
                if "261118" in filepath:
                    qty = row[4] if len(row) > 4 and pd.notna(row[4]) else 0
                else:
                    qty = row[6] if len(row) > 6 and pd.notna(row[6]) else 0
                qty = int(float(qty))

                if not product_name or qty == 0:
                    continue

                # 프리픽스 제거 (예: "[26FW] " → "")
                if "] " in product_name:
                    product_name = product_name.split("] ", 1)[1]

                # 색상 정보 제거 (뒤의 색상명들: 차콜, 브라운, 블랙, 화이트, 그레이, 등)
                # Google Sheets와 매칭하기 위해 색상을 제거
                colors = ["차콜", "브라운", "블랙", "화이트", "그레이", "네이비", "카키", "올리브", "베이지",
                         "다크 그레이", "라이트 그레이", "인디고", "컬러명"]
                for color in colors:
                    if product_name.endswith(" " + color):
                        product_name = product_name[:-len(" " + color)]
                        break

                # 가격 조회
                base_price = price_map.get(product_name, 0)

                # 정확한 매칭이 없으면, 부분 매칭 시도
                if base_price == 0:
                    for sheet_name, sheet_price in price_map.items():
                        if product_name in sheet_name or sheet_name in product_name:
                            base_price = sheet_price
                            break

                # 매칭 실패한 항목 기록
                if base_price == 0:
                    unmatched.append((product_name, qty))

                # 추가 할인은 POS에서 처리 → Google Sheets 가격을 그대로 사용
                final_price = base_price

                receipt_data = {
                    "kind": "init",  # 초기재고
                    "label": f"26FW_초기재고",
                    "ts": datetime.now().isoformat(),
                    "by": "system",
                    "items": [
                        {
                            "bc": product_name,
                            "name": product_name,
                            "qty": qty,
                            "unit": final_price
                        }
                    ]
                }

                receipts.append(receipt_data)
                if len(receipts) <= 3:
                    print(f"   {product_name}: {qty}개 @ {final_price}원")
            except Exception as e:
                pass
    except Exception as e:
        print(f"❌ {filename} 오류: {e}")

print(f"\n✅ 총 {len(receipts)}건 입고 데이터 준비됨")

if unmatched:
    print(f"\n⚠️ 매칭 실패한 상품: {len(unmatched)}건")
    for product_name, qty in unmatched[:20]:
        print(f"  - {product_name}: {qty}개")
    if len(unmatched) > 20:
        print(f"  ... 외 {len(unmatched) - 20}건")

# 저장
with open("receipts_init.json", "w", encoding="utf-8") as f:
    json.dump(receipts, f, ensure_ascii=False, indent=2)
print("📁 receipts_init.json 저장됨")
