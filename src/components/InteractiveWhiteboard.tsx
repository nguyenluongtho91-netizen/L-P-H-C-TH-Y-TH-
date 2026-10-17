// src/components/InteractiveWhiteboard.tsx
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Save, Undo2, Redo2, Trash2, Pen, Highlighter, Ruler,
  Square, Circle, ArrowUpRight, Eraser, Type, Image as ImageIcon,
  ChevronLeft, ChevronRight, Plus, Download, Copy, Check,
  Maximize2, Minimize2, X, Sparkles, BookOpen, Layers,
  Compass, Eye, HelpCircle, FileCheck
} from 'lucide-react';
import { PRESET_SHAPES, SHAPE_CATEGORIES, PresetShape } from '@/services/whiteboardShapesService';
import toast from 'react-hot-toast';

export type PaperStyle = 'math_grid' | 'ruled' | 'blank' | 'chalkboard' | 'oxy_grid';
export type ToolType = 'pen' | 'highlighter' | 'ruler' | 'arrow' | 'rect' | 'circle' | 'eraser' | 'text';

interface InteractiveWhiteboardProps {
  onInsertToQuestion?: (dataUrl: string) => void;
  onClose?: () => void;
  title?: string;
  isModal?: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  tool: ToolType;
  color: string;
  size: number;
  points: Point[];
  shapeType?: string;
}

const COLOR_PRESETS = [
  { name: 'Đen', hex: '#0f172a' },
  { name: 'Vàng dạ quang', hex: '#eab308' },
  { name: 'Xanh lá', hex: '#22c55e' },
  { name: 'Xanh cyan', hex: '#06b6d4' },
  { name: 'Xanh dương', hex: '#2563eb' },
  { name: 'Đỏ', hex: '#ef4444' },
  { name: 'Tím', hex: '#a855f7' },
  { name: 'Trắng', hex: '#ffffff' },
];

const STROKE_SIZES = [
  { size: 2, label: 'Siêu mảnh' },
  { size: 3.5, label: 'Mảnh' },
  { size: 6, label: 'Vừa' },
  { size: 10, label: 'Đậm' },
  { size: 16, label: 'Dạ quang' },
];

export default function InteractiveWhiteboard({
  onInsertToQuestion,
  onClose,
  title = 'Bảng Vẽ Ô Ly Toán - Hóa Thầy Thọ',
  isModal = false
}: InteractiveWhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tools state
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [strokeColor, setStrokeColor] = useState<string>('#0f172a');
  const [strokeSize, setStrokeSize] = useState<number>(3.5);
  const [paperStyle, setPaperStyle] = useState<PaperStyle>('math_grid');

  // Drawing state
  const isDrawing = useRef(false);
  const currentPoints = useRef<Point[]>([]);
  const startPoint = useRef<Point | null>(null);

  // Multi-page & History state
  const [pages, setPages] = useState<{ id: number; strokes: Stroke[] }[]>([
    { id: 1, strokes: [] }
  ]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);

  // Modals & Drawers
  const [showShapeDrawer, setShowShapeDrawer] = useState(false);
  const [selectedShapeCategory, setSelectedShapeCategory] = useState('all');
  const [showLatexModal, setShowLatexModal] = useState(false);
  const [latexInput, setLatexInput] = useState('\\int_{0}^{1} x^2 dx = \\frac{1}{3}');
  const [latexPreviewUrl, setLatexPreviewUrl] = useState<string | null>(null);
  const [textInputModal, setTextInputModal] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });
  const [canvasText, setCanvasText] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Background colors depending on paper style
  const isChalkboard = paperStyle === 'chalkboard';

  // Automatically adjust default pen color for chalkboard
  useEffect(() => {
    if (paperStyle === 'chalkboard') {
      if (strokeColor === '#0f172a') setStrokeColor('#ffffff');
    } else {
      if (strokeColor === '#ffffff') setStrokeColor('#0f172a');
    }
  }, [paperStyle]);

  // Handle Resize & Canvas Scaling for Retina
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
    redrawAll();
  }, [currentPageIndex, pages, paperStyle]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // Draw background grid / paper pattern
  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();

    if (paperStyle === 'chalkboard') {
      // Bảng đen / phấn rêu
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#132e22');
      grad.addColorStop(1, '#0e231a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Đường kẻ mờ màu xanh rêu nhạt
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else if (paperStyle === 'math_grid') {
      // GIẤY Ô LY TOÁN HỌC (CHUẨN Y HỆT ẢNH NGƯỜI DÙNG TẢI LÊN)
      // Nền trắng dịu
      ctx.fillStyle = '#fcfdfe';
      ctx.fillRect(0, 0, width, height);

      const smallGrid = 25; // 25px mỗi ô ly nhỏ
      const bigGrid = 125;  // 5 ô nhỏ = 1 ô lớn

      // Lưới ô ly nhỏ (màu xanh thiên thanh nhạt)
      ctx.strokeStyle = '#bae6fd'; // sky-200
      ctx.lineWidth = 0.8;
      for (let x = 0; x < width; x += smallGrid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += smallGrid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Lưới ô lớn (màu xanh đậm hơn để phân biệt)
      ctx.strokeStyle = '#7dd3fc'; // sky-300
      ctx.lineWidth = 1.4;
      for (let x = 0; x < width; x += bigGrid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += bigGrid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else if (paperStyle === 'ruled') {
      // Giấy kẻ ngang học sinh
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Đường kẻ lề đỏ bên trái
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(80, 0);
      ctx.lineTo(80, height);
      ctx.stroke();

      // Dòng kẻ ngang màu xanh nhạt
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      const lineSpacing = 32;
      for (let y = 60; y < height; y += lineSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else if (paperStyle === 'oxy_grid') {
      // Toàn bộ bảng là hệ trục toạ độ Oxy
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      const step = 30;
      const cx = Math.floor(width / (2 * step)) * step;
      const cy = Math.floor(height / (2 * step)) * step;

      // Lưới phụ
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      // Trục toạ độ Oxy chính
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      // Trục x
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(width, cy); ctx.stroke();
      // Trục y
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, height); ctx.stroke();

      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('x', width - 20, cy - 8);
      ctx.fillText('y', cx + 10, 20);
      ctx.fillText('O', cx - 18, cy + 18);
    } else {
      // Giấy trắng tinh
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.restore();
  };

  // Helper vẽ đường mượt mà Catmull-Rom hoặc Bezier curve
  const drawSmoothStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    const pts = stroke.points;
    if (pts.length === 0) return;

    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = 0.38;
      ctx.globalCompositeOperation = isChalkboard ? 'screen' : 'multiply';
      ctx.lineWidth = stroke.size * 2.2;
    } else if (stroke.tool === 'eraser') {
      ctx.strokeStyle = isChalkboard ? '#132e22' : (paperStyle === 'math_grid' ? '#fcfdfe' : '#ffffff');
      ctx.lineWidth = stroke.size * 3;
    }

    if (stroke.tool === 'ruler' || stroke.tool === 'arrow') {
      if (pts.length >= 2) {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        if (stroke.tool === 'arrow') {
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const head = 12;
          ctx.beginPath();
          ctx.moveTo(p2.x, p2.y);
          ctx.lineTo(p2.x - head * Math.cos(angle - Math.PI / 6), p2.y - head * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(p2.x - head * Math.cos(angle + Math.PI / 6), p2.y - head * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fillStyle = stroke.color;
          ctx.fill();
        }
      }
      ctx.restore();
      return;
    }

    if (stroke.tool === 'rect') {
      if (pts.length >= 2) {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      }
      ctx.restore();
      return;
    }

    if (stroke.tool === 'circle') {
      if (pts.length >= 2) {
        const p1 = pts[0];
        const p2 = pts[pts.length - 1];
        const rx = Math.abs(p2.x - p1.x) / 2;
        const ry = Math.abs(p2.y - p1.y) / 2;
        const cx = Math.min(p1.x, p2.x) + rx;
        const cy = Math.min(p1.y, p2.y) + ry;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    // Freehand Pen / Highlighter / Eraser
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, 2 * Math.PI);
      ctx.fillStyle = stroke.color;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }

    ctx.restore();
  };

  // Redraw complete canvas
  const redrawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, width, height);
    drawBackground(ctx, width, height);

    const currentStrokes = pages[currentPageIndex]?.strokes || [];
    currentStrokes.forEach(s => drawSmoothStroke(ctx, s));

    // Draw active drawing in progress
    if (isDrawing.current && currentPoints.current.length > 0) {
      drawSmoothStroke(ctx, {
        tool: currentTool,
        color: strokeColor,
        size: strokeSize,
        points: currentPoints.current
      });
    }
  };

  // Pointer Event Handlers (Support Stylus, Finger Touch & Mouse)
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (currentTool === 'text') {
      const pt = getCanvasPoint(e);
      setTextInputModal({ open: true, x: pt.x, y: pt.y });
      return;
    }

    isDrawing.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = getCanvasPoint(e);
    startPoint.current = pt;
    currentPoints.current = [pt];
    redrawAll();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const pt = getCanvasPoint(e);

    if (currentTool === 'ruler' || currentTool === 'arrow' || currentTool === 'rect' || currentTool === 'circle') {
      // Shape tools only store start and current endpoint
      if (startPoint.current) {
        currentPoints.current = [startPoint.current, pt];
      }
    } else {
      currentPoints.current.push(pt);
    }
    redrawAll();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (currentPoints.current.length > 0) {
      const newStroke: Stroke = {
        tool: currentTool,
        color: strokeColor,
        size: strokeSize,
        points: [...currentPoints.current]
      };

      setPages(prev => {
        const next = [...prev];
        next[currentPageIndex] = {
          ...next[currentPageIndex],
          strokes: [...next[currentPageIndex].strokes, newStroke]
        };
        return next;
      });
      setRedoStack([]); // Clear redo stack on new action
    }

    currentPoints.current = [];
    startPoint.current = null;
    redrawAll();
  };

  // Undo & Redo
  const handleUndo = () => {
    const currentStrokes = pages[currentPageIndex]?.strokes || [];
    if (currentStrokes.length === 0) return;

    const popped = currentStrokes[currentStrokes.length - 1];
    setRedoStack(r => [...r, popped]);

    setPages(prev => {
      const next = [...prev];
      next[currentPageIndex] = {
        ...next[currentPageIndex],
        strokes: currentStrokes.slice(0, -1)
      };
      return next;
    });
    setTimeout(redrawAll, 10);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextStroke = redoStack[redoStack.length - 1];
    setRedoStack(r => r.slice(0, -1));

    setPages(prev => {
      const next = [...prev];
      next[currentPageIndex] = {
        ...next[currentPageIndex],
        strokes: [...next[currentPageIndex].strokes, nextStroke]
      };
      return next;
    });
    setTimeout(redrawAll, 10);
  };

  const handleClear = () => {
    if (!window.confirm('Thầy/Cô có chắc chắn muốn xóa sạch toàn bộ nét vẽ trang này?')) return;
    setPages(prev => {
      const next = [...prev];
      next[currentPageIndex] = { ...next[currentPageIndex], strokes: [] };
      return next;
    });
    setRedoStack([]);
    setTimeout(redrawAll, 10);
    toast.success('Đã dọn sạch bảng vẽ');
  };

  // Insert Preset Shape into Canvas
  const handleInsertShape = (shape: PresetShape) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    // Đặt ở vị trí trung tâm màn hình
    const posX = Math.max(50, (width - shape.width) / 2);
    const posY = Math.max(60, (height - shape.height) / 2);

    shape.renderToCanvas(ctx, posX, posY, shape.width, shape.height, strokeColor, isChalkboard);

    // Save as snapshot stroke or re-render
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Lưu một fake stroke để undo hoạt động
    const fakeStroke: Stroke = {
      tool: 'pen',
      color: strokeColor,
      size: strokeSize,
      points: [{ x: posX, y: posY }],
      shapeType: shape.id
    };

    setPages(prev => {
      const next = [...prev];
      next[currentPageIndex] = {
        ...next[currentPageIndex],
        strokes: [...next[currentPageIndex].strokes, fakeStroke]
      };
      return next;
    });

    setShowShapeDrawer(false);
    toast.success(`Đã chèn "${shape.name}" lên bảng`);
  };

  // Insert Text
  const handleConfirmText = () => {
    if (!canvasText.trim()) {
      setTextInputModal({ open: false, x: 0, y: 0 });
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.fillStyle = strokeColor;
    ctx.font = `bold ${strokeSize * 4.5}px sans-serif`;
    ctx.fillText(canvasText, textInputModal.x, textInputModal.y);
    ctx.restore();

    setCanvasText('');
    setTextInputModal({ open: false, x: 0, y: 0 });
    toast.success('Đã thêm chữ');
  };

  // Insert Image (Upload / Paste)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const maxW = 400;
        const scale = Math.min(1, maxW / img.width);
        const w = img.width * scale;
        const h = img.height * scale;

        ctx.drawImage(img, 60, 60, w, h);
        toast.success('Đã chèn ảnh thành công');
      };
      img.src = evt.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Keyboard Shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+V)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pages, currentPageIndex, redoStack]);

  // Export / Save Actions
  const getCanvasDataUrl = (transparent = false): string => {
    const canvas = canvasRef.current;
    if (!canvas) return '';

    if (!transparent) {
      return canvas.toDataURL('image/png');
    }

    // Export transparent: redraw strokes on transparent background
    const offCanvas = document.createElement('canvas');
    offCanvas.width = canvas.width;
    offCanvas.height = canvas.height;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return canvas.toDataURL('image/png');

    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);

    const currentStrokes = pages[currentPageIndex]?.strokes || [];
    currentStrokes.forEach(s => drawSmoothStroke(ctx, s));

    return offCanvas.toDataURL('image/png');
  };

  const handleDownload = () => {
    const dataUrl = getCanvasDataUrl(false);
    const link = document.createElement('a');
    link.download = `Bang_Ve_Thay_Tho_Trang_${currentPageIndex + 1}_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    toast.success('Đã tải hình vẽ xuống máy tính');
  };

  const handleCopyClipboard = async () => {
    try {
      const dataUrl = getCanvasDataUrl(false);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      setCopied(true);
      toast.success('Đã sao chép ảnh vào Bộ nhớ tạm (Clipboard)! Nhấn Ctrl+V để dán.');
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      toast.error('Không thể sao chép tự động. Hãy dùng nút Tải về.');
    }
  };

  const handleInsertToParent = () => {
    if (onInsertToQuestion) {
      const dataUrl = getCanvasDataUrl(false);
      onInsertToQuestion(dataUrl);
      toast.success('Đã chèn hình vẽ vào câu hỏi!');
      if (onClose) onClose();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col relative select-none overflow-hidden ${
        isModal
          ? 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-2 sm:p-6 flex items-center justify-center'
          : 'w-full h-screen bg-slate-100'
      }`}
    >
      <div
        className={`flex flex-col w-full h-full bg-white shadow-2xl overflow-hidden relative ${
          isModal ? 'rounded-2xl max-w-7xl max-h-[96vh] border border-slate-300' : ''
        }`}
      >
        {/* ======================================================== */}
        {/* THANH CÔNG CỤ TRÊN CÙNG (GIỐNG HỆT ẢNH SCRIBBLE INK CỦA BẠN) */}
        {/* ======================================================== */}
        <header className="h-14 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 flex items-center justify-between z-30 shrink-0 shadow-sm">
          {/* 1. KHỐI BÊN TRÁI: Lưu, Hoàn tác, Nền giấy, Trang */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Lưu & Xuất ảnh */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
              <button
                onClick={handleDownload}
                title="Tải ảnh PNG xuống máy"
                className="p-1.5 rounded-md hover:bg-white text-slate-700 transition"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={handleCopyClipboard}
                title="Sao chép ảnh vào Clipboard (Ctrl+V)"
                className="p-1.5 rounded-md hover:bg-white text-slate-700 transition"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
              {onInsertToQuestion && (
                <button
                  onClick={handleInsertToParent}
                  className="px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-md flex items-center gap-1 transition shadow-sm ml-1"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Chèn vào đề</span>
                </button>
              )}
            </div>

            <div className="h-5 w-px bg-slate-200 mx-0.5" />

            {/* Undo / Redo */}
            <button
              onClick={handleUndo}
              title="Hoàn tác (Ctrl+Z)"
              className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="Làm lại (Ctrl+Y)"
              className={`p-1.5 rounded-lg transition ${
                redoStack.length > 0 ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300'
              }`}
            >
              <Redo2 className="w-4 h-4" />
            </button>

            {/* Clear All */}
            <button
              onClick={handleClear}
              title="Xóa trắng trang"
              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <div className="h-5 w-px bg-slate-200 mx-0.5" />

            {/* Chọn nền giấy (Paper Style) */}
            <select
              value={paperStyle}
              onChange={(e) => setPaperStyle(e.target.value as PaperStyle)}
              className="text-xs font-medium bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="math_grid">📐 Giấy ô ly Toán</option>
              <option value="ruled">📝 Giấy kẻ ngang</option>
              <option value="blank">⬜ Giấy trắng tinh</option>
              <option value="chalkboard">⬛ Bảng đen phấn</option>
              <option value="oxy_grid">📏 Hệ tọa độ Oxy</option>
            </select>
          </div>

          {/* 2. KHỐI TRUNG TÂM: Tiêu đề & Quản lý Trang */}
          <div className="hidden md:flex items-center gap-2 bg-slate-50 px-3 py-1 rounded-full border border-slate-200 text-xs font-medium text-slate-600">
            <span>{title}</span>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPageIndex(Math.max(0, currentPageIndex - 1))}
                disabled={currentPageIndex === 0}
                className="hover:text-blue-600 disabled:opacity-30"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-bold text-blue-600">
                {currentPageIndex + 1}/{pages.length}
              </span>
              <button
                onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, currentPageIndex + 1))}
                disabled={currentPageIndex === pages.length - 1}
                className="hover:text-blue-600 disabled:opacity-30"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setPages(p => [...p, { id: p.length + 1, strokes: [] }]);
                  setCurrentPageIndex(pages.length);
                  toast.success('Đã thêm trang mới');
                }}
                title="Thêm trang mới"
                className="ml-1 p-0.5 hover:bg-slate-200 rounded text-slate-600"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 3. KHỐI BÊN PHẢI: Kích thước nét, Màu sắc, Bút, Tẩy, Thước, Hình vẽ Toán-Hóa */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* 4 Nốt kích thước nét vẽ (Dot Sizes - y hệt ảnh Scribble Ink) */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {STROKE_SIZES.map((item) => (
                <button
                  key={item.size}
                  onClick={() => setStrokeSize(item.size)}
                  title={item.label}
                  className={`w-6 h-6 flex items-center justify-center rounded-full transition ${
                    strokeSize === item.size ? 'bg-white shadow-sm ring-1 ring-slate-400' : 'hover:bg-slate-200'
                  }`}
                >
                  <div
                    className="rounded-full bg-slate-800"
                    style={{
                      width: Math.min(14, Math.max(4, item.size * 1.2)),
                      height: Math.min(14, Math.max(4, item.size * 1.2))
                    }}
                  />
                </button>
              ))}
            </div>

            {/* Các nốt màu nhanh (Color Palette Dots - y hệt ảnh Scribble Ink) */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {COLOR_PRESETS.slice(0, 6).map((c) => (
                <button
                  key={c.hex}
                  onClick={() => setStrokeColor(c.hex)}
                  title={c.name}
                  className={`w-6 h-6 rounded-full border border-black/10 transition transform hover:scale-110 flex items-center justify-center ${
                    strokeColor === c.hex ? 'ring-2 ring-blue-500 ring-offset-1 scale-110' : ''
                  }`}
                  style={{ backgroundColor: c.hex }}
                >
                  {strokeColor === c.hex && (
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        c.hex === '#ffffff' || c.hex === '#eab308' ? 'bg-black' : 'bg-white'
                      }`}
                    />
                  )}
                </button>
              ))}
              {/* Color Picker input */}
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => setStrokeColor(e.target.value)}
                title="Màu khác"
                className="w-5 h-5 rounded-full cursor-pointer border-0 p-0 overflow-hidden"
              />
            </div>

            {/* CÔNG CỤ CHÍNH: Bút, Dạ quang, Thước, Hình, Tẩy, Toán-Hóa */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg gap-0.5">
              {/* Bút viết */}
              <button
                onClick={() => setCurrentTool('pen')}
                title="Bút viết mượt"
                className={`p-1.5 rounded-md transition ${
                  currentTool === 'pen' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Pen className="w-4 h-4" />
              </button>

              {/* Bút dạ quang */}
              <button
                onClick={() => setCurrentTool('highlighter')}
                title="Bút dạ quang (Highlighter)"
                className={`p-1.5 rounded-md transition ${
                  currentTool === 'highlighter' ? 'bg-yellow-500 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Highlighter className="w-4 h-4" />
              </button>

              {/* Thước kẻ / Đoạn thẳng */}
              <button
                onClick={() => setCurrentTool('ruler')}
                title="Thước kẻ (Đường thẳng tắp)"
                className={`p-1.5 rounded-md transition ${
                  currentTool === 'ruler' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Ruler className="w-4 h-4" />
              </button>

              {/* Mũi tên */}
              <button
                onClick={() => setCurrentTool('arrow')}
                title="Mũi tên / Vector"
                className={`p-1.5 rounded-md transition ${
                  currentTool === 'arrow' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>

              {/* Hình chữ nhật */}
              <button
                onClick={() => setCurrentTool('rect')}
                title="Hình chữ nhật / Vuông"
                className={`p-1.5 rounded-md transition ${
                  currentTool === 'rect' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Square className="w-4 h-4" />
              </button>

              {/* Hình tròn */}
              <button
                onClick={() => setCurrentTool('circle')}
                title="Hình tròn / Elip"
                className={`p-1.5 rounded-md transition ${
                  currentTool === 'circle' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Circle className="w-4 h-4" />
              </button>

              {/* Cục Tẩy */}
              <button
                onClick={() => setCurrentTool('eraser')}
                title="Tẩy xóa nét"
                className={`p-1.5 rounded-md transition ${
                  currentTool === 'eraser' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Eraser className="w-4 h-4" />
              </button>
            </div>

            {/* NÚT ĐẶC BIỆT: THƯ VIỆN HÌNH TOÁN & HÓA HỌC */}
            <button
              onClick={() => setShowShapeDrawer(true)}
              className="px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg flex items-center gap-1.5 transition shadow-sm"
              title="Mở kho hình vẽ Toán học & Hóa học chuẩn Bộ GD"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span className="hidden sm:inline">Kho Hình Toán - Hóa</span>
              <span className="sm:hidden">Hình</span>
            </button>

            {/* Chèn Text */}
            <button
              onClick={() => setCurrentTool('text')}
              title="Chèn chữ viết"
              className={`p-1.5 rounded-lg border border-slate-200 transition ${
                currentTool === 'text' ? 'bg-blue-50 text-blue-600 border-blue-400' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Type className="w-4 h-4" />
            </button>

            {/* Chèn ảnh đề bài / bài làm học sinh */}
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Chèn ảnh đề bài hoặc bài giải"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />

            {/* Đóng Modal nếu ở chế độ popup */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition ml-1"
                title="Đóng bảng vẽ"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        {/* ======================================================== */}
        {/* VÙNG CANVAS VẼ CHÍNH */}
        {/* ======================================================== */}
        <div className="flex-1 relative overflow-hidden bg-slate-50">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="w-full h-full touch-none cursor-crosshair block"
            style={{
              touchAction: 'none'
            }}
          />

          {/* Gợi ý phím tắt nhanh góc dưới */}
          <div className="absolute bottom-3 left-4 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-200 shadow-sm text-[11px] text-slate-500 flex items-center gap-3 pointer-events-none">
            <span>✏️ <b>Ctrl+Z</b> Hoàn tác</span>
            <span>🔁 <b>Ctrl+Y</b> Làm lại</span>
            <span>📋 <b>Ctrl+V</b> Dán ảnh bài làm</span>
            <span>📐 <b>Shift</b> Giữ vẽ thẳng</span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* MODAL KHO HÌNH VẼ TOÁN HỌC & HÓA HỌC CHUYÊN DỤNG */}
        {/* ======================================================== */}
        {showShapeDrawer && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
              {/* Header Drawer */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                    📐
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Thư Viện Hình Vẽ Toán Học & Dụng Cụ Hóa Học
                    </h2>
                    <p className="text-xs text-slate-500">
                      Nhấp vào bất kỳ hình nào để dán chuẩn xác lên bảng vẽ (có sẵn nét đứt không gian 3D)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowShapeDrawer(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Danh mục lọc hình */}
              <div className="flex items-center gap-1.5 px-6 py-2.5 bg-slate-50 border-b border-slate-200 overflow-x-auto custom-scrollbar">
                {SHAPE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setSelectedShapeCategory(cat.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                      selectedShapeCategory === cat.key
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Lưới các hình vẽ */}
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 custom-scrollbar">
                {PRESET_SHAPES.filter(
                  s => selectedShapeCategory === 'all' || s.category === selectedShapeCategory
                ).map((shape) => (
                  <div
                    key={shape.id}
                    onClick={() => handleInsertShape(shape)}
                    className="flex flex-col items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition cursor-pointer group shadow-sm bg-white"
                  >
                    <div
                      className="w-full h-32 flex items-center justify-center text-slate-700 group-hover:text-blue-600 transition"
                      dangerouslySetInnerHTML={{ __html: shape.svgPreview }}
                    />
                    <div className="w-full text-center mt-2 border-t border-slate-100 pt-2">
                      <p className="text-xs font-bold text-slate-800 line-clamp-1 group-hover:text-blue-700">
                        {shape.name}
                      </p>
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full inline-block mt-1">
                        {shape.categoryLabel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
                <span>💡 Mẹo: Bạn có thể chọn màu nét vẽ ở thanh trên cùng trước khi chèn hình.</span>
                <button
                  onClick={() => setShowShapeDrawer(false)}
                  className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 font-semibold text-slate-700 transition"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL NHẬP CHỮ (TEXT INPUT MODAL) */}
        {/* ======================================================== */}
        {textInputModal.open && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl p-4 w-full max-w-md border border-slate-200">
              <h3 className="text-sm font-bold text-slate-800 mb-2">Chèn chữ viết lên bảng</h3>
              <input
                type="text"
                value={canvasText}
                onChange={(e) => setCanvasText(e.target.value)}
                placeholder="Nhập ghi chú, lời giải, ký hiệu..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmText();
                  if (e.key === 'Escape') setTextInputModal({ open: false, x: 0, y: 0 });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setTextInputModal({ open: false, x: 0, y: 0 })}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  onClick={handleConfirmText}
                  className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm"
                >
                  Chèn chữ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
