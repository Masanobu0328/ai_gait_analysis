# -*- coding: utf-8 -*-
"""
Analysis router - video upload and analysis control.
"""
import json
import hashlib
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks

from config import settings
from models.schemas import (
    AnalysisUploadResponse,
    AnalysisStatusResponse,
    AnalysisStatus,
)

router = APIRouter()

# In-memory status tracking (replace with Redis/DB in production)
analysis_status: dict = {}


def generate_patient_id(name: str, timestamp: datetime) -> str:
    """患者名から一意のIDを生成（匿名化）"""
    unique_string = f"{name}_{timestamp.strftime('%Y%m%d_%H%M%S')}"
    hash_value = hashlib.sha256(unique_string.encode()).hexdigest()[:12]
    date_part = timestamp.strftime('%Y%m%d')
    return f"PT-{date_part}-{hash_value[:8].upper()}"


def run_analysis_subprocess(case: str, case_dir: Path, skip_video: bool = False, skip_side: bool = True):
    """バックグラウンドで解析を実行"""
    try:
        analysis_status[case] = {"status": AnalysisStatus.PROCESSING, "progress": 0.1}

        front_video = case_dir / f"{case}_front.mp4"
        if not case_dir.exists() or not front_video.exists():
            analysis_status[case] = {
                "status": AnalysisStatus.FAILED,
                "progress": 0,
                "message": f"Input video not found: {front_video}",
            }
            return

        cmd_parts = [
            sys.executable,
            str(settings.ANALYZE_SCRIPT),
            '--input_root', str(settings.INPUT_DIR),
            '--output_root', str(settings.OUTPUT_DIR),
            '--case', case
        ]
        
        if skip_video:
            cmd_parts.append('--skip-video')
        if skip_side:
            cmd_parts.append('--skip-side')
        
        result = subprocess.run(
            cmd_parts,
            cwd=str(settings.PROJECT_ROOT),
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=1200,
        )
        
        # Check for output files
        front_dir = settings.OUTPUT_DIR / f"{case}_front"
        metrics_file = front_dir / "gait_metrics.csv"
        
        if metrics_file.exists():
            analysis_status[case] = {
                "status": AnalysisStatus.COMPLETED,
                "progress": 1.0,
                "message": "解析が完了しました"
            }
        else:
            analysis_status[case] = {
                "status": AnalysisStatus.FAILED,
                "progress": 0,
                "message": f"解析に失敗しました: {result.stderr[-500:] if result.stderr else 'Unknown error'}"
            }
            
    except Exception as e:
        analysis_status[case] = {
            "status": AnalysisStatus.FAILED,
            "progress": 0,
            "message": str(e)
        }


@router.post("/upload", response_model=AnalysisUploadResponse)
async def upload_video_and_questionnaire(
    background_tasks: BackgroundTasks,
    front_video: UploadFile | None = File(default=None, description="背面動画ファイル（互換入力名: front_video）"),
    rear_video: UploadFile | None = File(default=None, description="背面動画ファイル（推奨入力名: rear_video）"),
    name: str = Form(...),
    age: int = Form(...),
    sex: str = Form(default="未選択"),
    height: int = Form(...),
    weight: int = Form(...),
    chief: str = Form(default=""),
    goal: str = Form(default=""),
    lifestyle_detail: str = Form(default=""),
    job: str = Form(default=""),
    exercise: str = Form(default=""),
    skip_video: bool = Form(default=False),
):
    """動画と問診データをアップロードして解析を開始"""
    upload_video = rear_video or front_video
    if upload_video is None:
        raise HTTPException(status_code=400, detail="背面動画ファイルが必要です")
    
    # Generate IDs
    timestamp = datetime.now()
    patient_id = generate_patient_id(name, timestamp)
    case = f"{patient_id}_{timestamp.strftime('%Y%m%d_%H%M')}"
    
    # Create case directory
    case_dir = settings.INPUT_DIR / case
    case_dir.mkdir(parents=True, exist_ok=True)
    
    # Save video file
    video_path = case_dir / f"{case}_front.mp4"
    content = await upload_video.read()
    with open(video_path, "wb") as f:
        f.write(content)
    
    # Save interview data (without personal info for AI)
    interview = {
        "patient_id": patient_id,
        "age": age,
        "sex": sex,
        "height": height,
        "weight": weight,
        "chief": chief,
        "goal": goal,
        "lifestyle_detail": lifestyle_detail,
        "job": job,
        "exercise": exercise,
    }
    
    with open(case_dir / "interview.json", "w", encoding="utf-8") as f:
        json.dump(interview, f, ensure_ascii=False, indent=2)
    
    # Save personal info separately (not sent to AI)
    patient_info = {
        "patient_id": patient_id,
        "name": name,
        "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S")
    }
    
    with open(case_dir / "patient_info.json", "w", encoding="utf-8") as f:
        json.dump(patient_info, f, ensure_ascii=False, indent=2)
    
    # Initialize status
    analysis_status[case] = {"status": AnalysisStatus.PENDING, "progress": 0}
    
    # Start analysis in background
    background_tasks.add_task(run_analysis_subprocess, case, case_dir, skip_video)
    
    return AnalysisUploadResponse(
        case_id=case,
        patient_id=patient_id,
        message="アップロード完了。解析を開始します。",
        status=AnalysisStatus.PENDING
    )


@router.get("/{case_id}/status", response_model=AnalysisStatusResponse)
async def get_analysis_status(case_id: str):
    """解析ステータスを取得"""
    if case_id not in analysis_status:
        # Check if results exist on disk
        front_dir = settings.OUTPUT_DIR / f"{case_id}_front"
        metrics_file = front_dir / "gait_metrics.csv"
        
        if metrics_file.exists():
            return AnalysisStatusResponse(
                case_id=case_id,
                status=AnalysisStatus.COMPLETED,
                message="解析完了",
                progress=1.0
            )
        else:
            raise HTTPException(status_code=404, detail="Case not found")
    
    status_info = analysis_status[case_id]
    return AnalysisStatusResponse(
        case_id=case_id,
        status=status_info.get("status", AnalysisStatus.PENDING),
        message=status_info.get("message", ""),
        progress=status_info.get("progress", 0)
    )


@router.post("/{case_id}/start")
async def start_analysis(case_id: str, background_tasks: BackgroundTasks, skip_video: bool = False):
    """既存ケースの解析を開始（再実行用）"""
    case_dir = settings.INPUT_DIR / case_id
    
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    analysis_status[case_id] = {"status": AnalysisStatus.PENDING, "progress": 0}
    background_tasks.add_task(run_analysis_subprocess, case_id, case_dir, skip_video)
    
    return {"message": "解析を開始しました", "case_id": case_id}
