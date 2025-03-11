# PowerShell script to verify the directory structure for AWS Amplify deployment
# Run this script from the root of your repository before pushing to GitHub

$ErrorActionPreference = "Stop"
Write-Host "Verifying repository structure for AWS Amplify deployment..." -ForegroundColor Cyan

# Check if frontend directory exists
if (-not (Test-Path -Path "frontend")) {
    Write-Host "ERROR: frontend directory not found at repository root!" -ForegroundColor Red
    Write-Host "Your repository structure should have a 'frontend' directory at the root level." -ForegroundColor Yellow
    exit 1
}

# Check for essential Next.js files
$essentialFiles = @("package.json", "next.config.js", "tsconfig.json")
foreach ($file in $essentialFiles) {
    if (-not (Test-Path -Path "frontend/$file")) {
        Write-Host "ERROR: Required file '$file' not found in frontend directory!" -ForegroundColor Red
        exit 1
    }
}

# Check if amplify.yml exists at the root
if (-not (Test-Path -Path "amplify.yml")) {
    Write-Host "WARNING: amplify.yml not found at repository root!" -ForegroundColor Yellow
    Write-Host "You should have an amplify.yml file at the root of your repository for AWS Amplify deployments." -ForegroundColor Yellow
}

# Verify the content of package.json
$packageJsonContent = Get-Content -Path "frontend/package.json" -Raw | ConvertFrom-Json
if (-not $packageJsonContent.scripts.build) {
    Write-Host "ERROR: No 'build' script found in package.json!" -ForegroundColor Red
    exit 1
}

Write-Host "Repository structure verification complete!" -ForegroundColor Green
Write-Host "Your project appears to have the correct structure for AWS Amplify deployment." -ForegroundColor Green

# Display recommended next steps
Write-Host "`nRecommended next steps:" -ForegroundColor Cyan
Write-Host "1. Commit and push your changes to GitHub"
Write-Host "2. In the AWS Amplify console, ensure your build settings match the ones in amplify.yml"
Write-Host "3. Set up any required environment variables (like NEXT_PUBLIC_API_URL)"
Write-Host "4. Click 'Save and deploy' in the AWS Amplify console" 