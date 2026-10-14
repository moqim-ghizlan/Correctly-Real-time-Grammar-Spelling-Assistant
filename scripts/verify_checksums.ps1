param([string]$Bundle)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (-not $Bundle) { $Bundle = "$repo/backend/vendor" }
& "$repo/backend/.venv/Scripts/python.exe" "$PSScriptRoot/vendor_bundle.py" verify --root $Bundle
if ($LASTEXITCODE -ne 0) { throw 'Checksum verification failed' }
