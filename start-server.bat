@echo off
title Personal NAS Server
color 0A

echo ========================================================
echo        Personal NAS -- Private Cloud Storage Server
echo ========================================================
echo.

:: 1. Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is NOT installed or not found in your PATH!
    echo Please install Node.js (v18 or higher) from: https://nodejs.org
    echo After installing, restart this script.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js is installed.
node -v

:: 2. Check and install dependencies if node_modules is missing
if not exist "server\node_modules\" (
    echo.
    echo [*] Installing server dependencies (first-time setup, please wait)...
    cd server
    call npm install
    cd ..
    if not exist "server\node_modules\" (
        color 0C
        echo [ERROR] npm install failed. Please check your internet connection.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully.
)

:: 3. Automatically launch the browser after a 2-second delay in background
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: 4. Start the server
echo.
echo [*] Starting Personal NAS Server...
echo Press Ctrl+C at any time to stop the server.
echo.
cd server
node index.js
if %errorlevel% neq 0 (
    echo.
    color 0C
    echo [ERROR] Server exited unexpectedly.
    pause
)
