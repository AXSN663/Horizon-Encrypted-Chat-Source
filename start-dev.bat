@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==================================
echo Horizon Chat - Quick Start
echo ==================================
echo.

REM Check if .env exists
if not exist .env (
    echo [ERROR] .env file not found!
    echo Please copy .env.example to .env and configure it.
    echo.
    pause
    exit /b 1
)

echo Starting PostgreSQL with Docker...
docker-compose up -d postgres
timeout /t 5 /nobreak >nul

echo.
echo Starting Server on port 4000...
start "Horizon Server" cmd /k "cd /d "%~dp0apps\server" && npm run dev"

echo Starting Web on port 3000...
timeout /t 2 /nobreak >nul
start "Horizon Web" cmd /k "cd /d "%~dp0apps\web" && npm run dev"

echo.
echo ==================================
echo Services starting...
echo Web: http://localhost:3000
echo API: http://localhost:4000
echo ==================================
echo.
echo Press any key to close this window (services will keep running)
pause >nul
