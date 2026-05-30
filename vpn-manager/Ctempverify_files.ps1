$baseDir = "C:\Users\i201720174\Desktop\ProyectoVPN_3.0\vpn-manager\src\components\Common\M5FullInfoModal"

$expectedFiles = @(
    "M5FullInfoModal.tsx",
    "index.ts",
    "types.ts",
    "constants.ts",
    "README.md",
    "hooks\useCopiedIpState.ts",
    "components\M5Row.tsx",
    "components\M5Section.tsx",
    "components\IfaceBlock.tsx",
    "components\ModalBackdrop.tsx",
    "components\ModalHeader.tsx",
    "components\ModalContent.tsx",
    "components\EmptyState.tsx",
    "components\SystemSection.tsx",
    "components\WirelessSection.tsx",
    "components\InterfacesSection.tsx",
    "components\ServicesSection.tsx",
    "utils\deviceFamily.ts",
    "utils\styles.ts",
    "utils\formatters.ts",
    "EXTRACTION_PLAN.md",
    "EXTRACTION_PLAN_FINAL.md"
)

Write-Host "=== VERIFICACIÓN DE ARCHIVOS PLAN M5FullInfoModal ===" -ForegroundColor Cyan
Write-Host ""

$created = 0
$missing = @()

foreach ($file in $expectedFiles) {
    $fullPath = Join-Path $baseDir $file
    if (Test-Path $fullPath) {
        Write-Host "✅ $file" -ForegroundColor Green
        $created++
    } else {
        Write-Host "❌ FALTA: $file" -ForegroundColor Red
        $missing += $file
    }
}

Write-Host ""
Write-Host "=== RESUMEN ===" -ForegroundColor Yellow
Write-Host "Archivos esperados: $($expectedFiles.Count)"
Write-Host "Archivos creados: $created" -ForegroundColor Green
Write-Host "Archivos faltantes: $($missing.Count)" -ForegroundColor $(if ($missing.Count -eq 0) { "Green" } else { "Red" })

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Faltantes:" -ForegroundColor Red
    foreach ($m in $missing) {
        Write-Host "  - $m"
    }
}
