#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import openpyxl

sys.stdout.reconfigure(encoding='utf-8')

file_path = r"C:\Users\hyoji\.claude\uploads\fbdd17c6-4be8-4934-af74-018fc52ccd3d\96c0f612-26.11_________.xlsx"

wb = openpyxl.load_workbook(file_path, data_only=True)
ws = wb.active

print("=" * 100)
print("Price Sheet Analysis")
print("=" * 100)

# 첫 10행 확인
print("\n첫 10행 출력:")
for i, row in enumerate(ws.iter_rows(min_row=1, max_row=10, values_only=True), 1):
    print(f"Row {i}: {row}")

print("\n" + "=" * 100)
print("\n7D & 쉘 후드 재킷 검색:")
print("=" * 100)

# 7D와 쉘 후드 재킷 검색
for row_idx, row in enumerate(ws.iter_rows(min_row=1, values_only=True), 1):
    row_text = str(row).lower()
    if '7d' in row_text or ('쉘' in row_text and '후드' in row_text):
        print(f"\nRow {row_idx}: {row}")

print("\n" + "=" * 100)
