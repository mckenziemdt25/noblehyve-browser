@echo off
REM Wrapper to strip -snld flag (symlink preservation) which fails on some Windows setups
setlocal
set "args=%*"
set "args=%args:-snld =%"
"C:\Program Files\7-Zip\7z.exe" %args%
exit /b 0
