# Configura OPENAI_API_KEY no Railway via API
# Secret nunca aparece no terminal (Read-Host -AsSecureString)

$TOKEN = "1b2d31c4-8c1b-476e-bbf0-ded53d6d6701"
$PROJECT_ID = "a81628ac-31fd-476c-b5ae-9d7c99f6a7ac"
$SERVICE_ID = "aff8a743-7640-40fd-9bf6-f8234f43b7f1"
$ENV_ID = "019ddaef-9402-4817-8d42-a71930b1bc1b"
$API = "https://backboard.railway.app/graphql/v2"

Write-Host "`n=== OpenAI API Key ===" -ForegroundColor Cyan
Write-Host "Cole sua OPENAI_API_KEY (sk-proj-...)"
Write-Host "O valor aparecerá como *** no terminal`n"

$secure = Read-Host -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
)

if (-not $plain.StartsWith("sk-")) {
    Write-Host "[AVISO] A chave deve começar com sk-. Verifique e tente novamente." -ForegroundColor Yellow
}

$body = @{
    query = "mutation { variableCollectionUpsert(input: { projectId: `"$PROJECT_ID`", environmentId: `"$ENV_ID`", serviceId: `"$SERVICE_ID`", variables: { OPENAI_API_KEY: `"$plain`", OPENAI_MODEL: `"gpt-4.1-mini`" } }) }"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri $API -Method POST `
    -Headers @{ "Authorization" = "Bearer $TOKEN"; "Content-Type" = "application/json" } `
    -Body $body

if ($result.data.variableCollectionUpsert -eq $true) {
    Write-Host "[OK] OPENAI_API_KEY configurado com sucesso" -ForegroundColor Green
    Write-Host "Aguarde ~60s para redeploy automatico..."
} else {
    Write-Host "[ERRO] Falhou. Resposta:" -ForegroundColor Red
    Write-Host ($result | ConvertTo-Json)
}
