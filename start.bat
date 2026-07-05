@echo off
setlocal
cd /d "%~dp0"

echo Updating legislator data...
curl -L -o data\legislators-current.json https://unitedstates.github.io/congress-legislators/legislators-current.json
if errorlevel 1 (
    echo WARNING: download failed, using existing data\legislators-current.json
)

echo Rebuilding data.js...
node build-data.mjs
if errorlevel 1 (
    echo ERROR: build-data.mjs failed. Aborting.
    pause
    exit /b 1
)

echo Starting local server...
start "PoliticsExplorer server" /min cmd /c npx --yes serve . -l 8000

timeout /t 2 /nobreak >nul
start "" http://localhost:8000

endlocal
