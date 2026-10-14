param(
    [Parameter(Mandatory=$true)][string]$EngineSource,
    [Parameter(Mandatory=$true)][string]$RuntimeSource
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
& "$repo/backend/.venv/Scripts/python.exe" "$PSScriptRoot/vendor_bundle.py" prepare --engine $EngineSource --runtime $RuntimeSource
if ($LASTEXITCODE -ne 0) { throw 'Vendor preparation failed' }
