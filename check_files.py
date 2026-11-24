import pandas as pd
import sys

files = [
    r"C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고_테고2ea)_자사_842829718.xlsx",
    r"C:\Users\hyoji\Downloads\261124_어반사이드_출고(26.11 더현대 충청 재고)_자사_836503789.xlsx",
    r"C:\Users\hyoji\Downloads\261118_어반사이드_입고(26FW 더현대 충청 DP 재고 사무실 출고요청) _자사_005941892 (1).xlsx",
]

for filepath in files:
    try:
        df = pd.read_excel(filepath, nrows=3)
        filename = filepath.split("\\")[-1][:50]
        print(f"\n📄 {filename}")
        print(f"열: {list(df.columns)}")
        print("샘플데이터:")
        print(df)
    except Exception as e:
        print(f"❌ 오류: {e}")
