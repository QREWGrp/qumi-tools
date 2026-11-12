@echo off
setlocal
REM QUMI bridge installer: no secret import and no automatic build permission.
where node >nul 2>nul || (echo ERROR: Install Node.js 20+ first. & exit /b 1)
where npm >nul 2>nul || (echo ERROR: npm is unavailable. & exit /b 1)
cd /d "%~dp0..\server" || exit /b 1
call npm install --ignore-scripts || exit /b 1
node --check index.mjs || exit /b 1
node --check operations.mjs || exit /b 1
echo Runtime dependencies installed and static checks passed. Configure secrets through approved Windows service environment.
echo Read deploy\WINDOWS-VHOST.md for VHost, proxy and acceptance setup.
endlocal
