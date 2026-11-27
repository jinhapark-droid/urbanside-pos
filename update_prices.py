#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

import gspread

gc = gspread.oauth(
    scopes=['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    credentials_filename=r'C:\Users\hyoji\.gspread\jh_oauth_client.json',
    authorized_user_filename=r'C:\Users\hyoji\.gspread\jh_authorized_user.json'
)

sheet = gc.open_by_key('1elpoQQ3CW4aNpcZfFJbu8q3ShUGKhNoZT2p3dGw4MFA')
ws = sheet.worksheet('[국내_온라인] 어패럴_PriceTable')
values = ws.get_all_values()

# 26.11 블프 행만 추출
updates = {}

for row in values[3:]:
    if len(row) < 12:
        continue
    
    promo = str(row[7]).strip() if len(row) > 7 else ""
    name = str(row[3]).strip() if len(row) > 3 else ""
    normal = str(row[10]).strip() if len(row) > 10 else ""
    discount = str(row[11]).strip() if len(row) > 11 else ""
    
    if "26.11 블프" in promo and name:
        try:
            normal_int = int(normal.replace(',', ''))
            discount_int = int(discount.replace(',', ''))
            
            if name not in updates:
                updates[name] = {
                    'normal': normal_int,
                    'discount': discount_int
                }
        except:
            pass

print(f"26.11 블프 상품 {len(updates)}개\n")

# prices_full.json 로드
with open('data/prices_full.json', 'r', encoding='utf-8') as f:
    prices_full = json.load(f)

# 비교
mismatches = []
for name, gs_prices in updates.items():
    if name in prices_full:
        pf = prices_full[name]
        
        if pf.get('normal') != gs_prices['normal']:
            mismatches.append({
                'name': name,
                'type': '정가',
                'gs': gs_prices['normal'],
                'pf': pf.get('normal')
            })
        
        if pf.get('discount') != gs_prices['discount']:
            mismatches.append({
                'name': name,
                'type': '할인가',
                'gs': gs_prices['discount'],
                'pf': pf.get('discount')
            })

if mismatches:
    print(f"❌ 불일치 {len(mismatches)}개\n")
    for m in mismatches:
        print(f"{m['name']}")
        print(f"  {m['type']}: GS={m['gs']:,}원 vs PF={m['pf']:,}원")
else:
    print(f"✅ 모두 일치!")

print(f"\n{'='*60}")
print(f"검산 완료: {len(updates)}개 / {len(prices_full)}개")
print(f"불일치: {len(mismatches)}개")
print(f"{'='*60}")
