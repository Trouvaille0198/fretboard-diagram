#!/bin/bash
# 在 zellij session 'fret' 中运行开发服务器
# 使用方法: 在 zellij 中附加到 fret session 后，运行: source run-in-zellij.sh

cd /home/melon/pros/fretboard-diagram
pnpm dev
