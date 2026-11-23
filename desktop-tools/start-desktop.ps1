param([string]$Executable)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskConfig = $env:CODEITZ_DESKTOP_CONFIG
if (-not $taskConfig) { $taskConfig = Join-Path $env:LOCALAPPDATA 'CodeitzDesktop/runtime.json' }
$taskServer = Join-Path $taskRoot 'desktop-runtime/server.mjs'
if (-not (Test-Path -LiteralPath $taskConfig -PathType Leaf)) { throw 'Existing private Desktop configuration is missing.' }
if (-not (Test-Path -LiteralPath $taskServer -PathType Leaf)) { throw 'The consolidated desktop runtime source is missing.' }
if (-not $Executable) { $Executable = Join-Path $env:LOCALAPPDATA 'Programs/CodeitzDesktopPreview/codeitz-desktop.exe' }
if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'The native desktop application has not been installed.' }
$env:CODEITZ_DESKTOP_CONFIG = $taskConfig
$env:CODEITZ_DESKTOP_SERVER = $taskServer
$taskProcess = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path -Parent $Executable) -WindowStyle Normal -PassThru
Write-Output "Codeitz Desktop launched (process $($taskProcess.Id)). Existing configuration and records retained."
