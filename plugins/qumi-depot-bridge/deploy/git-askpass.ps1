$ErrorActionPreference = 'Stop'
if ($env:QUMI_GIT_ASKPASS_ACTIVE -ne '1') { exit 1 }
if ($env:DEPOT_GIT_KEY) {
    [Console]::Out.WriteLine($env:DEPOT_GIT_KEY)
    exit 0
}
$dir = if ($env:QUMI_DEPOT_VAULT_DIR) { $env:QUMI_DEPOT_VAULT_DIR } else { Join-Path $env:LOCALAPPDATA 'QUMI\DepotVault' }
$secret = Join-Path $dir 'DEPOT_GIT_KEY.dpapi'
if (-not (Test-Path -LiteralPath $secret -PathType Leaf)) { exit 1 }
Add-Type -AssemblyName System.Security
$cipher = [IO.File]::ReadAllBytes($secret)
$plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try { [Console]::Out.WriteLine([Text.Encoding]::UTF8.GetString($plain)) }
finally { [Array]::Clear($plain,0,$plain.Length) }
