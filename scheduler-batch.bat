@echo off
REM TikTok Live Screenshot Scheduler - Windows Task Scheduler Batch Script
REM 每 20 分钟由任务计划程序调用一次

set PROJECT_DIR=C:\Users\86424\projects\streamers-autocheck
cd /d %PROJECT_DIR%

REM 加载环境变量
call .env

REM 执行抓图脚本
node src/scheduler-worker.js

REM 记录执行时间（可选）
echo [%date% %time%] Scheduler executed >> logs\scheduler-batch.log
