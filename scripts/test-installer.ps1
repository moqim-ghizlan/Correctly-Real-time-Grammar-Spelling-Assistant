param([string]$InstallerPath, [string]$UpgradeInstallerPath, [string]$ReportDir)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (-not $InstallerPath) { $InstallerPath = Join-Path $repo 'artifacts/installer-test-release/Correctly-V3.1-Setup.exe' }
if (-not $ReportDir) { $ReportDir = Join-Path $repo 'docs/validation/v3.1' }
$arguments = @("$PSScriptRoot/validate_installer.py", '--installer', $InstallerPath, '--report-dir', $ReportDir)
if ($UpgradeInstallerPath) { $arguments += @('--upgrade-installer', $UpgradeInstallerPath) }
& "$repo/backend/.venv/Scripts/python.exe" @arguments
if ($LASTEXITCODE -ne 0) { throw 'Installer validation failed; inspect the JSON report and setup logs' }
