@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================
echo Horizon Chat - Starting Services
echo ==================================

REM Check if .env exists
if not exist .env (
    echo Creating .env file from .env.example...
    copy .env.example .env
    echo Please edit .env file with your configuration before running again.
    exit /b 1
)

echo Installing dependencies...
call npm install
if errorlevel 1 (
    echo Failed to install dependencies
    exit /b 1
)

echo Generating Prisma client...
cd packages\database
call npx prisma generate
if errorlevel 1 (
    echo Failed to generate Prisma client
    exit /b 1
)
cd ..\..

echo Running database migrations...
cd packages\database
call npx prisma migrate dev --name init
if errorlevel 1 (
    echo Failed to run migrations
    exit /b 1
)
cd ..\..

echo.
echo ==================================
echo Starting services...
echo Web: http://localhost:3000
echo API: http://localhost:4000
echo.
echo Press Ctrl+C to stop all services
echo ==================================
echo.

REM Start both services using turbo
echo Starting server and web concurrently...
start "Horizon Server" cmd /k "cd apps\server && npm run dev"
timeout /t 3 /nobreak >nul
start "Horizon Web" cmd /k "cd apps\web && npm run dev"

echo.
echo ==================================
echo Services started in separate windows
echo Web: http://localhost:3000
echo API: http://localhost:4000
echo ==================================
echo.
echo Press any key to exit (services will keep running in their windows)...
pause >nul
endlocal
