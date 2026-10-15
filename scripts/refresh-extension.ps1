param(
    [Parameter(Mandatory=$true)][string]$BundlePath,
    [string]$ReleaseDir = 'artifacts/release',
    [ValidatePattern('^[A-Za-z0-9.-]+\.exe$')][string]$SetupFile = 'Correctly-V4-RC1-Setup.exe'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$release = (Resolve-Path -LiteralPath $ReleaseDir).Path
$setup = Join-Path $release $SetupFile
$manifestPath = Join-Path $release 'release-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.setup_sha256) { throw 'Setup checksum differs from release manifest' }
$lock = [IO.File]::Open("$repo/artifacts/createSetup.lock", [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
    $stage = Join-Path $release ('extension-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage | Out-Null
    & "$repo/backend/.venv/Scripts/python.exe" "$PSScriptRoot/installer_bundle.py" --bundle $BundlePath --report "$stage/bundle-files.json" --extension-zip "$stage/Correctly-Extension.zip"
    if ($LASTEXITCODE -ne 0) { throw 'Extension validation failed' }
    $extension = Get-Content -LiteralPath "$repo/dist/manifest.json" -Raw | ConvertFrom-Json
    $manifest.extension_sha256 = (Get-FileHash -LiteralPath "$stage/Correctly-Extension.zip" -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifest | Add-Member -Force NoteProperty extension_version $extension.version
    $manifest | Add-Member -Force NoteProperty extension_version_name $extension.version_name
    $manifest | Add-Member -Force NoteProperty extension_refreshed_at ([DateTime]::UtcNow.ToString('o'))
    $manifest | ConvertTo-Json | Set-Content -LiteralPath "$stage/release-manifest.json" -Encoding UTF8
    @(
        ($manifest.setup_sha256 + '  ' + $SetupFile),
        ($manifest.extension_sha256 + '  Correctly-Extension.zip')
    ) | Set-Content -LiteralPath "$stage/SHA256SUMS.txt" -Encoding ASCII
    $previous = Join-Path $stage 'previous-release'
    New-Item -ItemType Directory -Path $previous | Out-Null
    foreach ($name in @('Correctly-Extension.zip', 'release-manifest.json', 'SHA256SUMS.txt')) {
        Copy-Item -LiteralPath (Join-Path $release $name) -Destination (Join-Path $previous $name)
        Copy-Item -LiteralPath (Join-Path $stage $name) -Destination (Join-Path $release $name) -Force
    }
    Write-Output "Refreshed validated extension $($extension.version_name); SHA-256: $($manifest.extension_sha256)"
} finally { $lock.Dispose() }
