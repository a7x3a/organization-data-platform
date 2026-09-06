[CmdletBinding()]
param(
    [string]$ApiUrl = "http://localhost:4000",
    [string]$AccessToken,
    [int]$BatchSize = 1000,
    [switch]$Apply,
    [switch]$SkipProcessing
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "Updating QAI Data Platform..." -ForegroundColor Cyan
git pull --ff-only origin main

docker compose up --build -d

Write-Host "Waiting for the API..." -ForegroundColor Cyan
$ready = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri "$ApiUrl/health" -Method Get -TimeoutSec 5
        if ($health.status -eq "ok") {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $ready) {
    throw "The API did not become healthy. Run 'docker compose logs -f api' to inspect the startup failure."
}

if ($SkipProcessing) {
    Write-Host "Update complete. Existing data was not processed." -ForegroundColor Yellow
    exit 0
}

if ([string]::IsNullOrWhiteSpace($AccessToken)) {
    throw "AccessToken is required for data processing. Use -AccessToken with a valid Data Manager bearer token, or pass -SkipProcessing."
}

$headers = @{ Authorization = "Bearer $AccessToken" }
$body = @{ apply = [bool]$Apply; limit = $BatchSize } | ConvertTo-Json
$result = Invoke-RestMethod -Uri "$ApiUrl/api/files/process" -Method Post -Headers $headers -ContentType "application/json" -Body $body

Write-Host "Processing mode: $($result.mode)" -ForegroundColor Green
Write-Host "Scanned: $($result.scanned) | Changed: $($result.changed) | Renamed: $($result.renamed) | Duplicates: $($result.duplicates)"

if (-not $Apply) {
    Write-Host "Preview only. Re-run with -Apply after reviewing the result." -ForegroundColor Yellow
} else {
    Write-Host "Existing database metadata and display names were processed. Raw storage files were not deleted or rewritten." -ForegroundColor Green
}
