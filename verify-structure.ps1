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

# Check for Supabase environment variables in .env.local
Write-Host "Checking for Supabase environment variables..." -ForegroundColor Cyan
$envFileExists = Test-Path -Path "frontend/.env.local"
if ($envFileExists) {
    $envFileContent = Get-Content -Path "frontend/.env.local" -Raw
    $hasSupabaseUrl = $envFileContent -match "NEXT_PUBLIC_SUPABASE_URL"
    $hasSupabaseKey = $envFileContent -match "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    
    if (-not $hasSupabaseUrl -or -not $hasSupabaseKey) {
        Write-Host "WARNING: Supabase environment variables missing in .env.local file!" -ForegroundColor Yellow
        Write-Host "Make sure to add these variables in the AWS Amplify Console:" -ForegroundColor Yellow
        Write-Host "  - NEXT_PUBLIC_SUPABASE_URL" -ForegroundColor Yellow
        Write-Host "  - NEXT_PUBLIC_SUPABASE_ANON_KEY" -ForegroundColor Yellow
    } else {
        Write-Host "  ✓ Supabase environment variables found in .env.local" -ForegroundColor Green
    }
} else {
    Write-Host "WARNING: No .env.local file found!" -ForegroundColor Yellow
    Write-Host "Make sure to add these required variables in the AWS Amplify Console:" -ForegroundColor Yellow
    Write-Host "  - NEXT_PUBLIC_SUPABASE_URL" -ForegroundColor Yellow
    Write-Host "  - NEXT_PUBLIC_SUPABASE_ANON_KEY" -ForegroundColor Yellow
}

Write-Host "Repository structure verification complete!" -ForegroundColor Green
Write-Host "Your project appears to have the correct structure for AWS Amplify deployment." -ForegroundColor Green

# Display recommended next steps
Write-Host "`nRecommended next steps:" -ForegroundColor Cyan
Write-Host "1. Commit and push your changes to GitHub"
Write-Host "2. In the AWS Amplify console, ensure your build settings match the ones in amplify.yml"
Write-Host "3. Set up required environment variables:"
Write-Host "   - NEXT_PUBLIC_SUPABASE_URL"
Write-Host "   - NEXT_PUBLIC_SUPABASE_ANON_KEY"
Write-Host "   - NEXT_PUBLIC_API_URL (if connecting to your EC2 backend)"
Write-Host "4. Click 'Save and deploy' in the AWS Amplify console" 