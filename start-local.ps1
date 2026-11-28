# Lab Inventory — local Windows launcher (no Docker required)
#Requires -Version 5.1
param(
  [switch]$CheckOnly,
  [switch]$FirstSetup,
  [switch]$BootstrapAdmin
)

$ErrorActionPreference = 'Stop'
$RepoRoot = $PSScriptRoot
Set-Location $RepoRoot

function Write-Info([string]$Message) {
  Write-Host $Message
}

function Invoke-RepoNpm {
  param(
    [Parameter(Mandatory)][string[]]$NpmArguments,
    [Parameter(Mandatory)][string]$StepLabel
  )
  & npm @NpmArguments
  if ($LASTEXITCODE -ne 0) {
    Write-Info "${StepLabel} failed (npm exit code $LASTEXITCODE)."
    exit [Math]::Max($LASTEXITCODE, 1)
  }
}

function Import-RepoDotEnv {
  $envFile = Join-Path $RepoRoot '.env'
  if (-not (Test-Path -LiteralPath $envFile)) { return }
  Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    if ($val.Length -ge 2 -and (
        ($val.StartsWith('"') -and $val.EndsWith('"')) -or
        ($val.StartsWith("'") -and $val.EndsWith("'"))
      )) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    if (-not $key) { return }
    $existing = [Environment]::GetEnvironmentVariable($key, 'Process')
    if ([string]::IsNullOrWhiteSpace($existing)) {
      [Environment]::SetEnvironmentVariable($key, $val, 'Process')
    }
  }
}

function Test-NodeAtLeast20 {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Info 'Node.js 20+ is required — install from https://nodejs.org/'
    return $false
  }
  $major = [int](node -p "parseInt(process.versions.node.split('.')[0], 10)")
  if ($LASTEXITCODE -ne 0) {
    Write-Info 'Could not read Node.js version (node exited with a non-zero code).'
    return $false
  }
  if ($major -lt 20) {
    Write-Info "Node.js $($major) detected; version 20 or newer is required."
    return $false
  }
  return $true
}

function Get-SqlEndpoint {
  Import-RepoDotEnv
  $server = if ($env:LAB_DB_SERVER) { $env:LAB_DB_SERVER } else { '127.0.0.1' }
  $port = if ($env:LAB_DB_PORT) { [int]$env:LAB_DB_PORT } else { 14333 }
  return @{ Server = $server; Port = $port }
}

function Test-SqlTcpOpen {
  $ep = Get-SqlEndpoint
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($ep.Server, $ep.Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(3000, $false)) { return $false }
    $client.EndConnect($iar)
    return $true
  } catch {
    return $false
  } finally {
    if ($client.Connected) { $client.Close() }
  }
}

function Read-SecureEnvPassword {
  param([string]$Name, [string]$Prompt)
  $existing = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if (-not [string]::IsNullOrWhiteSpace($existing)) { return }
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [Environment]::SetEnvironmentVariable($Name, $plain, 'Process')
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

Import-RepoDotEnv

if (-not (Test-NodeAtLeast20)) { exit 2 }

$endpoint = Get-SqlEndpoint
if (-not (Test-SqlTcpOpen)) {
  Write-Info "Cannot reach SQL Server at $($endpoint.Server):$($endpoint.Port)."
  Write-Info 'Install SQL Server 2025 Express (see LOCAL_RUN.md) or start your local instance.'
  exit 3
}

if ($CheckOnly) {
  Write-Info 'Prerequisites OK (Node.js + SQL Server TCP endpoint).'
  exit 0
}

if (-not $env:LAB_HTTP_BIND) {
  [Environment]::SetEnvironmentVariable('LAB_HTTP_BIND', '127.0.0.1', 'Process')
}

Read-SecureEnvPassword -Name 'LAB_DB_PASSWORD' -Prompt 'SQL password (LAB_DB_PASSWORD, input hidden)'

$serverDir = Join-Path $RepoRoot 'server'
$httpPort = if ($env:LAB_HTTP_PORT) { $env:LAB_HTTP_PORT } else { '3000' }

if (-not (Test-Path -LiteralPath (Join-Path $serverDir 'node_modules'))) {
  Push-Location $serverDir
  try {
    Invoke-RepoNpm -NpmArguments @('install') -StepLabel 'npm install'
  } finally {
    Pop-Location
  }
}

Push-Location $serverDir
try {
  if ($FirstSetup) {
    Write-Info 'Running first-time db:init and db:migrate (non-destructive).'
    Invoke-RepoNpm -NpmArguments @('run', 'db:init') -StepLabel 'npm run db:init'
    Invoke-RepoNpm -NpmArguments @('run', 'db:migrate') -StepLabel 'npm run db:migrate'
    Write-Info 'Optional dev-only sample data: npm run db:seed-qa (do not use on shared/production DBs).'
  }

  if ($BootstrapAdmin) {
    if (-not $env:LAB_ADMIN_EMAIL) {
      [Environment]::SetEnvironmentVariable('LAB_ADMIN_EMAIL', 'admin@lab.example', 'Process')
    }
    Write-Info 'Bootstrap admin — password is read with masked input (not echoed).'
    Invoke-RepoNpm -NpmArguments @('run', 'bootstrap-admin') -StepLabel 'npm run bootstrap-admin'
  }

  Write-Info "Starting API + UI at http://127.0.0.1:${httpPort}/login.html"
  Invoke-RepoNpm -NpmArguments @('start') -StepLabel 'npm start'
} finally {
  Pop-Location
}