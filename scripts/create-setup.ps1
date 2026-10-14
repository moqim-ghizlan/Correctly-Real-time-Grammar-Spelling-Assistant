param(
    [ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [switch]$CheckOnly,
    [switch]$NoOpen
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$python = Join-Path $repo 'backend/.venv/Scripts/python.exe'
$release = Join-Path $repo 'artifacts/release'
$buildLock = $null
$previousLocation = Get-Location
try {
    Set-Location -LiteralPath $repo
    if (-not $Version) {
        $source = Get-Content -LiteralPath "$repo/backend/src/correctly_server/__init__.py" -Raw
        $match = [regex]::Match($source, '__version__\s*=\s*"(\d+\.\d+\.\d+)"')
        if (-not $match.Success) { throw 'Version serveur introuvable (format attendu : X.Y.Z).' }
        $Version = $match.Groups[1].Value
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Node.js/npm manque sur ce PC de developpement.' }
    foreach ($required in @(
        $python,
        "$repo/node_modules/.bin/vite.cmd",
        "$repo/backend/vendor/runtime/bin/javaw.exe",
        "$repo/backend/vendor/engine/languagetool-server.jar"
    )) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Prerequis manquant : $required" }
    }
    $compiler = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    $compilerPath = if ($compiler) { $compiler.Source } else { $null }
    foreach ($candidate in @(
        "$repo/artifacts/tools/InnoSetup-6.7.3/ISCC.exe",
        "${env:ProgramFiles(x86)}/Inno Setup 6/ISCC.exe",
        "$env:LOCALAPPDATA/Programs/Inno Setup 6/ISCC.exe"
    )) {
        if (-not $compilerPath -and (Test-Path -LiteralPath $candidate)) { $compilerPath = $candidate }
    }
    if (-not $compilerPath) { throw 'Inno Setup manque. Voir installer/README.md.' }
    Write-Host "Creation du Setup Correctly $Version"
    if ($CheckOnly) {
        Write-Host 'OK : prerequis disponibles. Aucune compilation lancee.'
        return
    }
    New-Item -ItemType Directory -Force -Path "$repo/artifacts" | Out-Null
    # Exclusive handle prevents concurrent builds from sharing PyInstaller's workdir.
    $buildLock = [IO.File]::Open("$repo/artifacts/createSetup.lock", [IO.FileMode]::OpenOrCreate,
        [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $buildDir = Join-Path $repo ('artifacts/setup-builds/' + [guid]::NewGuid().ToString('N'))

    Write-Host '[1/3] Compilation de l extension Chrome/Brave...'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'La compilation de l extension a echoue.' }

    Write-Host '[2/3] Compilation du serveur Windows et verification du moteur...'
    & $python "$PSScriptRoot/build_windows.py" --output-dir $buildDir --skip-archive
    if ($LASTEXITCODE -ne 0) { throw 'La compilation du serveur a echoue.' }

    Write-Host '[3/3] Creation du Setup, du ZIP extension et des checksums...'
    & "$PSScriptRoot/build-installer.ps1" -Version $Version -BundlePath "$buildDir/Correctly-V3-Windows-x64" -OutputDir $release -ISCCPath $compilerPath
    if (-not (Test-Path -LiteralPath "$release/Correctly-V3.1-Setup.exe")) { throw 'Setup final introuvable.' }

    Write-Host ''
    Write-Host 'Termine ! Les fichiers a envoyer sont dans artifacts\release :'
    Write-Host '  Correctly-V3.1-Setup.exe'
    Write-Host '  Correctly-Extension.zip'
    Write-Host '  SHA256SUMS.txt'
    Write-Host 'Les anciens builds sont conserves. La compilation ne remplace pas les tests de validation.'
    if (-not $NoOpen) { Start-Process -FilePath explorer.exe -ArgumentList ('"' + $release + '"') }
} catch {
    Write-Host ("ERREUR : " + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($buildLock) { $buildLock.Dispose() }
    Set-Location -LiteralPath $previousLocation.Path
}
