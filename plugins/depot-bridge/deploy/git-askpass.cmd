@echo off
rem This helper intentionally passes NO Git-supplied prompt text to a shell.
rem Git credential.username is fixed by the approved git process.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0git-askpass.ps1"
