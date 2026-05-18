# Kill ALL listeners on port, clear pycache, start Haazir backend (repo root).
param(
    [int]$Port = 8080,
    [switch]$UseNextPortIfBusy
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Get-PortListenerPids([int]$LocalPort) {
    $pids = @()
    foreach ($line in (netstat -ano | Select-String "LISTENING")) {
        if ($line -notmatch ":$LocalPort\s") { continue }
        if ($line -match '\s+(\d+)\s*$') {
            $pids += [int]$Matches[1]
        }
    }
    return $pids | Select-Object -Unique
}

function Stop-PortListeners([int]$LocalPort) {
    foreach ($procId in (Get-PortListenerPids $LocalPort)) {
        if ($procId -le 4) { continue }
        Write-Host "  taskkill /PID $procId /F"
        cmd /c "taskkill /PID $procId /F /T 2>nul" | Out-Null
    }
    Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'uvicorn' } |
        ForEach-Object {
            Write-Host "  taskkill uvicorn PID $($_.ProcessId)"
            cmd /c "taskkill /PID $($_.ProcessId) /F /T 2>nul" | Out-Null
        }
}

function Test-PortFree([int]$LocalPort) {
    return (Get-PortListenerPids $LocalPort).Count -eq 0
}

function Wait-PortFree([int]$LocalPort, [int]$Seconds = 20) {
    Stop-PortListeners $LocalPort
    for ($i = 0; $i -lt $Seconds; $i++) {
        if (Test-PortFree $LocalPort) { return $true }
        Start-Sleep -Seconds 1
        if ($i % 3 -eq 2) { Stop-PortListeners $LocalPort }
    }
    return $false
}

Write-Host "Freeing port $Port ..."
if (-not (Wait-PortFree $Port)) {
    $ghost = Get-PortListenerPids $Port
    Write-Host ""
    Write-Host "Port $Port still busy (PIDs: $($ghost -join ', '))." -ForegroundColor Yellow
    Write-Host "These may be ghost sockets from a crashed uvicorn or another terminal/WSL." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Try:" -ForegroundColor Cyan
    Write-Host "  1. Close every terminal that ran uvicorn / backend"
    Write-Host "  2. PowerShell as Administrator, then run this script again"
    Write-Host "  3. Or use next free port:  .\scripts\start_backend.ps1 -UseNextPortIfBusy"
    Write-Host "  4. Or manual:  taskkill /PID $($ghost[0]) /F /T"
    Write-Host ""

    if ($UseNextPortIfBusy) {
        $Port = 8081
        Write-Host "Trying port $Port instead ..."
        if (-not (Wait-PortFree $Port)) {
            Write-Host "ERROR: Port $Port also busy. Reboot or free ports manually." -ForegroundColor Red
            exit 1
        }
    } else {
        exit 1
    }
}

Write-Host "Port $Port is free."

Write-Host "Removing __pycache__..."
Get-ChildItem -Path $RepoRoot -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Starting on http://0.0.0.0:${Port}"
Write-Host "  python -m uvicorn backend.main:app --host 0.0.0.0 --port $Port"
if ($Port -ne 8080) {
    Write-Host "  Update mobile/.env: EXPO_PUBLIC_API_URL=http://<PC_IP>:$Port" -ForegroundColor Yellow
}

$env:PORT = "$Port"
python -m uvicorn backend.main:app --host 0.0.0.0 --port $Port
