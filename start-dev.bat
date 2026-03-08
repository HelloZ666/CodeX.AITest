@echo off
setlocal

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "API_DIR=%ROOT_DIR%\api"
set "FRONTEND_DIR=%ROOT_DIR%"
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=5173"
set "BACKEND_URL=http://127.0.0.1:%BACKEND_PORT%/api/health"
set "FRONTEND_URL=http://127.0.0.1:%FRONTEND_PORT%/"
set "ENV_FILE=%ROOT_DIR%\.env"

if /I "%~1"=="--help" goto :help
if /I "%~1"=="-h" goto :help
if /I "%~1"=="--check" goto :check

call :load_environment
call :validate_environment || exit /b 1
call :warn_if_auth_env_missing

call :warn_if_port_in_use %BACKEND_PORT% backend
call :warn_if_port_in_use %FRONTEND_PORT% frontend

echo.
echo Starting backend...
start "CodeX.AITest Backend" cmd /k "cd /d ""%API_DIR%"" && python -m uvicorn index:app --reload --host 127.0.0.1 --port %BACKEND_PORT%"

echo Starting frontend...
start "CodeX.AITest Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm run dev -- --host 127.0.0.1 --port %FRONTEND_PORT%"

echo.
echo Launch commands sent.
echo Frontend: %FRONTEND_URL%
echo Backend health: %BACKEND_URL%
echo.
echo Notes:
echo 1. Install frontend and backend dependencies before first run.
echo 2. Copy .env.example to .env and configure auth variables for a fresh database.
echo 3. Close the two command windows to stop the services.
exit /b 0

:check
call :load_environment
call :validate_environment || exit /b 1
call :warn_if_auth_env_missing
echo.
echo Check passed. You can double-click start-dev.bat to launch the project.
echo Frontend: %FRONTEND_URL%
echo Backend health: %BACKEND_URL%
exit /b 0

:load_environment
if exist "%ENV_FILE%" (
  echo [INFO] Loading environment from %ENV_FILE%
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    if not "%%~A"=="" set "%%~A=%%~B"
  )
) else (
  echo [INFO] .env not found. Using current shell environment.
)
exit /b 0

:validate_environment
if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERROR] package.json not found: %FRONTEND_DIR%
  exit /b 1
)

if not exist "%API_DIR%\index.py" (
  echo [ERROR] Backend entry file not found: %API_DIR%\index.py
  exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] python was not found in PATH.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  exit /b 1
)

if not exist "%FRONTEND_DIR%\node_modules" (
  echo [WARNING] node_modules not found. Run npm install first if needed.
)

exit /b 0

:warn_if_auth_env_missing
if "%SESSION_SECRET%"=="" (
  echo [WARNING] SESSION_SECRET is not set.
)
if "%INITIAL_ADMIN_USERNAME%"=="" (
  echo [WARNING] INITIAL_ADMIN_USERNAME is not set.
)
if "%INITIAL_ADMIN_PASSWORD%"=="" (
  echo [WARNING] INITIAL_ADMIN_PASSWORD is not set.
)
if "%SESSION_SECRET%"=="" (
  echo [WARNING] Fresh backend initialization may fail. Copy .env.example to .env first.
  exit /b 0
)
if "%INITIAL_ADMIN_USERNAME%"=="" (
  echo [WARNING] Fresh backend initialization may fail. Copy .env.example to .env first.
  exit /b 0
)
if "%INITIAL_ADMIN_PASSWORD%"=="" (
  echo [WARNING] Fresh backend initialization may fail. Copy .env.example to .env first.
)
exit /b 0

:warn_if_port_in_use
netstat -ano | findstr /r /c:":%~1 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [WARNING] %~2 port %~1 is already in use.
)
exit /b 0

:help
echo Usage:
echo   start-dev.bat
echo   start-dev.bat --check
echo.
echo Description:
echo   run directly: start frontend and backend
echo   --check    : validate the environment only
exit /b 0
