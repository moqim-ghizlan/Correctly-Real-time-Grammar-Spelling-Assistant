$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
& "$repo/backend/.venv/Scripts/python.exe" "$PSScriptRoot/build_windows.py"
if ($LASTEXITCODE -ne 0) { throw 'Windows build failed' }
