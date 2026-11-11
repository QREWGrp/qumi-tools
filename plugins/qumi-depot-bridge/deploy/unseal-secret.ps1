param(
  [Parameter(Mandatory=$true)][ValidateSet('DEPOT_TOKEN','DEPOT_API_KEY','DEPOT_GIT_KEY')][string]$SecretName,
  [Parameter(Mandatory=$true)][string]$VaultDirectory
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$file = Join-Path $VaultDirectory ($SecretName + '.dpapi')
if (-not (Test-Path -LiteralPath $file)) { throw 'Secret is not provisioned' }
$cipher = [IO.File]::ReadAllBytes($file)
$plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
try { [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain)) }
finally { [Array]::Clear($plain, 0, $plain.Length) }
