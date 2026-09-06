$ErrorActionPreference = 'Stop'

$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCommand) {
  $dockerPath = $dockerCommand.Source
} else {
  $dockerCandidates = @(
    (Join-Path $env:LocalAppData 'Programs\DockerDesktop\resources\bin\docker.exe'),
    'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
  )
  $dockerPath = $dockerCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $dockerPath) {
  throw 'Docker CLI was not found. Install or start Docker Desktop, then try again.'
}

$rootEnv = @{}
$envPath = Join-Path $PSScriptRoot '.env'
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $rootEnv[$Matches[1]] = $Matches[2].Trim() }
  }
}
$apiPort = if ($rootEnv.PORT) { $rootEnv.PORT } else { '3002' }
$liveKitPort = if ($rootEnv.LIVEKIT_HTTP_PORT) { $rootEnv.LIVEKIT_HTTP_PORT } else { '7880' }
$whipPort = if ($rootEnv.INGRESS_WHIP_PORT) { $rootEnv.INGRESS_WHIP_PORT } else { '8080' }
$rtmpPort = if ($rootEnv.INGRESS_RTMP_PORT) { $rootEnv.INGRESS_RTMP_PORT } else { '1935' }
$browserPort = if ($rootEnv.BROWSER_DESKTOP_PORT) { $rootEnv.BROWSER_DESKTOP_PORT } else { '6080' }

& $dockerPath compose --profile ingress --profile browser up -d redis livekit ingress browser-service browser-desktop

Write-Host "LiveKit:  ws://localhost:$liveKitPort"
Write-Host "Ingress:  http://localhost:$whipPort (WHIP), rtmp://localhost:$rtmpPort/live"
Write-Host "Firefox:  http://localhost:$browserPort/vnc.html?autoconnect=1&resize=scale"
Write-Host "API:      http://localhost:$apiPort"
Write-Host 'Web:      http://localhost:5173'

npm run dev
