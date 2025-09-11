// Small shared helpers used by both pages to build export payloads
export function captureThumbnail(videoRef) {
  try {
    if (!videoRef || !videoRef.videoWidth) return null;
    const w = videoRef.videoWidth || 640;
    const h = videoRef.videoHeight || 360;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(videoRef, 0, 0, w, h);
    return c.toDataURL('image/png');
  } catch (e) {
    console.warn('Thumbnail capture failed', e); return null;
  }
}

export function timelineToPNG(deceptionTimeline) {
  try {
    const data = deceptionTimeline || [];
    const w = 800; const h = 160; const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(0, h - 20); ctx.lineTo(w, h - 20); ctx.stroke();
    if (data.length > 0) {
      const vals = data.map(d => (typeof d.score === 'number' ? d.score : 0));
      const max = Math.max(...vals, 1);
      ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2; ctx.beginPath();
      data.forEach((d, i) => {
        const x = (i / Math.max(1, data.length - 1)) * (w - 20) + 10;
        const y = ((1 - (d.score / max)) * (h - 40)) + 10;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    return c.toDataURL('image/png');
  } catch (e) { console.warn('Timeline PNG generation failed', e); return null; }
}

export function computeTopMoments(deceptionTimeline, transcriptHistory, n = 5, dedupeSeconds = 3) {
  try {
    const data = deceptionTimeline || [];
    if (!data.length) return [];
    const sorted = [...data].sort((a, b) => (a.score || 0) - (b.score || 0));
    const results = [];
    const dedupeMs = Math.max(0, dedupeSeconds) * 1000;
    let lastIncludedMs = -Infinity;

    for (const d of sorted) {
      const momentMs = (typeof d.time === 'string') ? Date.parse(d.time) : d.time;
      if (momentMs == null) continue;
      const score = d.score || 0;
      const label = score < 0.25 ? 'High' : (score < 0.5 ? 'Medium' : 'Low');
      if (label === 'Low') continue;
      if (momentMs - lastIncludedMs <= dedupeMs) continue;

      let snippet = '';
      if (transcriptHistory && transcriptHistory.length) {
        let best = null; let bestDiff = Infinity;
        for (const seg of transcriptHistory) {
          const s = (typeof seg.start === 'number') ? seg.start : (seg.start ? Number(seg.start) : null);
          if (s == null) continue;
          const diff = Math.abs(s - momentMs);
          if (diff < bestDiff) { bestDiff = diff; best = seg; }
        }
        if (best) snippet = best.text || '';
      }

      const dObj = new Date(momentMs);
      const hh = String(dObj.getHours()).padStart(2, '0');
      const mm = String(dObj.getMinutes()).padStart(2, '0');
      const ss = String(dObj.getSeconds()).padStart(2, '0');
      const start = `${hh}:${mm}:${ss}`;

      results.push({ start, text: snippet, risk: `${score.toFixed(2)} (${label})`, time_ms: momentMs });
      lastIncludedMs = momentMs;
      if (results.length >= n) break;
    }

    return results;
  } catch (e) { return []; }
}

export async function captureSnippetAtMs(videoRef, momentMs, deceptionTimeline) {
  try {
    if (!videoRef || !videoRef.videoWidth) return null;
    const v = videoRef;
    const sessionStartMs = (deceptionTimeline && deceptionTimeline.length) ? deceptionTimeline[0].time : null;
    let targetSec = null;
    if (sessionStartMs != null && typeof momentMs === 'number') {
      targetSec = (momentMs - sessionStartMs) / 1000.0;
    }
    const originalTime = v.currentTime;
    if (targetSec != null && typeof v.duration === 'number' && targetSec >= 0 && targetSec <= v.duration) {
      await new Promise((resolve) => {
        const onSeek = () => { v.removeEventListener('seeked', onSeek); resolve(); };
        v.addEventListener('seeked', onSeek);
        v.currentTime = Math.min(targetSec, Math.max(0, v.duration));
        setTimeout(() => { try { v.removeEventListener('seeked', onSeek); } catch(e){}; resolve(); }, 800);
      });
    }
    const w = 320;
    const h = Math.round((v.videoHeight / v.videoWidth) * w) || 180;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d');
    ctx.drawImage(v, 0, 0, w, h);
    const dataUrl = c.toDataURL('image/png');
    if (targetSec != null && typeof originalTime === 'number') {
      try { v.currentTime = originalTime; } catch (e) { }
    }
    return dataUrl;
  } catch (e) { console.warn('Failed to capture snippet', e); return null; }
}

export function computeAvgFusion(deceptionTimeline, fusionScore) {
  const arr = deceptionTimeline || [];
  if (!arr.length) return (fusionScore !== null && fusionScore !== undefined) ? fusionScore : null;
  const vals = arr.map(d => (typeof d.score === 'number' ? d.score : null)).filter(v => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
