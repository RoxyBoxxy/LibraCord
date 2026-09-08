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

# Development services run on the host while LiveKit runs in Docker. Override
# production-facing URLs from .env so tokens issued by the local API point at
# Docker's published host port rather than the container-only address.
$env:LIVEKIT_URL = "ws://localhost:$liveKitPort"
$env:LIVEKIT_INTERNAL_URL = "ws://localhost:$liveKitPort"
$env:LIVEKIT_USE_EXTERNAL_IP = 'false'
$env:NODE_ENV = 'development'
$env:CLIENT_ORIGIN = 'http://localhost:5173'
$env:PUBLIC_URL = "http://localhost:$apiPort"
$env:DESKTOP_HOME_SERVER = "http://localhost:$apiPort"
$env:DESKTOP_CLIENT_URL = 'http://localhost:5173'
$defaultRoute = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
  Sort-Object RouteMetric, InterfaceMetric |
  Select-Object -First 1
$localRtcAddress = if ($defaultRoute) {
  Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $defaultRoute.InterfaceIndex -ErrorAction SilentlyContinue |
    Where-Object { $_.AddressState -eq 'Preferred' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -First 1 -ExpandProperty IPAddress
}
if (-not $localRtcAddress) {
  throw 'Could not determine the local IPv4 address LiveKit should advertise.'
}
$env:LIVEKIT_NODE_IP = $localRtcAddress
$env:LIVEKIT_TURN_ENABLED = 'false'

# Do not reuse a LibraCord API process that was started with production .env
# values. LIVEKIT_URL is read when app.js is imported, so that stale process
# would keep issuing tokens for the wrong port even after this script applies
# the development overrides above.
$apiListener = Get-NetTCPConnection -LocalPort ([int]$apiPort) -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($apiListener) {
  $apiProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($apiListener.OwningProcess)" -ErrorAction SilentlyContinue
  $apiParent = if ($apiProcess) { Get-CimInstance Win32_Process -Filter "ProcessId = $($apiProcess.ParentProcessId)" -ErrorAction SilentlyContinue }
  $isLibraCordNode = $apiProcess.Name -eq 'node.exe' -and $apiProcess.CommandLine -match 'src[/\\]index\.js'
  if (-not $isLibraCordNode -and $apiParent) {
    $isLibraCordNode = $apiParent.Name -eq 'node.exe' -and $apiParent.CommandLine -match 'src[/\\]index\.js'
  }
  if ($isLibraCordNode) {
    if ($apiParent -and $apiParent.Name -eq 'node.exe') { Stop-Process -Id $apiParent.ProcessId -Force -ErrorAction SilentlyContinue }
    Stop-Process -Id $apiProcess.ProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 300
  } else {
    throw "Port $apiPort is already used by a process that is not a LibraCord development server."
  }
}

& $dockerPath compose --profile ingress --profile browser up -d redis livekit ingress browser-service browser-desktop

Write-Host "LiveKit:  ws://localhost:$liveKitPort"
Write-Host "WebRTC:   $localRtcAddress (TCP $($rootEnv.LIVEKIT_TCP_PORT), UDP $($rootEnv.LIVEKIT_UDP_PORT))"
Write-Host "Ingress:  http://localhost:$whipPort (WHIP), rtmp://localhost:$rtmpPort/live"
Write-Host "Firefox:  http://localhost:$browserPort/vnc.html?autoconnect=1&resize=scale"
Write-Host "API:      http://localhost:$apiPort"
Write-Host 'Web:      http://localhost:5173'

npm run dev
