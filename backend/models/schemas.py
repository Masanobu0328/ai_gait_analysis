# -*- coding: utf-8 -*-
"""
Pydantic models for API requests and responses.
"""
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, List
from pydantic import BaseModel, Field


class Sex(str, Enum):
    """性別の選択肢"""
    MALE = "男性"
    FEMALE = "女性"
    OTHER = "その他"
    UNSPECIFIED = "未選択"


class QuestionnaireInput(BaseModel):
    """問診入力データ"""
    name: str = Field(..., description="お名前")
    age: int = Field(..., ge=0, le=120, description="年齢")
    sex: Sex = Field(default=Sex.UNSPECIFIED, description="性別")
    height: int = Field(..., ge=0, le=250, description="身長(cm)")
    weight: int = Field(..., ge=0, le=300, description="体重(kg)")
    chief: str = Field(default="", description="主訴・気になること")
    goal: str = Field(default="", description="目標")
    lifestyle_detail: str = Field(default="", description="生活スタイルの詳細")
    job: str = Field(default="", description="お仕事")
    exercise: str = Field(default="", description="運動習慣")


class AnalysisStatus(str, Enum):
    """解析ステータス"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisUploadResponse(BaseModel):
    """動画アップロードレスポンス"""
    case_id: str
    patient_id: str
    message: str
    status: AnalysisStatus = AnalysisStatus.PENDING


class AnalysisStatusResponse(BaseModel):
    """解析ステータスレスポンス"""
    case_id: str
    status: AnalysisStatus
    message: str
    progress: Optional[float] = None


class RadarScore(BaseModel):
    """五角形レーダーチャート用スコア"""
    pelvic_tilt: float = Field(..., description="骨盤の傾き (0-100)")
    shoulder_tilt: float = Field(..., description="肩の傾き (0-100)")
    knee_alignment: float = Field(..., description="膝の向き (0-100)")
    head_tilt: float = Field(..., description="頭の傾き (0-100)")
    trunk_stability: float = Field(..., description="体幹の安定性 (0-100)")


class MetricValue(BaseModel):
    """メトリクス値"""
    value: float
    unit: str
    status: str = Field(description="良好 / 注意 / 要改善")
    reference: Optional[str] = None


class MetricTrendPoint(BaseModel):
    """Frame-based trend data for detailed gait charts."""
    frame: int
    phase: str
    support_side: str
    cycle_index: int
    cycle_percent: float
    pelvic_tilt: float
    shoulder_tilt: float
    trunk_sway: float
    com_lateral: float
    knee_asymmetry: float
    knee_right: float
    knee_left: float


class MetricCyclePoint(BaseModel):
    """Cycle-normalized mean profile (1-100% gait cycle)."""
    gait_percent: int
    phase: str
    support_side: str
    pelvic_tilt: float
    shoulder_tilt: float
    trunk_sway: float
    com_lateral: float
    knee_asymmetry: float
    knee_right: float
    knee_left: float


class CycleProfileQuality(BaseModel):
    """Quality estimate for cycle-normalized profile."""
    score: float
    level: str
    cycles_used: int
    periodicity: float
    consistency: float
    note: str


class AnalysisResults(BaseModel):
    """解析結果"""
    case_id: str
    patient_id: str
    timestamp: datetime
    
    # 患者向けスコア
    radar_scores: RadarScore
    
    # セラピスト向け詳細
    metrics: Dict[str, MetricValue]

    # 時系列トレンド（グラフ表示用）
    trend_points: List[MetricTrendPoint] = []

    # 歩行周期正規化（1-100%）の平均プロファイル
    cycle_profile: List[MetricCyclePoint] = []
    cycles_used: int = 0
    cycle_quality: Optional[CycleProfileQuality] = None
    trunk_sway_unit: str = "%"
    com_lateral_unit: str = "cm"
    height_cm_used: Optional[float] = None
    
    # 動画パス
    skeleton_video_url: Optional[str] = None


class PatientReviewData(BaseModel):
    """患者向けレビューデータ構造"""
    overview: str = Field(..., description="歩行の様子について")
    concerns: str = Field(..., description="気になる点")
    causes: str = Field(..., description="予想される原因")
    advice: str = Field(..., description="日常生活でのアドバイス")


class PatientReviewResponse(BaseModel):
    """患者向けレビュー"""
    case_id: str
    review_data: PatientReviewData
    radar_scores: RadarScore
    improvement_points: List[str] = []


class TherapistReviewData(BaseModel):
    """セラピスト向けレビューデータ構造"""
    summary: str = Field(..., description="歩行解析結果サマリ")
    findings: str = Field(..., description="主要所見")
    problem_areas: str = Field(..., description="予測される問題部位")
    interpretation: str = Field(..., description="主訴の統合と解釈")
    clinical_suggestions: str = Field(..., description="臨床的示唆")
    limitations: str = Field(..., description="測定限界")


class TherapistReviewResponse(BaseModel):
    """セラピスト向けレビュー"""
    case_id: str
    review_data: TherapistReviewData
    metrics: Dict[str, MetricValue]
    clinical_suggestions: List[str] = []
