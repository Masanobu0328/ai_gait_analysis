# -*- coding: utf-8 -*-
"""
Results router - fetch analysis results.
"""
import json
from datetime import datetime

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from config import settings
from models.schemas import (
    AnalysisResults,
    RadarScore,
    MetricValue,
)

router = APIRouter()


def _safe_numeric(series: pd.Series) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    values = values.interpolate(limit_direction="both")
    return values.fillna(0.0)


def _normalize_angle(series: pd.Series) -> pd.Series:
    normalized = ((series + 180.0) % 360.0) - 180.0
    return normalized


def _select_first_existing(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for col in candidates:
        if col in df.columns:
            return col
    return None


def _pick_gait_phase(cycle_percent: float) -> str:
    if cycle_percent < 10:
        return "初期接地"
    if cycle_percent < 30:
        return "荷重応答"
    if cycle_percent < 50:
        return "立脚中期"
    if cycle_percent < 62:
        return "立脚終期"
    if cycle_percent < 75:
        return "前遊脚期"
    if cycle_percent < 87:
        return "遊脚前期"
    return "遊脚終期"


def _support_side_label(cycle_percent: float) -> str:
    # 右踵接地から次の右踵接地までを1周期として定義
    return "右立脚" if cycle_percent < 62.0 else "左立脚"


def _to_valid_height(value: object) -> float | None:
    try:
        v = float(value)
        if 80.0 <= v <= 230.0:
            return v
    except Exception:
        return None
    return None


def _smooth_series(series: pd.Series, window: int = 7) -> pd.Series:
    win = max(3, window if window % 2 == 1 else window + 1)
    return series.rolling(window=win, center=True, min_periods=1).mean()


def _detect_stride_bounds(heel_signal: pd.Series) -> list[int]:
    """Detect stride boundaries from heel vertical trajectory."""
    values = _safe_numeric(heel_signal).to_numpy()
    n = len(values)
    if n < 4:
        return [0, max(1, n - 1)]

    # Local maxima candidates (foot near ground in normalized image coordinates).
    peak_candidates = [
        i for i in range(1, n - 1)
        if values[i] > values[i - 1] and values[i] >= values[i + 1]
    ]
    if not peak_candidates:
        return [0, n - 1]

    span = float(values.max() - values.min())
    min_prominence = max(0.005, span * 0.12)
    min_distance = max(8, int(n / 12))

    peaks: list[int] = []
    last_peak = -10_000
    for idx in peak_candidates:
        left = max(0, idx - 2)
        right = min(n, idx + 3)
        local_base = float(values[left:right].min())
        prominence = float(values[idx] - local_base)
        if prominence < min_prominence:
            continue
        if idx - last_peak < min_distance:
            if values[idx] > values[last_peak]:
                peaks[-1] = idx
                last_peak = idx
            continue
        peaks.append(idx)
        last_peak = idx

    if len(peaks) < 2:
        return [0, n - 1]
    return peaks


def _estimate_period_frames(signal: pd.Series) -> int | None:
    period, strength = _period_from_autocorr(signal)
    if strength < 0.15:
        return None
    return period


def _period_from_autocorr(signal: pd.Series) -> tuple[int, float]:
    values = _safe_numeric(signal).to_numpy(dtype=float)
    n = len(values)
    if n < 40:
        return 0, 0.0
    x = values - float(np.mean(values))
    if np.allclose(x.std(), 0.0):
        return 0, 0.0
    ac = np.correlate(x, x, mode="full")[n - 1:]
    ac = ac / max(float(ac[0]), 1e-8)
    min_lag = max(12, n // 25)
    max_lag = min(180, n // 2)
    if max_lag <= min_lag:
        return 0, 0.0
    window = ac[min_lag:max_lag + 1]
    if len(window) == 0:
        return 0, 0.0
    best = int(np.argmax(window)) + min_lag
    return best, float(max(0.0, min(1.0, ac[best])))


def _synthesize_stride_bounds(n_frames: int, period: int) -> list[int]:
    if period <= 1 or n_frames < period + 2:
        return [0, max(1, n_frames - 1)]
    bounds = list(range(0, n_frames, period))
    if bounds[-1] != n_frames - 1:
        bounds.append(n_frames - 1)
    return bounds


def _resample_to_cycle_percent(series: pd.Series, target_points: int = 100) -> np.ndarray:
    values = _safe_numeric(series).to_numpy(dtype=float)
    n = len(values)
    if n < 2:
        return np.full(target_points, np.nan)
    x_old = np.linspace(0.0, 100.0, n)
    x_new = np.arange(1, target_points + 1, dtype=float)
    return np.interp(x_new, x_old, values)


def _calc_cycle_quality(
    cycles: dict[str, list[np.ndarray]],
    cycles_used: int,
    periodicity: float,
) -> dict:
    if cycles_used <= 0:
        return {
            "score": 0.0,
            "level": "low",
            "cycles_used": 0,
            "periodicity": 0.0,
            "consistency": 0.0,
            "note": "周期を抽出できないため信頼度を評価できません。",
        }

    consist_list: list[float] = []
    for key in ["pelvic_tilt", "shoulder_tilt", "trunk_sway", "com_lateral", "knee_asymmetry"]:
        stack = np.vstack(cycles[key]) if cycles[key] else np.empty((0, 100))
        if stack.shape[0] == 0:
            continue
        std_profile = np.nanmean(np.nanstd(stack, axis=0))
        amp = float(np.nanpercentile(np.abs(stack), 90)) + 1e-6
        rel = float(std_profile / amp)
        consistency = float(np.clip(1.0 - rel * 1.8, 0.0, 1.0))
        consist_list.append(consistency)

    consistency_score = float(np.mean(consist_list)) if consist_list else 0.0
    cycle_count_score = float(min(1.0, cycles_used / 6.0))
    score = 100.0 * (0.45 * consistency_score + 0.35 * periodicity + 0.20 * cycle_count_score)
    score = float(np.clip(score, 0.0, 100.0))

    if score >= 80:
        level = "high"
        note = "歩行周期の再現性が高く、平均波形の信頼度は高めです。"
    elif score >= 60:
        level = "medium"
        note = "臨床参考には十分ですが、追加撮影で安定します。"
    else:
        level = "low"
        note = "周期検出が不安定で、解釈には注意が必要です。"

    return {
        "score": round(score, 1),
        "level": level,
        "cycles_used": cycles_used,
        "periodicity": round(periodicity * 100.0, 1),
        "consistency": round(consistency_score * 100.0, 1),
        "note": note,
    }


def _extract_frame_metrics(
    angle_df: pd.DataFrame,
    height_cm: float | None = None,
) -> tuple[dict[str, pd.Series], str, str]:
    pelvic_col = _select_first_existing(angle_df, ["pelvic_yz", "pelvic_xz"])
    shoulder_y_left = _select_first_existing(angle_df, ["11_y"])
    shoulder_y_right = _select_first_existing(angle_df, ["12_y"])
    pelvis_y_left = _select_first_existing(angle_df, ["23_y"])
    pelvis_y_right = _select_first_existing(angle_df, ["24_y"])
    pelvis_x_left = _select_first_existing(angle_df, ["23_x"])
    pelvis_x_right = _select_first_existing(angle_df, ["24_x"])

    if not pelvic_col or not shoulder_y_left or not shoulder_y_right or not pelvis_x_left or not pelvis_x_right:
        return {}, "%", "cm"

    hip_width = (_safe_numeric(angle_df[pelvis_x_right]) - _safe_numeric(angle_df[pelvis_x_left])).abs()
    hip_width = hip_width.clip(lower=1e-4)
    pelvis_center_x = (_safe_numeric(angle_df[pelvis_x_left]) + _safe_numeric(angle_df[pelvis_x_right])) / 2.0
    pelvis_center_baseline = float(pelvis_center_x.median())

    # 背面撮影前提: + は「右下制」、- は「左下制」
    shoulder_dy = _safe_numeric(angle_df[shoulder_y_right]) - _safe_numeric(angle_df[shoulder_y_left])
    shoulder_dx = (_safe_numeric(angle_df[pelvis_x_right]) - _safe_numeric(angle_df[pelvis_x_left])).clip(lower=1e-4)
    shoulder_tilt = np.degrees(np.arctan2(shoulder_dy.to_numpy(dtype=float), shoulder_dx.to_numpy(dtype=float)))
    shoulder_tilt = pd.Series(shoulder_tilt, index=angle_df.index)

    # 体幹傾斜: 骨盤中心の左右偏位を、肩-足首の縦方向スケールで角度化（+で右傾斜）
    ankle_y_right = _select_first_existing(angle_df, ["28_y", "30_y", "ankle_xy_r"])
    ankle_y_left = _select_first_existing(angle_df, ["27_y", "29_y", "ankle_xy_l"])
    if ankle_y_right and ankle_y_left:
        shoulder_mid_y = (_safe_numeric(angle_df[shoulder_y_left]) + _safe_numeric(angle_df[shoulder_y_right])) / 2.0
        ankle_mid_y = (_safe_numeric(angle_df[ankle_y_left]) + _safe_numeric(angle_df[ankle_y_right])) / 2.0
        body_height_norm = (ankle_mid_y - shoulder_mid_y).abs().clip(lower=1e-4)
    else:
        body_height_norm = hip_width

    trunk_dx = pelvis_center_x - pelvis_center_baseline
    trunk_sway = np.degrees(np.arctan2(trunk_dx.to_numpy(dtype=float), body_height_norm.to_numpy(dtype=float)))
    trunk_sway = pd.Series(trunk_sway, index=angle_df.index)
    trunk_unit = "°"
    com_unit = "cm"
    if pelvis_y_left and pelvis_y_right:
        pelvis_dy = _safe_numeric(angle_df[pelvis_y_right]) - _safe_numeric(angle_df[pelvis_y_left])
        pelvis_tilt = np.degrees(np.arctan2(pelvis_dy.to_numpy(dtype=float), shoulder_dx.to_numpy(dtype=float)))
        pelvic_tilt = pd.Series(pelvis_tilt, index=angle_df.index)
    else:
        pelvic_raw = _safe_numeric(angle_df[pelvic_col])
        pelvic_folded = ((pelvic_raw + 90.0) % 180.0) - 90.0
        pelvic_tilt = pelvic_folded - float(pelvic_folded.median())
    # FTA相当の実角度を表示用に保持（ユーザー要望）
    knee_right = _safe_numeric(angle_df["knee_xy_r"])
    knee_left = _safe_numeric(angle_df["knee_xy_l"])
    knee_asymmetry = knee_right - knee_left

    # COM左右移動: 可能なら pose_data/angle_data に保存されたCOMを利用、なければ骨盤中心で代替
    if "com_lateral_cm" in angle_df.columns:
        com_lateral = _safe_numeric(angle_df["com_lateral_cm"])
        com_unit = "cm"
    else:
        if "com_x" in angle_df.columns:
            com_x = _safe_numeric(angle_df["com_x"])
        else:
            com_x = pelvis_center_x
        com_center = float(com_x.median())
        com_lateral_norm = com_x - com_center

        img_w_series = _safe_numeric(angle_df["img_w"]) if "img_w" in angle_df.columns else pd.Series(
            np.full(len(angle_df), 1.0), index=angle_df.index, dtype=float
        )
        com_lateral_px = com_lateral_norm * img_w_series
        if "scale_cm_per_px" in angle_df.columns:
            scale_series = _safe_numeric(angle_df["scale_cm_per_px"])
            scale_med = float(scale_series.median())
            if np.isfinite(scale_med) and scale_med > 0:
                com_lateral = com_lateral_px * scale_series
                com_unit = "cm"
            else:
                com_lateral = com_lateral_px
                com_unit = "px"
        else:
            com_lateral = com_lateral_px
            com_unit = "px"

    pelvic_tilt = _smooth_series(pelvic_tilt, 9).clip(lower=-30.0, upper=30.0)
    shoulder_tilt = _smooth_series(shoulder_tilt, 9).clip(lower=-30.0, upper=30.0)
    trunk_sway = _smooth_series(trunk_sway, 9).clip(lower=-20.0, upper=20.0)
    com_lateral = _smooth_series(com_lateral, 9).clip(lower=-50.0, upper=50.0)
    knee_right = _smooth_series(knee_right, 9).clip(lower=130.0, upper=200.0)
    knee_left = _smooth_series(knee_left, 9).clip(lower=130.0, upper=200.0)
    knee_asymmetry = _smooth_series(knee_asymmetry, 9).clip(lower=-20.0, upper=20.0)

    return (
        {
            "pelvic_tilt": pelvic_tilt,
            "shoulder_tilt": shoulder_tilt,
            "trunk_sway": trunk_sway,
            "com_lateral": com_lateral,
            "knee_asymmetry": knee_asymmetry,
            "knee_right": knee_right,
            "knee_left": knee_left,
        },
        trunk_unit,
        com_unit,
    )


def build_trend_points(angle_df: pd.DataFrame, height_cm: float | None = None) -> list[dict]:
    """Build frame-level trend points for detailed gait chart rendering."""
    if angle_df.empty:
        return []

    required_columns = {"frame", "knee_xy_r", "knee_xy_l"}
    if not required_columns.issubset(angle_df.columns):
        return []

    metrics, _, _ = _extract_frame_metrics(angle_df, height_cm=height_cm)
    if not metrics:
        return []

    frame_series = _safe_numeric(angle_df["frame"]).round().astype(int)
    pelvic = metrics["pelvic_tilt"]
    shoulder = metrics["shoulder_tilt"]
    trunk = metrics["trunk_sway"]
    com_lateral = metrics["com_lateral"]
    knee_asymmetry = metrics["knee_asymmetry"]
    knee_right = metrics["knee_right"]
    knee_left = metrics["knee_left"]
    heel_col = _select_first_existing(angle_df, ["28_y", "30_y", "ankle_xy_r"])
    if not heel_col:
        heel_col = _select_first_existing(angle_df, ["27_y", "29_y", "ankle_xy_l"])
    if not heel_col:
        return []

    stride_bounds = _detect_stride_bounds(angle_df[heel_col])

    total = len(angle_df)
    step = max(1, total // 180)
    points: list[dict] = []

    for idx in range(0, total, step):
        cycle_index = 0
        cycle_percent = 0.0
        for stride_idx in range(len(stride_bounds) - 1):
            start = stride_bounds[stride_idx]
            end = stride_bounds[stride_idx + 1]
            if start <= idx <= end and end > start:
                cycle_index = stride_idx + 1
                cycle_percent = ((idx - start) / (end - start)) * 100.0
                break
        phase = _pick_gait_phase(cycle_percent)
        support_side = _support_side_label(cycle_percent)

        points.append(
            {
                "frame": int(frame_series.iloc[idx]),
                "phase": phase,
                "support_side": support_side,
                "cycle_index": cycle_index,
                "cycle_percent": round(float(cycle_percent), 1),
                "pelvic_tilt": round(float(pelvic.iloc[idx]), 3),
                "shoulder_tilt": round(float(shoulder.iloc[idx]), 3),
                "trunk_sway": round(float(trunk.iloc[idx]), 3),
                "com_lateral": round(float(com_lateral.iloc[idx]), 3),
                "knee_asymmetry": round(float(knee_asymmetry.iloc[idx]), 3),
                "knee_right": round(float(knee_right.iloc[idx]), 3),
                "knee_left": round(float(knee_left.iloc[idx]), 3),
            }
        )

    return points


def build_cycle_profile(angle_df: pd.DataFrame, height_cm: float | None = None) -> tuple[list[dict], int, dict]:
    """Build 1-100% gait-cycle mean profile from stride segments."""
    required_columns = {"knee_xy_r", "knee_xy_l"}
    if not required_columns.issubset(angle_df.columns):
        return [], 0, _calc_cycle_quality({}, 0, 0.0)

    metrics, _, _ = _extract_frame_metrics(angle_df, height_cm=height_cm)
    if not metrics:
        return [], 0, _calc_cycle_quality({}, 0, 0.0)

    heel_col = _select_first_existing(angle_df, ["28_y", "30_y", "ankle_xy_r"])
    if not heel_col:
        heel_col = _select_first_existing(angle_df, ["27_y", "29_y", "ankle_xy_l"])
    if not heel_col:
        return [], 0, _calc_cycle_quality({}, 0, 0.0)

    stride_bounds = _detect_stride_bounds(angle_df[heel_col])
    _, periodicity = _period_from_autocorr(angle_df[heel_col])
    if len(stride_bounds) < 3:
        ref_col = _select_first_existing(angle_df, ["ankle_xy_r", "ankle_xy_l", "knee_xy_r"])
        if ref_col:
            period = _estimate_period_frames(angle_df[ref_col])
            if period:
                stride_bounds = _synthesize_stride_bounds(len(angle_df), period)
    if len(stride_bounds) < 2:
        return [], 0, _calc_cycle_quality({}, 0, periodicity)

    cycles: dict[str, list[np.ndarray]] = {
        "pelvic_tilt": [],
        "shoulder_tilt": [],
        "trunk_sway": [],
        "com_lateral": [],
        "knee_asymmetry": [],
        "knee_right": [],
        "knee_left": [],
    }

    for i in range(len(stride_bounds) - 1):
        start = stride_bounds[i]
        end = stride_bounds[i + 1]
        length = end - start + 1
        if length < 12:
            continue
        for key in cycles:
            segment = metrics[key].iloc[start:end + 1]
            cycles[key].append(_resample_to_cycle_percent(segment, target_points=100))

    cycles_used = len(cycles["pelvic_tilt"])
    if cycles_used == 0:
        return [], 0, _calc_cycle_quality(cycles, 0, periodicity)

    profile: list[dict] = []
    for pct in range(1, 101):
        idx = pct - 1
        support_side = _support_side_label(float(pct))
        profile.append(
            {
                "gait_percent": pct,
                "phase": _pick_gait_phase(float(pct)),
                "support_side": support_side,
                "pelvic_tilt": round(float(np.nanmean([c[idx] for c in cycles["pelvic_tilt"]])), 3),
                "shoulder_tilt": round(float(np.nanmean([c[idx] for c in cycles["shoulder_tilt"]])), 3),
                "trunk_sway": round(float(np.nanmean([c[idx] for c in cycles["trunk_sway"]])), 3),
                "com_lateral": round(float(np.nanmean([c[idx] for c in cycles["com_lateral"]])), 3),
                "knee_asymmetry": round(float(np.nanmean([c[idx] for c in cycles["knee_asymmetry"]])), 3),
                "knee_right": round(float(np.nanmean([c[idx] for c in cycles["knee_right"]])), 3),
                "knee_left": round(float(np.nanmean([c[idx] for c in cycles["knee_left"]])), 3),
            }
        )
    quality = _calc_cycle_quality(cycles, cycles_used, periodicity)
    return profile, cycles_used, quality


def calculate_radar_score(value: float, thresholds: tuple, invert: bool = True) -> float:
    """
    指標値を0-100のスコアに変換
    invert=True: 値が小さいほど良い（例: 傾きの大きさ）
    """
    low, mid, high = thresholds
    
    if invert:
        if value <= low:
            return 100.0
        elif value <= mid:
            return 80.0 + (mid - value) / (mid - low) * 20.0
        elif value <= high:
            return 50.0 + (high - value) / (high - mid) * 30.0
        else:
            return max(0.0, 50.0 - (value - high) * 5)
    else:
        # Not inverted (higher is better)
        if value >= high:
            return 100.0
        elif value >= mid:
            return 80.0 + (value - mid) / (high - mid) * 20.0
        elif value >= low:
            return 50.0 + (value - low) / (mid - low) * 30.0
        else:
            return max(0.0, value / low * 50.0)


def get_status_label(value: float, thresholds: tuple, invert: bool = True) -> str:
    """値に基づいてステータスラベルを返す"""
    low, mid, _ = thresholds
    
    if invert:
        if value <= low:
            return "良好"
        elif value <= mid:
            return "注意"
        else:
            return "要改善"
    else:
        if value >= mid:
            return "良好"
        elif value >= low:
            return "注意"
        else:
            return "要改善"


def build_radar_scores(metrics_dict: dict) -> RadarScore:
    """メトリクスから五角形レーダーチャート用スコアを構築"""
    
    pelvic = abs(float(metrics_dict.get('pelvic_obliquity_mean', 0)))
    shoulder = abs(float(metrics_dict.get('shoulder_tilt_mean', 0)))
    knee_r = float(metrics_dict.get('dynamic_knee_valgus_varus_2D_R', 0))
    knee_l = float(metrics_dict.get('dynamic_knee_valgus_varus_2D_L', 0))
    knee_asymmetry = abs(knee_r - knee_l)
    head_sway = abs(float(metrics_dict.get('head_lateral_sway_amp', 0)))
    head_tilt = abs(float(metrics_dict.get('head_tilt_mean', 0))) if 'head_tilt_mean' in metrics_dict else 0
    
    return RadarScore(
        pelvic_tilt=calculate_radar_score(pelvic, (1.0, 2.0, 3.0)),
        shoulder_tilt=calculate_radar_score(shoulder, (1.0, 2.0, 3.0)),
        knee_alignment=calculate_radar_score(knee_asymmetry, (3.0, 5.0, 8.0)),
        head_tilt=calculate_radar_score(head_tilt, (2.0, 4.0, 6.0)),
        trunk_stability=calculate_radar_score(head_sway, (0.03, 0.05, 0.08)),
    )


def build_detailed_metrics(metrics_dict: dict) -> dict:
    """セラピスト向け詳細メトリクスを構築"""
    
    result = {}
    
    # 骨盤傾斜
    pelvic = abs(float(metrics_dict.get('pelvic_obliquity_mean', 0)))
    result['pelvic_obliquity'] = MetricValue(
        value=pelvic,
        unit="%",
        status=get_status_label(pelvic, (1.0, 2.0, 3.0)),
        reference="基準値: <1.0%"
    )
    
    # 肩傾斜
    shoulder = abs(float(metrics_dict.get('shoulder_tilt_mean', 0)))
    result['shoulder_tilt'] = MetricValue(
        value=shoulder,
        unit="%",
        status=get_status_label(shoulder, (1.0, 2.0, 3.0)),
        reference="基準値: <1.0%"
    )
    
    # 膝の向き（右）
    knee_r = float(metrics_dict.get('dynamic_knee_valgus_varus_2D_R', 0))
    result['knee_alignment_r'] = MetricValue(
        value=knee_r,
        unit="°",
        status=get_status_label(abs(knee_r), (5.0, 8.0, 12.0)),
        reference="基準値: ±5°"
    )
    
    # 膝の向き（左）
    knee_l = float(metrics_dict.get('dynamic_knee_valgus_varus_2D_L', 0))
    result['knee_alignment_l'] = MetricValue(
        value=knee_l,
        unit="°",
        status=get_status_label(abs(knee_l), (5.0, 8.0, 12.0)),
        reference="基準値: ±5°"
    )
    
    # 膝の左右差
    knee_asymmetry = abs(knee_r - knee_l)
    result['knee_asymmetry'] = MetricValue(
        value=knee_asymmetry,
        unit="°",
        status=get_status_label(knee_asymmetry, (3.0, 5.0, 8.0)),
        reference="基準値: <3°"
    )
    
    # 体幹の揺れ
    head_sway = abs(float(metrics_dict.get('head_lateral_sway_amp', 0)))
    result['trunk_sway'] = MetricValue(
        value=head_sway,
        unit="m",
        status=get_status_label(head_sway, (0.03, 0.05, 0.08)),
        reference="基準値: <0.03m"
    )
    
    return result


def _resolve_case_output_dir(case_id: str):
    front_dir = settings.OUTPUT_DIR / f"{case_id}_front"
    merged_dir = settings.OUTPUT_DIR / f"{case_id}_merged"

    if front_dir.exists() and (front_dir / "gait_metrics.csv").exists():
        return front_dir
    if merged_dir.exists() and (merged_dir / "gait_metrics.csv").exists():
        return merged_dir
    return None


@router.get("/{case_id}/pose-data", response_class=PlainTextResponse)
async def get_pose_data_csv(case_id: str):
    output_dir = _resolve_case_output_dir(case_id)
    if output_dir is None:
        raise HTTPException(status_code=404, detail="Results not found")

    pose_path = output_dir / "pose_data.csv"
    if not pose_path.exists():
        raise HTTPException(status_code=404, detail="pose_data.csv not found")

    try:
        text = pose_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read pose_data.csv: {e}") from e

    return PlainTextResponse(content=text, media_type="text/csv; charset=utf-8")


@router.get("/{case_id}", response_model=AnalysisResults)
async def get_results(case_id: str):
    """解析結果を取得"""
    
    # Find output directory
    output_dir = _resolve_case_output_dir(case_id)
    metrics_file = output_dir / "gait_metrics.csv" if output_dir else None
    
    if not metrics_file:
        raise HTTPException(status_code=404, detail="Results not found")
    
    # Load metrics
    df = pd.read_csv(metrics_file)
    if df.empty:
        raise HTTPException(status_code=500, detail="Metrics file is empty")
    
    metrics_dict = df.iloc[0].to_dict()
    
    # Load interview for patient_id
    input_dir = settings.INPUT_DIR / case_id
    interview_path = input_dir / "interview.json"
    patient_id = case_id.split("_")[0] if "_" in case_id else case_id
    height_cm = None
    
    if interview_path.exists():
        with open(interview_path, encoding="utf-8") as f:
            interview = json.load(f)
            patient_id = interview.get("patient_id", patient_id)
            height_cm = _to_valid_height(interview.get("height"))
    
    # Build response
    radar_scores = build_radar_scores(metrics_dict)
    detailed_metrics = build_detailed_metrics(metrics_dict)
    trend_points = []
    cycle_profile = []
    cycles_used = 0
    cycle_quality = None
    com_lateral_unit = "cm"
    angle_path = output_dir / "angle_data.csv"
    if angle_path.exists():
        angle_df = pd.read_csv(angle_path)
        trend_points = build_trend_points(angle_df, height_cm=height_cm)
        cycle_profile, cycles_used, cycle_quality = build_cycle_profile(angle_df, height_cm=height_cm)
        _, trunk_sway_unit, com_lateral_unit = _extract_frame_metrics(angle_df, height_cm=height_cm)
        com_src = cycle_profile if cycle_profile else trend_points
        if com_src:
            com_values = np.array([float(p.get("com_lateral", 0.0)) for p in com_src], dtype=float)
            com_max = float(np.nanmax(com_values))
            com_min = float(np.nanmin(com_values))
            com_range = float(com_max - com_min)
            detailed_metrics["com_lateral_max"] = MetricValue(
                value=round(com_max, 3),
                unit=com_lateral_unit,
                status="参考",
                reference="COM左右移動の最大値",
            )
            detailed_metrics["com_lateral_min"] = MetricValue(
                value=round(com_min, 3),
                unit=com_lateral_unit,
                status="参考",
                reference="COM左右移動の最小値",
            )
            detailed_metrics["com_lateral_range"] = MetricValue(
                value=round(com_range, 3),
                unit=com_lateral_unit,
                status="参考",
                reference="COM左右移動の移動幅",
            )
    else:
        trunk_sway_unit = "%"
    
    # Video URL
    skeleton_video_url = None
    video_path = output_dir / "skeleton_only.mp4"
    if video_path.exists():
        skeleton_video_url = f"/static/videos/{output_dir.name}/skeleton_only.mp4"
    else:
        legacy_video_path = output_dir / "pose_output.mp4"
        if legacy_video_path.exists():
            skeleton_video_url = f"/static/videos/{output_dir.name}/pose_output.mp4"
    
    return AnalysisResults(
        case_id=case_id,
        patient_id=patient_id,
        timestamp=datetime.now(),
        radar_scores=radar_scores,
        metrics=detailed_metrics,
        trend_points=trend_points,
        cycle_profile=cycle_profile,
        cycles_used=cycles_used,
        cycle_quality=cycle_quality,
        trunk_sway_unit=trunk_sway_unit,
        com_lateral_unit=com_lateral_unit,
        height_cm_used=height_cm,
        skeleton_video_url=skeleton_video_url
    )
