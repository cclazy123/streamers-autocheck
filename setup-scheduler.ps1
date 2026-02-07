# Windows Task Scheduler Setup Script
# 自动创建每 20 分钟执行一次的定时任务

$PROJECT_DIR = "C:\Users\86424\projects\streamers-autocheck"
$BATCH_FILE = "$PROJECT_DIR\scheduler-batch.bat"
$TASK_NAME = "TikTok-Live-Scheduler"
$TASK_DESC = "TikTok Live Screenshot Scheduler - Every 20 minutes"

# 检查是否以管理员身份运行
$isAdmin = ([System.Security.Principal.WindowsIdentity]::GetCurrent()).groups -match "S-1-5-32-544"
if (-not $isAdmin) {
    Write-Host "❌ This script must run as Administrator"
    Write-Host "请以管理员身份运行此脚本"
    exit 1
}

Write-Host "Setting up Windows Task Scheduler..." -ForegroundColor Cyan
Write-Host "项目目录: $PROJECT_DIR"
Write-Host "批处理文件: $BATCH_FILE"
Write-Host ""

# 1. 检查文件是否存在
if (!(Test-Path $BATCH_FILE)) {
    Write-Host "❌ Batch file not found: $BATCH_FILE" -ForegroundColor Red
    exit 1
}

# 获取批处理文件的完整路径
$BATCH_FILE = (Get-Item $BATCH_FILE).FullName
Write-Host "批处理文件完整路径: $BATCH_FILE" -ForegroundColor Gray

# 2. 删除已有的任务（如果存在）
Write-Host "检查现有任务..."
$existingTask = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "删除现有任务: $TASK_NAME"
    Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
}

# 3. 创建触发器（每 20 分钟运行一次）
$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 20) `
    -RepetitionDuration (New-TimeSpan -Days 365)

# 4. 创建操作（运行批处理文件）
$action = New-ScheduledTaskAction -Execute $BATCH_FILE

# 5. 创建任务设置
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

# 6. 注册任务
Write-Host "注册定时任务..." -ForegroundColor Yellow
try {
    Register-ScheduledTask `
        -TaskName $TASK_NAME `
        -Description $TASK_DESC `
        -Trigger $trigger `
        -Action $action `
        -Settings $settings `
        -Force | Out-Null
    Write-Host "✅ Task registered successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to register task: $_" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Task created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "任务详情:" -ForegroundColor Cyan
Write-Host "  任务名称: $TASK_NAME"
Write-Host "  执行间隔: 每 20 分钟"
Write-Host "  执行文件: $BATCH_FILE"
Write-Host "  运行用户: $(whoami)"
Write-Host "  重复持续时间: 365 天（之后可手动续期）"
Write-Host ""

# 7. 测试任务
Write-Host "立即执行一次任务?" -ForegroundColor Yellow
$response = Read-Host "输入 y/n (默认 n)"
if ($response -eq 'y' -or $response -eq 'Y') {
    Write-Host "启动任务..." -ForegroundColor Cyan
    try {
        Start-ScheduledTask -TaskName $TASK_NAME
        Write-Host "✓ Task started" -ForegroundColor Green
        Start-Sleep -Seconds 2
        Write-Host ""
        Write-Host "查看执行结果请运行:"
        Write-Host "  Get-ScheduledTaskInfo -TaskName '$TASK_NAME'"
    } catch {
        Write-Host "⚠️  Task start had issues: $_" -ForegroundColor Yellow
        Write-Host "（任务已创建，会在 20 分钟后自动执行）"
    }
}

Write-Host ""
Write-Host "后续命令:" -ForegroundColor Cyan
Write-Host "  查看任务状态: Get-ScheduledTask -TaskName '$TASK_NAME' | fl"
Write-Host "  手动执行任务: Start-ScheduledTask -TaskName '$TASK_NAME'"
Write-Host "  删除任务: Unregister-ScheduledTask -TaskName '$TASK_NAME' -Confirm:`$false"
