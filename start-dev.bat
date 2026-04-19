@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

for %%I in ("%ROOT_DIR%") do (
  set "PROJECT_NAME=%%~nxI"
  set "PARENT_DIR=%%~dpI"
)
if "%PARENT_DIR:~-1%"=="\" set "PARENT_DIR=%PARENT_DIR:~0,-1%"

set "API_DIR=%ROOT_DIR%\api"
set "FRONTEND_DIR=%ROOT_DIR%"
set "PROJECT_ENV_FILE=%ROOT_DIR%\.env"

set "RESTART_MODE=0"

if /I "%~1"=="--help" goto :help
if /I "%~1"=="-h" goto :help
if /I "%~1"=="--check" goto :check
if /I "%~1"=="--restart" set "RESTART_MODE=1"
if /I "%~1"=="-r" set "RESTART_MODE=1"

call :load_environment_file "%PROJECT_ENV_FILE%"
if "%APP_RUNTIME_DIR%"=="" set "APP_RUNTIME_DIR=%PARENT_DIR%\%PROJECT_NAME%.runtime"

set "RUNTIME_ENV_FILE=%APP_RUNTIME_DIR%\.env"
call :load_environment_file "%RUNTIME_ENV_FILE%"
call :apply_runtime_defaults
call :prepare_runtime
call :validate_environment
if errorlevel 1 exit /b 1
call :warn_if_auth_env_missing
if "%RESTART_MODE%"=="1" goto :restart_ports
call :fail_if_port_in_use %BACKEND_PORT% backend
if errorlevel 1 exit /b 1
call :fail_if_port_in_use %FRONTEND_PORT% frontend
if errorlevel 1 exit /b 1
goto :launch_services

:restart_ports
call :stop_listeners_on_port %BACKEND_PORT% backend
call :stop_listeners_on_port %FRONTEND_PORT% frontend
goto :launch_services

:launch_services
echo.
echo Starting backend...
start "CodeX.AITest Backend" cmd /k "cd /d ""%API_DIR%"" && echo [INFO] Backend log: %BACKEND_CONSOLE_LOG% && echo [INFO] Python: %PYTHON_CMD% && ""%PYTHON_CMD%"" -m uvicorn index:app --host %BACKEND_BIND_HOST% --port %BACKEND_PORT% 1>> ""%BACKEND_CONSOLE_LOG%"" 2>&1"

echo Starting frontend...
start "CodeX.AITest Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && echo [INFO] Frontend log: %FRONTEND_CONSOLE_LOG% && npm run dev -- --host %FRONTEND_BIND_HOST% --port %FRONTEND_PORT% 1>> ""%FRONTEND_CONSOLE_LOG%"" 2>&1"

echo.
echo Launch commands sent.
echo Frontend: %FRONTEND_URL%
echo Backend health: %BACKEND_URL%
echo Runtime dir: %APP_RUNTIME_DIR%
echo Database: %DB_PATH%
echo Log dir: %APP_LOG_DIR%
echo.
echo Notes:
echo 1. The runtime directory is outside the project folder, so updating code will not overwrite data and logs.
echo 2. Put the persistent .env at %RUNTIME_ENV_FILE%.
echo 3. Close the two command windows to stop the services.
exit /b 0

:check
call :load_environment_file "%PROJECT_ENV_FILE%"
if "%APP_RUNTIME_DIR%"=="" set "APP_RUNTIME_DIR=%PARENT_DIR%\%PROJECT_NAME%.runtime"
set "RUNTIME_ENV_FILE=%APP_RUNTIME_DIR%\.env"
call :load_environment_file "%RUNTIME_ENV_FILE%"
call :apply_runtime_defaults
call :prepare_runtime
call :validate_environment
if errorlevel 1 exit /b 1
call :warn_if_auth_env_missing
set "PORT_WARNING="
call :warn_if_port_in_use %BACKEND_PORT% backend
call :warn_if_port_in_use %FRONTEND_PORT% frontend
echo.
echo Check passed. You can double-click start-dev.bat to launch the project.
if not "%PORT_WARNING%"=="" (
  echo [WARNING] Existing listeners detected. Use start-dev.bat --restart or stop the old processes before relaunching.
)
echo Frontend: %FRONTEND_URL%
echo Backend health: %BACKEND_URL%
echo Runtime dir: %APP_RUNTIME_DIR%
echo Database: %DB_PATH%
echo Log dir: %APP_LOG_DIR%
exit /b 0

:apply_runtime_defaults
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=5173"
set "BACKEND_BIND_HOST=0.0.0.0"
set "FRONTEND_BIND_HOST=0.0.0.0"
if "%APP_LOG_DIR%"=="" set "APP_LOG_DIR=%APP_RUNTIME_DIR%\logs"
if "%DB_PATH%"=="" set "DB_PATH=%APP_RUNTIME_DIR%\data\codetestguard.db"
set "BACKEND_URL=http://127.0.0.1:%BACKEND_PORT%/api/health"
set "FRONTEND_URL=http://127.0.0.1:%FRONTEND_PORT%/"
set "BACKEND_CONSOLE_LOG=%APP_LOG_DIR%\backend-console.log"
set "FRONTEND_CONSOLE_LOG=%APP_LOG_DIR%\frontend-console.log"
exit /b 0

:prepare_runtime
if not exist "%APP_RUNTIME_DIR%" mkdir "%APP_RUNTIME_DIR%"
for %%I in ("%APP_LOG_DIR%") do if not exist "%%~fI" mkdir "%%~fI"
for %%I in ("%DB_PATH%") do if not exist "%%~dpI" mkdir "%%~dpI"
exit /b 0

:load_environment_file
set "TARGET_ENV_FILE=%~1"
if exist "%TARGET_ENV_FILE%" (
  echo [INFO] Loading environment from %TARGET_ENV_FILE%
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%TARGET_ENV_FILE%") do (
    if not "%%~A"=="" set "%%~A=%%~B"
  )
)
exit /b 0

:resolve_python_command
if defined PYTHON_CMD (
  call :resolve_python_candidate "%PYTHON_CMD%"
  if defined PYTHON_CMD exit /b 0
)

set "PYTHON_CMD="
call :resolve_python_candidate "python"
if defined PYTHON_CMD exit /b 0

for %%P in (
  "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
  "%ProgramFiles%\Python313\python.exe"
  "%ProgramFiles%\Python312\python.exe"
  "%ProgramFiles%\Python311\python.exe"
  "%ProgramFiles%\Python310\python.exe"
  "C:\Python313\python.exe"
  "C:\Python312\python.exe"
  "C:\Python311\python.exe"
  "C:\Python310\python.exe"
) do (
  if not defined PYTHON_CMD call :resolve_python_candidate "%%~fP"
)
if defined PYTHON_CMD exit /b 0

for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$candidates = @(); if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313\python.exe'); $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'); $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'); $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python310\python.exe') }; if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Python313\python.exe'); $candidates += (Join-Path $env:ProgramFiles 'Python312\python.exe'); $candidates += (Join-Path $env:ProgramFiles 'Python311\python.exe'); $candidates += (Join-Path $env:ProgramFiles 'Python310\python.exe') }; $candidates += 'C:\Python313\python.exe'; $candidates += 'C:\Python312\python.exe'; $candidates += 'C:\Python311\python.exe'; $candidates += 'C:\Python310\python.exe'; foreach ($candidate in $candidates) { if (Test-Path -LiteralPath $candidate) { Write-Output $candidate; break } }"`) do (
  if not defined PYTHON_CMD set "PYTHON_CMD=%%P"
)
exit /b 0

:resolve_python_candidate
set "PYTHON_CANDIDATE=%~1"
if "%PYTHON_CANDIDATE%"=="" exit /b 1

if exist "%PYTHON_CANDIDATE%" (
  set "PYTHON_CMD=%PYTHON_CANDIDATE%"
  exit /b 0
)

for /f "delims=" %%P in ('where "%PYTHON_CANDIDATE%" 2^>nul') do (
  if not defined PYTHON_CMD set "PYTHON_CMD=%%P"
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

call :resolve_python_command
if not defined PYTHON_CMD (
  echo [ERROR] python was not found in PATH or common local install paths.
  echo [ERROR] Set PYTHON_CMD in %RUNTIME_ENV_FILE% if your interpreter is installed in a custom location.
  echo [ERROR] Example: PYTHON_CMD=C:\Python311\python.exe
  exit /b 1
)

"%PYTHON_CMD%" --version >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was found but could not be executed: %PYTHON_CMD%
  echo [ERROR] Update PYTHON_CMD in %RUNTIME_ENV_FILE% to a usable interpreter path, then run start-dev.bat --check again.
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
  echo [WARNING] Fresh backend initialization may fail. Configure %RUNTIME_ENV_FILE% or %PROJECT_ENV_FILE% first.
  exit /b 0
)
if "%INITIAL_ADMIN_USERNAME%"=="" (
  echo [WARNING] Fresh backend initialization may fail. Configure %RUNTIME_ENV_FILE% or %PROJECT_ENV_FILE% first.
  exit /b 0
)
if "%INITIAL_ADMIN_PASSWORD%"=="" (
  echo [WARNING] Fresh backend initialization may fail. Configure %RUNTIME_ENV_FILE% or %PROJECT_ENV_FILE% first.
)
exit /b 0

:warn_if_port_in_use
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%~1 .*LISTENING" 2^>nul') do (
  set "PORT_WARNING=1"
  echo [WARNING] %~2 port %~1 is already in use by PID %%P.
)
exit /b 0

:fail_if_port_in_use
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%~1 .*LISTENING" 2^>nul') do (
  echo [ERROR] %~2 port %~1 is already in use by PID %%P.
  echo [ERROR] Stop the old process first, or run start-dev.bat --restart to release the dev ports and start fresh.
  exit /b 1
)
exit /b 0

:stop_listeners_on_port
set "FOUND_LISTENER="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%~1 .*LISTENING" 2^>nul') do (
  set "FOUND_LISTENER=1"
  echo [INFO] Stopping %~2 listener on port %~1, PID %%P...
  taskkill /PID %%P /T /F >nul 2>nul
)
if "%FOUND_LISTENER%"=="1" (
  timeout /t 1 /nobreak >nul
)
exit /b 0

:help
echo Usage:
echo   start-dev.bat
echo   start-dev.bat --restart
echo   start-dev.bat --check
echo.
echo Description:
echo   run directly: start frontend and backend
echo   --restart : stop existing listeners on dev ports 8000 / 5173, then start frontend and backend
echo   --check   : validate the environment only
echo.
echo Runtime:
echo   default runtime dir: sibling folder named %PROJECT_NAME%.runtime
echo   backend bind host : 0.0.0.0
echo   frontend bind host: 0.0.0.0
exit /b 0
