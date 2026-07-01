#!/usr/bin/env pwsh
#Requires -Version 5.1
<#
.SYNOPSIS
    SiPer 服务管理脚本 (Windows)

.DESCRIPTION
    用法: .\siper.ps1 {start|stop|restart|status|log|deploy} [端口]
    示例:
        .\siper.ps1 start          # 启动 SiPer
        .\siper.ps1 stop           # 停止 SiPer
        .\siper.ps1 restart        # 重启 SiPer
        .\siper.ps1 status         # 查看运行状态
        .\siper.ps1 log            # 查看日志
        .\siper.ps1 deploy         # 打包发布包 (ZIP)
        .\siper.ps1 start 7240     # 在 7240 端口启动

.NOTES
    Author: SiPer Team
    Date:   2026-06-14
#>

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "status", "log", "deploy", "force-stop")]
    [string]$Command = "status",

    [Parameter(Position=1)]
    [ValidateRange(1, 65535)]
    [int]$Port = 7240,

    [string]$ProjectDir = $PWD.Path
)

# =============================================================================
# Initialize ProjectDir to script location (PS 5.1 compatible)
# =============================================================================
if (-not $ProjectDir -or $ProjectDir -eq $PWD.Path) {
    $ProjectDir = if ($MyInvocation.MyCommand.Path) { Split-Path $MyInvocation.MyCommand.Path } else { $PWD.Path }
}

# =============================================================================
# Configuration
# =============================================================================
$MainFile = "siper_web.py"
$PidFile = Join-Path $ProjectDir ".siper.pid"
$LogFile = Join-Path $env:TEMP "siper_file.log"
$StartupLog = Join-Path $env:TEMP "siper_startup.log"

# Colors
$ColorInfo = "Cyan"
$ColorSuccess = "Green"
$ColorWarning = "Yellow"
$ColorError = "Red"

# =============================================================================
# Helper Functions
# =============================================================================

function Write-Info { param($Message) Write-Host "INFO: $Message" -ForegroundColor $ColorInfo }
function Write-Success { param($Message) Write-Host "✔ $Message" -ForegroundColor $ColorSuccess }
function Write-Warning { param($Message) Write-Host "⚠ $Message" -ForegroundColor $ColorWarning }
function Write-Failure { param($Message) Write-Host "✗ $Message" -ForegroundColor $ColorError }

function Get-SiperProcess {
    $cip = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue
    if (-not $cip) { return $null }
    foreach ($p in $cip) {
        if ($p.CommandLine -like "*$MainFile*") {
            return $p
        }
    }
    return $null
}

function Test-PortInUse {
    param([int]$Port)
    $netstat = netstat -ano | Select-String ":$Port\s"
    return ($netstat -ne $null)
}

function Get-ProcessByPort {
    param([int]$Port)
    $netstat = netstat -ano | Select-String ":$Port\s"
    if ($netstat) {
        $line = $netstat.Line.Split() | Where-Object { $_ -ne "" }
        $procPid = $line[-1]
        try {
            return Get-Process -Id $procPid -ErrorAction SilentlyContinue
        } catch { return $null }
    }
    return $null
}

function Find-FreePort {
    <#
    .SYNOPSIS
        查找一个空闲端口（避免被系统服务占用）
    #>
    param([int]$StartPort = 7240, [int]$Range = 100)
    for ($p = $StartPort; $p -lt $StartPort + $Range; $p++) {
        if (-not (Test-PortInUse $p)) {
            return $p
        }
    }
    return 0
}

function Force-ReleasePort {
    <#
    .SYNOPSIS
        强制释放指定端口（杀掉所有占用者）
    #>
    param([int]$Port)
    $netstatLines = netstat -ano | Select-String ":$Port\s"
    $killed = @()
    foreach ($line in $netstatLines) {
        $parts = $line.Line.Split() | Where-Object { $_ -ne "" }
        $procPid = $parts[-1]
        # Skip PID 0 (system idle)
        if ($procPid -eq "0") { continue }
        try {
            $proc = Get-Process -Id $procPid -ErrorAction Stop
            $killed += "$($proc.ProcessName)($procPid)"
            $proc | Stop-Process -Force
        } catch {
            $killed += "PID_$procPid(cannot_kill)"
        }
    }
    if ($killed) {
        Write-Success "已释放端口 $Port (终止: $($killed -join ', '))"
    } else {
        Write-Info "端口 $Port 未检测到占用"
    }
}

function Install-SiperDependencies {
    <#
    .SYNOPSIS
        检查并安装缺失的 Python 依赖
    #>
    Write-Host "[前置检查] 检查 Python 依赖..." -ForegroundColor $ColorInfo
    
    # Check Python
    try {
        $pyVer = python --version 2>&1
        Write-Info "Python 版本: $pyVer"
    } catch {
        Write-Failure "Python 未安装或不在 PATH 中"
        Write-Host "  请安装 Python 3.10+ 并确保 python 命令可用" -ForegroundColor Yellow
        return $false
    }
    
    # Read requirements.txt
    $reqFile = Join-Path $ProjectDir "requirements.txt"
    if (-not (Test-Path $reqFile)) {
        Write-Warning "未找到 requirements.txt，跳过依赖检查"
        return $true
    }
    
    $reqs = Get-Content $reqFile | Where-Object { $_.Trim() -and -not $_.StartsWith('#') }
    $missing = @()
    
    foreach ($req in $reqs) {
        $package = ($req -split '[>=<]')[0].Trim()
        if (-not $package) { continue }
        
        # Check if installed
        $result = python -c "import $package" 2>&1
        if ($LASTEXITCODE -ne 0) {
            $missing += $req
        }
    }
    
    if ($missing.Count -eq 0) {
        Write-Success "所有依赖已安装"
        return $true
    }
    
    Write-Warning "发现 $($missing.Count) 个缺失依赖: $($missing -join ', ')"
    Write-Info "正在安装依赖..."
    
    # Install missing
    $reqStr = $missing -join ' '
    $process = Start-Process -FilePath "pip" -ArgumentList "install", $reqStr -Wait -PassThru -NoNewWindow
    
    if ($process.ExitCode -eq 0) {
        Write-Success "依赖安装完成"
        return $true
    } else {
        Write-Failure "依赖安装失败 (exit code: $($process.ExitCode))"
        return $false
    }
}

# =============================================================================
# Commands
# =============================================================================

function Start-SiperCommand {
    Write-Host "启动 SiPer..." -ForegroundColor $ColorInfo

    # Step 0: Ensure dependencies
    $depsOk = Install-SiperDependencies
    if (-not $depsOk) { return }

    # Step 1: Kill existing siper_web.py
    $existing = Get-SiperProcess
    if ($existing) {
        Write-Info "发现旧的 SiPer 进程 (PID: $($existing.ProcessId))，正在停止..."
        Stop-Process -Id $existing.ProcessId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }

    # Step 2: Release port (handle iphlpsvc / svchost)
    if (Test-PortInUse $Port) {
        $blocker = Get-ProcessByPort $Port
        $blockerName = if ($blocker) { "$($blocker.ProcessName)($($blocker.Id))" } else { "unknown" }
        Write-Warning "端口 $Port 被占用 ($blockerName)，尝试释放..."
        
        # Try to stop iphlpsvc (common port blocker)
        $iphlpsvc = Get-Service -Name "iphlpsvc" -ErrorAction SilentlyContinue
        if ($iphlpsvc -and $iphlpsvc.Status -eq 'Running') {
            Write-Info "停止 IP Helper 服务 (iphlpsvc)..."
            try {
                Stop-Service iphlpsvc -Force -ErrorAction Stop
                Start-Sleep -Seconds 2
                Write-Success "IP Helper 服务已停止"
            } catch {
                Write-Warning "无法停止 IP Helper 服务: $_"
            }
        }
        
        # If still in use, force kill
        if (Test-PortInUse $Port) {
            Write-Info "强制释放端口 $Port..."
            Force-ReleasePort $Port
            Start-Sleep -Seconds 1
        }
        
        # Final check
        if (Test-PortInUse $Port) {
            $freePort = Find-FreePort 7240
            if ($freePort -gt 0) {
                Write-Warning "端口 $Port 无法释放（系统服务保护），自动切换到端口 $freePort"
                # Update config
                $configFile = Join-Path $ProjectDir "settings.json"
                if (Test-Path $configFile) {
                    try {
                        $cfg = Get-Content $configFile -Raw | ConvertFrom-Json
                        $cfg.gateway.webui.port = $freePort
                        $cfg | ConvertTo-Json -Depth 10 | Set-Content $configFile -Encoding UTF8
                        Write-Info "已更新 settings.json 端口为 $freePort"
                    } catch { }
                }
                $Port = $freePort
            } else {
                Write-Failure "无法找到空闲端口，请手动指定端口"
                return
            }
        }
    }

    if (Test-Path $StartupLog) {
        Clear-Content $StartupLog -Force
    }

    if (-not (Test-Path (Join-Path $ProjectDir $MainFile))) {
        Write-Failure "未找到 $MainFile，请在 SiPer 目录下执行此脚本"
        return
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "python"
    $psi.Arguments = "-u `"$MainFile`" $Port"
    $psi.WorkingDirectory = $ProjectDir
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.CreateNoWindow = $true
    $psi.UseShellExecute = $false

    try {
        $process = [System.Diagnostics.Process]::Start($psi)
        $childPid = $process.Id
        $childPid | Set-Content $PidFile -Encoding UTF8

        Write-Info "新进程 PID: $childPid"
    } catch {
        Write-Failure "启动失败: $_"
        Write-Info "请确认 Python 已安装且 python 命令在 PATH 中"
        return
    }

    Write-Host "等待端口 $Port 可用..." -NoNewline
    $retry = 0
    $started = $false
    while ($retry -lt 60) {
        Start-Sleep -Seconds 1
        if (Test-PortInUse $Port) {
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:$Port/" -UseBasicParsing -ErrorAction Stop
                if ($response.StatusCode -eq 200) {
                    $started = $true
                    break
                }
            } catch {}
        }
        $retry++
        Write-Host "." -NoNewline
    }

    Write-Host ""

    if ($started) {
        Write-Success "SiPer 已就绪！端口 $Port HTTP 200 (${retry}s)"
        Write-Host ""
        Write-Host "  前端地址: http://localhost:$Port" -ForegroundColor $ColorInfo
    } else {
        Write-Failure "端口 $Port 在 60 秒内未就绪，请检查日志"
        Get-Content $StartupLog -Tail 20 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" }
    }
}

function Stop-SiperCommand {
    Write-Host "停止 SiPer..." -ForegroundColor $ColorInfo

    $existing = Get-SiperProcess
    if (-not $existing) {
        Write-Warning "SiPer 未运行"
        if (Test-Path $PidFile) {
            Remove-Item $PidFile -Force
            Write-Success "已清理残留 PID 文件"
        }
        return
    }

    $targetPid = $existing.ProcessId
    Write-Info "终止进程 PID: $targetPid..."

    try {
        Stop-Process -Id $targetPid -Force -ErrorAction Stop
    } catch {
        Write-Failure "终止失败: $_"
        return
    }

    $retry = 0
    while ($retry -lt 10) {
        Start-Sleep -Seconds 0.5
        $stillRunning = Get-SiperProcess
        if (-not $stillRunning) { break }
        $retry++
    }

    if (-not (Get-SiperProcess)) {
        Write-Success "进程已停止"
    } else {
        Write-Failure "进程未能正常停止，请手动检查"
    }

    if (Test-PortInUse $Port) {
        $blocker = Get-ProcessByPort $Port
        if ($blocker -and $blocker.Id -ne $targetPid) {
            $blocker | Stop-Process -Force -ErrorAction SilentlyContinue
        }
    }

    if (Test-Path $PidFile) {
        Remove-Item $PidFile -Force
        Write-Success "PID 文件已清理"
    }

    Write-Success "SiPer 已停止"
}

function Get-SiperStatus {
    $existing = Get-SiperProcess
    if ($existing) {
        Write-Host "SiPer 运行中 (PID: $($existing.ProcessId))" -ForegroundColor $ColorSuccess
        if (Test-PortInUse $Port) {
            Write-Success "端口 $Port 正常监听"
        } else {
            Write-Failure "端口 $Port 未监听"
        }
        try {
            $proc = Get-Process -Id $existing.ProcessId
            $uptime = (Get-Date) - $proc.StartTime
            Write-Host "运行时间: $($uptime.ToString('dd\ hh\:mm\:ss'))"
        } catch { }
    } else {
        Write-Host "SiPer 未运行" -ForegroundColor $ColorWarning
        if (Test-Path $PidFile) {
            $savedPid = Get-Content $PidFile -Raw
            $savedPid = $savedPid.Trim()
            Write-Warning "残留 PID 文件: $savedPid (进程不存在)"
        }
    }
}

function Get-SiperLog {
    Write-Host "=== 启动日志 ===" -ForegroundColor $ColorInfo
    if (Test-Path $StartupLog) {
        Get-Content $StartupLog | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Host "  (无启动日志)" -ForegroundColor $ColorWarning
    }

    Write-Host ""
    Write-Host "=== 最近日志 (最后 50 行) ===" -ForegroundColor $ColorInfo
    if (Test-Path $LogFile) {
        Get-Content $LogFile -Tail 50 | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Host "  (无日志文件)" -ForegroundColor $ColorWarning
    }
}

function Invoke-DeployCommand {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $buildDir = Join-Path $env:TEMP "siper-agent-$timestamp"
    $outputFile = Join-Path $env:TEMP "siper-agent-${timestamp}.zip"

    Write-Host "=== SiPer Agent Windows 打包 ===" -ForegroundColor $ColorInfo
    Write-Host "源目录: $ProjectDir"
    Write-Host "临时目录: $buildDir"
    Write-Host ""

    if (Test-Path $buildDir) {
        Remove-Item $buildDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

    Write-Host "[1/5] 复制源代码文件..." -ForegroundColor $ColorInfo
    $items = Get-ChildItem -Path $ProjectDir -Recurse -File | Where-Object {
        $relativePath = $_.FullName.Substring($ProjectDir.Length).TrimStart('\', '/')
        $name = $_.Name

        $excludes = @(
            "*.pyc", "__pycache__", ".git", ".gitignore", ".env", ".siper.pid",
            "models.json", "settings.json", "test_siper.py", ".cleanup_backup",
            ".tmp", "tmp", "uploads", "data", ":Zone.Identifier",
            "sessions.db", "sessions.db-shm", "sessions.db-wal",
            "meta.json", "todos.json", "skill_stats.json",
            "config.json.bak", "soul.md.bak", "token.db",
            "token.db-shm", "token.db-wal"
        )
        foreach ($ex in $excludes) {
            if ($name -like $ex -or $relativePath -like "*$ex*") { return $false }
        }

        if ($relativePath -match "webui[\\/]static[\\/]node_modules") { return $false }
        if ($relativePath -match "scripts[\\/]") { return $false }
        if ($relativePath -match "\\.git\\") { return $false }
        if ($relativePath -match "[\\/]memory[\\/]?") { return $false }

        return $true
    }

    $copied = 0
    foreach ($item in $items) {
        $relativePath = $item.FullName.Substring($ProjectDir.Length).TrimStart('\', '/')
        $destPath = Join-Path $buildDir $relativePath
        $destDir = Split-Path -Parent $destPath

        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item -Path $item.FullName -Destination $destPath -Force
        $copied++
    }
    Write-Success "复制 $copied 个文件"

    Write-Host "[2/5] 清理运行时代理文件..." -ForegroundColor $ColorInfo
    $patterns = @(
        "**\agents\*\sessions.db*",
        "**\agents\*\meta.json",
        "**\agents\*\todos.json",
        "**\agents\*\skill_stats.json",
        "**\agents\*\config.json.bak",
        "**\agents\*\soul.md.bak",
        "**\agents\*\memory.md",
        "**\agents\token.db*"
    )
    foreach ($pat in $patterns) {
        Get-ChildItem -Path $buildDir -Recurse -Filter ($pat.Split('\')[-1]) | Where-Object {
            $_.FullName -like "*$($pat.Replace('\*','*'))*"
        } | Remove-Item -Force -ErrorAction SilentlyContinue
    }

    @(
        "settings.json", "models.json", ".env",
        "agents\default\config.json", "agents\default\skill_config.json",
        "agents\default\memory.md"
    ) | ForEach-Object {
        $path = Join-Path $buildDir $_
        if (Test-Path $path) {
            Remove-Item $path -Force
        }
    }

    Write-Host "[3/5] 生成默认配置文件模板..." -ForegroundColor $ColorInfo

    @'
{
  "agent": {
    "id": "primary",
    "name": "AI Agent",
    "max_concurrent_tools": 5,
    "fallback_providers": [],
    "memory_backend": "sqlite",
    "session_timeout": 3600,
    "enable_logging": true,
    "log_level": "INFO",
    "skills_dir": "./skills",
    "data_dir": "./data"
  },
  "system": {
    "log_buffer_size": 2000,
    "token_usage_max": 500,
    "session_list_limit": 50,
    "ws_heartbeat_timeout": 300,
    "context_window_default": 8192
  },
  "tools": {
    "rate_limit": {
      "requests_per_minute": 60,
      "requests_per_hour": 1000,
      "burst_size": 10
    }
  },
  "gateway": {
    "cli": { "enabled": true },
    "webui": { "enabled": true, "host": "localhost", "port": 7240 }
  },
  "orchestration": {
    "default_workers": 2,
    "task_timeout": 300
  }
}
'@ | Set-Content (Join-Path $buildDir "settings.json.template") -Encoding UTF8

    @'
{
  "version": 2,
  "providers": {
    "": {
      "base_url": "https://api.example.com/v1",
      "api_key": "YOUR_API_KEY_HERE",
      "models": [
        {
          "id": "your-model-id",
          "name": "Your Model Name",
          "alias": "",
          "provider": "",
          "base_url": "https://api.example.com/v1",
          "api_key": "YOUR_API_KEY_HERE",
          "context_window": 131072,
          "capabilities": ["chat", "function_calling", "reasoning", "code"],
          "is_default": true
        }
      ]
    }
  },
  "default_provider": "",
  "default_model": "your-model-id"
}
'@ | Set-Content (Join-Path $buildDir "models.json.template") -Encoding UTF8

    @'
# SiPer Agent 环境变量配置
# 复制此文件为 .env 并填入实际的 API Key
LONGCAT_API_KEY=YOUR_API_KEY_HERE
'@ | Set-Content (Join-Path $buildDir ".env.template") -Encoding UTF8

    New-Item -ItemType Directory -Path (Join-Path $buildDir "agents\default") -Force | Out-Null

    @'
{
  "name": "default",
  "icon": "🎭",
  "avatar": "agents/default/avatar.png",
  "tags": ["default"],
  "memory_integration": {
    "mode": "append",
    "position": "after_system",
    "max_tokens": 20000
  },
  "appearance": {
    "msg_font_size": "18px",
    "msg_bg": "#1c2333",
    "msg_text": "#e6edf3",
    "msg_border": "#30363d"
  },
  "session_timeout": 3600,
  "max_tools": 300,
  "max_tool_rounds": 100,
  "available_models": ["your-model-id"],
  "default_chat_model": "your-model-id",
  "default_vision_model": "your-model-id"
}
'@ | Set-Content (Join-Path $buildDir "agents\default\config.json.template") -Encoding UTF8

    @'
{
  "version": 1,
  "pre_filter": {
    "enabled": true,
    "top_k": 10,
    "min_score": 0.1,
    "fallback_threshold": 3
  },
  "injection": {
    "format": "text",
    "include_capabilities": true,
    "max_skill_index_tokens": 1000
  },
  "feedback": {
    "enabled": true,
    "stats_file": "skill_stats.json",
    "decay_factor": 0.95,
    "min_samples": 5
  },
  "gating": {
    "check_tools": true,
    "check_env": false,
    "check_bins": false,
    "check_platform": false
  },
  "entries": {}
}
'@ | Set-Content (Join-Path $buildDir "agents\default\skill_config.json.template") -Encoding UTF8

    Write-Host "[4/5] 移除原始敏感配置文件（保留模板）..." -ForegroundColor $ColorInfo

    Write-Host "[5/5] 打包..." -ForegroundColor $ColorInfo

    if (Test-Path $outputFile) {
        Remove-Item $outputFile -Force
    }
    Compress-Archive -Path "$buildDir\*" -DestinationPath $outputFile -Force

    Remove-Item $buildDir -Recurse -Force

    Write-Host ""
    Write-Host "=== 打包完成 ===" -ForegroundColor $ColorSuccess
    $fileSize = [math]::Round((Get-Item $outputFile).Length / 1MB, 2)
    Write-Host "输出文件: $outputFile"
    Write-Host "文件大小: $fileSize MB"
}

# =============================================================================
# Main
# =============================================================================

switch ($Command) {
    "start"      { Start-SiperCommand }
    "stop"       { Stop-SiperCommand }
    "restart"    { Stop-SiperCommand; Start-SiperCommand }
    "status"     { Get-SiperStatus }
    "log"        { Get-SiperLog }
    "deploy"     { Invoke-DeployCommand }
    "force-stop" { Force-ReleasePort $Port }
    default {
        Write-Host "用法: .\siper.ps1 {start|stop|restart|status|log|deploy|force-stop} [端口]" -ForegroundColor $ColorInfo
    }
}
