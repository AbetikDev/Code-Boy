@echo off
echo === Build ===
call npm run compile
if errorlevel 1 ( echo BUILD FAILED & pause & exit /b 1 )

echo === Package ===
call npx vsce package --readme-path README.vscode.md --allow-missing-repository --no-dependencies --out code-boy-1.0.2.vsix
if errorlevel 1 ( echo PACKAGE FAILED & pause & exit /b 1 )

echo === Install ===
call code --install-extension code-boy-1.0.2.vsix --force
if errorlevel 1 ( echo INSTALL FAILED & pause & exit /b 1 )

echo.
echo === Done! Reload VS Code: Ctrl+Shift+P → Developer: Reload Window ===
pause
