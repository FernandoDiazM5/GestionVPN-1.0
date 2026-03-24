# Script para exponer la web a internet mediante Cloudflare (Sin cuenta)
# Descarga automáticamente cloudflared.exe si no existe y luego inicia el túnel apuntando al puerto de React/Vite (5173).

$exePath = ".\cloudflared-windows-amd64.exe"
$url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

# 1. Comprobar si ya existe el ejecutable
if (-Not (Test-Path $exePath)) {
    Write-Host ">>> Descargando Cloudflare Tunnel (cloudflared.exe)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $url -OutFile $exePath
    Write-Host ">>> Descarga completada." -ForegroundColor Green
} else {
    Write-Host ">>> Cloudflare Tunnel ya esta descargado." -ForegroundColor Green
}

Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "Iniciando túnel seguro. " -ForegroundColor Yellow
Write-Host "Busca en las líneas de abajo un enlace que termina en .trycloudflare.com" -ForegroundColor Yellow
Write-Host "Esa es la URL que debes compartir (no olvides agregarle /GestionVPN-1.0/ al final)." -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow

# 2. Iniciar el túnel hacia el puerto de Vite (5173)
& $exePath tunnel --url http://localhost:5173
