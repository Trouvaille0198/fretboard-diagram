#!/bin/sh
# 测试浏览器探活启动：9223 端口活着就直接用，死了才拉起（避免 about:blank 标签堆积）
if curl -s --max-time 2 http://127.0.0.1:9223/json/version > /dev/null 2>&1; then
  echo "test-chrome: alive"
else
  "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \
    --remote-debugging-port=9223 \
    --user-data-dir="C:\\Users\\sunti\\AppData\\Local\\Chroly\\browser-profile" \
    --no-first-run --no-default-browser-check about:blank > /dev/null 2>&1 &
  sleep 4
  echo "test-chrome: launched"
fi
