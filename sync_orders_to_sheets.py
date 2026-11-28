#!/usr/bin/env python3
"""
주문조회 데이터를 Google Sheets로 동기화
Supabase에서 sales 데이터를 읽어서 구글시트에 저장
"""

import gspread
import json
from datetime import datetime
from pathlib import Path

# gspread 인증
oauth_client = Path.home() / ".gspread" / "jh_oauth_client.json"
authorized_user = Path.home() / ".gspread" / "jh_authorized_user.json"

gc = gspread.oauth(
    scopes=["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"],
    credentials_filename=str(oauth_client),
    authorized_user_filename=str(authorized_user)
)

# 구글시트 열기
sheet_id = "1mMSqaT1S-wt9HH1t6vXYScCBud4K5l3q9Kg06d69f4A"
sh = gc.open_by_key(sheet_id)

# "주문조회" 탭 가져오기 (없으면 생성)
try:
    ws = sh.worksheet("주문조회")
except gspread.exceptions.WorksheetNotFound:
    ws = sh.add_worksheet("주문조회", 1000, 20)

# Supabase에서 sales 데이터 읽기
try:
    from supabase import create_client, Client

    sb_url = "https://owykoqnhwmdhpadxipes.supabase.co"
    sb_key = "sb_publishable_Pgf79543Sk1FvB_PtWK5PA_2U9jlGbD"
    supabase: Client = create_client(sb_url, sb_key)

    response = supabase.table("sales").select("*").execute()
    sales = response.data
    print(f"✓ Supabase에서 {len(sales)}건의 주문 로드")
except Exception as e:
    print(f"⚠️ Supabase 읽기 실패: {e}")
    # 로컬 localStorage.json에서 읽기 (있으면)
    try:
        with open(r"C:\Users\hyoji\ananti-pos\data\sales.json") as f:
            sales = json.load(f)
            print(f"✓ 로컬 파일에서 {len(sales)}건의 주문 로드")
    except:
        print("❌ 주문 데이터를 찾을 수 없습니다")
        sales = []

# 헤더 설정
headers = ["주문번호", "날짜시간", "담당자", "고객명", "연락처", "상품명", "색상/사이즈", "수량", "
정가", "할인율", "판매금액", "결제액", "배송주소", "더현대영수증", "상태", "메모", "주문ID"]

# 기존 데이터 지우기
ws.clear()

# 헤더 삽입
ws.append_row(headers, table_range="A1")

# 주문 데이터 준비
rows = []
for sale in sorted(sales, key=lambda x: x.get("ts", 0), reverse=True):
    ts = sale.get("ts", 0)
    dt = datetime.fromtimestamp(ts / 1000) if ts else datetime.now()
    date_str = dt.strftime("%Y-%m-%d %H:%M")

    # 각 항목별로 행 추가
    items = sale.get("items", [])
    if not items:
        rows.append([
            sale.get("orderNo", ""),
            date_str,
            sale.get("by", ""),
            sale.get("custName", ""),
            sale.get("custPhone", ""),
            "",
            "",
            "",
            sale.get("gross", ""),
            "",
            sale.get("total", ""),
            sale.get("paid", ""),
            sale.get("ship", {}).get("addr", "") if sale.get("ship") else "",
            sale.get("hyundaiReceiptNo", ""),
            sale.get("status", ""),
            sale.get("memo", ""),
            sale.get("id", "")
        ])
    else:
        for idx, item in enumerate(items):
            rows.append([
                sale.get("orderNo", "") if idx == 0 else "",
                date_str if idx == 0 else "",
                sale.get("by", "") if idx == 0 else "",
                sale.get("custName", "") if idx == 0 else "",
                sale.get("custPhone", "") if idx == 0 else "",
                item.get("name", ""),
                f"{item.get('color', '')} / {item.get('size', '')}",
                item.get("qty", ""),
                item.get("price", "") if idx == 0 else "",
                f"{item.get('disc', 0) * 100:.0f}%" if item.get('disc') else "",
                sale.get("total", "") if idx == 0 else "",
                sale.get("paid", "") if idx == 0 else "",
                sale.get("ship", {}).get("addr", "") if sale.get("ship") and idx == 0 else "",
                sale.get("hyundaiReceiptNo", "") if idx == 0 else "",
                sale.get("status", "") if idx == 0 else "",
                sale.get("memo", "") if idx == 0 else "",
                sale.get("id", "") if idx == 0 else ""
            ])

# 시트에 추가
if rows:
    ws.append_rows(rows, table_range="A2")
    print(f"✓ {len(rows)}개 행을 시트에 추가했습니다")
else:
    print("⚠️ 주문 데이터가 없습니다")

# 열 너비 조정
ws.update_column_dimension(1, {"pixelSize": 100})  # 주문번호
ws.update_column_dimension(2, {"pixelSize": 140})  # 날짜
ws.update_column_dimension(5, {"pixelSize": 180})  # 상품명
ws.update_column_dimension(13, {"pixelSize": 200}) # 배송주소

print(f"✅ 동기화 완료: {len(sales)}건의 주문이 '주문조회' 탭에 저장되었습니다")
print(f"📊 시트 URL: https://docs.google.com/spreadsheets/d/{sheet_id}")
