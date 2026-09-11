$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/Donacgreece/Ritmexa.git"
$Branch = "main"
$Downloads = Join-Path $env:USERPROFILE "Downloads"
$RepoPath = "C:\RitmexaPush"
$ExtractPath = "C:\RitmexaExtract"

function Pause-Ritmexa {
    Write-Host ""
    Write-Host "Press ENTER to close..." -ForegroundColor Yellow
    Read-Host | Out-Null
}

function Fail-Ritmexa {
    param([string]$Message)

    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    Pause-Ritmexa
    exit 1
}

try {
    Set-Location "C:\"

    Write-Host ""
    Write-Host "========================================" -ForegroundColor DarkGray
    Write-Host " Ritmexa ZIP Build and Push" -ForegroundColor Magenta
    Write-Host "========================================" -ForegroundColor DarkGray
    Write-Host ""

    foreach ($cmd in @("git", "gh", "node", "npm")) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            Fail-Ritmexa "$cmd is not installed or is not available in PATH."
        }
    }

    Write-Host "[1/7] Finding latest Ritmexa ZIP in Downloads..." -ForegroundColor Cyan

    $Zip = Get-ChildItem -Path $Downloads -Filter "Ritmexa*.zip" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $Zip) {
        Fail-Ritmexa "No Ritmexa ZIP was found in $Downloads"
    }

    Write-Host "Using: $($Zip.FullName)" -ForegroundColor Green

    Write-Host ""
    Write-Host "[2/7] Checking GitHub login..." -ForegroundColor Cyan

    & gh auth status *> $null

    if ($LASTEXITCODE -ne 0) {
        Write-Host "GitHub login is required. A browser window will open." -ForegroundColor Yellow
        & gh auth login --hostname github.com --git-protocol https --web

        if ($LASTEXITCODE -ne 0) {
            Fail-Ritmexa "GitHub login failed."
        }
    }

    & gh auth setup-git

    if ($LASTEXITCODE -ne 0) {
        Fail-Ritmexa "Could not configure GitHub authentication for Git."
    }

    Write-Host "GitHub login OK." -ForegroundColor Green

    Write-Host ""
    Write-Host "[3/7] Preparing clean working folders..." -ForegroundColor Cyan

    if (Test-Path $RepoPath) {
        Remove-Item $RepoPath -Recurse -Force
    }

    if (Test-Path $ExtractPath) {
        Remove-Item $ExtractPath -Recurse -Force
    }

    New-Item -ItemType Directory -Path $ExtractPath | Out-Null

    Write-Host ""
    Write-Host "[4/7] Cloning Ritmexa repository..." -ForegroundColor Cyan

    & git clone $RepoUrl $RepoPath

    if ($LASTEXITCODE -ne 0) {
        Fail-Ritmexa "git clone failed."
    }

    Write-Host ""
    Write-Host "[5/7] Extracting the release and replacing project files..." -ForegroundColor Cyan

    Expand-Archive -Path $Zip.FullName -DestinationPath $ExtractPath -Force

    $PackageFile = Get-ChildItem -Path $ExtractPath -Filter "package.json" -File -Recurse |
        Select-Object -First 1

    if (-not $PackageFile) {
        Fail-Ritmexa "package.json was not found inside the ZIP."
    }

    $SourcePath = $PackageFile.Directory.FullName
    Write-Host "Project source: $SourcePath" -ForegroundColor DarkGray

    Get-ChildItem -Path $RepoPath -Force |
        Where-Object { $_.Name -ne ".git" } |
        Remove-Item -Recurse -Force

    Get-ChildItem -Path $SourcePath -Force | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $RepoPath -Recurse -Force
    }

    Set-Location $RepoPath

    Write-Host ""
    Write-Host "[6/7] Installing dependencies and validating production build..." -ForegroundColor Cyan

    if (Test-Path "package-lock.json") { Remove-Item "package-lock.json" -Force }

    & npm install --no-audit --no-fund

    if ($LASTEXITCODE -ne 0) {
        Fail-Ritmexa "npm install failed. Nothing was pushed."
    }

    & npm run check

    if ($LASTEXITCODE -ne 0) {
        Fail-Ritmexa "TypeScript check failed. Nothing was pushed."
    }

    & npm run build

    if ($LASTEXITCODE -ne 0) {
        Fail-Ritmexa "Production build failed. Nothing was pushed."
    }

    if (-not (Test-Path "dist")) {
        Fail-Ritmexa "The production build completed but the dist folder was not created. Nothing was pushed."
    }

    Write-Host "Production build passed." -ForegroundColor Green

    Write-Host ""
    Write-Host "[7/7] Committing and pushing to GitHub..." -ForegroundColor Cyan

    & git add -A

    if ($LASTEXITCODE -ne 0) {
        Fail-Ritmexa "git add failed."
    }

    $Changes = & git status --porcelain

    if (-not $Changes) {
        Write-Host "Nothing changed. The repository is already up to date." -ForegroundColor Yellow
        Pause-Ritmexa
        exit 0
    }

    $PackageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
    $Version = if ($PackageJson.version) { "v$($PackageJson.version)" } else { "update" }
    $CommitMessage = "Ritmexa $Version"

    & git commit -m $CommitMessage

    if ($LASTEXITCODE -ne 0) {
        Fail-Ritmexa "git commit failed."
    }

    & git push origin $Branch

    if ($LASTEXITCODE -ne 0) {
        Fail-Ritmexa "git push failed."
    }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor DarkGray
    Write-Host " Ritmexa pushed successfully." -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Repository: https://github.com/Donacgreece/Ritmexa" -ForegroundColor Cyan
    Write-Host "Live app:    https://donacgreece.github.io/Ritmexa/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "GitHub Actions will deploy the new version automatically." -ForegroundColor Green
}
catch {
    Fail-Ritmexa $_.Exception.Message
}

Pause-Ritmexa
