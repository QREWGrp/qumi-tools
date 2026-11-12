# Internal bridge helper. Prints plaintext only to its local parent Node process via private process pipe.
param([ValidateSet('ionos','cloudflare')][string]$Provider,[Parameter(Mandatory=$true)][string]$VaultPath)
$ErrorActionPreference='Stop'
if(-not [IO.File]::Exists($VaultPath)){throw 'DPAPI credential file does not exist'}
$cipher=[IO.File]::ReadAllBytes($VaultPath)
$plain=[System.Security.Cryptography.ProtectedData]::Unprotect($cipher,[System.Text.Encoding]::UTF8.GetBytes('ionos-bridge/'+$Provider),[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
try {[Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($plain))}
finally {[Array]::Clear($plain,0,$plain.Length)}
