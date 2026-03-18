# -*- coding: utf-8 -*-
"""
Reviews router - GPT-based review generation.
"""

import json
import re
import sys
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException

# Add parent directory to path for importing existing modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from config import settings
from models.schemas import PatientReviewResponse, TherapistReviewResponse
from routers.results import build_detailed_metrics, build_radar_scores

router = APIRouter()

try:
    from services.gpt_review import generate_patient_review, generate_therapist_review

    HAS_GPT_UTILS = True
except ImportError:
    HAS_GPT_UTILS = False

    def generate_patient_review(_df: pd.DataFrame, _interview: dict) -> str:
        return "{}"

    def generate_therapist_review(_df: pd.DataFrame, _interview: dict) -> str:
        return "{}"


def load_case_data(case_id: str):
    """ケースのメトリクスと問診データをロード"""
    front_dir = settings.OUTPUT_DIR / f"{case_id}_front"
    merged_dir = settings.OUTPUT_DIR / f"{case_id}_merged"

    metrics_file = None
    if front_dir.exists() and (front_dir / "gait_metrics.csv").exists():
        metrics_file = front_dir / "gait_metrics.csv"
    elif merged_dir.exists() and (merged_dir / "gait_metrics.csv").exists():
        metrics_file = merged_dir / "gait_metrics.csv"

    if not metrics_file:
        raise HTTPException(status_code=404, detail="Results not found")

    df = pd.read_csv(metrics_file)
    if df.empty:
        raise HTTPException(status_code=500, detail="Metrics file is empty")

    input_dir = settings.INPUT_DIR / case_id
    interview_path = input_dir / "interview.json"
    interview: dict[str, Any] = {}

    if interview_path.exists():
        with open(interview_path, encoding="utf-8") as f:
            interview = json.load(f)

    return df, interview


def _to_float(value: Any) -> float | None:
    try:
        if value is None or pd.isna(value):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _get_first_number(metrics: dict[str, Any], keys: list[str]) -> float | None:
    for key in keys:
        if key in metrics:
            value = _to_float(metrics.get(key))
            if value is not None:
                return value
    return None


def _format_num(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "未取得"
    return f"{value:.{digits}f}"


def _clean_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    text = re.sub(r"\s+", " ", value).strip()
    replacements = {
        "pelvic_obliquity_mean": "骨盤の傾き（平均）",
        "pelvic_obliquity_amp": "骨盤の傾き（振れ幅）",
        "head_lateral_sway_amp": "体のブレ幅",
        "head_lateral_sway_mean": "体のブレ方向",
        "cycle_stability": "歩くリズムの安定性",
        "dynamic_knee_valgus_varus_2D_R": "右膝の角度",
        "dynamic_knee_valgus_varus_2D_L": "左膝の角度",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def _extract_metric_snapshot(metrics: dict[str, Any]) -> dict[str, float | None]:
    knee_r = _get_first_number(metrics, ["dynamic_knee_valgus_varus_2D_R", "knee_varus_valgus_r_mean"])
    knee_l = _get_first_number(metrics, ["dynamic_knee_valgus_varus_2D_L", "knee_varus_valgus_l_mean"])

    return {
        "pelvic_tilt": _get_first_number(metrics, ["pelvic_obliquity_mean", "pelvic_obliquity"]),
        "pelvic_amp": _get_first_number(metrics, ["pelvic_obliquity_amp"]),
        "shoulder_tilt": _get_first_number(metrics, ["shoulder_tilt_mean", "shoulder_obliquity"]),
        "head_tilt": _get_first_number(metrics, ["head_tilt_mean", "head_tilt"]),
        "head_sway": _get_first_number(metrics, ["head_lateral_sway_amp", "head_sway"]),
        "head_sway_mean": _get_first_number(metrics, ["head_lateral_sway_mean", "head_sway_mean", "trunk_sway_mean"]),
        "knee_r": knee_r,
        "knee_l": knee_l,
        "knee_diff": abs(knee_r - knee_l) if knee_r is not None and knee_l is not None else None,
        "cycle_stability": _get_first_number(metrics, ["cycle_stability"]),
    }


def _pelvis_direction(value: float | None) -> str:
    if value is None:
        return "判定できませんでした"
    if value > 0:
        return "右が少し下がる傾向"
    if value < 0:
        return "左が少し下がる傾向"
    return "左右差はほとんどありません"


def _knee_direction_text(knee_r: float | None, knee_l: float | None, tol: float = 0.3) -> str:
    if knee_r is None or knee_l is None:
        return "判定が難しい状態"

    diff = knee_r - knee_l
    if abs(diff) <= tol:
        return "右左の差は小さめ"
    if diff < 0:
        return "右膝が左より少し内側、左膝はやや外側寄り"
    return "右膝が左より少し外側、左膝はやや内側寄り"


def _trunk_direction_text(sway_mean: float | None) -> str:
    if sway_mean is None:
        return "左右どちらにブレやすいかは判定困難"
    if sway_mean > 0:
        return "右足がつく場面で右側にブレやすい傾向"
    if sway_mean < 0:
        return "左足がつく場面で左側にブレやすい傾向"
    return "左右どちらにも大きな偏りはなし"


def _severity_label(value: float | None, low: float, mid: float) -> str:
    if value is None:
        return "評価不可"
    v = abs(value)
    if v <= low:
        return "軽度"
    if v <= mid:
        return "中等度"
    return "高度"


def _interview_focus(interview: dict[str, Any]) -> tuple[str, str, str]:
    chief = _clean_text(interview.get("chief", ""))
    goal = _clean_text(interview.get("goal", ""))
    lifestyle = _clean_text(interview.get("lifestyle_detail", ""))
    return chief, goal, lifestyle


def _build_patient_review(metrics: dict[str, Any], interview: dict[str, Any], ai_data: dict[str, Any]) -> dict[str, str]:
    snap = _extract_metric_snapshot(metrics)
    chief, goal, _ = _interview_focus(interview)

    pelvis_text = _pelvis_direction(snap["pelvic_tilt"])
    knee_text = _knee_direction_text(snap["knee_r"], snap["knee_l"])
    trunk_text = _trunk_direction_text(snap["head_sway_mean"])
    trunk_text_patient = "ややブレが出やすい" if "判定" in trunk_text else trunk_text

    pelvis_val = _format_num(snap["pelvic_tilt"], 1)
    knee_diff_val = _format_num(snap["knee_diff"], 1)
    knee_r_val = _format_num(snap["knee_r"], 1)
    knee_l_val = _format_num(snap["knee_l"], 1)
    sway_val = _format_num(snap["head_sway"], 3)

    overview = (
        f"今回の歩行では、骨盤に{pelvis_text}（約{pelvis_val}度）がみられました。"
        f"それに伴って膝には「{knee_text}」という左右差があり、右は約{knee_r_val}度、左は約{knee_l_val}度、差は約{knee_diff_val}度でした。"
        f"さらに体のブレ幅は約{sway_val}mで、{trunk_text_patient}傾向が確認されています。"
        "これらの所見を合わせると、片脚で支える場面で体が不安定になりやすく、歩行時のふらつきや疲れやすさにつながっている可能性があります。"
    )
    if chief:
        overview += f"問診で伺った「{chief}」とも整合する結果です。"
    if goal:
        overview += f"目標の「{goal}」に向けて、左右差と体のブレの改善を優先していきましょう。"

    pelvis_abs = abs(snap["pelvic_tilt"]) if snap["pelvic_tilt"] is not None else 0.0
    knee_abs = abs(snap["knee_diff"]) if snap["knee_diff"] is not None else 0.0
    sway_abs = abs(snap["head_sway"]) if snap["head_sway"] is not None else 0.0
    ranked = [
        (sway_abs / 0.03 if sway_abs > 0 else 0.0, "体のブレが出やすく、歩行中の安定性に影響している点"),
        (pelvis_abs, "骨盤の高さに左右差があり、重心が片側に寄りやすい点"),
        (knee_abs / 3.0 if knee_abs > 0 else 0.0, "膝の使い方に左右差があり、荷重が偏りやすい点"),
    ]
    ranked.sort(key=lambda x: x[0], reverse=True)
    concerns = (
        f"・最も気になるのは、{ranked[0][1]}です。\n"
        f"・次に、{ranked[1][1]}です。"
    )

    causes = "\n".join(
        [
            "・骨盤の左右差には、お尻の横の筋力（中殿筋など）の働き低下が関係している可能性があります。",
            "・膝の左右差には、股関節まわりの硬さ（外旋/内旋）や、太ももの筋力バランス低下が影響している可能性があります。",
            "・体のブレには、体幹を横方向に支える筋力（腹斜筋・腰方形筋など）の弱さや、足首の硬さが関与している可能性があります。",
        ]
    )

    advice = "\n".join(
        [
            "・今後は、股関節の柔軟性（特に回旋）と、お尻・体幹の支持力を中心に評価していきます。",
            "・歩行中の崩れやすい場面を、右足接地時と左足接地時に分けて詳しく確認します。",
            "・再評価では、骨盤の傾き・膝の左右差・体のブレ幅がどの程度改善したかを丁寧に比較します。",
        ]
    )

    ai_advice = _clean_text(ai_data.get("advice", ""))
    if ai_advice and len(ai_advice) <= 140:
        advice += f"\n補足: {ai_advice}"

    return {
        "overview": overview,
        "concerns": concerns,
        "causes": causes,
        "advice": advice,
    }


def _build_therapist_review(metrics: dict[str, Any], interview: dict[str, Any], ai_data: dict[str, Any]) -> dict[str, str]:
    snap = _extract_metric_snapshot(metrics)
    chief, goal, lifestyle = _interview_focus(interview)

    pelvis_text = _pelvis_direction(snap["pelvic_tilt"])
    knee_text = _knee_direction_text(snap["knee_r"], snap["knee_l"])
    trunk_text = _trunk_direction_text(snap["head_sway_mean"])

    summary_lines = [
        f"背面歩行で骨盤は{pelvis_text}（平均{_format_num(snap['pelvic_tilt'], 1)}度）。",
        f"膝は{knee_text}（左右差{_format_num(snap['knee_diff'], 1)}度）。",
        f"体幹の左右動揺幅は{_format_num(snap['head_sway'], 3)}mで、{trunk_text}。",
    ]
    if chief:
        summary_lines.append(f"問診主訴: {chief}")
    if goal:
        summary_lines.append(f"問診目標: {goal}")
    summary_lines.append("前額面での骨盤-体幹-膝の連動として評価した。")
    summary = "\n".join(summary_lines)

    findings = "\n".join(
        [
            f"・骨盤の傾き（平均）: {_format_num(snap['pelvic_tilt'], 1)}度 / 振れ幅: {_format_num(snap['pelvic_amp'], 1)}度",
            f"・肩の傾き（平均）: {_format_num(snap['shoulder_tilt'], 1)}度",
            f"・膝角度（背面2D）: 右 {_format_num(snap['knee_r'], 1)}度 / 左 {_format_num(snap['knee_l'], 1)}度 / 左右差 {_format_num(snap['knee_diff'], 1)}度",
            f"・体幹の左右動揺幅: {_format_num(snap['head_sway'], 3)}m / 方向: {trunk_text}",
            f"・歩行リズムの安定性: {_format_num(snap['cycle_stability'], 3)}",
        ]
    )

    problem_areas = "\n".join(
        [
            f"・骨盤: {pelvis_text}（{_severity_label(snap['pelvic_tilt'], 1.0, 2.0)}）",
            f"・膝: {knee_text}（{_severity_label(snap['knee_diff'], 3.0, 5.0)}）",
            f"・体幹: {trunk_text}（{_severity_label(snap['head_sway'], 0.03, 0.05)}）",
        ]
    )

    interpretation_lines = [
        "骨盤傾斜の偏りに対して体幹の側方移動が増え、膝の左右差が二次的に増幅している可能性がある。",
        "片脚支持期での骨盤制御不足が、前額面での代償連鎖に寄与していると考える。",
    ]
    if chief:
        interpretation_lines.append(f"問診主訴（{chief}）は、上記の左右差と整合する可能性がある。")
    if lifestyle:
        interpretation_lines.append(f"生活背景（{lifestyle}）により、同様の代償が日常で反復している可能性がある。")
    interpretation = "\n".join(interpretation_lines)

    clinical_suggestions_lines = [
        "1. 評価: 片脚支持期の骨盤ドロップ量、膝内外反、体幹側方偏位をフレーム単位で確認",
        "2. 介入: 中殿筋・体幹側屈筋の協調を狙った荷重移動/片脚支持ドリルを実施",
        "3. 再評価: 骨盤傾き、膝左右差、体幹左右動揺幅を同条件で比較",
    ]
    if goal:
        clinical_suggestions_lines.append(f"4. 問診目標（{goal}）に直結する動作課題へ段階的に接続する")
    clinical_suggestions = "\n".join(clinical_suggestions_lines)

    limitations = "\n".join(
        [
            "・本レポートは背面動画由来の2D指標が中心。",
            "・膝左右差は背面2D膝角度（右-左）を用いた簡易評価。",
            "・体幹の左右動揺幅は頭部/体幹の左右動揺幅の推定量。",
        ]
    )

    ai_interpretation = _clean_text(ai_data.get("interpretation", ""))
    if ai_interpretation and len(ai_interpretation) <= 180:
        interpretation += f"\n補足: {ai_interpretation}"

    return {
        "summary": summary,
        "findings": findings,
        "problem_areas": problem_areas,
        "interpretation": interpretation,
        "clinical_suggestions": clinical_suggestions,
        "limitations": limitations,
    }


def _parse_review_json(review_json_str: str) -> dict[str, Any]:
    try:
        data = json.loads(review_json_str)
        return data if isinstance(data, dict) else {}
    except (TypeError, json.JSONDecodeError):
        return {}


@router.get("/{case_id}/patient", response_model=PatientReviewResponse)
async def get_patient_review(case_id: str):
    """患者向けレビューを返す"""
    df, interview = load_case_data(case_id)
    metrics_dict = df.iloc[0].to_dict()

    review_json_str = generate_patient_review(df, interview)
    ai_review_data = _parse_review_json(review_json_str)
    review_data = _build_patient_review(metrics_dict, interview, ai_review_data)

    radar_scores = build_radar_scores(metrics_dict)

    return PatientReviewResponse(
        case_id=case_id,
        review_data=review_data,
        radar_scores=radar_scores,
        improvement_points=[],
    )


@router.get("/{case_id}/therapist", response_model=TherapistReviewResponse)
async def get_therapist_review(case_id: str):
    """療法士向けレビューを返す"""
    df, interview = load_case_data(case_id)
    metrics_dict = df.iloc[0].to_dict()

    review_json_str = generate_therapist_review(df, interview)
    ai_review_data = _parse_review_json(review_json_str)
    review_data = _build_therapist_review(metrics_dict, interview, ai_review_data)

    detailed_metrics = build_detailed_metrics(metrics_dict)

    return TherapistReviewResponse(
        case_id=case_id,
        review_data=review_data,
        metrics=detailed_metrics,
        clinical_suggestions=[],
    )
