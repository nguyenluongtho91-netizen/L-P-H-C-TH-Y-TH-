// src/services/whiteboardShapesService.ts
/**
 * Thư viện Hình vẽ Toán học & Hóa học Chuyên Dụng
 * Dành cho Bảng vẽ Kỹ thuật số Lớp Học Thầy Thọ
 */

export interface PresetShape {
  id: string;
  name: string;
  category: 'math_2d' | 'math_3d' | 'math_graph' | 'chem_glassware' | 'chem_experiment' | 'chem_electro' | 'chem_organic';
  categoryLabel: string;
  iconName: string;
  width: number;
  height: number;
  renderToCanvas: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, strokeColor: string, isDark: boolean) => void;
  svgPreview: string; // SVG mini để preview trong kho hình
}

// Helper: Vẽ mũi tên
function drawArrow(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, headLength = 10) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const angle = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
}

// ==========================================
// DANH SÁCH TẤT CẢ CÁC HÌNH VẼ MẪU
// ==========================================
export const PRESET_SHAPES: PresetShape[] = [
  // ------------------------------------------
  // 1. TOÁN HỌC: HÌNH HỌC PHẲNG (MATH 2D)
  // ------------------------------------------
  {
    id: 'tam_giac_vuong',
    name: 'Tam giác vuông ABC',
    category: 'math_2d',
    categoryLabel: 'Hình phẳng',
    iconName: 'Triangle',
    width: 240,
    height: 180,
    svgPreview: `<svg viewBox="0 0 100 80" fill="none" stroke="currentColor" stroke-width="2"><polygon points="20,70 80,70 20,20"/><rect x="20" y="60" width="10" height="10" stroke-width="1.5"/><text x="12" y="75" font-size="10">A</text><text x="84" y="75" font-size="10">B</text><text x="12" y="16" font-size="10">C</text></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillStyle = color;
      ctx.font = 'bold 15px sans-serif';

      const A = { x: x + 30, y: y + h - 30 };
      const B = { x: x + w - 30, y: y + h - 30 };
      const C = { x: x + 30, y: y + 30 };

      // Tam giác
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.lineTo(C.x, C.y);
      ctx.closePath();
      ctx.stroke();

      // Ký hiệu góc vuông tại A
      const sq = 14;
      ctx.beginPath();
      ctx.moveTo(A.x + sq, A.y);
      ctx.lineTo(A.x + sq, A.y - sq);
      ctx.lineTo(A.x, A.y - sq);
      ctx.stroke();

      // Nhãn
      ctx.fillText('A', A.x - 20, A.y + 15);
      ctx.fillText('B', B.x + 10, B.y + 15);
      ctx.fillText('C', C.x - 20, C.y - 10);
      ctx.restore();
    }
  },
  {
    id: 'tam_giac_deu',
    name: 'Tam giác đều ABC',
    category: 'math_2d',
    categoryLabel: 'Hình phẳng',
    iconName: 'Triangle',
    width: 220,
    height: 200,
    svgPreview: `<svg viewBox="0 0 100 90" fill="none" stroke="currentColor" stroke-width="2"><polygon points="50,15 15,80 85,80"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillStyle = color;
      ctx.font = 'bold 15px sans-serif';

      const A = { x: x + w / 2, y: y + 25 };
      const B = { x: x + 25, y: y + h - 25 };
      const C = { x: x + w - 25, y: y + h - 25 };

      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.lineTo(C.x, C.y);
      ctx.closePath();
      ctx.stroke();

      // 3 vạch bằng nhau
      const tick = (p1: any, p2: any) => {
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        const nx = -dy / len * 6;
        const ny = dx / len * 6;
        ctx.beginPath();
        ctx.moveTo(mx - nx, my - ny);
        ctx.lineTo(mx + nx, my + ny);
        ctx.stroke();
      };
      tick(A, B);
      tick(B, C);
      tick(C, A);

      ctx.fillText('A', A.x - 6, A.y - 10);
      ctx.fillText('B', B.x - 20, B.y + 15);
      ctx.fillText('C', C.x + 10, C.y + 15);
      ctx.restore();
    }
  },
  {
    id: 'hinh_binh_hanh',
    name: 'Hình bình hành ABCD',
    category: 'math_2d',
    categoryLabel: 'Hình phẳng',
    iconName: 'Square',
    width: 260,
    height: 160,
    svgPreview: `<svg viewBox="0 0 100 60" fill="none" stroke="currentColor" stroke-width="2"><polygon points="30,15 90,15 70,50 10,50"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillStyle = color;
      ctx.font = 'bold 15px sans-serif';

      const offset = 50;
      const A = { x: x + 20 + offset, y: y + 25 };
      const B = { x: x + w - 20, y: y + 25 };
      const C = { x: x + w - 20 - offset, y: y + h - 25 };
      const D = { x: x + 20, y: y + h - 25 };

      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.lineTo(C.x, C.y);
      ctx.lineTo(D.x, D.y);
      ctx.closePath();
      ctx.stroke();

      ctx.fillText('A', A.x - 15, A.y - 8);
      ctx.fillText('B', B.x + 8,  B.y - 8);
      ctx.fillText('C', C.x + 8,  C.y + 18);
      ctx.fillText('D', D.x - 15, D.y + 18);
      ctx.restore();
    }
  },
  {
    id: 'duong_tron_tam_o',
    name: 'Đường tròn tâm O, bán kính R',
    category: 'math_2d',
    categoryLabel: 'Hình phẳng',
    iconName: 'Circle',
    width: 220,
    height: 220,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2"><circle cx="50" cy="50" r="38"/><circle cx="50" cy="50" r="3" fill="currentColor"/><line x1="50" y1="50" x2="88" y2="50"/><text x="44" y="44" font-size="10">O</text><text x="65" y="45" font-size="9">R</text></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillStyle = color;
      ctx.font = 'bold 15px sans-serif';

      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2 - 25;

      // Vòng tròn
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.stroke();

      // Tâm O
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
      ctx.fill();

      // Bán kính R
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();

      ctx.fillText('O', cx - 18, cy - 8);
      ctx.fillText('R', cx + r / 2 - 5, cy - 8);
      ctx.fillText('M', cx + r + 6, cy + 5);
      ctx.restore();
    }
  },
  {
    id: 'duong_tron_luong_giac',
    name: 'Vòng tròn lượng giác chuẩn',
    category: 'math_2d',
    categoryLabel: 'Hình phẳng',
    iconName: 'Compass',
    width: 280,
    height: 280,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="50" cy="50" r="36"/><line x1="10" y1="50" x2="90" y2="50"/><line x1="50" y1="10" x2="50" y2="90"/><text x="88" y="48" font-size="8">cos</text><text x="52" y="14" font-size="8">sin</text></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillStyle = color;
      ctx.font = 'bold 13px sans-serif';

      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2 - 35;

      // Trục cos (hoành)
      drawArrow(ctx, cx - r - 25, cy, cx + r + 25, cy);
      ctx.fillText('cos x', cx + r + 15, cy - 8);

      // Trục sin (tung)
      drawArrow(ctx, cx, cy + r + 25, cx, cy - r - 25);
      ctx.fillText('sin x', cx + 8, cy - r - 15);

      // Đường tròn
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.stroke();

      // Tâm O, 1, -1
      ctx.fillText('O', cx - 14, cy + 16);
      ctx.fillText('1', cx + r - 3, cy + 18);
      ctx.fillText('-1', cx - r - 15, cy + 18);
      ctx.fillText('1', cx + 8, cy - r + 8);
      ctx.fillText('-1', cx + 8, cy + r + 4);

      // Các tia góc đặc biệt 30, 45, 60
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      const angles = [
        { deg: 30, label: 'π/6' },
        { deg: 45, label: 'π/4' },
        { deg: 60, label: 'π/3' },
        { deg: 90, label: 'π/2' },
        { deg: 180, label: 'π' },
      ];
      angles.forEach(a => {
        const rad = (a.deg * Math.PI) / 180;
        const px = cx + r * Math.cos(rad);
        const py = cy - r * Math.sin(rad);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.stroke();

        ctx.save();
        ctx.fillStyle = '#dc2626';
        ctx.font = '11px sans-serif';
        const lx = cx + (r + 15) * Math.cos(rad);
        const ly = cy - (r + 15) * Math.sin(rad);
        ctx.fillText(a.label, lx - 10, ly + 4);
        ctx.restore();
      });

      ctx.restore();
    }
  },
  {
    id: 'he_truc_oxy',
    name: 'Hệ trục tọa độ Oxy chia vạch',
    category: 'math_2d',
    categoryLabel: 'Hình phẳng',
    iconName: 'Grid',
    width: 260,
    height: 240,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="50" x2="90" y2="50"/><line x1="50" y1="90" x2="50" y2="10"/><text x="88" y="46" font-size="10">x</text><text x="54" y="16" font-size="10">y</text><text x="42" y="62" font-size="9">O</text></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillStyle = color;
      ctx.font = 'bold 14px sans-serif';

      const cx = x + w / 2;
      const cy = y + h / 2;

      // Trục x
      drawArrow(ctx, x + 15, cy, x + w - 15, cy);
      ctx.fillText('x', x + w - 12, cy - 8);

      // Trục y
      drawArrow(ctx, cx, y + h - 15, cx, y + 15);
      ctx.fillText('y', cx + 10, y + 18);

      // Gốc O
      ctx.fillText('O', cx - 18, cy + 18);

      // Vạch chia đơn vị
      const step = 30;
      ctx.font = '11px sans-serif';
      for (let i = 1; i <= 3; i++) {
        // Bên phải x
        ctx.beginPath();
        ctx.moveTo(cx + i * step, cy - 4);
        ctx.lineTo(cx + i * step, cy + 4);
        ctx.stroke();
        ctx.fillText(`${i}`, cx + i * step - 3, cy + 16);

        // Bên trái x
        ctx.beginPath();
        ctx.moveTo(cx - i * step, cy - 4);
        ctx.lineTo(cx - i * step, cy + 4);
        ctx.stroke();
        ctx.fillText(`-${i}`, cx - i * step - 8, cy + 16);

        // Phía trên y
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy - i * step);
        ctx.lineTo(cx + 4, cy - i * step);
        ctx.stroke();
        ctx.fillText(`${i}`, cx + 8, cy - i * step + 4);

        // Phía dưới y
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy + i * step);
        ctx.lineTo(cx + 4, cy + i * step);
        ctx.stroke();
        ctx.fillText(`-${i}`, cx + 8, cy + i * step + 4);
      }

      ctx.restore();
    }
  },

  // ------------------------------------------
  // 2. TOÁN HỌC: HÌNH KHÔNG GIAN 3D (CÓ NÉT ĐỨT KHUẤT)
  // ------------------------------------------
  {
    id: 'chop_tam_giac',
    name: 'Hình chóp tam giác S.ABC',
    category: 'math_3d',
    categoryLabel: 'Hình 3D',
    iconName: 'Box',
    width: 240,
    height: 240,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="50,15 15,80 55,85 85,75"/><line x1="50" y1="15" x2="55" y2="85"/><line x1="15" y1="80" x2="85" y2="75" stroke-dasharray="3,3"/><text x="48" y="12" font-size="8">S</text></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.font = 'bold 15px sans-serif';

      const S = { x: x + w / 2, y: y + 25 };
      const A = { x: x + 35, y: y + h - 50 };
      const B = { x: x + w / 2 + 15, y: y + h - 25 };
      const C = { x: x + w - 35, y: y + h - 60 };

      // Nét liền
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(S.x, S.y);
      ctx.lineTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.lineTo(S.x, S.y);
      ctx.lineTo(C.x, C.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();

      // Cạnh khuất AC (nét đứt)
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(C.x, C.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillText('S', S.x - 6, S.y - 10);
      ctx.fillText('A', A.x - 20, A.y + 10);
      ctx.fillText('B', B.x - 6, B.y + 20);
      ctx.fillText('C', C.x + 10, C.y + 8);
      ctx.restore();
    }
  },
  {
    id: 'chop_tu_giac_deu',
    name: 'Hình chóp tứ giác S.ABCD (SO ⊥ đáy)',
    category: 'math_3d',
    categoryLabel: 'Hình 3D',
    iconName: 'Box',
    width: 270,
    height: 270,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="50,15 15,65 45,85 85,75"/><line x1="50" y1="15" x2="45" y2="85"/><line x1="15" y1="65" x2="55" y2="55" stroke-dasharray="3,3"/><line x1="55" y1="55" x2="85" y2="75" stroke-dasharray="3,3"/><line x1="50" y1="15" x2="55" y2="55" stroke-dasharray="3,3"/><text x="48" y="12" font-size="8">S</text></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.font = 'bold 15px sans-serif';

      const S = { x: x + w / 2, y: y + 25 };
      const A = { x: x + w / 2 + 10, y: y + h - 100 }; // Đỉnh sau khuất
      const B = { x: x + 25, y: y + h - 65 };
      const C = { x: x + w / 2 - 20, y: y + h - 25 };
      const D = { x: x + w - 25, y: y + h - 55 };

      // Tâm đáy O
      const O = { x: (A.x + C.x) / 2, y: (A.y + C.y) / 2 };

      // Cạnh nét liền bên ngoài
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(S.x, S.y); ctx.lineTo(B.x, B.y);
      ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y);
      ctx.lineTo(S.x, S.y);
      ctx.moveTo(S.x, S.y); ctx.lineTo(C.x, C.y);
      ctx.stroke();

      // Cạnh nét đứt (khuất): AB, AD, SA, SO, AC, BD
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
      ctx.moveTo(A.x, A.y); ctx.lineTo(D.x, D.y);
      ctx.moveTo(S.x, S.y); ctx.lineTo(A.x, A.y);
      // Đường cao SO
      ctx.moveTo(S.x, S.y); ctx.lineTo(O.x, O.y);
      // 2 đường chéo đáy
      ctx.moveTo(A.x, A.y); ctx.lineTo(C.x, C.y);
      ctx.moveTo(B.x, B.y); ctx.lineTo(D.x, D.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillText('S', S.x - 6, S.y - 10);
      ctx.fillText('A', A.x - 16, A.y - 5);
      ctx.fillText('B', B.x - 20, B.y + 10);
      ctx.fillText('C', C.x - 8, C.y + 20);
      ctx.fillText('D', D.x + 10, D.y + 10);
      ctx.fillText('O', O.x + 6, O.y + 14);
      ctx.restore();
    }
  },
  {
    id: 'hinh_lap_phuong',
    name: 'Hình lập phương ABCD.A\'B\'C\'D\'',
    category: 'math_3d',
    categoryLabel: 'Hình 3D',
    iconName: 'Box',
    width: 250,
    height: 250,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="20" y="45" width="45" height="45"/><rect x="35" y="20" width="45" height="45"/><line x1="20" y1="45" x2="35" y2="20"/><line x1="65" y1="45" x2="80" y2="20"/><line x1="65" y1="90" x2="80" y2="65"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.font = 'bold 14px sans-serif';

      const s = 110;
      const dx = 40;
      const dy = 35;

      // Mặt trước ABCD
      const A = { x: x + 35, y: y + dy + 15 };
      const B = { x: x + 35 + s, y: y + dy + 15 };
      const C = { x: x + 35 + s, y: y + dy + 15 + s };
      const D = { x: x + 35, y: y + dy + 15 + s };

      // Mặt sau A'B'C'D'
      const A1 = { x: A.x + dx, y: A.y - dy };
      const B1 = { x: B.x + dx, y: B.y - dy };
      const C1 = { x: C.x + dx, y: C.y - dy };
      const D1 = { x: D.x + dx, y: D.y - dy };

      // Cạnh nét liền
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Mặt trước
      ctx.rect(A.x, A.y, s, s);
      // Nối B-B1, C-C1
      ctx.moveTo(B.x, B.y); ctx.lineTo(B1.x, B1.y);
      ctx.moveTo(C.x, C.y); ctx.lineTo(C1.x, C1.y);
      // Mặt trên B1-A1-A-B
      ctx.lineTo(B1.x, B1.y); ctx.lineTo(A1.x, A1.y); ctx.lineTo(A.x, A.y);
      // Cạnh B1-C1
      ctx.moveTo(B1.x, B1.y); ctx.lineTo(C1.x, C1.y);
      ctx.stroke();

      // Cạnh khuất nét đứt: D-D1, D1-A1, D1-C1
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(D.x, D.y); ctx.lineTo(D1.x, D1.y);
      ctx.moveTo(A1.x, A1.y); ctx.lineTo(D1.x, D1.y);
      ctx.moveTo(C1.x, C1.y); ctx.lineTo(D1.x, D1.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillText('A', A.x - 18, A.y + 4);
      ctx.fillText('B', B.x + 8, B.y + 4);
      ctx.fillText('C', C.x + 8, C.y + 14);
      ctx.fillText('D', D.x - 18, D.y + 14);
      ctx.fillText("A'", A1.x - 10, A1.y - 8);
      ctx.fillText("B'", B1.x + 8, B1.y - 8);
      ctx.fillText("C'", C1.x + 8, C1.y + 4);
      ctx.fillText("D'", D1.x + 8, D1.y + 12);
      ctx.restore();
    }
  },
  {
    id: 'khoi_non',
    name: 'Khối nón tròn xoay (Trục SO, Bán kính R)',
    category: 'math_3d',
    categoryLabel: 'Hình 3D',
    iconName: 'Cone',
    width: 220,
    height: 250,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="50" y1="15" x2="20" y2="75"/><line x1="50" y1="15" x2="80" y2="75"/><path d="M 20 75 A 30 10 0 0 0 80 75"/><path d="M 20 75 A 30 10 0 0 1 80 75" stroke-dasharray="3,3"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.font = 'bold 15px sans-serif';

      const cx = x + w / 2;
      const cy = y + h - 45;
      const rx = w / 2 - 30;
      const ry = 22;
      const S = { x: cx, y: y + 30 };

      // 2 đường sinh
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(S.x, S.y); ctx.lineTo(cx - rx, cy);
      ctx.moveTo(S.x, S.y); ctx.lineTo(cx + rx, cy);
      ctx.stroke();

      // Đáy elip nửa trước (nét liền)
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
      ctx.stroke();

      // Đáy elip nửa sau (nét đứt)
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 2 * Math.PI);
      // Đường cao SO
      ctx.moveTo(S.x, S.y); ctx.lineTo(cx, cy);
      // Bán kính R
      ctx.moveTo(cx, cy); ctx.lineTo(cx + rx, cy);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillText('S', S.x - 6, S.y - 10);
      ctx.fillText('O', cx - 18, cy + 6);
      ctx.fillText('R', cx + rx / 2 - 4, cy - 6);
      ctx.fillText('h', cx + 8, y + h / 2 - 10);
      ctx.restore();
    }
  },
  {
    id: 'mat_cau',
    name: 'Mặt cầu tâm O, bán kính R',
    category: 'math_3d',
    categoryLabel: 'Hình 3D',
    iconName: 'Sphere',
    width: 220,
    height: 220,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="50" cy="50" r="38"/><path d="M 12 50 A 38 12 0 0 0 88 50"/><path d="M 12 50 A 38 12 0 0 1 88 50" stroke-dasharray="3,3"/><circle cx="50" cy="50" r="2.5" fill="currentColor"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.font = 'bold 15px sans-serif';

      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2 - 25;
      const ry = 22;

      // Vòng tròn bao
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.stroke();

      // Xích đạo elip nửa trước (nét liền)
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, ry, 0, 0, Math.PI);
      ctx.stroke();

      // Xích đạo elip nửa sau (nét đứt)
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, ry, 0, Math.PI, 2 * Math.PI);
      // Bán kính R
      ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.707, cy - ry * 0.707);
      ctx.stroke();

      // Tâm O
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillText('O', cx - 18, cy + 18);
      ctx.fillText('R', cx + 18, cy - 8);
      ctx.restore();
    }
  },

  // ------------------------------------------
  // 3. TOÁN HỌC: ĐỒ THỊ HÀM SỐ (MATH GRAPHS)
  // ------------------------------------------
  {
    id: 'do_thi_parabol',
    name: 'Đồ thị Parabol y = ax² + bx + c',
    category: 'math_graph',
    categoryLabel: 'Đồ thị',
    iconName: 'LineChart',
    width: 260,
    height: 240,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="10" y1="80" x2="90" y2="80"/><line x1="50" y1="90" x2="50" y2="10"/><path d="M 20 20 Q 50 100 80 20" stroke="#2563eb" stroke-width="2"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.font = 'bold 14px sans-serif';

      const cx = x + w / 2;
      const cy = y + h - 50;

      // Trục Oxy
      drawArrow(ctx, x + 15, cy, x + w - 15, cy);
      ctx.fillText('x', x + w - 12, cy - 8);
      drawArrow(ctx, cx, y + h - 15, cx, y + 15);
      ctx.fillText('y', cx + 10, y + 18);
      ctx.fillText('O', cx - 18, cy + 18);

      // Đường Parabol
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const vertex = { x: cx + 25, y: cy - 70 };
      ctx.moveTo(cx - 70, cy + 30);
      ctx.quadraticCurveTo(vertex.x, cy + 30, cx + 80, y + 30);
      ctx.stroke();

      // Đỉnh I
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(vertex.x, vertex.y, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillText('I', vertex.x + 8, vertex.y - 4);

      ctx.restore();
    }
  },
  {
    id: 'do_thi_nhat_bien',
    name: 'Đồ thị phân thức y = (ax+b)/(cx+d)',
    category: 'math_graph',
    categoryLabel: 'Đồ thị',
    iconName: 'LineChart',
    width: 260,
    height: 240,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="10" y1="50" x2="90" y2="50"/><line x1="50" y1="90" x2="50" y2="10"/><line x1="65" y1="10" x2="65" y2="90" stroke="#dc2626" stroke-dasharray="2,2"/><line x1="10" y1="35" x2="90" y2="35" stroke="#dc2626" stroke-dasharray="2,2"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.font = 'bold 14px sans-serif';

      const cx = x + w / 2 - 20;
      const cy = y + h / 2 + 10;

      // Trục Oxy
      drawArrow(ctx, x + 15, cy, x + w - 15, cy);
      ctx.fillText('x', x + w - 12, cy - 8);
      drawArrow(ctx, cx, y + h - 15, cx, y + 15);
      ctx.fillText('y', cx + 10, y + 18);
      ctx.fillText('O', cx - 18, cy + 18);

      // Tiệm cận đứng & ngang (nét đứt đỏ)
      const asymX = cx + 35;
      const asymY = cy - 40;
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      // TC đứng
      ctx.beginPath();
      ctx.moveTo(asymX, y + 15); ctx.lineTo(asymX, y + h - 15);
      ctx.stroke();
      // TC ngang
      ctx.beginPath();
      ctx.moveTo(x + 15, asymY); ctx.lineTo(x + w - 15, asymY);
      ctx.stroke();

      // 2 nhánh hyperbol
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      // Nhánh 1 (dưới trái)
      ctx.beginPath();
      ctx.moveTo(x + 20, asymY + 8);
      ctx.quadraticCurveTo(asymX - 20, asymY + 20, asymX - 8, y + h - 20);
      ctx.stroke();
      // Nhánh 2 (trên phải)
      ctx.beginPath();
      ctx.moveTo(asymX + 8, y + 20);
      ctx.quadraticCurveTo(asymX + 20, asymY - 20, x + w - 20, asymY - 8);
      ctx.stroke();

      ctx.restore();
    }
  },

  // ------------------------------------------
  // 4. HÓA HỌC: DỤNG CỤ THỦY TINH (CHEM GLASSWARE)
  // ------------------------------------------
  {
    id: 'ong_nghiem',
    name: 'Ống nghiệm thủy tinh đựng hóa chất',
    category: 'chem_glassware',
    categoryLabel: 'Dụng cụ Hóa',
    iconName: 'TestTube',
    width: 140,
    height: 240,
    svgPreview: `<svg viewBox="0 0 80 120" fill="none" stroke="currentColor" stroke-width="2"><path d="M 28 15 L 25 15 L 25 90 A 15 15 0 0 0 55 90 L 55 15 L 52 15"/><path d="M 25 60 A 15 8 0 0 0 55 60 L 55 90 A 15 15 0 0 1 25 90 Z" fill="#60a5fa" opacity="0.4"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      const cx = x + w / 2;
      const topY = y + 25;
      const botY = y + h - 45;
      const r = 20;

      // Dung dịch màu xanh lam CuSO4
      ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.beginPath();
      ctx.moveTo(cx - r, botY - 50);
      ctx.lineTo(cx - r, botY);
      ctx.arc(cx, botY, r, Math.PI, 0, true);
      ctx.lineTo(cx + r, botY - 50);
      ctx.closePath();
      ctx.fill();

      // Bề mặt thoáng dung dịch (meniscus)
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, botY - 50, r, 5, 0, 0, 2 * Math.PI);
      ctx.stroke();

      // Thân ống nghiệm thủy tinh
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      // Miệng loe
      ctx.ellipse(cx, topY, r + 4, 6, 0, 0, 2 * Math.PI);
      // 2 cạnh đứng và đáy tròn
      ctx.moveTo(cx - r, topY);
      ctx.lineTo(cx - r, botY);
      ctx.arc(cx, botY, r, Math.PI, 0, true);
      ctx.lineTo(cx + r, topY);
      ctx.stroke();

      // Vạch chia
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - r, botY - i * 18);
        ctx.lineTo(cx - r + 8, botY - i * 18);
        ctx.stroke();
      }

      ctx.restore();
    }
  },
  {
    id: 'coc_becher',
    name: 'Cốc đun Becher (có vạch chia thể tích)',
    category: 'chem_glassware',
    categoryLabel: 'Dụng cụ Hóa',
    iconName: 'Beaker',
    width: 200,
    height: 220,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2"><path d="M 20 20 L 20 80 Q 20 85 25 85 L 75 85 Q 80 85 80 80 L 80 20 L 15 20"/><path d="M 20 50 L 80 50 L 80 82 L 20 82 Z" fill="#34d399" opacity="0.35"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      const left = x + 35;
      const right = x + w - 35;
      const top = y + 30;
      const bottom = y + h - 30;
      const width = right - left;

      // Dung dịch bên trong
      ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
      ctx.fillRect(left + 2, bottom - 70, width - 4, 68);

      // Thân cốc Becher
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      // Mỏ rót bên trái
      ctx.moveTo(left - 10, top);
      ctx.lineTo(left, top + 6);
      ctx.lineTo(left, bottom - 8);
      ctx.quadraticCurveTo(left, bottom, left + 8, bottom);
      ctx.lineTo(right - 8, bottom);
      ctx.quadraticCurveTo(right, bottom, right, bottom - 8);
      ctx.lineTo(right, top);
      ctx.lineTo(left - 10, top);
      ctx.stroke();

      // Vạch chia thể tích (50ml, 100ml, 150ml, 200ml)
      ctx.font = '10px sans-serif';
      ctx.fillStyle = color;
      [
        { vol: 50,  dy: 20 },
        { vol: 100, dy: 40 },
        { vol: 150, dy: 60 },
        { vol: 200, dy: 80 }
      ].forEach(v => {
        ctx.beginPath();
        ctx.moveTo(left + 2, bottom - v.dy);
        ctx.lineTo(left + 15, bottom - v.dy);
        ctx.stroke();
        ctx.fillText(`${v.vol}ml`, left + 18, bottom - v.dy + 3);
      });

      ctx.restore();
    }
  },
  {
    id: 'binh_tam_giac',
    name: 'Bình tam giác Erlenmeyer',
    category: 'chem_glassware',
    categoryLabel: 'Dụng cụ Hóa',
    iconName: 'FlaskConical',
    width: 200,
    height: 230,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2"><path d="M 42 15 L 58 15 L 58 35 L 85 85 Q 85 90 80 90 L 20 90 Q 15 90 15 85 L 42 35 Z"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      const cx = x + w / 2;
      const top = y + 25;
      const bot = y + h - 25;

      // Dung dịch màu tím thuốc tím KMnO4
      ctx.fillStyle = 'rgba(168, 85, 247, 0.35)';
      ctx.beginPath();
      ctx.moveTo(cx - 35, bot - 55);
      ctx.lineTo(cx + 35, bot - 55);
      ctx.lineTo(cx + 58, bot - 5);
      ctx.quadraticCurveTo(cx + 60, bot, cx + 55, bot);
      ctx.lineTo(cx - 55, bot);
      ctx.quadraticCurveTo(cx - 60, bot, cx - 58, bot - 5);
      ctx.closePath();
      ctx.fill();

      // Thân bình
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      // Cổ bình
      ctx.ellipse(cx, top, 14, 4, 0, 0, 2 * Math.PI);
      ctx.moveTo(cx - 12, top);
      ctx.lineTo(cx - 12, top + 35);
      // Đáy phình rộng
      ctx.lineTo(cx - 60, bot - 8);
      ctx.quadraticCurveTo(cx - 60, bot, cx - 50, bot);
      ctx.lineTo(cx + 50, bot);
      ctx.quadraticCurveTo(cx + 60, bot, cx + 60, bot - 8);
      ctx.lineTo(cx + 12, top + 35);
      ctx.lineTo(cx + 12, top);
      ctx.stroke();

      ctx.restore();
    }
  },
  {
    id: 'den_con',
    name: 'Đèn cồn thí nghiệm kèm ngọn lửa',
    category: 'chem_glassware',
    categoryLabel: 'Dụng cụ Hóa',
    iconName: 'Flame',
    width: 180,
    height: 220,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="50" cy="70" rx="30" ry="20"/><rect x="44" y="45" width="12" height="15"/><path d="M 50 20 Q 40 38 46 45 Q 50 47 54 45 Q 60 38 50 20" fill="#f97316" stroke="none"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      const cx = x + w / 2;
      const bot = y + h - 25;

      // Thân đèn cồn thủy tinh
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(cx, bot - 35, 45, 28, 0, 0, 2 * Math.PI);
      ctx.stroke();

      // Mức cồn trong bình
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.beginPath();
      ctx.ellipse(cx, bot - 30, 40, 22, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Cổ đèn và bấc đèn
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(cx - 10, bot - 75, 20, 16);
      ctx.strokeRect(cx - 10, bot - 75, 20, 16);

      // Sợi bấc nhô lên
      ctx.fillStyle = '#475569';
      ctx.fillRect(cx - 3, bot - 88, 6, 14);

      // Ngọn lửa 3 tầng (Vàng bên trong, Cam bên ngoài)
      // Tầng ngoài (Cam)
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.moveTo(cx, bot - 145);
      ctx.quadraticCurveTo(cx - 24, bot - 105, cx - 12, bot - 88);
      ctx.quadraticCurveTo(cx, bot - 84, cx + 12, bot - 88);
      ctx.quadraticCurveTo(cx + 24, bot - 105, cx, bot - 145);
      ctx.fill();

      // Tầng giữa (Vàng rực rỡ)
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(cx, bot - 130);
      ctx.quadraticCurveTo(cx - 14, bot - 105, cx - 7, bot - 88);
      ctx.quadraticCurveTo(cx, bot - 85, cx + 7, bot - 88);
      ctx.quadraticCurveTo(cx + 14, bot - 105, cx, bot - 130);
      ctx.fill();

      // Tầng lõi xanh (nhiệt độ cao)
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.ellipse(cx, bot - 90, 4, 7, 0, 0, 2 * Math.PI);
      ctx.fill();

      ctx.restore();
    }
  },

  // ------------------------------------------
  // 5. HÓA HỌC: BỘ THÍ NGHIỆM LẮP RÁP (CHEM SETUPS)
  // ------------------------------------------
  {
    id: 'dieu_che_khi_day_nuoc',
    name: 'Bộ thí nghiệm thu khí đẩy nước (O2, H2...)',
    category: 'chem_experiment',
    categoryLabel: 'Bộ thí nghiệm',
    iconName: 'FlaskConical',
    width: 320,
    height: 240,
    svgPreview: `<svg viewBox="0 0 100 80" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="55" y="45" width="40" height="25" rx="3"/><path d="M 20 25 L 50 35 L 75 55"/><circle cx="75" cy="45" r="8"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillStyle = color;
      ctx.font = '12px sans-serif';

      // 1. Đèn cồn bên trái
      const burnerX = x + 60;
      const burnerY = y + h - 45;
      ctx.beginPath();
      ctx.ellipse(burnerX, burnerY, 22, 14, 0, 0, 2 * Math.PI);
      ctx.stroke();
      // Ngọn lửa
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.moveTo(burnerX, burnerY - 35);
      ctx.quadraticCurveTo(burnerX - 10, burnerY - 20, burnerX, burnerY - 14);
      ctx.quadraticCurveTo(burnerX + 10, burnerY - 20, burnerX, burnerY - 35);
      ctx.fill();

      // 2. Ống nghiệm nghiêng nung KMnO4
      ctx.save();
      ctx.translate(burnerX + 10, burnerY - 45);
      ctx.rotate(-0.25);
      ctx.fillStyle = 'rgba(168, 85, 247, 0.4)'; // KMnO4 bột tím
      ctx.fillRect(-20, 0, 35, 18);
      ctx.strokeStyle = color;
      ctx.strokeRect(-20, 0, 90, 18);
      ctx.restore();

      // 3. Ống dẫn khí cong chữ Z sang chậu nước
      const potX = x + w - 100;
      const potY = y + h - 40;
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(burnerX + 85, burnerY - 55);
      ctx.lineTo(burnerX + 120, burnerY - 55);
      ctx.lineTo(potX - 10, potY + 15);
      ctx.lineTo(potX + 30, potY + 15);
      ctx.stroke();

      // 4. Chậu thủy tinh đựng nước
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.fillRect(potX - 25, potY, 95, 30);
      ctx.strokeRect(potX - 25, potY, 95, 30);

      // 5. Ống nghiệm úp ngược thu khí
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillRect(potX + 18, potY - 55, 24, 70);
      ctx.strokeRect(potX + 18, potY - 55, 24, 70);

      // Bọt khí nổi lên
      ctx.fillStyle = '#38bdf8';
      [
        { ox: 25, oy: -15 }, { ox: 32, oy: -30 }, { ox: 28, oy: -45 }
      ].forEach(b => {
        ctx.beginPath();
        ctx.arc(potX + b.ox, potY + b.oy, 3, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Nhãn
      ctx.fillStyle = color;
      ctx.fillText('KMnO₄ (đun nóng)', x + 10, y + 35);
      ctx.fillText('Khí O₂ thu được', potX - 10, potY - 65);

      ctx.restore();
    }
  },

  // ------------------------------------------
  // 6. HÓA HỌC: PIN ĐIỆN HÓA & ĐIỆN PHÂN (CHEM ELECTRO)
  // ------------------------------------------
  {
    id: 'pin_dien_hoa_zn_cu',
    name: 'Pin điện hóa Zn - Cu (Galvani)',
    category: 'chem_electro',
    categoryLabel: 'Điện hóa học',
    iconName: 'Zap',
    width: 320,
    height: 240,
    svgPreview: `<svg viewBox="0 0 100 80" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="15" y="35" width="28" height="35"/><rect x="57" y="35" width="28" height="35"/><path d="M 36 45 C 36 25, 64 25, 64 45" stroke="#ef4444"/><circle cx="50" cy="18" r="8"/><text x="46" y="21" font-size="7">V</text></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillStyle = color;
      ctx.font = 'bold 12px sans-serif';

      const cupW = 85;
      const cupH = 100;
      const cupY = y + h - 110;
      const c1X = x + 30;
      const c2X = x + w - 30 - cupW;

      // Cốc 1 (ZnSO4 - dung dịch trong suốt)
      ctx.fillStyle = 'rgba(226, 232, 240, 0.4)';
      ctx.fillRect(c1X, cupY + 30, cupW, cupH - 30);
      ctx.strokeRect(c1X, cupY, cupW, cupH);

      // Cốc 2 (CuSO4 - xanh lam)
      ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
      ctx.fillRect(c2X, cupY + 30, cupW, cupH - 30);
      ctx.strokeRect(c2X, cupY, cupW, cupH);

      // Thanh kẽm Zn (bạc)
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(c1X + 25, cupY - 15, 16, 95);
      ctx.strokeRect(c1X + 25, cupY - 15, 16, 95);

      // Thanh đồng Cu (đỏ cam)
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(c2X + cupW - 40, cupY - 15, 16, 95);
      ctx.strokeRect(c2X + cupW - 40, cupY - 15, 16, 95);

      // Cầu muối KCl chữ U úp ngược
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(c1X + cupW - 15, cupY + 60);
      ctx.lineTo(c1X + cupW - 15, cupY + 15);
      ctx.lineTo(c2X + 15, cupY + 15);
      ctx.lineTo(c2X + 15, cupY + 60);
      ctx.stroke();

      // Dây dẫn và Vôn kế V
      const meterX = x + w / 2;
      const meterY = y + 35;
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c1X + 33, cupY - 15);
      ctx.lineTo(c1X + 33, meterY);
      ctx.lineTo(meterX - 16, meterY);
      ctx.moveTo(meterX + 16, meterY);
      ctx.lineTo(c2X + cupW - 32, meterY);
      ctx.lineTo(c2X + cupW - 32, cupY - 15);
      ctx.stroke();

      // Đồng hồ vôn kế V
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(meterX, meterY, 16, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#dc2626';
      ctx.fillText('1.10V', meterX - 16, meterY + 4);

      // Nhãn chú thích
      ctx.fillStyle = color;
      ctx.fillText('(-) Anot: Zn', c1X + 10, cupY + cupH + 18);
      ctx.fillText('(+) Catot: Cu', c2X + 10, cupY + cupH + 18);
      ctx.fillText('Cầu muối KCl', meterX - 35, cupY + 8);

      ctx.restore();
    }
  },

  // ------------------------------------------
  // 7. HÓA HỌC: CẤU TRÚC HỮU CƠ (ORGANIC STRUCTURES)
  // ------------------------------------------
  {
    id: 'vong_benzen',
    name: 'Vòng Benzen C6H6 chuẩn',
    category: 'chem_organic',
    categoryLabel: 'Hóa hữu cơ',
    iconName: 'Hexagon',
    width: 180,
    height: 180,
    svgPreview: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2"><polygon points="50,15 85,35 85,75 50,95 15,75 15,35"/><circle cx="50" cy="55" r="20"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;

      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2 - 25;

      // Lục giác đều
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const rad = (i * 60 - 30) * Math.PI / 180;
        const px = cx + r * Math.cos(rad);
        const py = cy + r * Math.sin(rad);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // Vòng tròn liên hợp pi ở giữa
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.58, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.restore();
    }
  },
  {
    id: 'phenol',
    name: 'Phân tử Phenol (C6H5OH)',
    category: 'chem_organic',
    categoryLabel: 'Hóa hữu cơ',
    iconName: 'Hexagon',
    width: 180,
    height: 220,
    svgPreview: `<svg viewBox="0 0 100 120" fill="none" stroke="currentColor" stroke-width="2"><polygon points="50,45 85,65 85,100 50,118 15,100 15,65"/><circle cx="50" cy="82" r="18"/><line x1="50" y1="45" x2="50" y2="28"/><text x="42" y="22" font-size="12">OH</text></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2.5;
      ctx.font = 'bold 16px sans-serif';

      const cx = x + w / 2;
      const cy = y + h / 2 + 18;
      const r = 50;

      // Vòng benzen
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const rad = (i * 60 - 90) * Math.PI / 180;
        const px = cx + r * Math.cos(rad);
        const py = cy + r * Math.sin(rad);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.58, 0, 2 * Math.PI);
      ctx.stroke();

      // Liên kết nối lên nhóm -OH
      const topVertexY = cy - r;
      ctx.beginPath();
      ctx.moveTo(cx, topVertexY);
      ctx.lineTo(cx, topVertexY - 22);
      ctx.stroke();

      // Nhóm -OH
      ctx.fillText('OH', cx - 12, topVertexY - 28);

      ctx.restore();
    }
  },
  {
    id: 'mach_carbon_zigzag',
    name: 'Khung mạch Carbon dích dắc (Hexan)',
    category: 'chem_organic',
    categoryLabel: 'Hóa hữu cơ',
    iconName: 'Activity',
    width: 240,
    height: 120,
    svgPreview: `<svg viewBox="0 0 100 50" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="10,35 30,15 50,35 70,15 90,35"/></svg>`,
    renderToCanvas: (ctx, x, y, w, h, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const cy = y + h / 2;
      const pts = [
        { x: x + 25, y: cy + 20 },
        { x: x + 65, y: cy - 20 },
        { x: x + 105, y: cy + 20 },
        { x: x + 145, y: cy - 20 },
        { x: x + 185, y: cy + 20 },
        { x: x + 225, y: cy - 20 }
      ];

      ctx.beginPath();
      pts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      ctx.restore();
    }
  }
];

export const SHAPE_CATEGORIES = [
  { key: 'all', label: 'Tất cả' },
  { key: 'math_2d', label: 'Toán: Hình phẳng' },
  { key: 'math_3d', label: 'Toán: Hình 3D' },
  { key: 'math_graph', label: 'Toán: Đồ thị' },
  { key: 'chem_glassware', label: 'Hóa: Dụng cụ' },
  { key: 'chem_experiment', label: 'Hóa: Bộ thí nghiệm' },
  { key: 'chem_electro', label: 'Hóa: Điện hóa' },
  { key: 'chem_organic', label: 'Hóa: Hữu cơ' },
];
