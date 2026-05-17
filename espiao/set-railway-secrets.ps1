# Configura secrets no Railway via API sem exibir valores no terminal
# Execute: .\set-railway-secrets.ps1
# Os valores que você digitar aparecem como *** no terminal

$TOKEN = "1b2d31c4-8c1b-476e-bbf0-ded53d6d6701"
$SERVICE_ID = "aff8a743-7640-40fd-9bf6-f8234f43b7f1"
$ENVIRONMENT_ID = "019ddaef-9402-4817-8d42-a71930b1bc1b"
$PROJECT_ID = "a81628ac-31fd-476c-b5ae-9d7c99f6a7ac"
$API = "https://backboard.railway.app/graphql/v2"

function Set-RailwayVar {
    param($Key, $Value)
    $body = @{
        query = "mutation { variableCollectionUpsert(input: { projectId: `"$PROJECT_ID`", environmentId: `"$ENVIRONMENT_ID`", serviceId: `"$SERVICE_ID`", variables: { $Key`: `"$Value`" } }) }"
    } | ConvertTo-Json
    $result = Invoke-RestMethod -Uri $API -Method POST `
        -Headers @{ "Authorization" = "Bearer $TOKEN"; "Content-Type" = "application/json" } `
        -Body $body
    if ($result.data.variableCollectionUpsert -eq $true) {
        Write-Host "  [OK] $Key configurado" -ForegroundColor Green
    } else {
        Write-Host "  [ERRO] $Key falhou" -ForegroundColor Red
        Write-Host ($result | ConvertTo-Json)
    }
}

Write-Host "`n=== Configurando secrets no Railway ===" -ForegroundColor Cyan
Write-Host "Os valores digitados aparecem como *** no terminal`n"

# DATABASE_URL
Write-Host "Cole a DATABASE_URL do Supabase (pooling, porta 6543, sslmode=require):"
$db = Read-Host -AsSecureString
$dbPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($db))
Set-RailwayVar "DATABASE_URL" $dbPlain

# REDIS_HOST
Write-Host "`nCole o REDIS_HOST (ex: seu-host.upstash.io):"
$rh = Read-Host
Set-RailwayVar "REDIS_HOST" $rh

# REDIS_PORT
Set-RailwayVar "REDIS_PORT" "6379"
Write-Host "  [OK] REDIS_PORT=6379 configurado" -ForegroundColor Green

# REDIS_PASSWORD
Write-Host "`nCole o REDIS_PASSWORD (token Upstash):"
$rp = Read-Host -AsSecureString
$rpPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($rp))
Set-RailwayVar "REDIS_PASSWORD" $rpPlain

# OPENAI_API_KEY
Write-Host "`nCole o OPENAI_API_KEY (sk-proj-...):"
$oai = Read-Host -AsSecureString
$oaiPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($oai))
Set-RailwayVar "OPENAI_API_KEY" $oaiPlain

Write-Host "`n=== Configurando JWT secrets fortes ===" -ForegroundColor Cyan
Write-Host "Gerando JWT_SECRET e JWT_REFRESH_SECRET seguros automaticamente..."

$jwtSecret = -join ((1..64) | ForEach-Object { [char](Get-Random -Minimum 65 -Maximum 91) + [char](Get-Random -Minimum 97 -Maximum 123) } | Get-Random -Count 64)
$jwtRefresh = -join ((1..64) | ForEach-Object { [char](Get-Random -Minimum 65 -Maximum 91) + [char](Get-Random -Minimum 97 -Maximum 123) } | Get-Random -Count 64)
Set-RailwayVar "JWT_SECRET" $jwtSecret
Set-RailwayVar "JWT_REFRESH_SECRET" $jwtRefresh

Write-Host "`n=== Secrets configurados! ===" -ForegroundColor Green
Write-Host "Execute agora o script de migrations: .\run-migrations.ps1"
