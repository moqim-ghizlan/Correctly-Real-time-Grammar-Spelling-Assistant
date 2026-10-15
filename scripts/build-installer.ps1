param(
    [ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version = '3.1.0',
    [string]$BundlePath,
    [string]$OutputDir,
    [string]$ISCCPath,
    [switch]$TestMode,
    [ValidatePattern('^[A-Za-z0-9.-]+$')][string]$SetupName = 'Correctly-V3.1-Setup'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (-not $BundlePath) { $BundlePath = Join-Path $repo 'artifacts/v3.1/Correctly-V3-Windows-x64' }
if (-not $OutputDir) { $OutputDir = Join-Path $repo 'artifacts/release' }
$bundle = (Resolve-Path -LiteralPath $BundlePath).Path
$output = [IO.Path]::GetFullPath($OutputDir)
if ($output -eq $repo -or $output -eq [IO.Path]::GetPathRoot($output) -or
    $output.StartsWith($bundle + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $bundle.StartsWith($output + '\', [StringComparison]::OrdinalIgnoreCase) -or $output -eq $bundle) {
    throw 'Use a dedicated output directory separate from the bundle'
}
if (-not $ISCCPath) {
    $found = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($found) { $ISCCPath = $found.Source }
    foreach ($candidate in @(
        (Join-Path $repo 'artifacts/tools/InnoSetup-6.7.3/ISCC.exe'),
        "${env:ProgramFiles(x86)}/Inno Setup 6/ISCC.exe",
        "$env:LOCALAPPDATA/Programs/Inno Setup 6/ISCC.exe"
    )) {
        if (-not $ISCCPath -and (Test-Path -LiteralPath $candidate)) { $ISCCPath = $candidate }
    }
}
if (-not $ISCCPath) { throw 'ISCC.exe missing. See installer/README.md for verified build-tool provisioning.' }
$compiler = (Resolve-Path -LiteralPath $ISCCPath).Path
New-Item -ItemType Directory -Force -Path $output | Out-Null
# Each build gets its own staging folder. Never recursively clean artifacts or source.
$stage = Join-Path $output ('build-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
$python = Join-Path $repo 'backend/.venv/Scripts/python.exe'
& $python "$PSScriptRoot/installer_bundle.py" --bundle $bundle --report "$stage/bundle-files.json" --extension-zip "$stage/Correctly-Extension.zip"
if ($LASTEXITCODE -ne 0) { throw 'Installer input validation failed' }
$testValue = '0'
if ($TestMode) { $testValue = '1' }
$compileLog = Join-Path $stage 'compiler.log'
& $compiler "/DMyAppVersion=$Version" "/DMyOutputBase=$SetupName" "/DBundleDir=$bundle" "/DReleaseDir=$stage" "/DTestMode=$testValue" "$repo/installer/Correctly.iss" | Tee-Object -FilePath $compileLog | Select-String -Pattern '^Compiler engine version:|Correctly compiler version:|^Error|^Successful compile'
if ($LASTEXITCODE -ne 0) { throw "ISCC failed; staging retained at $stage" }
$versionMatch = [regex]::Match((Get-Content -LiteralPath $compileLog -Raw), 'Compiler engine version: Inno Setup (\d+\.\d+\.\d+)')
if (-not $versionMatch.Success) { throw 'Compiler version evidence missing' }
$compilerVersion = $versionMatch.Groups[1].Value
$setupFile = $SetupName + '.exe'
$setup = Join-Path $stage $setupFile
if (-not (Test-Path -LiteralPath $setup)) { throw 'Compiler did not produce the expected EXE' }
$inputs = Get-Content -LiteralPath "$stage/bundle-files.json" -Raw | ConvertFrom-Json
$release = [ordered]@{
    version = $Version
    test_mode = [bool]$TestMode
    built_at = [DateTime]::UtcNow.ToString('o')
    compiler_version = $compilerVersion
    bundle_file_count = $inputs.file_count
    bundle_bytes = $inputs.bytes
    engine_version = $inputs.engine_version
    runtime_version = $inputs.runtime_version
    setup_bytes = (Get-Item -LiteralPath $setup).Length
    setup_sha256 = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
    extension_sha256 = (Get-FileHash -LiteralPath "$stage/Correctly-Extension.zip" -Algorithm SHA256).Hash.ToLowerInvariant()
    signature = (Get-AuthenticodeSignature -LiteralPath $setup).Status.ToString()
}
$release | ConvertTo-Json | Set-Content -LiteralPath "$stage/release-manifest.json" -Encoding UTF8
@(
    ($release.setup_sha256 + '  ' + $setupFile),
    ($release.extension_sha256 + '  Correctly-Extension.zip')
) | Set-Content -LiteralPath "$stage/SHA256SUMS.txt" -Encoding ASCII
$names = @($setupFile, 'Correctly-Extension.zip', 'release-manifest.json', 'bundle-files.json', 'SHA256SUMS.txt')
$previous = Join-Path $stage 'previous-release'
foreach ($name in $names) {
    $destination = Join-Path $output $name
    if (Test-Path -LiteralPath $destination) {
        New-Item -ItemType Directory -Force -Path $previous | Out-Null
        Move-Item -LiteralPath $destination -Destination (Join-Path $previous $name)
    }
    Copy-Item -LiteralPath (Join-Path $stage $name) -Destination $destination
}
Write-Output "Built: $output/$setupFile"
Write-Output "Bytes: $($release.setup_bytes); SHA-256: $($release.setup_sha256); test mode: $TestMode"
