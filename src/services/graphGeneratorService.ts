/**
 * Graph & Diagram Generator Service
 * Vũ khí sinh đồ thị Toán học & Hóa học trực tiếp bằng SVG chất lượng cao
 * Dành cho Hệ Thống Thầy Thọ (Toán - Hóa)
 */

export interface GraphOptions {
  type: 'parabola' | 'cubic' | 'rational' | 'linear' | 'kinetics' | 'titration';
  title?: string;
  width?: number;
  height?: number;
  params: Record<string, number>;
  showGrid?: boolean;
}

export function generateSvgGraph(options: GraphOptions): string {
  const w = options.width || 480;
  const h = options.height || 360;
  const pad = 42;
  const pw = w - 2 * pad;
  const ph = h - 2 * pad;

  let xmin = -4;
  let xmax = 4;
  let ymin = -4;
  let ymax = 4;
  let xLabel = 'x';
  let yLabel = 'y';

  if (options.type === 'kinetics') {
    xmin = 0;
    xmax = 10;
    ymin = 0;
    ymax = 1.2;
    xLabel = 'Thời gian t (s)';
    yLabel = 'Nồng độ C (mol/L)';
  } else if (options.type === 'titration') {
    xmin = 0;
    xmax = 50;
    ymin = 0;
    ymax = 14;
    xLabel = 'V (mL dung dịch NaOH)';
    yLabel = 'pH';
  } else if (options.type === 'parabola') {
    const a = options.params.a ?? 1;
    const b = options.params.b ?? 0;
    const c = options.params.c ?? 0;
    const vx = -b / (2 * a);
    xmin = Math.min(-4, Math.floor(vx - 3));
    xmax = Math.max(4, Math.ceil(vx + 3));
    const vy = a * vx * vx + b * vx + c;
    ymin = Math.min(-4, Math.floor(vy - 2));
    ymax = Math.max(5, Math.ceil(vy + 6));
  } else if (options.type === 'rational') {
    xmin = -6;
    xmax = 6;
    ymin = -6;
    ymax = 6;
  }

  const toSx = (x: number) => pad + ((x - xmin) / (xmax - xmin)) * pw;
  const toSy = (y: number) => pad + ((ymax - y) / (ymax - ymin)) * ph;

  const ox = toSx(0);
  const oy = toSy(0);

  // 1. Grid
  let gridSvg = '';
  if (options.showGrid !== false) {
    const xStep = (xmax - xmin) <= 10 ? 1 : 2;
    for (let x = Math.ceil(xmin); x <= Math.floor(xmax); x += xStep) {
      if (x === 0 && ox >= pad && ox <= w - pad) continue;
      const sx = toSx(x);
      gridSvg += `<line x1="${sx}" y1="${pad}" x2="${sx}" y2="${h - pad}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2,2"/>`;
    }
    const yStep = (ymax - ymin) <= 10 ? 1 : 2;
    for (let y = Math.ceil(ymin); y <= Math.floor(ymax); y += yStep) {
      if (y === 0 && oy >= pad && oy <= h - pad) continue;
      const sy = toSy(y);
      gridSvg += `<line x1="${pad}" y1="${sy}" x2="${w - pad}" y2="${sy}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2,2"/>`;
    }
  }

  // 2. Axes
  let axesSvg = '';
  // Ox
  if (oy >= pad && oy <= h - pad) {
    axesSvg += `<line x1="${pad - 10}" y1="${oy}" x2="${w - pad + 15}" y2="${oy}" stroke="#1e293b" stroke-width="1.8"/>`;
    axesSvg += `<polygon points="${w - pad + 15},${oy} ${w - pad + 7},${oy - 4} ${w - pad + 7},${oy + 4}" fill="#1e293b"/>`;
    axesSvg += `<text x="${w - pad + 16}" y="${oy + 4}" font-size="13" font-family="Times New Roman, serif" font-style="italic" font-weight="bold" fill="#1e293b">${xLabel}</text>`;
  }
  // Oy
  if (ox >= pad && ox <= w - pad) {
    axesSvg += `<line x1="${ox}" y1="${h - pad + 10}" x2="${ox}" y2="${pad - 15}" stroke="#1e293b" stroke-width="1.8"/>`;
    axesSvg += `<polygon points="${ox},${pad - 15} ${ox - 4},${pad - 7} ${ox + 4},${pad - 7}" fill="#1e293b"/>`;
    axesSvg += `<text x="${ox - 4}" y="${pad - 18}" font-size="13" font-family="Times New Roman, serif" font-style="italic" font-weight="bold" fill="#1e293b" text-anchor="end">${yLabel}</text>`;
  }

  // Origin O
  if (ox >= pad && ox <= w - pad && oy >= pad && oy <= h - pad) {
    axesSvg += `<text x="${ox - 6}" y="${oy + 14}" font-size="12" font-family="Times New Roman, serif" font-style="italic" fill="#475569" text-anchor="end">O</text>`;
  }

  // Tick labels
  let ticksSvg = '';
  const xStep = (xmax - xmin) <= 10 ? 1 : 2;
  for (let x = Math.ceil(xmin); x <= Math.floor(xmax); x += xStep) {
    if (x === 0) continue;
    const sx = toSx(x);
    if (sx < pad || sx > w - pad) continue;
    ticksSvg += `<line x1="${sx}" y1="${oy - 3}" x2="${sx}" y2="${oy + 3}" stroke="#1e293b" stroke-width="1.2"/>`;
    ticksSvg += `<text x="${sx}" y="${oy + 14}" font-size="10" font-family="sans-serif" fill="#475569" text-anchor="middle">${x}</text>`;
  }

  const yStep = (ymax - ymin) <= 10 ? 1 : (ymax - ymin) <= 20 ? 2 : 5;
  for (let y = Math.ceil(ymin); y <= Math.floor(ymax); y += yStep) {
    if (y === 0) continue;
    const sy = toSy(y);
    if (sy < pad || sy > h - pad) continue;
    ticksSvg += `<line x1="${ox - 3}" y1="${sy}" x2="${ox + 3}" y2="${sy}" stroke="#1e293b" stroke-width="1.2"/>`;
    ticksSvg += `<text x="${ox - 6}" y="${sy + 3}" font-size="10" font-family="sans-serif" fill="#475569" text-anchor="end">${y}</text>`;
  }

  // 3. Curves
  let curvesSvg = '';
  const steps = 180;

  if (options.type === 'parabola') {
    const a = options.params.a ?? 1;
    const b = options.params.b ?? -2;
    const c = options.params.c ?? -1;

    const points: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const x = xmin + (i * (xmax - xmin)) / steps;
      const y = a * x * x + b * x + c;
      if (y >= ymin - 1 && y <= ymax + 1) {
        points.push([toSx(x), toSy(y)]);
      }
    }
    if (points.length > 1) {
      const d = points.map(([px, py], idx) => `${idx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
      curvesSvg += `<path d="${d}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round"/>`;
    }

    // Vertex point
    const vx = -b / (2 * a);
    const vy = a * vx * vx + b * vx + c;
    if (vx >= xmin && vx <= xmax && vy >= ymin && vy <= ymax) {
      const svx = toSx(vx);
      const svy = toSy(vy);
      curvesSvg += `<circle cx="${svx}" cy="${svy}" r="3.5" fill="#dc2626"/>`;
      curvesSvg += `<line x1="${svx}" y1="${svy}" x2="${svx}" y2="${oy}" stroke="#dc2626" stroke-dasharray="3,3" stroke-width="1"/>`;
      curvesSvg += `<line x1="${svx}" y1="${svy}" x2="${ox}" y2="${svy}" stroke="#dc2626" stroke-dasharray="3,3" stroke-width="1"/>`;
      curvesSvg += `<text x="${svx + 6}" y="${svy - 6}" font-size="11" font-weight="bold" fill="#dc2626">I(${vx.toFixed(1)}; ${vy.toFixed(1)})</text>`;
    }
  } else if (options.type === 'cubic') {
    const a = options.params.a ?? 1;
    const b = options.params.b ?? 0;
    const c = options.params.c ?? -3;
    const dParam = options.params.d ?? 1;

    const points: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const x = xmin + (i * (xmax - xmin)) / steps;
      const y = a * x * x * x + b * x * x + c * x + dParam;
      if (y >= ymin - 1 && y <= ymax + 1) {
        points.push([toSx(x), toSy(y)]);
      }
    }
    if (points.length > 1) {
      const d = points.map(([px, py], idx) => `${idx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
      curvesSvg += `<path d="${d}" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round"/>`;
    }
  } else if (options.type === 'rational') {
    const a = options.params.a ?? 1;
    const b = options.params.b ?? 1;
    const cVal = options.params.c ?? 1;
    const dVal = options.params.d ?? -1;

    const vAsymptote = -dVal / cVal;
    const hAsymptote = a / cVal;

    if (vAsymptote >= xmin && vAsymptote <= xmax) {
      const sx = toSx(vAsymptote);
      curvesSvg += `<line x1="${sx}" y1="${pad}" x2="${sx}" y2="${h - pad}" stroke="#dc2626" stroke-width="1.4" stroke-dasharray="4,4"/>`;
      curvesSvg += `<text x="${sx + 4}" y="${pad + 12}" font-size="10" fill="#dc2626" font-weight="bold">x=${vAsymptote.toFixed(1)}</text>`;
    }
    if (hAsymptote >= ymin && hAsymptote <= ymax) {
      const sy = toSy(hAsymptote);
      curvesSvg += `<line x1="${pad}" y1="${sy}" x2="${w - pad}" y2="${sy}" stroke="#dc2626" stroke-width="1.4" stroke-dasharray="4,4"/>`;
      curvesSvg += `<text x="${w - pad - 4}" y="${sy - 4}" font-size="10" fill="#dc2626" font-weight="bold" text-anchor="end">y=${hAsymptote.toFixed(1)}</text>`;
    }

    const b1: [number, number][] = [];
    for (let i = 0; i <= steps / 2; i++) {
      const x = xmin + (i * (vAsymptote - 0.08 - xmin)) / (steps / 2);
      const y = (a * x + b) / (cVal * x + dVal);
      if (y >= ymin - 1 && y <= ymax + 1) b1.push([toSx(x), toSy(y)]);
    }
    if (b1.length > 1) {
      const d = b1.map(([px, py], idx) => `${idx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
      curvesSvg += `<path d="${d}" fill="none" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round"/>`;
    }

    const b2: [number, number][] = [];
    for (let i = 0; i <= steps / 2; i++) {
      const x = (vAsymptote + 0.08) + (i * (xmax - (vAsymptote + 0.08))) / (steps / 2);
      const y = (a * x + b) / (cVal * x + dVal);
      if (y >= ymin - 1 && y <= ymax + 1) b2.push([toSx(x), toSy(y)]);
    }
    if (b2.length > 1) {
      const d = b2.map(([px, py], idx) => `${idx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
      curvesSvg += `<path d="${d}" fill="none" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round"/>`;
    }
  } else if (options.type === 'kinetics') {
    const c0 = options.params.c0 ?? 1.0;
    const k = options.params.k ?? 0.35;

    const reactantPoints: [number, number][] = [];
    const productPoints: [number, number][] = [];

    for (let i = 0; i <= steps; i++) {
      const t = (i * xmax) / steps;
      const cA = c0 * Math.exp(-k * t);
      const cP = c0 * (1 - Math.exp(-k * t));
      reactantPoints.push([toSx(t), toSy(cA)]);
      productPoints.push([toSx(t), toSy(cP)]);
    }

    const dReactant = reactantPoints.map(([px, py], idx) => `${idx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
    const dProduct = productPoints.map(([px, py], idx) => `${idx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');

    curvesSvg += `<path d="${dReactant}" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round"/>`;
    curvesSvg += `<text x="${toSx(xmax * 0.4)}" y="${toSy(c0 * Math.exp(-k * xmax * 0.4)) - 8}" font-size="11" font-weight="bold" fill="#dc2626">Chất phản ứng [A]</text>`;

    curvesSvg += `<path d="${dProduct}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round"/>`;
    curvesSvg += `<text x="${toSx(xmax * 0.5)}" y="${toSy(c0 * (1 - Math.exp(-k * xmax * 0.5))) - 8}" font-size="11" font-weight="bold" fill="#2563eb">Sản phẩm [B]</text>`;
  } else if (options.type === 'titration') {
    const eqV = options.params.eqV ?? 25;

    const points: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const V = (i * xmax) / steps;
      const delta = V - eqV;
      const pH = 7 + 6 * Math.tanh(delta / 4);
      points.push([toSx(V), toSy(pH)]);
    }

    const dCurve = points.map(([px, py], idx) => `${idx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
    curvesSvg += `<path d="${dCurve}" fill="none" stroke="#059669" stroke-width="2.8" stroke-linecap="round"/>`;

    const eqSx = toSx(eqV);
    const eqSy = toSy(7);
    curvesSvg += `<circle cx="${eqSx}" cy="${eqSy}" r="4" fill="#d97706"/>`;
    curvesSvg += `<line x1="${eqSx}" y1="${eqSy}" x2="${eqSx}" y2="${oy}" stroke="#d97706" stroke-dasharray="3,3" stroke-width="1.2"/>`;
    curvesSvg += `<line x1="${eqSx}" y1="${eqSy}" x2="${ox}" y2="${eqSy}" stroke="#d97706" stroke-dasharray="3,3" stroke-width="1.2"/>`;
    curvesSvg += `<text x="${eqSx + 8}" y="${eqSy + 4}" font-size="11" font-weight="bold" fill="#d97706">Điểm tương đương (pH=7)</text>`;
  }

  let titleSvg = '';
  if (options.title) {
    titleSvg = `<text x="${w / 2}" y="24" font-size="13" font-family="sans-serif" font-weight="bold" fill="#1e293b" text-anchor="middle">${options.title}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="auto" style="max-width:${w}px;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;display:block;margin:0 auto;box-shadow:0 1px 3px rgba(0,0,0,0.06);">${titleSvg}${gridSvg}${axesSvg}${ticksSvg}${curvesSvg}</svg>`;
}

export function generateSvgDataUri(options: GraphOptions): string {
  const svg = generateSvgGraph(options);
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
