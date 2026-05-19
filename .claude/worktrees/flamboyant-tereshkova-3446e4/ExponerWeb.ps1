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

# Si ya hay un túnel ejecutándose, lo detenemos primero para evitar conflictos
if (Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue) {
    Write-Host ">>> Deteniendo túnel anterior..." -ForegroundColor Yellow
    Stop-Process -Name "cloudflared" -Force
    Start-Sleep -Seconds 1
}

if (Test-Path "cloudflare.log") {
    Remove-Item "cloudflare.log" -Force
}

# 2. Iniciar el túnel en segundo plano y redirigir su salida para leer la URL
Write-Host ">>> Iniciando cloudflared... Espera unos segundos mientras se genera tu enlace público..." -ForegroundColor Cyan

Start-Process -FilePath $exePath -ArgumentList "tunnel","--url","http://localhost:5173" -RedirectStandardError "cloudflare.log" -WindowStyle Hidden

# Esperamos hasta encontrar la URL en el archivo
$retry = 0
$urlFound = $false
while (-not $urlFound -and $retry -lt 15) {
    Start-Sleep -Seconds 2
    if (Test-Path "cloudflare.log") {
        $content = Get-Content "cloudflare.log" -Raw
        if ($content -match "(https://[a-zA-Z0-9-]+\.trycloudflare\.com)") {
            $url = $matches[1]
            Write-Host "================================================================" -ForegroundColor Green
            Write-Host "TU ENLACE PÚBLICO HA SIDO GENERADO CON ÉXITO:" -ForegroundColor Green
            Write-Host ""
            Write-Host "-> $url/GestionVPN-1.0/ <-" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "================================================================" -ForegroundColor Green
            Write-Host "El túnel se está ejecutando en segundo plano de manera continua." -ForegroundColor Cyan
            Write-Host "Nota: Cuando quieras apagar la web, usa el siguiente comando:" -ForegroundColor Cyan
            Write-Host "Stop-Process -Name cloudflared" -ForegroundColor White
            $urlFound = $true
        }
    }
    $retry++
}

if (-not $urlFound) {
    Write-Host "Tiempo de espera agotado o hubo un error obteniendo la URL." -ForegroundColor Red
    Write-Host "Abre el archivo 'cloudflare.log' para ver qué falló." -ForegroundColor Yellow
}
