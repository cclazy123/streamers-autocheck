#!/usr/bin/env powershell
# BFG Quick Cleanup Script (Windows PowerShell)
# Use this if you need faster history cleanup than git filter-branch
# Prerequisites: BFG must be installed (choco install bfg)

param(
    [switch]$Download = $false,
    [switch]$Install = $false,
    [switch]$RunCleanup = $false,
    [switch]$All = $false
)

$RepoUrl = "https://github.com/cclazy123/streamers-autocheck.git"
$WorkDir = "C:\tmp_bfg_cleanup"

if ($All -or $Download) {
    Write-Host "=== Step 1: Clone mirror ===" -ForegroundColor Green
    if (-not (Test-Path $WorkDir)) { New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null }
    Set-Location $WorkDir
    & "C:\Program Files\Git\cmd\git.exe" clone --mirror $RepoUrl streamers-autocheck.git
    Write-Host "Mirror cloned to $WorkDir\streamers-autocheck.git" -ForegroundColor Green
}

if ($All -or $RunCleanup) {
    Write-Host "=== Step 2: Run BFG cleanup ===" -ForegroundColor Green
    Set-Location $WorkDir
    if (-not (Test-Path "streamers-autocheck.git")) {
        Write-Host "ERROR: Mirror not found. Run with -Download first." -ForegroundColor Red
        exit 1
    }
    
    # Remove large folders
    bfg --delete-folders node_modules --delete-folders tmp_chrome_profile --delete-folders logs streamers-autocheck.git
    
    # Cleanup
    Set-Location streamers-autocheck.git
    & "C:\Program Files\Git\cmd\git.exe" reflog expire --expire=now --all
    & "C:\Program Files\Git\cmd\git.exe" gc --prune=now --aggressive
    Write-Host "BFG cleanup complete." -ForegroundColor Green
    
    # Push back
    Write-Host "=== Step 3: Force push ===" -ForegroundColor Green
    & "C:\Program Files\Git\cmd\git.exe" push --force --mirror $RepoUrl
    Write-Host "Force push complete!" -ForegroundColor Green
    
    Write-Host "=== Cleanup ===" -ForegroundColor Green
    Set-Location ..
    Remove-Item -Recurse -Force streamers-autocheck.git
    Write-Host "Temp files cleaned up." -ForegroundColor Green
}

if ($Install) {
    Write-Host "Installing BFG via Chocolatey..." -ForegroundColor Green
    choco install bfg -y
    Write-Host "BFG installed!" -ForegroundColor Green
}

Write-Host @"
=== BFG Cleanup Script ===
Usage:
  .\cleanup-bfg.ps1 -Install        # Install BFG runtime
  .\cleanup-bfg.ps1 -Download       # Clone mirror only
  .\cleanup-bfg.ps1 -RunCleanup     # Run BFG cleanup (requires mirror)
  .\cleanup-bfg.ps1 -All            # Download + Cleanup + Push

Current status: git filter-branch already applied.
"@ -ForegroundColor Cyan
