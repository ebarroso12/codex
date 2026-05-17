# Roda migrations e seed no Railway via API exec
# Execute: .\run-migrations.ps1

$TOKEN = "1b2d31c4-8c1b-476e-bbf0-ded53d6d6701"
$SERVICE_ID = "aff8a743-7640-40fd-9bf6-f8234f43b7f1"
$ENVIRONMENT_ID = "019ddaef-9402-4817-8d42-a71930b1bc1b"

Write-Host "=== Migrations Prisma ===" -ForegroundColor Cyan
Write-Host "Abra o terminal do Railway e execute estes comandos:"
Write-Host ""
Write-Host "1. Migrations:" -ForegroundColor Yellow
Write-Host "   npx prisma migrate deploy --schema packages/database/prisma/schema.prisma"
Write-Host ""
Write-Host "2. Seed admin:" -ForegroundColor Yellow
Write-Host "   npm run prisma:seed"
Write-Host ""
Write-Host "Para abrir o terminal Railway:" -ForegroundColor Cyan
Write-Host "   https://railway.app/project/a81628ac-31fd-476c-b5ae-9d7c99f6a7ac"
Write-Host "   Service -> Deployments -> abrir o terminal (icone >_)"
