@echo off
chcp 65001 >nul
title 어반사이드 POS 주문 동기화 서버
echo.
echo ========================================
echo 어반사이드 POS 주문 동기화 시작
echo ========================================
echo.
echo [대기 중...] 서버가 시작되었습니다
echo.
echo 주문이 완료되면 Google Sheets에 자동 기록됩니다
echo.
echo.
python api_server.py
pause
