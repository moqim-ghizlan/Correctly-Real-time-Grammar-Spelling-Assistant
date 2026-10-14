param([string]$Bundle, [int]$Port = 8081)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (-not $Bundle) { $Bundle = "$repo/artifacts/Correctly-V3-Windows-x64" }
$exe = Join-Path (Resolve-Path -LiteralPath $Bundle).Path 'CorrectlyServer.exe'
$report = Join-Path $env:TEMP ([guid]::NewGuid().ToString() + '-correctly-smoke.json')
$process = Start-Process -FilePath $exe -ArgumentList @('--smoke-test', ('"' + $report + '"'), '--port', "$Port") -WindowStyle Hidden -PassThru
if (-not $process.WaitForExit(150000)) { throw 'Smoke test timed out; inspect the owned process before retrying' }
if (-not (Test-Path -LiteralPath $report)) { throw 'Smoke report missing' }
$result = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
if ($process.ExitCode -ne 0 -or -not $result.ok -or -not $result.stopped) { throw "Smoke test failed; report: $report" }
Write-Output "PASS: packaged FR/EN and owned-process shutdown. Report: $report"
