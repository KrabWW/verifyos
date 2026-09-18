# VerifyOS Windows 原生启动脚本（start.sh 的 Windows 对应版）
# 用法: powershell -ExecutionPolicy Bypass -File start-windows.ps1
# 依赖: WSL Ubuntu(已装 PG16+pgvector/Redis, systemd) + Node 22 + 已 pnpm install
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---- 0. 载入 .env ----
$envMap = @{}
foreach ($l in [IO.File]::ReadAllLines("$root\.env")) {
  if ($l -match '^\s*([A-Za-z0-9_]+)\s*=') { $envMap[$Matches[1]] = $l.Substring($l.IndexOf('=')+1) }
}
foreach ($k in $envMap.Keys) { Set-Item -Path ("Env:" + $k) -Value $envMap[$k] }
$apiPort = if ($env:API_PORT) { $env:API_PORT } else { '8082' }
$webPort = if ($env:WEB_PORT) { $env:WEB_PORT } else { '5173' }

# ---- 0.5 WSL 保活（防空闲自动关停 → PG fast shutdown → server 崩溃） ----
# schtasks 需管理员权限，这里改用分离的 wsl.exe 常驻进程（sleep infinity）让 WSL 永不空闲。
$kaCount = 0
try {
  $kaCount = [int](wsl -- sh -c "ps -eo args | grep -v grep | grep -c 'sleep infinity'" 2>$null | Select-Object -Last 1)
} catch { $kaCount = 0 }
if ($kaCount -eq 0) {
  # 注意：Start-Process wsl.exe（Hidden/Minimized）会立即退出(exit 0, WSL 隐藏控制台 quirk)；
  # 必须走 WMI Win32_Process.Create 派生独立控制台会话，进程才常驻。
  $null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = 'cmd.exe /c wsl.exe -d Ubuntu -u root --exec /bin/sh -c "exec sleep infinity"'
  }
  Write-Host "keepalive: WSL 常驻进程已拉起"
} else {
  Write-Host "keepalive: 已在运行，跳过"
}

# ---- 1. WSL 基建: PG(5433) + Redis(6379) ----
wsl -u root -- bash -c "pg_ctlcluster 16 main start 2>/dev/null; systemctl start redis-server 2>/dev/null; true"
wsl -u postgres -- pg_isready -h 127.0.0.1 -p 5433

# ---- 2. 数据库迁移（幂等） ----
Push-Location $root
pnpm --filter @verifyos/server migrate
Pop-Location

# ---- 3. 停旧进程 ----
foreach ($port in @([int]$apiPort, [int]$webPort)) {
  Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $port } |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Start-Sleep 1

# ---- 4. 启动 server（独立进程，日志落盘） ----
Start-Process node -ArgumentList 'dist\main.js' -WorkingDirectory "$root\apps\server" -WindowStyle Hidden `
  -RedirectStandardOutput "$root\server.log" -RedirectStandardError "$root\server.err.log"

# ---- 5. 启动 web (vite) ----
Start-Process node -ArgumentList '..\..\node_modules\vite\bin\vite.js','--port',"$webPort",'--strictPort','--host' `
  -WorkingDirectory "$root\apps\web" -WindowStyle Hidden `
  -RedirectStandardOutput "$root\web.log" -RedirectStandardError "$root\web.err.log"

# ---- 6. 就绪检查 ----
$ok = $false
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep 2
  try {
    $h = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$apiPort/api/health" -TimeoutSec 3).Content
    $w = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$webPort/" -TimeoutSec 3).StatusCode
    if ($h -match '"ok":true' -and $w -eq 200) { $ok = $true; break }
  } catch {}
}
if ($ok) {
  Write-Host "OK  API  http://127.0.0.1:$apiPort/api/health"
  Write-Host "OK  Web  http://127.0.0.1:$webPort"
  Write-Host "OK  PG   127.0.0.1:5433/verifyos (WSL PostgreSQL 16)"
  Write-Host "OK  Redis 127.0.0.1:6379 (WSL Redis 7)"
} else {
  Write-Host "FAILED - 查看 server.log / server.err.log / web.log / web.err.log"
  exit 1
}
