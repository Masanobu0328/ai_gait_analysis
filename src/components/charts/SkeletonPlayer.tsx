"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

type FocusMode = "whole" | "left" | "right" | "shoulder" | "pelvis" | "knee" | "trunk";
type Side = "left" | "right" | "center";

type Landmark = {
  x: number | null;
  y: number | null;
  vis: number | null;
};

type PoseFrame = {
  landmarks: Landmark[];
  comX?: number | null;
  comY?: number | null;
};

type SkeletonPlayerProps = {
  videoSrc: string;
  defaultFps?: number;
  caseId?: string;
};

const LEFT_IDS = new Set([1, 2, 3, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31]);
const RIGHT_IDS = new Set([4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32]);
const SHOULDER_IDS = new Set([11, 12]);
const PELVIS_IDS = new Set([23, 24]);
const KNEE_IDS = new Set([23, 24, 25, 26, 27, 28]);
const TRUNK_IDS = new Set([0, 11, 12, 23, 24]);

const FOCUS_TABS: Array<{ key: FocusMode; label: string }> = [
  { key: "whole", label: "全体" },
  { key: "left", label: "左" },
  { key: "right", label: "右" },
  { key: "shoulder", label: "肩" },
  { key: "pelvis", label: "骨盤" },
  { key: "knee", label: "膝" },
  { key: "trunk", label: "体幹" },
];

const CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  [11, 12],
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [27, 31], [29, 31],
  [28, 30], [28, 32], [30, 32],
];

type WeightedPoint = {
  x: number;
  y: number;
  vis: number;
};

function meanPoint(points: Array<WeightedPoint | null>): WeightedPoint | null {
  const valid = points.filter((p): p is WeightedPoint => p !== null);
  if (valid.length === 0) return null;
  const x = valid.reduce((sum, p) => sum + p.x, 0) / valid.length;
  const y = valid.reduce((sum, p) => sum + p.y, 0) / valid.length;
  const vis = valid.reduce((sum, p) => sum + p.vis, 0) / valid.length;
  return { x, y, vis };
}

function landmarkPoint(landmarks: Landmark[], idx: number, minVis = 0.2): WeightedPoint | null {
  const lm = landmarks[idx];
  if (!lm || lm.x == null || lm.y == null) return null;
  const vis = lm.vis ?? 1;
  if (vis < minVis) return null;
  return { x: lm.x, y: lm.y, vis };
}

function estimateComFromLandmarks(landmarks: Landmark[]): { x: number; y: number } | null {
  const pNose = landmarkPoint(landmarks, 0);
  const pLe = landmarkPoint(landmarks, 7);
  const pRe = landmarkPoint(landmarks, 8);
  const pLs = landmarkPoint(landmarks, 11);
  const pRs = landmarkPoint(landmarks, 12);
  const pLel = landmarkPoint(landmarks, 13);
  const pRel = landmarkPoint(landmarks, 14);
  const pLw = landmarkPoint(landmarks, 15);
  const pRw = landmarkPoint(landmarks, 16);
  const pLh = landmarkPoint(landmarks, 23);
  const pRh = landmarkPoint(landmarks, 24);
  const pLk = landmarkPoint(landmarks, 25);
  const pRk = landmarkPoint(landmarks, 26);
  const pLa = landmarkPoint(landmarks, 27);
  const pRa = landmarkPoint(landmarks, 28);
  const pLheel = landmarkPoint(landmarks, 29);
  const pRheel = landmarkPoint(landmarks, 30);
  const pLtoe = landmarkPoint(landmarks, 31);
  const pRtoe = landmarkPoint(landmarks, 32);

  const headCenter = meanPoint([pNose, pLe, pRe]);
  const trunkCenter = meanPoint([pLs, pRs, pLh, pRh]);
  const lUpperArm = meanPoint([pLs, pLel]);
  const rUpperArm = meanPoint([pRs, pRel]);
  const lForearmHand = meanPoint([pLel, pLw]);
  const rForearmHand = meanPoint([pRel, pRw]);
  const lThigh = meanPoint([pLh, pLk]);
  const rThigh = meanPoint([pRh, pRk]);
  const lShankFoot = meanPoint([pLk, pLa, pLheel, pLtoe]);
  const rShankFoot = meanPoint([pRk, pRa, pRheel, pRtoe]);

  const segments: Array<{ weight: number; point: WeightedPoint | null }> = [
    { weight: 0.081, point: headCenter },
    { weight: 0.475, point: trunkCenter },
    { weight: 0.028, point: lUpperArm },
    { weight: 0.028, point: rUpperArm },
    { weight: 0.022, point: lForearmHand },
    { weight: 0.022, point: rForearmHand },
    { weight: 0.100, point: lThigh },
    { weight: 0.100, point: rThigh },
    { weight: 0.072, point: lShankFoot },
    { weight: 0.072, point: rShankFoot },
  ];

  let weightSum = 0;
  let xSum = 0;
  let ySum = 0;
  for (const { weight, point } of segments) {
    if (!point) continue;
    xSum += weight * point.x;
    ySum += weight * point.y;
    weightSum += weight;
  }
  if (weightSum <= 0.25) return null;
  return { x: xSum / weightSum, y: ySum / weightSum };
}

function parsePoseCsv(csvText: string): { frames: PoseFrame[]; imgW: number; imgH: number } {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { frames: [], imgW: 1920, imgH: 1080 };
  }

  const headers = lines[0].split(",");
  const colIndex = new Map<string, number>();
  headers.forEach((h, i) => colIndex.set(h, i));

  const frames: PoseFrame[] = [];
  let imgW = 1920;
  let imgH = 1080;

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",");
    if (cols.length < headers.length) continue;

    const landmarks: Landmark[] = [];
    for (let j = 0; j < 33; j += 1) {
      const xIdx = colIndex.get(`${j}_x`);
      const yIdx = colIndex.get(`${j}_y`);
      const visIdx = colIndex.get(`${j}_vis`);

      const xRaw = xIdx !== undefined ? cols[xIdx] : "";
      const yRaw = yIdx !== undefined ? cols[yIdx] : "";
      const visRaw = visIdx !== undefined ? cols[visIdx] : "";

      const xNum = xRaw === "" ? NaN : Number(xRaw);
      const yNum = yRaw === "" ? NaN : Number(yRaw);
      const visNum = visRaw === "" ? NaN : Number(visRaw);

      landmarks.push({
        x: Number.isFinite(xNum) ? xNum : null,
        y: Number.isFinite(yNum) ? yNum : null,
        vis: Number.isFinite(visNum) ? visNum : null,
      });
    }

    const wIdx = colIndex.get("img_w");
    const hIdx = colIndex.get("img_h");
    if (wIdx !== undefined) {
      const w = Number(cols[wIdx]);
      if (Number.isFinite(w) && w > 0) imgW = w;
    }
    if (hIdx !== undefined) {
      const h = Number(cols[hIdx]);
      if (Number.isFinite(h) && h > 0) imgH = h;
    }

    const comXIdx = colIndex.get("com_x");
    const comYIdx = colIndex.get("com_y");
    const comXRaw = comXIdx !== undefined ? cols[comXIdx] : "";
    const comYRaw = comYIdx !== undefined ? cols[comYIdx] : "";
    const comXNum = comXRaw === "" ? NaN : Number(comXRaw);
    const comYNum = comYRaw === "" ? NaN : Number(comYRaw);

    let comX: number | null = Number.isFinite(comXNum) ? comXNum : null;
    let comY: number | null = Number.isFinite(comYNum) ? comYNum : null;
    if (comX == null || comY == null) {
      const estimated = estimateComFromLandmarks(landmarks);
      if (estimated) {
        comX = estimated.x;
        comY = estimated.y;
      }
    }

    frames.push({
      landmarks,
      comX,
      comY,
    });
  }

  return { frames, imgW, imgH };
}

function landmarkSide(index: number): Side {
  if (LEFT_IDS.has(index)) return "left";
  if (RIGHT_IDS.has(index)) return "right";
  return "center";
}

function isFocusedLandmark(index: number, focusMode: FocusMode): boolean {
  if (focusMode === "whole") return true;
  if (focusMode === "left") return LEFT_IDS.has(index);
  if (focusMode === "right") return RIGHT_IDS.has(index);
  if (focusMode === "shoulder") return SHOULDER_IDS.has(index);
  if (focusMode === "pelvis") return PELVIS_IDS.has(index);
  if (focusMode === "knee") return KNEE_IDS.has(index);
  return TRUNK_IDS.has(index);
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, "#1a2028");
  grad.addColorStop(1, "#2a3a4a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const cx = width / 2;
  const cy = height / 2;

  ctx.strokeStyle = "rgba(255,255,255,0.32)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, height);
  ctx.stroke();

  ctx.strokeStyle = "rgba(130, 220, 255, 0.28)";
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(width, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function connectionColor(a: number, b: number, focusMode: FocusMode): string {
  if (focusMode === "whole") return "rgba(255, 235, 90, 0.95)";

  const aFocused = isFocusedLandmark(a, focusMode);
  const bFocused = isFocusedLandmark(b, focusMode);
  if (!aFocused && !bFocused) return "rgba(165, 170, 180, 0.26)";
  return "rgba(255, 120, 120, 0.98)";
}

function landmarkColor(index: number, focusMode: FocusMode): string {
  if (focusMode === "whole") return "rgba(0, 220, 255, 0.98)";
  const focused = isFocusedLandmark(index, focusMode);
  if (!focused) return "rgba(165, 170, 180, 0.32)";
  return "rgba(255, 120, 120, 1)";
}

export default function SkeletonPlayer({ videoSrc, defaultFps = 30, caseId }: SkeletonPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevTsRef = useRef<number>(0);
  const frameFloatRef = useRef<number>(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  const [frames, setFrames] = useState<PoseFrame[]>([]);
  const [imgW, setImgW] = useState(1920);
  const [imgH, setImgH] = useState(1080);

  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [focusMode, setFocusMode] = useState<FocusMode>("whole");
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [loopStartFrame, setLoopStartFrame] = useState(0);
  const [loopEndFrame, setLoopEndFrame] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const totalFrames = frames.length;
  const aspectRatio = useMemo(() => {
    if (imgW <= 0 || imgH <= 0) return 16 / 9;
    return imgW / imgH;
  }, [imgW, imgH]);

  const poseCsvUrl = useMemo(() => {
    if (videoSrc.endsWith("skeleton_only.mp4")) return videoSrc.replace("skeleton_only.mp4", "pose_data.csv");
    if (videoSrc.endsWith("pose_output.mp4")) return videoSrc.replace("pose_output.mp4", "pose_data.csv");
    return videoSrc;
  }, [videoSrc]);

  const poseCsvCandidates = useMemo(() => {
    const urls = new Set<string>();
    urls.add(poseCsvUrl);

    if (poseCsvUrl.includes("localhost")) {
      urls.add(poseCsvUrl.replace("localhost", "127.0.0.1"));
    }
    if (poseCsvUrl.includes("127.0.0.1")) {
      urls.add(poseCsvUrl.replace("127.0.0.1", "localhost"));
    }

    if (typeof window !== "undefined" && poseCsvUrl.includes("/static/videos/")) {
      try {
        const parsed = new URL(poseCsvUrl);
        const isLocalApi = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
        const currentHost = window.location.hostname;
        const envApiBase = process.env.NEXT_PUBLIC_API_URL;
        if (envApiBase) {
          try {
            const envOrigin = new URL(envApiBase).origin;
            urls.add(`${envOrigin}${parsed.pathname}`);
          } catch {
            // no-op
          }
        }
        if (isLocalApi) {
          // 8100/8000 の両系統を候補にして環境差を吸収
          urls.add(`${window.location.protocol}//${currentHost}:8100${parsed.pathname}`);
          urls.add(`${window.location.protocol}//${currentHost}:8000${parsed.pathname}`);
          // 旧ポートが混在しても 8100 を優先候補に含める
          urls.add(`${parsed.protocol}//${parsed.hostname}:8100${parsed.pathname}`);
          urls.add(`${parsed.protocol}//${parsed.hostname}:8000${parsed.pathname}`);
        } else {
          urls.add(`${window.location.protocol}//${currentHost}:8100${parsed.pathname}`);
          urls.add(`${window.location.protocol}//${currentHost}:8000${parsed.pathname}`);
        }
      } catch {
        // no-op
      }
    }

    if (caseId) {
      const path = `/api/v1/results/${caseId}/pose-data`;
      if (typeof window !== "undefined") {
        const protocol = window.location.protocol;
        const host = window.location.hostname;
        urls.add(`${protocol}//${host}:8100${path}`);
        urls.add(`${protocol}//${host}:8000${path}`);
      }
      const envApiBase = process.env.NEXT_PUBLIC_API_URL;
      if (envApiBase) {
        try {
          const envOrigin = new URL(envApiBase).origin;
          urls.add(`${envOrigin}${path}`);
        } catch {
          // no-op
        }
      }
    }

    return Array.from(urls);
  }, [poseCsvUrl, caseId]);

  const normalizedLoopRange = useMemo(() => {
    if (totalFrames === 0) return { start: 0, end: 0, span: 1 };
    const start = Math.max(0, Math.min(totalFrames - 1, Math.min(loopStartFrame, loopEndFrame)));
    const end = Math.max(0, Math.min(totalFrames - 1, Math.max(loopStartFrame, loopEndFrame)));
    return { start, end, span: Math.max(1, end - start + 1) };
  }, [loopStartFrame, loopEndFrame, totalFrames]);

  const seekFrame = (frame: number) => {
    if (totalFrames === 0) return;
    const clamped = Math.max(0, Math.min(totalFrames - 1, frame));
    setCurrentFrame(clamped);
    frameFloatRef.current = clamped;
  };

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setFrames([]);
    setCurrentFrame(0);
    frameFloatRef.current = 0;

    const load = async () => {
      try {
        let text: string | null = null;
        let lastErr: string | null = null;

        for (const url of poseCsvCandidates) {
          try {
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) {
              lastErr = `pose_data fetch failed: ${res.status} (${url})`;
              continue;
            }
            text = await res.text();
            break;
          } catch (e) {
            lastErr = `${String(e)} (${url})`;
          }
        }
        if (!text) throw new Error(lastErr || "pose_data fetch failed");
        if (cancelled) return;

        const parsed = parsePoseCsv(text);
        setFrames(parsed.frames);
        setImgW(parsed.imgW);
        setImgH(parsed.imgH);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setLoadError("pose_data.csv の読み込みに失敗しました（URL到達不可）");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [poseCsvCandidates]);

  useEffect(() => {
    if (totalFrames === 0) return;
    setLoopStartFrame(0);
    setLoopEndFrame(totalFrames - 1);
  }, [totalFrames]);

  useEffect(() => {
    if (totalFrames === 0) return;
    if (currentFrame < normalizedLoopRange.start || currentFrame > normalizedLoopRange.end) {
      seekFrame(normalizedLoopRange.start);
    }
  }, [currentFrame, totalFrames, normalizedLoopRange.start, normalizedLoopRange.end]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    drawBackground(ctx, width, height);

    if (totalFrames === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(loadError ?? "読み込み中...", width / 2, height / 2);
      return;
    }

    const toCanvasPoint = (x: number, y: number) => {
      const tx = ((x - 0.5) * zoom + 0.5 + panX) * width;
      const ty = ((y - 0.5) * zoom + 0.5 + panY) * height;
      return { x: tx, y: ty };
    };

    const getPoint = (frame: PoseFrame, index: number) => {
      const lm = frame.landmarks[index];
      if (!lm || lm.x == null || lm.y == null) return null;
      if ((lm.vis ?? 1) < 0.2) return null;
      return toCanvasPoint(lm.x, lm.y);
    };

    const getComPoint = (frame: PoseFrame) => {
      if (frame.comX == null || frame.comY == null) return null;
      return toCanvasPoint(frame.comX, frame.comY);
    };

    const drawFocusGuide = (frame: PoseFrame) => {
      const drawLevelGuide = (leftIdx: number, rightIdx: number, color: string) => {
        const left = getPoint(frame, leftIdx);
        const right = getPoint(frame, rightIdx);
        if (!left || !right) return;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.stroke();

        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, left.y);
        ctx.lineTo(width, left.y);
        ctx.moveTo(0, right.y);
        ctx.lineTo(width, right.y);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      if (focusMode === "shoulder") drawLevelGuide(11, 12, "rgba(255, 120, 120, 0.98)");
      if (focusMode === "pelvis") drawLevelGuide(23, 24, "rgba(255, 120, 120, 0.98)");

      if (focusMode === "knee") {
        const drawLegAxis = (hipIdx: number, kneeIdx: number, ankleIdx: number, color: string) => {
          const hip = getPoint(frame, hipIdx);
          const knee = getPoint(frame, kneeIdx);
          const ankle = getPoint(frame, ankleIdx);
          if (!hip || !knee || !ankle) return;

          // 膝の内外判定で一般的に見る下肢アライメント（股関節-膝-足関節）
          ctx.strokeStyle = "rgba(255,255,255,0.26)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(hip.x, hip.y);
          ctx.lineTo(ankle.x, ankle.y);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(hip.x, hip.y);
          ctx.lineTo(knee.x, knee.y);
          ctx.lineTo(ankle.x, ankle.y);
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(knee.x, knee.y, 4, 0, Math.PI * 2);
          ctx.fill();
        };

        drawLegAxis(23, 25, 27, "rgba(255, 120, 120, 0.98)");
        drawLegAxis(24, 26, 28, "rgba(255, 120, 120, 0.98)");
      }

      if (focusMode === "trunk") {
        const sL = getPoint(frame, 11);
        const sR = getPoint(frame, 12);
        const hL = getPoint(frame, 23);
        const hR = getPoint(frame, 24);
        if (!sL || !sR || !hL || !hR) return;

        const shoulderCenter = { x: (sL.x + sR.x) / 2, y: (sL.y + sR.y) / 2 };
        const hipCenter = { x: (hL.x + hR.x) / 2, y: (hL.y + hR.y) / 2 };

        ctx.strokeStyle = "rgba(255, 120, 120, 0.98)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(shoulderCenter.x, shoulderCenter.y);
        ctx.lineTo(hipCenter.x, hipCenter.y);
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 120, 120, 0.98)";
        ctx.beginPath();
        ctx.arc(shoulderCenter.x, shoulderCenter.y, 3, 0, Math.PI * 2);
        ctx.arc(hipCenter.x, hipCenter.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const frame = frames[currentFrame];
    const comTrailStart = Math.max(0, currentFrame - 45);
    const comTrail: Array<{ x: number; y: number }> = [];
    for (let i = comTrailStart; i <= currentFrame; i += 1) {
      const p = getComPoint(frames[i]);
      if (p) comTrail.push(p);
    }
    if (!frame) return;

    drawFocusGuide(frame);

    for (const [a, b] of CONNECTIONS) {
      const la = frame.landmarks[a];
      const lb = frame.landmarks[b];
      if (!la || !lb || la.x == null || la.y == null || lb.x == null || lb.y == null) continue;
      if ((la.vis ?? 1) < 0.2 || (lb.vis ?? 1) < 0.2) continue;

      const p1 = toCanvasPoint(la.x, la.y);
      const p2 = toCanvasPoint(lb.x, lb.y);
      ctx.strokeStyle = connectionColor(a, b, focusMode);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    frame.landmarks.forEach((lm, idx) => {
      if (!lm || lm.x == null || lm.y == null) return;
      if ((lm.vis ?? 1) < 0.2) return;

      const p = toCanvasPoint(lm.x, lm.y);
      ctx.fillStyle = landmarkColor(idx, focusMode);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });

    const comNow = getComPoint(frame);
    if (comNow) {
      ctx.fillStyle = "rgba(255, 90, 90, 1)";
      ctx.beginPath();
      ctx.arc(comNow.x, comNow.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(comNow.x, comNow.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [frames, totalFrames, currentFrame, focusMode, loadError, zoom, panX, panY]);

  useEffect(() => {
    if (!isPlaying || totalFrames === 0) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const step = (ts: number) => {
      if (prevTsRef.current === 0) prevTsRef.current = ts;
      const dt = ts - prevTsRef.current;
      prevTsRef.current = ts;

      const framesToAdvance = (dt / 1000) * defaultFps * playbackRate;
      const { start, span } = normalizedLoopRange;

      if (frameFloatRef.current < start || frameFloatRef.current > start + span) {
        frameFloatRef.current = start;
      }

      frameFloatRef.current += framesToAdvance;
      const wrapped = ((frameFloatRef.current - start) % span + span) % span;
      frameFloatRef.current = start + wrapped;

      const nextFrame = Math.floor(frameFloatRef.current);
      setCurrentFrame(nextFrame);

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      prevTsRef.current = 0;
    };
  }, [isPlaying, defaultFps, playbackRate, totalFrames, normalizedLoopRange]);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: panX,
      startPanY: panY,
    };
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    setPanX(drag.startPanX + dx / Math.max(1, zoom));
    setPanY(drag.startPanY + dy / Math.max(1, zoom));
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  };

  const resetView = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

  const updateZoom = (delta: number) => {
    setZoom((prev) => Math.max(1, Math.min(3, Number((prev + delta).toFixed(1)))));
  };

  return (
    <section className="-mx-4 bg-black shadow-lg overflow-hidden">
      <div className="w-full bg-black" style={{ aspectRatio }}>
        <canvas
          ref={canvasRef}
          width={960}
          height={Math.round(960 / aspectRatio)}
          className="w-full h-full object-contain cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      <div className="bg-slate-900 text-slate-100 px-3 py-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <p className="font-semibold tracking-wide">骨格モーション</p>
          <p className="text-slate-300">frame {currentFrame + 1} / {Math.max(1, totalFrames)}</p>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {FOCUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFocusMode(tab.key)}
              className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap border transition ${
                focusMode === tab.key
                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-200"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={Math.min(currentFrame, Math.max(0, totalFrames - 1))}
          onChange={(e) => seekFrame(Number(e.target.value))}
          className="w-full accent-cyan-400"
          disabled={totalFrames === 0}
        />

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => seekFrame(currentFrame - 1)}
            className="py-2 rounded-md bg-slate-700 text-xs font-medium hover:bg-slate-600 disabled:opacity-40"
            disabled={totalFrames === 0}
          >
            戻る
          </button>
          <button
            type="button"
            onClick={() => setIsPlaying((v) => !v)}
            className="py-2 rounded-md bg-cyan-600 text-xs font-bold hover:bg-cyan-500 disabled:opacity-40"
            disabled={totalFrames === 0}
          >
            {isPlaying ? "一時停止" : "再生"}
          </button>
          <button
            type="button"
            onClick={() => seekFrame(currentFrame + 1)}
            className="py-2 rounded-md bg-slate-700 text-xs font-medium hover:bg-slate-600 disabled:opacity-40"
            disabled={totalFrames === 0}
          >
            進む
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">速度</span>
            <select
              value={playbackRate}
              onChange={(e) => setPlaybackRate(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
            >
              <option value={0.25}>0.25x</option>
              <option value={0.5}>0.5x</option>
              <option value={0.75}>0.75x</option>
              <option value={1}>1.0x</option>
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-slate-400">ズーム {zoom.toFixed(1)}x</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateZoom(-0.1)}
                className="py-1 rounded-md bg-slate-700 text-xs font-semibold hover:bg-slate-600"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => updateZoom(0.1)}
                className="py-1 rounded-md bg-slate-700 text-xs font-semibold hover:bg-slate-600"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2 text-xs border-t border-slate-800 pt-2">
          <p className="text-slate-400">ループ範囲（常時有効）</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-slate-300">開始: {normalizedLoopRange.start + 1}</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, totalFrames - 1)}
                value={Math.min(loopStartFrame, Math.max(0, totalFrames - 1))}
                onChange={(e) => setLoopStartFrame(Number(e.target.value))}
                className="w-full accent-cyan-400"
                disabled={totalFrames === 0}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-300">終了: {normalizedLoopRange.end + 1}</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, totalFrames - 1)}
                value={Math.min(loopEndFrame, Math.max(0, totalFrames - 1))}
                onChange={(e) => setLoopEndFrame(Number(e.target.value))}
                className="w-full accent-cyan-400"
                disabled={totalFrames === 0}
              />
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={resetView}
            className="py-1.5 px-3 rounded-md bg-slate-700 text-xs font-medium hover:bg-slate-600"
          >
            表示リセット
          </button>
        </div>
      </div>
    </section>
  );
}




