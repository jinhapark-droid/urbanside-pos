#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

from http.server import HTTPServer, BaseHTTPRequestHandler
import gspread
from datetime import datetime

gc = gspread.oauth(
    scopes=['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    credentials_filename=r'C:\Users\hyoji\.gspread\jh_oauth_client.json',
    authorized_user_filename=r'C:\Users\hyoji\.gspread\jh_authorized_user.json'
)

# 사용자 Google Sheets ID (하드코딩)
SHEET_ID = "1n534dUsli2uIWiCcSNG7v8Jd-s-95QTZUAHN4JGnyHU"
existing_orders = set()

def get_sheet():
    global existing_orders
    sheet = gc.open_by_key(SHEET_ID)
    ws = sheet.get_worksheet(0)

    # 기존 주문번호 로드
    try:
        rows = ws.get_all_records()
        for row in rows:
            if row.get("주문번호"):
                existing_orders.add(row["주문번호"])
    except:
        pass

    return sheet

class PosHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/order":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            try:
                sale = json.loads(body)
                order_no = sale.get("orderNo", "")
                
                if order_no in existing_orders:
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "duplicate"}).encode())
                    return
                
                sheet = gc.open(SHEET_TITLE)
                ws = sheet.get_worksheet(0)
                
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
                pin = sale.get("pin", "—")
                
                row_data = [
                    order_no,
                    date,
                    time_str,
                    name,
                    size,
                    color,
                    qty,
                    sale.get("total", 0),
                    pin,
                    status,
                    sale.get("memo", "")
                ]
                
                ws.append_row(row_data)
                existing_orders.add(order_no)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode())
                print(f"✅ {order_no} (PIN: {pin}) 추가됨")
                
            except Exception as e:
                print(f"❌ 오류: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        pass

get_sheet()

server = HTTPServer(('127.0.0.1', 9876), PosHandler)
print("🚀 POS API Server 시작: http://127.0.0.1:9876")
print(f"시트: {SHEET_TITLE}")
print("주문 완료 시 Google Sheets에 자동 기록 (담당자PIN 포함)\n")

try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\n🛑 서버 중지")
