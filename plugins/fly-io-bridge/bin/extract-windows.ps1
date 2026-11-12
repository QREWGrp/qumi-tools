param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$zip = [System.IO.Compression.ZipFile]::OpenRead($Archive)
try {
  $items = @($zip.Entries | Where-Object { $_.Name -eq 'flyctl.exe' -or $_.Name -eq 'fly.exe' })
  if ($items.Count -ne 1) { throw 'Zip must contain one Fly executable.' }
  if ($items[0].Length -le 0 -or $items[0].Length -gt 200MB) { throw 'Unexpected executable size.' }
  $input = $items[0].Open()
  try { $output = [System.IO.File]::Open($Target,[System.IO.FileMode]::CreateNew) ; try { $input.CopyTo($output) } finally { $output.Dispose() } }
  finally { $input.Dispose() }
} finally { $zip.Dispose() }
