# Configura variáveis Meta WhatsApp no Railway via API
# Secrets nunca aparecem no terminal

$TOKEN = "1b2d31c4-8c1b-476e-bbf0-ded53d6d6701"
$PROJECT_ID = "a81628ac-31fd-476c-b5ae-9d7c99f6a7ac"
$SERVICE_ID = "aff8a743-7640-40fd-9bf6-f8234f43b7f1"
$ENV_ID = "019ddaef-9402-4817-8d42-a71930b1bc1b"
$API = "https://backboard.railway.app/graphql/v2"

function Get-SecureInput($prompt) {
    Write-Host $prompt
    $s = Read-Host -AsSecureString
    return [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    )
}

function Get-PlainInput($prompt) {
    Write-Host $prompt
    return Read-Host
}

Write-Host "`n=== Meta WhatsApp Business Cloud API ===" -ForegroundColor Cyan
Write-Host "Onde encontrar cada valor: README_WHATSAPP_CONNECT.md`n"

$accessToken  = Get-SecureInput "1. META_WHATSAPP_ACCESS_TOKEN (EAAxxxx...):"
$phoneId      = Get-PlainInput  "2. META_WHATSAPP_PHONE_NUMBER_ID (somente numeros):"
$bizAccountId = Get-PlainInput  "3. META_WHATSAPP_BUSINESS_ACCOUNT_ID (somente numeros):"
$appSecret    = Get-SecureInput "4. META_WHATSAPP_APP_SECRET (hex string):"

# VERIFY_TOKEN is user-defined — generate one or let user choose
Write-Host "`n5. META_WHATSAPP_VERIFY_TOKEN"
Write-Host "   Este valor VOCE define (qualquer string segura)."
Write-Host "   Use o gerado abaixo ou escreva o seu:"
$generated = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
Write-Host "   Sugerido: $generated" -ForegroundColor Yellow
$verifyToken = Read-Host "   Cole aqui (Enter = usar o sugerido)"
if (-not $verifyToken) { $verifyToken = $generated }

Write-Host "`nConfigurando no Railway..." -ForegroundColor Cyan

$vars = @{
    META_WHATSAPP_ACCESS_TOKEN       = $accessToken
    META_WHATSAPP_PHONE_NUMBER_ID    = $phoneId
    META_WHATSAPP_BUSINESS_ACCOUNT_ID = $bizAccountId
    META_WHATSAPP_APP_SECRET         = $appSecret
    META_WHATSAPP_VERIFY_TOKEN       = $verifyToken
    META_WHATSAPP_API_VERSION        = "v21.0"
}

$varStr = ($vars.GetEnumerator() | ForEach-Object { "$($_.Key): `"$($_.Value)`"" }) -join ", "
$body = @{
    query = "mutation { variableCollectionUpsert(input: { projectId: `"$PROJECT_ID`", environmentId: `"$ENV_ID`", serviceId: `"$SERVICE_ID`", variables: { $varStr } }) }"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri $API -Method POST `
    -Headers @{ "Authorization" = "Bearer $TOKEN"; "Content-Type" = "application/json" } `
    -Body $body

if ($result.data.variableCollectionUpsert -eq $true) {
    Write-Host "[OK] Variaveis Meta configuradas com sucesso" -ForegroundColor Green
    Write-Host ""
    Write-Host "=== ANOTE AGORA ===" -ForegroundColor Yellow
    Write-Host "Webhook URL: https://codex-production-3bc8.up.railway.app/whatsapp/webhook"
    Write-Host "Verify Token: $verifyToken" -ForegroundColor Green
    Write-Host ""
    Write-Host "Use esses valores no painel Meta > WhatsApp > Webhook"
} else {
    Write-Host "[ERRO]" -ForegroundColor Red
    Write-Host ($result | ConvertTo-Json)
}
