@echo off
setlocal
rem REQUIRED interactive provisioning; never accepts a secret on the command line.
rem Run under the same Windows identity that executes the MCP bridge.
set "VAULT=%LOCALAPPDATA%\QUMI\DepotVault"
if not "%QUMI_DEPOT_VAULT_DIR%"=="" set "VAULT=%QUMI_DEPOT_VAULT_DIR%"
echo DEPOT Bridge - secure one-time credential provisioning.
echo Enter DEPOT_TOKEN / DEPOT_API_KEY and DEPOT_GIT_KEY in the masked form.
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0setup-secrets.ps1" -VaultDirectory "%VAULT%"
if errorlevel 1 exit /b 1
if not exist "%VAULT%\DEPOT_GIT_KEY.dpapi" (echo Git key not provisioned. & exit /b 2)
if not exist "%VAULT%\DEPOT_API_KEY.dpapi" if not exist "%VAULT%\DEPOT_TOKEN.dpapi" (echo Depot API token not provisioned. & exit /b 3)
echo Credential files exist. Restart the MCP service under the same Windows user.
endlocal
