# -*- coding: utf-8 -*-
"""
メトリクス名の日本語翻訳
"""

# メトリクス名の日本語マッピング
METRICS_JP = {
    # 歩幅・歩行速度
    "step_length_r": "右足歩幅",
    "step_length_l": "左足歩幅",
    "step_length_r_cm": "右足歩幅（cm）",
    "step_length_l_cm": "左足歩幅（cm）",
    "step_asymmetry": "歩幅の左右差",
    "speed_norm": "歩行速度（正規化）",
    "speed_m_s": "歩行速度（m/s）",
    
    # 骨盤
    "pelvis_sway": "骨盤の横揺れ",
    "pelvic_lateral_sway_cm": "骨盤横揺れ（cm）",
    
    # 肩
    "shoulder_diff_mean": "肩の高さ差（平均）",
    "shoulder_diff_std": "肩の高さ差（標準偏差）",
    
    # かかと・足首
    "heel_tilt_r_mean": "右かかと傾き（平均）",
    "heel_tilt_l_mean": "左かかと傾き（平均）",
    "heel_tilt_r_std": "右かかと傾き（標準偏差）",
    "heel_tilt_l_std": "左かかと傾き（標準偏差）",
    "heel_tilt_diff": "かかと傾きの左右差",
    "ankle_pronation_r_mean": "右足首回内（平均）",
    "ankle_pronation_l_mean": "左足首回内（平均）",
    
    # 膝
    "knee_varus_valgus_r_mean": "右膝内反外反（平均）",
    "knee_varus_valgus_l_mean": "左膝内反外反（平均）",
    "knee_varus_valgus_r_std": "右膝内反外反（標準偏差）",
    "knee_varus_valgus_l_std": "左膝内反外反（標準偏差）",
    "knee_varus_valgus_diff": "膝内反外反の左右差",
}

def translate_metrics_dict(data: dict) -> dict:
    """
    メトリクス辞書のキーを日本語に翻訳
    
    Args:
        data: 元のメトリクス辞書
    
    Returns:
        日本語キーの辞書
    """
    translated = {}
    for key, value in data.items():
        jp_key = METRICS_JP.get(key, key)
        translated[jp_key] = value
    return translated


def format_metric_value(value, metric_name: str = "") -> str:
    """
    メトリクス値をフォーマット
    
    Args:
        value: 値
        metric_name: メトリクス名（単位判定用）
    
    Returns:
        フォーマット済みの文字列
    """
    try:
        num_value = float(value)
        
        # 単位の判定
        if "cm" in metric_name or "（cm）" in metric_name:
            return f"{num_value:.1f} cm"
        elif "m/s" in metric_name or "（m/s）" in metric_name:
            return f"{num_value:.2f} m/s"
        elif "度" in metric_name or "傾き" in metric_name or "内反外反" in metric_name or "回内" in metric_name:
            return f"{num_value:.1f}°"
        elif "左右差" in metric_name:
            return f"{num_value:.3f}"
        else:
            return f"{num_value:.2f}"
    except (ValueError, TypeError):
        return str(value)

