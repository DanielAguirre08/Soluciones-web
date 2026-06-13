Set-Location -LiteralPath "$PSScriptRoot\frontend"
$nodePath = Join-Path $env:ProgramFiles "nodejs"
$npmGlobalPath = Join-Path $env:APPDATA "npm"
$toolPaths = @($nodePath, $npmGlobalPath) | Where-Object { Test-Path $_ }
$env:PATH = ($toolPaths + $env:PATH) -join ";"
npm run build
npx http-server dist/frontend/browser -p 4200 -c-1
