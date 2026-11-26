#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import json
import os
sys.stdout.reconfigure(encoding='utf-8')

import gspread
from datetime import datetime

# Google Sheets 연결
gc = gspread.oauth(
    scopes=['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    credentials_filename=r'C:\Users\hyoji\.gspread\jh_oauth_client.json',
    authorized_user_filename=r'C:\Users\hyoji\.gspread\jh_authorized_user.json'
)

# 스프레드시트 이름
SHEET_TITLE = "어반사이드_더현대충청_주문현황"

def get_or_create_sheet():
    """스프레드시트 가져오기 또는 생성"""
    try:
        # 기존 시트 찾기
        sheet = gc.open(SHEET_TITLE)
        print(f"✅ 기존 시트 발견: {SHEET_TITLE}")
        return sheet
    except gspread.SpreadsheetNotFound:
        # 새 시트 생성
        print(f"📝 새 시트 생성: {SHEET_TITLE}")
        sheet = gc.create(SHEET_TITLE)

        # 헤더 추가
        ws = sheet.get_worksheet(0)
        headers = ["주문번호", "날짜", "시간", "상품명", "사이즈", "색상", "수량", "판매금액", "상태", "메모"]
        ws.append_row(headers)

        # 헤더 포맷
        for i in range(1, len(headers) + 1):
            ws.format(f"{chr(64+i)}1", {"textFormat": {"bold": True}})

        print(f"✅ 시트 생성 완료. 헤더 추가됨")
        return sheet

def parse_sales_data(data_str):
    """LocalStorage JSON 파싱"""
    try:
        return json.loads(data_str)
    except:
        return {}

def format_datetime(ts):
    """타임스탬프를 날짜/시간으로 변환"""
    dt = datetime.fromtimestamp(ts / 1000)
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M:%S")

def get_first_item(items):
    """첫 번째 상품 정보 추출"""
    if not items:
        return "—", "—", "—"
    item = items[0]
    return item.get("name", "—"), item.get("size", "—"), item.get("color", "—")

def add_sales_to_sheet(sheet, sales_data):
    """판매 데이터를 시트에 추가"""
    ws = sheet.get_worksheet(0)

    # 기존 주문번호들 가져오기
    existing_orders = set()
    rows = ws.get_all_records()
    for row in rows:
        if row.get("주문번호"):
            existing_orders.add(row["주문번호"])

    added_count = 0
    for sale in sales_data:
        order_no = sale.get("orderNo", "")

        # 이미 추가되었으면 스킵
        if order_no in existing_orders:
            continue

        # 상태 결정
        status = "교환" if "_EX" in order_no else "판매"

        date, time = format_datetime(sale.get("ts", 0))
        name, size, color = get_first_item(sale.get("items", []))
        qty = sum(item.get("qty", 0) for item in sale.get("items", []))

        # 행 추가
        row_data = [
            order_no,
            date,
            time,
            name,
            size,
            color,
            qty,
            sale.get("total", 0),
            status,
            sale.get("memo", "")
        ]

        ws.append_row(row_data)
        added_count += 1
        print(f"✓ {order_no} 추가됨")

    return added_count

def main():
    print(f"\n{'='*50}")
    print(f"Google Sheets 동기화 시작 ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})")
    print(f"{'='*50}\n")

    # 1. 스프레드시트 가져오기/생성
    sheet = get_or_create_sheet()

    # 2. LocalStorage 데이터 읽기
    # 주: 브라우저의 LocalStorage는 직접 접근 불가
    # 대신 사용자가 콘솔에서 JSON을 복사해서 sales.json으로 저장하거나,
    # 여기서는 현재 작동 중인 판매 데이터를 수동으로 입력해야 함

    # 3. sales.json 파일이 있으면 읽기
    sales_file = "data/sales_sync.json"
    if os.path.exists(sales_file):
        print(f"📂 {sales_file} 발견. 판매 데이터 로드 중...\n")
        with open(sales_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            sales = data.get("sales", [])

        if sales:
            added = add_sales_to_sheet(sheet, sales)
            print(f"\n✅ {added}건의 판매가 추가되었습니다.")

            # 성공했으면 파일 백업
            os.rename(sales_file, f"data/sales_sync.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
            print(f"📦 백업 파일 생성됨")
        else:
            print("❌ 판매 데이터가 없습니다.")
    else:
        print(f"⚠️  {sales_file} 파일을 찾을 수 없습니다.")
        print("📌 콘솔에서 다음 명령어를 실행하세요:")
        print("   const data = JSON.parse(localStorage.getItem('pos.salesData'));")
        print("   console.log(JSON.stringify(data, null, 2));")
        print("   → 출력된 데이터를 sales_sync.json에 저장하세요.\n")

    print(f"\n{'='*50}")
    print(f"동기화 완료! 스프레드시트 확인: {sheet.url}")
    print(f"{'='*50}\n")

if __name__ == "__main__":
    main()
