import json
import os
from pathlib import Path
from typing import Any, Optional, Union

import numpy as np
import pandas as pd

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore[assignment]

from .metrics_translator import translate_metrics_dict


def load_interview_for_case(case: str, input_root: Path) -> dict[str, Any]:
    """ケース配下の interview.json を読み込む。"""
    candidates = [
        input_root / case / f"{case}_interview.json",
        input_root / case / f"{case}.interview.json",
        input_root / case / "interview.json",
    ]
    for path in candidates:
        if path.exists():
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {}
    return {}


def build_compact_metrics_dict_from_df(df: pd.DataFrame) -> dict[str, Any]:
    """DataFrame からレビュー用の簡易メトリクス辞書を作る。"""
    data: dict[str, Any] = {}
    if df.empty:
        return data

    cols = {str(c).lower(): c for c in df.columns}
    if "metric" in cols and "value" in cols:
        metric_col = cols["metric"]
        value_col = cols["value"]
        for _, row in df.iterrows():
            key = str(row[metric_col]).strip()
            value = row[value_col]
            data[key] = value
        return data

    num_df = df.select_dtypes(include=[np.number])
    if not num_df.empty:
        return {str(k): float(v) for k, v in num_df.iloc[0].to_dict().items()}

    # 数値列がない場合は先頭行を文字列化して保持
    return {str(k): v for k, v in df.iloc[0].to_dict().items()}


def build_compact_metrics_dict(metrics: Union[Path, pd.DataFrame]) -> dict[str, Any]:
    if isinstance(metrics, pd.DataFrame):
        return build_compact_metrics_dict_from_df(metrics)
    if not metrics.exists():
        return {}
    try:
        return build_compact_metrics_dict_from_df(pd.read_csv(metrics))
    except Exception:
        return {}


def _make_openai_client() -> Optional["OpenAI"]:
    if OpenAI is None:
        return None
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return None
    try:
        return OpenAI(api_key=key)
    except Exception:
        return None


def _build_fallback_patient_review(metrics: dict[str, Any], interview: dict[str, Any]) -> dict[str, str]:
    chief = str(interview.get("chief") or interview.get("chief_complaint") or "").strip()
    overview = "背面歩行の代表指標を要約しました。"
    if chief:
        overview += f" 主訴: {chief}。"

    return {
        "overview": overview,
        "concerns": "骨盤・肩・膝・頭部の左右差を中心に確認します。",
        "causes": "体幹制御、股関節周囲筋、下肢アライメントの影響が考えられます。",
        "advice": "痛みのない範囲で左右差を減らす運動を継続し、再評価で変化を確認してください。",
    }


def _build_fallback_therapist_review(metrics: dict[str, Any], interview: dict[str, Any]) -> dict[str, str]:
    _ = metrics
    chief = str(interview.get("chief") or interview.get("chief_complaint") or "").strip()
    summary = "背面歩行の定量値を基に、左右差と体幹安定性を整理しました。"
    if chief:
        summary += f" 主訴: {chief}。"

    return {
        "summary": summary,
        "findings": "骨盤・肩・膝・頭部に関する代表指標を抽出済み。",
        "problem_areas": "左右差の大きい部位を優先して介入対象とする。",
        "interpretation": "前額面アライメントと体幹制御の相互作用を示唆。",
        "clinical_suggestions": "荷重対称性、股関節外転筋、体幹安定化の段階的介入を推奨。",
        "limitations": "2D推定に基づくため、臨床所見との統合解釈が必要。",
    }


def _call_openai_json(system_prompt: str, user_payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    client = _make_openai_client()
    if client is None:
        return None

    try:
        response = client.chat.completions.create(
            model="gpt-5-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
            timeout=20.0,
        )
        text = (response.choices[0].message.content or "").strip()
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        return None
    return None


def generate_patient_review(metrics: Union[Path, pd.DataFrame], interview: dict[str, Any]) -> str:
    data = translate_metrics_dict(build_compact_metrics_dict(metrics))
    ai_result = _call_openai_json(
        "患者向け歩行レビューをJSONで返す。keys: overview, concerns, causes, advice",
        {"interview": interview, "metrics": data},
    )
    result = ai_result if isinstance(ai_result, dict) else _build_fallback_patient_review(data, interview)
    return json.dumps(result, ensure_ascii=False)


def generate_therapist_review(metrics: Union[Path, pd.DataFrame], interview: dict[str, Any]) -> str:
    data = translate_metrics_dict(build_compact_metrics_dict(metrics))
    ai_result = _call_openai_json(
        "療法士向け歩行レビューをJSONで返す。keys: summary, findings, problem_areas, interpretation, clinical_suggestions, limitations",
        {"interview": interview, "metrics": data},
    )
    result = ai_result if isinstance(ai_result, dict) else _build_fallback_therapist_review(data, interview)
    return json.dumps(result, ensure_ascii=False)


def build_patient_radar_scores(metrics: dict[str, Any]) -> dict[str, float]:
    """UI互換のため残す。値がない場合は50点。"""

    def pick(keys: list[str]) -> float:
        for key in keys:
            value = metrics.get(key)
            if value is None:
                continue
            try:
                return abs(float(value))
            except (TypeError, ValueError):
                continue
        return 0.0

    def to_score(value: float, worst: float) -> float:
        return max(0.0, min(100.0, 100.0 - (value / worst) * 100.0))

    return {
        "骨盤": to_score(pick(["pelvic_obliquity_mean", "pelvic_obliquity"]), 10.0),
        "肩": to_score(pick(["shoulder_tilt_mean", "shoulder_obliquity"]), 10.0),
        "膝": to_score(pick(["dynamic_knee_valgus_varus_2D_R", "dynamic_knee_valgus_varus_2D_L"]), 15.0),
        "頭部": to_score(pick(["head_tilt_mean", "head_tilt"]), 10.0),
        "体幹": to_score(pick(["head_lateral_sway_amp", "head_sway"]), 0.05),
    }


def build_therapist_bar_data(metrics: dict[str, Any]) -> dict[str, float]:
    return {
        "pelvic": abs(float(metrics.get("pelvic_obliquity_mean", 0) or 0)),
        "shoulder": abs(float(metrics.get("shoulder_tilt_mean", 0) or 0)),
        "knee": abs(float(metrics.get("dynamic_knee_valgus_varus_2D_R", 0) or 0)),
        "head": abs(float(metrics.get("head_tilt_mean", 0) or 0)),
        "sway": abs(float(metrics.get("head_lateral_sway_amp", 0) or 0)),
    }


def get_cycle_stability(metrics: dict[str, Any]) -> float:
    value = metrics.get("cycle_stability", 0)
    try:
        return abs(float(value))
    except (TypeError, ValueError):
        return 0.0
