#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

import gspread

# Google Sheets 연결
gc = gspread.oauth(
    scopes=['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    credentials_filename=r'C:\Users\hyoji\.gspread\jh_oauth_client.json',
    authorized_user_filename=r'C:\Users\hyoji\.gspread\jh_authorized_user.json'
)

# 스프레드시트 열기
sheet = gc.open_by_key('1elpoQQ3CW4aNpcZfFJbu8q3ShUGKhNoZT2p3dGw4MFA')

ws = sheet.worksheet('[국내_온라인] 어패럴_PriceTable')
values = ws.get_all_values()

print(f"총 {len(values)}개 행 로드됨\n")

# 데이터 구조 파악: 처음 5행 확인
print("첫 5행:")
for i, row in enumerate(values[:5]):
    print(f"  Row {i}: {row[:12]}")  # 처음 12개 열만

print("\n데이터 수집 중...")

# prices_full.json 로드
with open('data/prices_full.json', 'r', encoding='utf-8') as f:
    prices_full = json.load(f)

# 모든 행에서 가격 정보 추출
# Column 3: 상품명, Column 9: 정상가, Column 11: 할인가 (추정)
gs_prices = {}
for row_idx, row in enumerate(values[1:], 1):  # 헤더 제외
    if len(row) < 12:
        continue

    name = str(row[3]).strip() if len(row) > 3 else ""
    if not name or name.lower() == "상품명":
        continue

    # 여러 위치에서 가격 찾기
    normal_candidates = [row[9] if len(row) > 9 else "", row[10] if len(row) > 10 else ""]
    discount_candidates = [row[11] if len(row) > 11 else "", row[10] if len(row) > 10 else ""]

    normal = None
    discount = None

    for val in normal_candidates:
        try:
            if val:
                normal = int(str(val).replace(',', '').strip())
                break
        except:
            pass

    for val in discount_candidates:
        try:
            if val:
                discount = int(str(val).replace(',', '').strip())
                break
        except:
            pass

    if normal and discount and name not in gs_prices:
        gs_prices[name] = {'normal': normal, 'discount': discount}

print(f"✅ Google Sheets에서 {len(gs_prices)}개 상품 수집\n")

# 가격 매칭
mismatches = []
matched = 0

for gs_name, gs_prices_data in gs_prices.items():
    # 정확 매칭
    if gs_name in prices_full:
        pf = prices_full[gs_name]
        matched += 1

        if pf.get('normal') != gs_prices_data['normal']:
            mismatches.append({
                'name': gs_name,
                'type': '정상가',
                'gs': gs_prices_data['normal'],
                'pf': pf.get('normal')
            })

        if pf.get('discount') != gs_prices_data['discount']:
            mismatches.append({
                'name': gs_name,
                'type': '할인가',
                'gs': gs_prices_data['discount'],
                'pf': pf.get('discount')
            })

# 결과
print(f"\n{'='*70}")
if mismatches:
    print(f"❌ 가격 불일치 {len(mismatches)}개\n")
    for m in mismatches:
        print(f"  {m['name']}")
        print(f"    {m['type']}: GS={m['gs']:,}원 vs PF={m['pf']:,}원")
else:
    print(f"✅ 모든 가격이 일치합니다!")

print(f"\n검산 결과:")
print(f"  Google Sheets: {len(gs_prices)}개")
print(f"  prices_full.json: {len(prices_full)}개")
print(f"  매칭됨: {matched}개")
print(f"  불일치: {len(mismatches)}개")
print(f"{'='*70}")
