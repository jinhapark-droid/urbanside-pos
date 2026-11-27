#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import os
import sys
import time
from datetime import datetime
sys.stdout.reconfigure(encoding='utf-8')

import gspread

gc = gspread.oauth(
    scopes=['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    credentials_filename=r'C:\Users\hyoji\.gspread\jh_oauth_client.json',
    authorized_user_filename=r'C:\Users\hyoji\.gspread\jh_authorized_user.json'
)

SHEET_TITLE = "어반사이드_더현대충청_주문현황"
sales_file = "data/sales_sync.json"
last_check = 0

def get_or_create_sheet():
    try:
        sheet = gc.open(SHEET_TITLE)
        return sheet
    except gspread.SpreadsheetNotFound:
        sheet = gc.create(SHEET_TITLE)
        ws = sheet.get_worksheet(0)
        headers = ["주문번호", "날짜", "시간", "상품명", "사이즈", "색상", "수량", "판매금액", "상태", "메모"]
        ws.append_row(headers)
        for i in range(1, len(headers) + 1):
            ws.format(f"{chr(64+i)}1", {"textFormat": {"bold": True}})
        return sheet

def sync_to_sheets():
    global last_check

    if not os.path.exists(sales_file):
        return 0

    try:
        with open(sales_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        sales = data.get("sales", [])
    except:
        return 0

    if not sales:
        return 0

    sheet = get_or_create_sheet()
    ws = sheet.get_worksheet(0)

    existing = set()
    try:
        rows = ws.get_all_records()
        for row in rows:
            if row.get("주문번호"):
                existing.add(row["주문번호"])
    except:
        pass

    added = 0
    for sale in sales:
        order_no = sale.get("orderNo", "")

        if order_no in existing:
            continue

        status = "교환" if "_EX" in order_no else "판매"

        try:
            dt = datetime.fromtimestamp(sale.get("ts", 0) / 1000)
            date = dt.strftime("%Y-%m-%d")
            time_str = dt.strftime("%H:%M:%S")
        except:
            date = ""
            time_str = ""

        items = sale.get("items", [])
        name = items[0].get("name", "—") if items else "—"
        size = items[0].get("size", "—") if items else "—"
        color = items[0].get("color", "—") if items else "—"
        qty = sum(item.get("qty", 0) for item in items)

        row_data = [
            order_no,
            date,
            time_str,
            name,
            size,
            color,
            qty,
            sale.get("total", 0),
            status,
            sale.get("memo", "")
        ]

        try:
            ws.append_row(row_data)
            added += 1
        except:
            pass

    return added

def cleanup_sync_file():
    if os.path.exists(sales_file):
        try:
            os.remove(sales_file)
        except:
            pass

print("🔄 Google Sheets 자동 동기화 시작...")
print(f"파일 감시: {sales_file}")
print(f"시트: {SHEET_TITLE}\n")

try:
    while True:
        try:
            added = sync_to_sheets()
            if added > 0:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ {added}개 주문 추가됨")
                cleanup_sync_file()
        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚠️  오류: {e}")

        time.sleep(5)  # 5초마다 체크
except KeyboardInterrupt:
    print("\n🛑 동기화 중지")
