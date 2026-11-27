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

# 현재 app.js 가격 (인라인 PRICES_FULL_DATA에서 추출)
app_prices = {
    "[26FW] 플랩 90 폴라텍 알파 다이렉트 바라클라바 블랙": {"normal": 59000, "discount": 53000},
    "[26FW] 제로인 옥타 하이브리드 캡 블랙": {"normal": 79000, "discount": 71000},
    "[26FW] 플랩 90 폴라텍 알파 다이렉트 바라클라바 라이트 그레이": {"normal": 59000, "discount": 53000},
    "[26FW] 이지모드 프라임플렉스 써모 팬츠 다크 그레이": {"normal": 209000, "discount": 167200},
    "[26FW] 메리노 울 후디 차콜": {"normal": 129000, "discount": 116000},
    "[26FW] 이지모드 프라임플렉스 써모 팬츠 차콜": {"normal": 209000, "discount": 167200},
    "[26FW] 메리노 울 후디 블랙": {"normal": 129000, "discount": 116000},
    "[26FW] 플랩 190 폴라텍 알파 다이렉트 후디 브라운": {"normal": 249000, "discount": 211500},
    "[26FW] 플랩 190 폴라텍 알파 다이렉트 후디 차콜": {"normal": 249000, "discount": 211500},
    "[26FW] 플랩 90 폴라텍 알파 다이렉트 후디 라이트 그레이": {"normal": 198000, "discount": 168300},
    "[26FW] 플랩 90 폴라텍 알파 다이렉트 후디 블랙": {"normal": 198000, "discount": 168300},
    "[26FW] 제로인 옥타 에어 롱슬리브 티셔츠 라이트 그레이": {"normal": 149000, "discount": 134000},
    "[26FW] 제로인 옥타 에어 롱슬리브 티셔츠 카멜": {"normal": 149000, "discount": 134000},
    "[26FW] 플랩 가루이시 후디 블랙": {"normal": 139000, "discount": 120000},
    "[26FW] 제로인 옥타 에어 롱슬리브 티셔츠 브라운": {"normal": 149000, "discount": 134000},
    "[26FW] 제로인 옥타 에어 롱슬리브 티셔츠 블랙": {"normal": 149000, "discount": 134000},
    "[26FW] 제로인 옥타 에어 후디 라이트 그레이": {"normal": 179000, "discount": 179000},
    "[26FW] 제로인 옥타 에어 후디 브라운": {"normal": 179000, "discount": 179000},
    "[26FW] 제로인 옥타 에어 후디 카멜": {"normal": 179000, "discount": 179000},
    "[26FW] 제로인 옥타 에어 후디 블랙": {"normal": 179000, "discount": 179000},
    "[26FW] 제로인 옥타 인슐레이션 팬츠 브라운": {"normal": 219000, "discount": 197000},
    "[26FW] 제로인 옥타 인슐레이션 팬츠 블랙": {"normal": 219000, "discount": 197000},
    "[26FW] 제로인 옥타 하이브리드 쉘 후드 재킷 브라운": {"normal": 289000, "discount": 260000},
    "[26FW] 제로인 옥타 에어 타이즈 차콜": {"normal": 119000, "discount": 102000},
    "[26FW] 제로인 옥타 하이브리드 쉘 후드 재킷 블랙": {"normal": 289000, "discount": 260000},
    "[26FW] 제로인 옥타 에어 베이스 레이어 후디 블랙": {"normal": 139000, "discount": 125000},
    "[26FW] 제로인 옥타 에어 베이스 레이어 후디 차콜": {"normal": 139000, "discount": 125000},
    "[26FW] 제로인 옥타 에어 타이즈 블랙": {"normal": 119000, "discount": 102000},
    "[26FW] 에일러론 900 익스페디션 다운 파카 카키 그레이": {"normal": 679000, "discount": 543200},
    "[26FW] 에일러론 900 UL 후드 다운 재킷 브라운": {"normal": 389000, "discount": 350100},
    "[26FW] 에일러론 900 익스페디션 다운 파카 블랙": {"normal": 679000, "discount": 543200},
    "[26FW] 에일러론 900 UL 후드 다운 재킷 블랙": {"normal": 389000, "discount": 350100},
    "[26FW] 에일러론 울트라 1000 SUL 다운 재킷 블랙": {"normal": 399000, "discount": 347200},
    "[26FW] 에일러론 울트라 1000 SUL 다운 재킷 실버": {"normal": 399000, "discount": 347200},
    "[26FW] 에일러론 울트라 1000 SUL 후드 다운 재킷 블루": {"normal": 599000, "discount": 497200},
    "[26FW] 에일러론 울트라 1000 SUL 후드 다운 재킷 블루 블랙": {"normal": 599000, "discount": 497200},
    "[26FW] 에일러론 울트라 1000 SUL 후드 다운 재킷 실버": {"normal": 599000, "discount": 497200},
    "[26FW] 에일러론 울트라 1000 SUL 후드 다운 재킷 차콜": {"normal": 599000, "discount": 497200},
    "[26FW] 에일러론 울트라 1000 SUL 후드 다운 재킷 블랙": {"normal": 599000, "discount": 497200},
    "[26FW] 에일러론 울트라 1000 SUL 7D 후드 다운 재킷 베이지": {"normal": 459000, "discount": 413000},
    "[26FW] 에일러론 울트라 1000 SUL 7D 후드 다운 재킷 오렌지": {"normal": 459000, "discount": 413000},
    "[26FW] 에일러론 울트라 1000 SUL 7D 후드 다운 재킷 블랙": {"normal": 459000, "discount": 413000},
    "어반사이드 테고 1.5P (솔리드 이너텐트 포함) (티타늄 블루)": {"normal": 590000, "discount": 540000}
}

# 엑셀 데이터 파싱
excel_prices = {}
all_rows = []

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

    excel_prices[full_name] = {
        "normal": normal_price,
        "discount": discount_price,
        "row": row_idx
    }
    all_rows.append((row_idx, product_name, color, normal_price, discount_price))

print("=" * 120)
print("가격 차이 분석")
print("=" * 120)

mismatches = []

for name, prices in excel_prices.items():
    if name in app_prices:
        app_p = app_prices[name]
        excel_p = prices

        if app_p["normal"] != excel_p["normal"] or app_p["discount"] != excel_p["discount"]:
            mismatches.append({
                "name": name,
                "app_normal": app_p["normal"],
                "app_discount": app_p["discount"],
                "excel_normal": excel_p["normal"],
                "excel_discount": excel_p["discount"],
                "row": excel_p["row"]
            })

if mismatches:
    print(f"\n❌ 가격 불일치 상품 {len(mismatches)}개:\n")
    for m in mismatches:
        print(f"Row {m['row']}: {m['name']}")
        print(f"  App:   정가 {m['app_normal']:,} → 할인 {m['app_discount']:,}")
        print(f"  Excel: 정가 {m['excel_normal']:,} → 할인 {m['excel_discount']:,}")

        # 차이 계산
        norm_diff = m['excel_normal'] - m['app_normal']
        disc_diff = m['excel_discount'] - m['app_discount']
        print(f"  차이:  정가 {norm_diff:+,} / 할인 {disc_diff:+,}")
        print()
else:
    print("\n✅ 가격 불일치 없음")

print("=" * 120)
