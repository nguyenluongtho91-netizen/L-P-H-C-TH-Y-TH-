// @ts-nocheck
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Check, X, Circle, PenTool, Type, RotateCw, ZoomIn, ZoomOut,
  Undo2, Trash2, Download, Sparkles, AlertCircle, ChevronLeft, ChevronRight,
  Maximize2, Eye, Award
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface Annotation {
  id: string;
  type: 'correct' | 'incorrect' | 'circle' | 'pen' | 'text';
  x: number; // Tỷ lệ % (0 - 100) so với chiều rộng ảnh
  y: number; // Tỷ lệ % (0 - 100) so với chiều cao ảnh
  width?: number; // % cho circle/box
  height?: number; // %
  points?: { x: number; y: number }[]; // % cho bút vẽ
  text?: string;
  color?: string;
}

export type ActiveTool = 'correct' | 'incorrect' | 'circle' | 'pen' | 'text' | 'view';

interface EssayImageAnnotatorProps {
  images: string[]; // Mảng Base64 hoặc URL ảnh bài làm
  studentName?: string;
  studentCode?: string;
  maxScore?: number;
  score: number;
  onScoreChange: (score: number) => void;
  feedback: string;
  onFeedbackChange: (feedback: string) => void;
  onAIGrade?: (imgBase64: string, rubric: string) => Promise<{ score: number; feedback: string; detail?: any }>;
  rubricText?: string;
  apiKey?: string;
}

export default function EssayImageAnnotator({
  images,
  studentName = 'Học sinh',
  studentCode = '',
  maxScore = 2.0,
  score,
  onScoreChange,
  feedback,
  onFeedbackChange,
  onAIGrade,
  rubricText = '',
  apiKey = '',
}: EssayImageAnnotatorProps) {
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [tool, setTool] = useState<ActiveTool>('correct');
  const [annotations, setAnnotations] = useState<Record<number, Annotation[]>>({});
  const [rotation, setRotation] = useState<Record<number, number>>({});
  const [zoom, setZoom] = useState(1.0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  // Trạng thái vẽ kéo thả (Circle, Pen)
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const curAnnotations = annotations[currentImgIndex] || [];
  const curRotation = rotation[currentImgIndex] || 0;
  const currentImage = images[currentImgIndex];

  // Chuyển đổi tọa độ chuột/chạm thành tỷ lệ % (0 - 100) của ảnh
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!imageRef.current) return null;
    const rect = imageRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    if (
      clientX < rect.left || clientX > rect.right ||
      clientY < rect.top || clientY > rect.bottom
    ) {
      return null;
    }

    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  };

  // ── XỬ LÝ CHẠM VÀO ẢNH ĐỂ ĐÓNG DẤU / KHOANH TRÒN / VẼ ──
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool === 'view' || !currentImage) return;
    const coords = getCoordinates(e);
    if (!coords) return;

    if (tool === 'correct' || tool === 'incorrect') {
      // Đóng dấu ĐÚNG (✓) hoặc SAI (✗)
      const newAnno: Annotation = {
        id: 'anno_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        type: tool,
        x: coords.x,
        y: coords.y,
        color: tool === 'correct' ? '#10b981' : '#ef4444',
      };
      setAnnotations(prev => ({
        ...prev,
        [currentImgIndex]: [...(prev[currentImgIndex] || []), newAnno]
      }));
    } else if (tool === 'text') {
      const note = window.prompt('Nhập lời phê / ghi chú cho học sinh tại đây:');
      if (note && note.trim()) {
        const newAnno: Annotation = {
          id: 'anno_' + Date.now(),
          type: 'text',
          x: coords.x,
          y: coords.y,
          text: note.trim(),
          color: '#ef4444',
        };
        setAnnotations(prev => ({
          ...prev,
          [currentImgIndex]: [...(prev[currentImgIndex] || []), newAnno]
        }));
      }
    } else if (tool === 'circle') {
      setIsDrawing(true);
      setDragStart(coords);
      setDragCurrent(coords);
    } else if (tool === 'pen') {
      setIsDrawing(true);
      setCurrentPath([coords]);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    if (!coords) return;

    if (tool === 'circle') {
      setDragCurrent(coords);
    } else if (tool === 'pen') {
      setCurrentPath(p => [...p, coords]);
    }
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (tool === 'circle' && dragStart && dragCurrent) {
      const minX = Math.min(dragStart.x, dragCurrent.x);
      const minY = Math.min(dragStart.y, dragCurrent.y);
      const width = Math.max(dragStart.x, dragCurrent.x) - minX;
      const height = Math.max(dragStart.y, dragCurrent.y) - minY;

      // Nếu chỉ chạm nhẹ mà không kéo, vẽ vòng tròn mặc định đường kính 7%
      const finalW = width < 1.5 ? 7 : width;
      const finalH = height < 1.5 ? 7 : height;
      const finalX = width < 1.5 ? dragStart.x - finalW / 2 : minX;
      const finalY = height < 1.5 ? dragStart.y - finalH / 2 : minY;

      const newAnno: Annotation = {
        id: 'anno_' + Date.now(),
        type: 'circle',
        x: finalX,
        y: finalY,
        width: finalW,
        height: finalH,
        color: '#ef4444',
      };
      setAnnotations(prev => ({
        ...prev,
        [currentImgIndex]: [...(prev[currentImgIndex] || []), newAnno]
      }));
      setDragStart(null);
      setDragCurrent(null);
    } else if (tool === 'pen' && currentPath.length > 1) {
      const newAnno: Annotation = {
        id: 'anno_' + Date.now(),
        type: 'pen',
        x: currentPath[0].x,
        y: currentPath[0].y,
        points: currentPath,
        color: '#ef4444',
      };
      setAnnotations(prev => ({
        ...prev,
        [currentImgIndex]: [...(prev[currentImgIndex] || []), newAnno]
      }));
      setCurrentPath([]);
    }
  };

  // Hoàn tác dấu vừa chấm
  const handleUndo = () => {
    setAnnotations(prev => {
      const list = prev[currentImgIndex] || [];
      if (list.length === 0) return prev;
      return {
        ...prev,
        [currentImgIndex]: list.slice(0, list.length - 1)
      };
    });
  };

  // Xóa toàn bộ dấu trên trang hiện tại
  const handleClear = () => {
    if (window.confirm('Thầy có chắc chắn muốn xóa toàn bộ các dấu đã chấm trên trang này không?')) {
      setAnnotations(prev => ({
        ...prev,
        [currentImgIndex]: []
      }));
    }
  };

  // Xoay ảnh 90 độ
  const handleRotate = () => {
    setRotation(prev => ({
      ...prev,
      [currentImgIndex]: ((prev[currentImgIndex] || 0) + 90) % 360
    }));
  };

  // Gọi AI chấm tự luận
  const handleTriggerAIGrade = async () => {
    if (!currentImage) {
      toast.error('Chưa có ảnh bài làm để AI chấm!');
      return;
    }
    if (!apiKey) {
      toast.error('Thầy vui lòng nhập Gemini API Key ở ô cấu hình phía trên!');
      return;
    }

    setAiLoading(true);
    const toastId = toast.loading('🤖 AI đang đọc chữ viết tay và chấm bài tự luận...');
    try {
      if (onAIGrade) {
        const result = await onAIGrade(currentImage, rubricText);
        setAiResult(result);
        if (result && typeof result.score === 'number') {
          onScoreChange(Math.min(maxScore, Math.max(0, result.score)));
          if (result.feedback) onFeedbackChange(result.feedback);
        }
        toast.success(`🎉 AI đã chấm xong! Gợi ý: ${result.score}/${maxScore} điểm`, { id: toastId });
      } else {
        toast.success('AI hoàn thành phân tích!', { id: toastId });
      }
    } catch (err: any) {
      toast.error('Lỗi khi chấm AI: ' + (err.message || 'Thử lại sau'), { id: toastId });
    } finally {
      setAiLoading(false);
    }
  };

  // ── XUẤT ẢNH BÀI ĐÃ CHẤM (DOWNLOAD COMPOSITE IMAGE) ──
  const handleExportAnnotatedImage = async () => {
    if (!imageRef.current) return;
    const toastId = toast.loading('Đang xuất ảnh bài chấm...');

    try {
      const img = imageRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Không thể khởi tạo Canvas');

      // Tạo canvas với kích thước gốc của ảnh
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      canvas.width = w;
      canvas.height = h;

      // Xoay nếu có
      ctx.save();
      if (curRotation !== 0) {
        ctx.translate(w / 2, h / 2);
        ctx.rotate((curRotation * Math.PI) / 180);
        if (curRotation === 90 || curRotation === 270) {
          ctx.drawImage(img, -h / 2, -w / 2, h, w);
        } else {
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
        }
      } else {
        ctx.drawImage(img, 0, 0, w, h);
      }
      ctx.restore();

      // Vẽ các dấu chạm lên ảnh theo tọa độ thực tế
      curAnnotations.forEach(a => {
        const px = (a.x / 100) * w;
        const py = (a.y / 100) * h;

        if (a.type === 'correct') {
          // Vẽ dấu tích xanh ✓
          ctx.save();
          ctx.strokeStyle = '#10b981';
          ctx.fillStyle = '#10b981';
          ctx.lineWidth = Math.max(4, w * 0.007);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          const s = Math.max(20, w * 0.035);
          ctx.beginPath();
          ctx.moveTo(px - s * 0.4, py);
          ctx.lineTo(px - s * 0.1, py + s * 0.4);
          ctx.lineTo(px + s * 0.5, py - s * 0.4);
          ctx.stroke();
          ctx.restore();
        } else if (a.type === 'incorrect') {
          // Vẽ dấu ✗ đỏ
          ctx.save();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = Math.max(4, w * 0.007);
          ctx.lineCap = 'round';

          const s = Math.max(16, w * 0.03);
          ctx.beginPath();
          ctx.moveTo(px - s * 0.4, py - s * 0.4);
          ctx.lineTo(px + s * 0.4, py + s * 0.4);
          ctx.moveTo(px + s * 0.4, py - s * 0.4);
          ctx.lineTo(px - s * 0.4, py + s * 0.4);
          ctx.stroke();
          ctx.restore();
        } else if (a.type === 'circle') {
          // Khoanh tròn đỏ
          ctx.save();
          const cw = ((a.width || 8) / 100) * w;
          const ch = ((a.height || 8) / 100) * h;
          ctx.strokeStyle = '#ef4444';
          ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
          ctx.lineWidth = Math.max(3, w * 0.005);
          ctx.beginPath();
          ctx.ellipse(px + cw / 2, py + ch / 2, cw / 2, ch / 2, 0, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        } else if (a.type === 'pen' && a.points && a.points.length > 1) {
          // Bút vẽ tự do
          ctx.save();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = Math.max(3, w * 0.005);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          a.points.forEach((pt, idx) => {
            const rx = (pt.x / 100) * w;
            const ry = (pt.y / 100) * h;
            if (idx === 0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
          });
          ctx.stroke();
          ctx.restore();
        } else if (a.type === 'text' && a.text) {
          // Nhãn ghi chú
          ctx.save();
          const fontSize = Math.max(16, w * 0.024);
          ctx.font = `bold ${fontSize}px sans-serif`;
          const textWidth = ctx.measureText(a.text).width;
          const pad = 8;

          ctx.fillStyle = '#fee2e2';
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.fillRect(px, py - fontSize - pad, textWidth + pad * 2, fontSize + pad * 1.5);
          ctx.strokeRect(px, py - fontSize - pad, textWidth + pad * 2, fontSize + pad * 1.5);

          ctx.fillStyle = '#b91c1c';
          ctx.fillText(a.text, px + pad, py - pad * 0.5);
          ctx.restore();
        }
      });

      // ── CON DẤU GIÁO VIÊN Ở GÓC TRÊN CÙNG BÊN PHẢI ──
      ctx.save();
      const stampW = Math.max(220, w * 0.32);
      const stampH = Math.max(80, w * 0.12);
      const stampX = w - stampW - 24;
      const stampY = 24;

      // Nền khung điểm
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = '#0d9488';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(stampX, stampY, stampW, stampH, 16) : ctx.rect(stampX, stampY, stampW, stampH);
      ctx.fill();
      ctx.stroke();

      // Tiêu đề giáo viên
      ctx.fillStyle = '#0f766e';
      ctx.font = `bold ${Math.max(14, w * 0.02)}px sans-serif`;
      ctx.fillText(`THẦY THỌ CHẤM BÀI`, stampX + 16, stampY + 28);

      // Điểm số
      ctx.fillStyle = '#dc2626';
      ctx.font = `900 ${Math.max(24, w * 0.038)}px sans-serif`;
      ctx.fillText(`${score.toFixed(2)} / ${maxScore} đ`, stampX + 16, stampY + stampH - 18);
      ctx.restore();

      // Tải ảnh về máy
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `BaiCham_${studentName.replace(/\s+/g, '_')}_Trang${currentImgIndex + 1}.png`;
      a.click();
      toast.success('Đã xuất ảnh bài chấm thành công!', { id: toastId });
    } catch (err: any) {
      toast.error('Lỗi khi xuất ảnh: ' + err.message, { id: toastId });
    }
  };

  if (!images || images.length === 0) {
    return (
      <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center text-slate-400">
        <div className="text-5xl mb-3">📸</div>
        <p className="font-extrabold text-base text-slate-600">Chưa có ảnh chụp bài làm tự luận</p>
        <p className="text-xs text-slate-400 mt-1">
          Học sinh có thể tải ảnh lên từ điện thoại hoặc Thầy chụp ảnh bài làm đính kèm vào đây.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 bg-white rounded-3xl border border-teal-100 shadow-sm p-4">
      {/* ── THANH CÔNG CỤ CHẠM TRỰC QUAN ── */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
        {/* Nhóm công cụ vẽ / chạm */}
        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl">
          <button
            onClick={() => setTool('correct')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
              tool === 'correct'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 hover:bg-white'
            }`}
            title="Chạm vào ảnh để đánh dấu Đúng (✓)"
          >
            <Check className="w-4 h-4 stroke-[3px]" />
            <span>✓ Đúng</span>
          </button>

          <button
            onClick={() => setTool('incorrect')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
              tool === 'incorrect'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'text-slate-600 hover:bg-white'
            }`}
            title="Chạm vào ảnh để đánh dấu Sai (✗)"
          >
            <X className="w-4 h-4 stroke-[3px]" />
            <span>✗ Sai</span>
          </button>

          <button
            onClick={() => setTool('circle')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
              tool === 'circle'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                : 'text-slate-600 hover:bg-white'
            }`}
            title="Khoanh tròn chỗ sai (kéo hoặc chạm vào vị trí sai)"
          >
            <Circle className="w-4 h-4 stroke-[2.5px]" />
            <span>⭕ Khoanh sai</span>
          </button>

          <button
            onClick={() => setTool('pen')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
              tool === 'pen'
                ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                : 'text-slate-600 hover:bg-white'
            }`}
            title="Bút vẽ tự do để gạch chân hoặc ghi chú"
          >
            <PenTool className="w-4 h-4" />
            <span>✏️ Bút vẽ</span>
          </button>

          <button
            onClick={() => setTool('text')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
              tool === 'text'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'text-slate-600 hover:bg-white'
            }`}
            title="Chạm để ghim lời phê / ghi chú"
          >
            <Type className="w-4 h-4" />
            <span>💬 Ghi chú</span>
          </button>

          <button
            onClick={() => setTool('view')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
              tool === 'view'
                ? 'bg-teal-700 text-white'
                : 'text-slate-600 hover:bg-white'
            }`}
            title="Chế độ xem phóng to/cuộn ảnh bình thường"
          >
            <Eye className="w-4 h-4" />
            <span>Xem</span>
          </button>
        </div>

        {/* Nhóm thao tác hỗ trợ: Xoay, Zoom, Undo, Xóa, Tải ảnh */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleUndo}
            disabled={curAnnotations.length === 0}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-all cursor-pointer"
            title="Hoàn tác dấu vừa chấm (Undo)"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleClear}
            disabled={curAnnotations.length === 0}
            className="p-2 rounded-xl text-slate-600 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-all cursor-pointer"
            title="Xóa toàn bộ dấu trên ảnh"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          <button
            onClick={handleRotate}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
            title="Xoay ảnh 90 độ"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setZoom(z => Math.min(2.5, z + 0.25))}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
            title="Phóng to ảnh"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            onClick={() => setZoom(z => Math.max(0.75, z - 0.25))}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
            title="Thu nhỏ ảnh"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          {/* Nút AI Chấm Tự Luận */}
          <button
            onClick={handleTriggerAIGrade}
            disabled={aiLoading}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            title="Trí tuệ nhân tạo Gemini đọc chữ viết tay và gợi ý điểm tự luận"
          >
            <Sparkles className="w-4 h-4 animate-pulse text-amber-300" />
            <span>{aiLoading ? 'AI đang đọc...' : '🤖 AI Chấm Tự Luận'}</span>
          </button>

          {/* Nút Tải ảnh đã chấm */}
          <button
            onClick={handleExportAnnotatedImage}
            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            title="Tải về file ảnh đã có dấu khoanh đỏ và điểm của Thầy"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Xuất ảnh bài chấm</span>
          </button>
        </div>
      </div>

      {/* ── BỘ ĐIỀU HƯỚNG TRANG ẢNH (NẾU HỌC SINH NỘP NHIỀU ẢNH) ── */}
      {images.length > 1 && (
        <div className="flex items-center justify-between bg-slate-50 px-4 py-2 rounded-2xl text-xs font-bold text-slate-600">
          <div className="flex items-center gap-2">
            <span>Trang bài làm:</span>
            <div className="flex gap-1.5">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentImgIndex(idx)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-extrabold transition-all cursor-pointer ${
                    currentImgIndex === idx
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[11px] text-slate-400">
            Tổng cộng: {images.length} ảnh bài làm
          </span>
        </div>
      )}

      {/* ── KHU VỰC HIỂN THỊ ẢNH & CANVAS TƯƠNG TÁC ── */}
      <div
        ref={containerRef}
        className="relative overflow-auto max-h-[620px] bg-slate-900/90 rounded-2xl flex items-center justify-center p-4 border border-slate-800 select-none"
        style={{ cursor: tool === 'view' ? 'default' : 'crosshair' }}
      >
        <div
          className="relative inline-block transition-transform duration-150 origin-center"
          style={{
            transform: `scale(${zoom}) rotate(${curRotation}deg)`,
          }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        >
          {/* Ảnh gốc bài làm */}
          <img
            ref={imageRef}
            src={currentImage}
            alt="Bài làm tự luận học sinh"
            className="max-w-full h-auto block rounded-lg shadow-2xl pointer-events-none"
            style={{ maxHeight: '70vh' }}
          />

          {/* SVG Lớp phủ các dấu chấm đã lưu */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {curAnnotations.map(anno => {
              if (anno.type === 'correct') {
                return (
                  <g key={anno.id} transform={`translate(${anno.x}, ${anno.y})`}>
                    <circle r="2.2" fill="#10b981" />
                    <path
                      d="M -1.2 0 L -0.3 0.9 L 1.3 -0.8"
                      stroke="white"
                      strokeWidth="0.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </g>
                );
              }
              if (anno.type === 'incorrect') {
                return (
                  <g key={anno.id} transform={`translate(${anno.x}, ${anno.y})`}>
                    <circle r="2.2" fill="#ef4444" />
                    <path
                      d="M -0.9 -0.9 L 0.9 0.9 M 0.9 -0.9 L -0.9 0.9"
                      stroke="white"
                      strokeWidth="0.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </g>
                );
              }
              if (anno.type === 'circle') {
                const rx = (anno.width || 8) / 2;
                const ry = (anno.height || 8) / 2;
                return (
                  <ellipse
                    key={anno.id}
                    cx={anno.x + rx}
                    cy={anno.y + ry}
                    rx={rx}
                    ry={ry}
                    fill="rgba(239, 68, 68, 0.15)"
                    stroke="#ef4444"
                    strokeWidth="0.7"
                    strokeDasharray="none"
                  />
                );
              }
              if (anno.type === 'pen' && anno.points && anno.points.length > 1) {
                const d = anno.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                return (
                  <path
                    key={anno.id}
                    d={d}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="0.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              }
              if (anno.type === 'text' && anno.text) {
                return (
                  <g key={anno.id} transform={`translate(${anno.x}, ${anno.y})`}>
                    <rect
                      x="0"
                      y="-3.5"
                      width={Math.max(12, anno.text.length * 1.3 + 2)}
                      height="4.2"
                      rx="0.8"
                      fill="#fee2e2"
                      stroke="#ef4444"
                      strokeWidth="0.3"
                    />
                    <text
                      x="1"
                      y="-1"
                      fontSize="2.4"
                      fontWeight="bold"
                      fill="#b91c1c"
                    >
                      {anno.text}
                    </text>
                  </g>
                );
              }
              return null;
            })}

            {/* Xem trước khi đang kéo chuột khoanh tròn */}
            {isDrawing && tool === 'circle' && dragStart && dragCurrent && (
              <rect
                x={Math.min(dragStart.x, dragCurrent.x)}
                y={Math.min(dragStart.y, dragCurrent.y)}
                width={Math.abs(dragCurrent.x - dragStart.x)}
                height={Math.abs(dragCurrent.y - dragStart.y)}
                rx="3"
                fill="rgba(239, 68, 68, 0.12)"
                stroke="#ef4444"
                strokeWidth="0.5"
                strokeDasharray="2,2"
              />
            )}

            {/* Xem trước khi đang vẽ bút tự do */}
            {isDrawing && tool === 'pen' && currentPath.length > 1 && (
              <path
                d={currentPath.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                fill="none"
                stroke="#ef4444"
                strokeWidth="0.6"
                strokeLinecap="round"
              />
            )}
          </svg>
        </div>
      </div>

      {/* ── BẢNG ĐIỀU KHIỂN ĐIỂM SỐ TỰ LUẬN & NHẬN XÉT ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
        {/* Cột 1: Nhập điểm tự luận */}
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <Award className="w-4 h-4 text-teal-600" />
              Điểm Tự Luận:
            </label>
            <span className="text-xs font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-lg">
              Tối đa: {maxScore} đ
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.25"
              min="0"
              max={maxScore}
              value={score}
              onChange={e => onScoreChange(Math.min(maxScore, Math.max(0, Number(e.target.value) || 0)))}
              className="w-24 text-2xl font-black text-teal-800 bg-white border-2 border-teal-200 rounded-xl px-3 py-1.5 text-center focus:outline-teal-600"
            />
            <div className="flex flex-wrap gap-1 flex-1">
              {[0.25, 0.5, 0.75, 1.0, 1.5, maxScore].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onScoreChange(val)}
                  className={`text-[11px] font-bold px-2 py-1 rounded-lg transition-all cursor-pointer ${
                    score === val
                      ? 'bg-teal-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-teal-50'
                  }`}
                >
                  {val === maxScore ? 'Tối đa' : `+${val}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Cột 2 & 3: Lời phê & Nhận xét của Thầy */}
        <div className="md:col-span-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wide">
              Nhận xét bài làm của Thầy:
            </label>
            {aiResult?.feedback && (
              <button
                type="button"
                onClick={() => onFeedbackChange(aiResult.feedback)}
                className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                ✨ Lấy nhận xét từ AI
              </button>
            )}
          </div>
          <textarea
            rows={2}
            value={feedback}
            onChange={e => onFeedbackChange(e.target.value)}
            placeholder="Nhận xét ưu điểm, chỉ ra bước tính toán sai hoặc lời khuyên ôn tập..."
            className="w-full bg-white text-xs font-medium text-slate-800 border border-slate-200 rounded-xl p-2.5 focus:outline-teal-600 resize-none leading-relaxed"
          />
        </div>
      </div>

      {/* Hiển thị chi tiết AI nếu có */}
      {aiResult && (
        <div className="bg-indigo-50/70 border border-indigo-200 p-3.5 rounded-2xl text-xs space-y-2">
          <div className="flex items-center justify-between text-indigo-950 font-bold">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Gợi ý chấm từ Trí tuệ nhân tạo (Gemini AI):
            </span>
            <span className="text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded-full font-black">
              {aiResult.score} / {maxScore} đ
            </span>
          </div>
          <p className="text-slate-700 leading-relaxed font-medium">
            {aiResult.feedback}
          </p>
          {aiResult.detail && Array.isArray(aiResult.detail) && (
            <div className="space-y-1 pt-1">
              {aiResult.detail.map((d: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-slate-600">
                  <span className={d.score > 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                    {d.score > 0 ? '✓' : '✗'}
                  </span>
                  <span>{d.comment || d.text || `Ý ${idx + 1}`}</span>
                  <span className="text-slate-400 font-mono text-[11px]">({d.score}đ)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
