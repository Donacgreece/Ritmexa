$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/Donacgreece/Ritmexa.git"
$CommitMessage = "Ritmexa v0.1.0 - mobile-first PWA"

Write-Host "Ritmexa v0.1.0 - preflight" -ForegroundColor Coral

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed or not available in PATH."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is not installed or not available in PATH."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is not installed or not available in PATH."
}

Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

Write-Host "Running production build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Production build failed. Nothing was pushed." }

if (-not (Test-Path ".git")) {
    git init
}

git branch -M main

$origin = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
    git remote set-url origin $RepoUrl
} else {
    git remote add origin $RepoUrl
}

git add .

$hasChanges = git status --porcelain
if ($hasChanges) {
    git commit -m $CommitMessage
} else {
    Write-Host "No local changes to commit." -ForegroundColor Yellow
}

Write-Host "Pushing Ritmexa to GitHub..." -ForegroundColor Cyan
git push -u origin main
if ($LASTEXITCODE -ne 0) {
    throw "Git push failed. Make sure GitHub authentication is configured for this PC."
}

Write-Host "Ritmexa v0.1.0 pushed successfully." -ForegroundColor Green
Write-Host "Repository: $RepoUrl" -ForegroundColor Green
