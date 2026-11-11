@echo off
setlocal
rem Interactive operator entrypoint. This is NOT a Windows service installer.
cd /d "%~dp0..\server"
set "VAULT=%LOCALAPPDATA%\QUMI\DepotVault"
if not "%QUMI_DEPOT_VAULT_DIR%"=="" set "VAULT=%QUMI_DEPOT_VAULT_DIR%"
if not exist "%VAULT%\DEPOT_GIT_KEY.dpapi" goto provision
if not exist "%VAULT%\DEPOT_TOKEN.dpapi" if not exist "%VAULT%\DEPOT_API_KEY.dpapi" goto provision
goto validate
:provision
call "%~dp0provision-gitaskpass.cmd"
if errorlevel 1 (echo Credential provisioning refused or incomplete. & exit /b 10)
:validate
if not exist "node_modules\@modelcontextprotocol\sdk" (echo MCP SDK not installed. Run npm install --ignore-scripts. & exit /b 20)
if not exist "node_modules\@depot\sdk-node" (echo Depot SDK not installed. Run npm install --ignore-scripts. & exit /b 21)
if "%QUMI_DEPOT_CLI_PATH%"=="" set "QUMI_DEPOT_CLI_PATH=C:\Program Files\Depot\bin\depot.exe"
if not exist "%QUMI_DEPOT_CLI_PATH%" (echo Depot CLI binary missing. & exit /b 22)
if "%QUMI_DEPOT_PROJECT_IDS%"=="" (echo QUMI_DEPOT_PROJECT_IDS is required. & exit /b 23)
if "%QUMI_DEPOT_EVIDENCE_DIR%"=="" (echo QUMI_DEPOT_EVIDENCE_DIR is required. & exit /b 24)
if "%QUMI_MCP_BEARER_TOKEN%"=="" (echo QUMI_MCP_BEARER_TOKEN must be provisioned separately through the service manager. & exit /b 27)
if "%QUMI_CHECKOUT_ROOT%"=="" (echo QUMI_CHECKOUT_ROOT is required. & exit /b 25)
if not exist "%QUMI_CHECKOUT_ROOT%\.git" (echo Approved checkout missing. & exit /b 26)
echo Local MCP bridge prerequisites satisfied. Secret values will not be displayed.
rem Pick one: '--stdio' with MCP client owning stdio, or '--http' behind TLS reverse proxy.
node index.mjs --http
endlocal
