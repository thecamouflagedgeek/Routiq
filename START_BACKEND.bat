@echo off
echo Starting RoadSafe AI Backend...
echo.
cd backend
if exist venv\Scripts\activate.bat (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
) else (
    echo WARNING: Virtual environment not found at backend\venv
    echo Please create it first with: python -m venv venv
    pause
    exit /b 1
)

echo.
echo Starting FastAPI server on http://127.0.0.1:8000
echo Press Ctrl+C to stop the server
echo.
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
