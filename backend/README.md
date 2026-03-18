# Backend API for Gait Analysis

FastAPI backend that wraps existing gait analysis engine.

## Setup

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/analysis/upload` | POST | Upload video + questionnaire |
| `/api/v1/analysis/{case_id}/start` | POST | Start analysis |
| `/api/v1/analysis/{case_id}/status` | GET | Check analysis status |
| `/api/v1/results/{case_id}` | GET | Get analysis results |
| `/api/v1/reviews/{case_id}/patient` | GET | Get patient review |
| `/api/v1/reviews/{case_id}/therapist` | GET | Get therapist review |
