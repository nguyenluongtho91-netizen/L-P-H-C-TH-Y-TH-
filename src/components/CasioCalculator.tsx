// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import {
  X, Minus, Maximize2, Minimize2, Volume2, VolumeX,
  RotateCcw, Sparkles, BookOpen, Atom, HelpCircle, GripHorizontal
} from 'lucide-react';

interface CasioCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'compact' | 'full';
}

// Bảng nguyên tử khối thông dụng cho Hóa học
const COMMON_ELEMENTS = [
  { symbol: 'H', name: 'Hydrogen', m: 1 },
  { symbol: 'C', name: 'Carbon', m: 12 },
  { symbol: 'N', name: 'Nitrogen', m: 14 },
  { symbol: 'O', name: 'Oxygen', m: 16 },
  { symbol: 'Na', name: 'Sodium', m: 23 },
  { symbol: 'Mg', name: 'Magnesium', m: 24 },
  { symbol: 'Al', name: 'Aluminium', m: 27 },
  { symbol: 'P', name: 'Phosphorus', m: 31 },
  { symbol: 'S', name: 'Sulfur', m: 32 },
  { symbol: 'Cl', name: 'Chlorine', m: 35.5 },
  { symbol: 'K', name: 'Potassium', m: 39 },
  { symbol: 'Ca', name: 'Calcium', m: 40 },
  { symbol: 'Fe', name: 'Iron', m: 56 },
  { symbol: 'Cu', name: 'Copper', m: 64 },
  { symbol: 'Zn', name: 'Zinc', m: 65 },
  { symbol: 'Br', name: 'Bromine', m: 80 },
  { symbol: 'Ag', name: 'Silver', m: 108 },
  { symbol: 'Ba', name: 'Barium', m: 137 },
];

const COMMON_COMPOUNDS = [
  { formula: 'H2O', name: 'Nước', m: 18 },
  { formula: 'CO2', name: 'Khí cacbonic', m: 44 },
  { formula: 'NaCl', name: 'Muối ăn', m: 58.5 },
  { formula: 'NaOH', name: 'Xút ăn da', m: 40 },
  { formula: 'HCl', name: 'Axit clohidric', m: 36.5 },
  { formula: 'H2SO4', name: 'Axit sunfuric', m: 98 },
  { formula: 'HNO3', name: 'Axit nitric', m: 63 },
  { formula: 'CaCO3', name: 'Đá vôi', m: 100 },
  { formula: 'CuSO4', name: 'Đồng(II) sunfat', m: 160 },
  { formula: 'Fe2O3', name: 'Sắt(III) oxit', m: 160 },
  { formula: 'Al2O3', name: 'Nhôm oxit', m: 102 },
  { formula: 'BaSO4', name: 'Bari sunfat', m: 233 },
];

export default function CasioCalculator({ isOpen, onClose }: CasioCalculatorProps) {
  // Trạng thái màn hình
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('0');
  const [ans, setAns] = useState('0');
  const [angleUnit, setAngleUnit] = useState<'DEG' | 'RAD'>('DEG');
  const [isShift, setIsShift] = useState(false);
  const [isAlpha, setIsAlpha] = useState(false);
  const [fractionMode, setFractionMode] = useState(false); // S<=>D mode
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [history, setHistory] = useState<Array<{ expr: string; res: string }>>([]);

  // Chế độ: 'COMP' (tính toán), 'EQN' (giải phương trình), 'CHEM' (tra cứu Hóa)
  const [activeTab, setActiveTab] = useState<'COMP' | 'EQN' | 'CHEM'>('COMP');

  // Phương trình bậc 2: ax^2 + bx + c = 0
  const [eqA, setEqA] = useState('');
  const [eqB, setEqB] = useState('');
  const [eqC, setEqC] = useState('');
  const [eqResult, setEqResult] = useState<any>(null);

  // Hệ phương trình 2 ẩn
  const [simA1, setSimA1] = useState('');
  const [simB1, setSimB1] = useState('');
  const [simC1, setSimC1] = useState('');
  const [simA2, setSimA2] = useState('');
  const [simB2, setSimB2] = useState('');
  const [simC2, setSimC2] = useState('');
  const [simResult, setSimResult] = useState<any>(null);

  // Kéo thả vị trí (Draggable)
  const [position, setPosition] = useState({ x: 40, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({ startX: 0, startY: 0, posX: 40, posY: 80 });

  // Phát âm thanh bấm phím Casio
  const playKeySound = () => {
    if (!isSoundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {}
  };

  // Xử lý kéo thả
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({
        x: Math.max(10, Math.min(window.innerWidth - 380, dragRef.current.posX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 560, dragRef.current.posY + dy))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Hỗ trợ gõ bàn phím máy tính
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key >= '0' && e.key <= '9') {
        inputChar(e.key);
      } else if (['+', '-', '*', '/'].includes(e.key)) {
        const opMap: Record<string, string> = { '*': '×', '/': '÷', '+': '+', '-': '-' };
        inputChar(opMap[e.key] || e.key);
      } else if (e.key === '.' || e.key === ',') {
        inputChar('.');
      } else if (e.key === '(' || e.key === ')') {
        inputChar(e.key);
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        calculate();
      } else if (e.key === 'Backspace') {
        deleteChar();
      } else if (e.key === 'Escape') {
        clearAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, expression, ans]);

  // Thêm ký tự vào biểu thức
  const inputChar = (char: string) => {
    playKeySound();
    setExpression(prev => prev + char);
  };

  // Thêm hàm vào biểu thức
  const inputFunc = (func: string) => {
    playKeySound();
    setExpression(prev => prev + func + '(');
  };

  // Xóa 1 ký tự (DEL)
  const deleteChar = () => {
    playKeySound();
    setExpression(prev => prev.slice(0, -1));
  };

  // Xóa toàn bộ (AC)
  const clearAll = () => {
    playKeySound();
    setExpression('');
    setResult('0');
    setFractionMode(false);
  };

  // Tính toán kết quả biểu thức
  const calculate = () => {
    playKeySound();
    if (!expression.trim()) return;

    try {
      let expr = expression;

      // Thay thế các ký hiệu Casio sang toán học JavaScript
      expr = expr.replace(/×/g, '*').replace(/÷/g, '/');
      expr = expr.replace(/π/g, 'Math.PI').replace(/e/g, 'Math.E');
      expr = expr.replace(/Ans/g, `(${ans})`);

      // Hàm lượng giác theo Deg / Rad
      if (angleUnit === 'DEG') {
        expr = expr.replace(/sin\(([^)]+)\)/g, 'Math.sin(($1) * Math.PI / 180)');
        expr = expr.replace(/cos\(([^)]+)\)/g, 'Math.cos(($1) * Math.PI / 180)');
        expr = expr.replace(/tan\(([^)]+)\)/g, 'Math.tan(($1) * Math.PI / 180)');
      } else {
        expr = expr.replace(/sin\(/g, 'Math.sin(');
        expr = expr.replace(/cos\(/g, 'Math.cos(');
        expr = expr.replace(/tan\(/g, 'Math.tan(');
      }

      expr = expr.replace(/asin\(/g, 'Math.asin(');
      expr = expr.replace(/acos\(/g, 'Math.acos(');
      expr = expr.replace(/atan\(/g, 'Math.atan(');

      expr = expr.replace(/√\(([^)]+)\)/g, 'Math.sqrt($1)');
      expr = expr.replace(/sqrt\(/g, 'Math.sqrt(');
      expr = expr.replace(/ln\(/g, 'Math.log(');
      expr = expr.replace(/log\(([^)]+)\)/g, 'Math.log10($1)');
      expr = expr.replace(/\^/g, '**');

      // Tự động đóng dấu ngoặc còn thiếu
      const openCount = (expr.match(/\(/g) || []).length;
      const closeCount = (expr.match(/\)/g) || []).length;
      if (openCount > closeCount) {
        expr += ')'.repeat(openCount - closeCount);
      }

      // Đánh giá biểu thức
      const evalResult = Function(`"use strict"; return (${expr})`)();

      if (typeof evalResult === 'number' && !isNaN(evalResult) && isFinite(evalResult)) {
        // Làm tròn số gọn gàng (tối đa 10 chữ số thập phân)
        const formatted = Math.abs(evalResult) < 1e-10 && evalResult !== 0
          ? evalResult.toExponential(4)
          : parseFloat(evalResult.toFixed(10)).toString();

        setResult(formatted);
        setAns(formatted);
        setFractionMode(false);
        setHistory(prev => [{ expr: expression, res: formatted }, ...prev.slice(0, 9)]);
      } else {
        setResult('Math ERROR');
      }
    } catch {
      setResult('Syntax ERROR');
    }
  };

  // Chuyển đổi Phân số <=> Thập phân (Nút S<=>D)
  const toggleFraction = () => {
    playKeySound();
    const val = parseFloat(result);
    if (isNaN(val)) return;

    if (!fractionMode) {
      // Tìm phân số xấp xỉ
      const frac = toFraction(val);
      if (frac) {
        setResult(frac);
        setFractionMode(true);
      }
    } else {
      // Trả lại dạng số thập phân
      setResult(ans);
      setFractionMode(false);
    }
  };

  // Thuật toán chuyển số thập phân thành phân số a/b
  const toFraction = (decimal: number): string | null => {
    if (Number.isInteger(decimal)) return null;
    const sign = decimal < 0 ? '-' : '';
    const num = Math.abs(decimal);
    const tolerance = 1.0E-6;
    let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
    let b = num;

    do {
      const a = Math.floor(b);
      let aux = h1;
      h1 = a * h1 + h2;
      h2 = aux;
      aux = k1;
      k1 = a * k1 + k2;
      k2 = aux;
      b = 1 / (b - a);
    } while (Math.abs(num - h1 / k1) > num * tolerance && k1 < 10000);

    return `${sign}${h1}/${k1}`;
  };

  // Giải phương trình bậc 2: ax^2 + bx + c = 0
  const solveQuadratic = () => {
    playKeySound();
    const a = parseFloat(eqA);
    const b = parseFloat(eqB);
    const c = parseFloat(eqC);

    if (isNaN(a) || isNaN(b) || isNaN(c)) {
      setEqResult({ error: 'Vui lòng nhập đầy đủ hệ số a, b, c' });
      return;
    }
    if (a === 0) {
      if (b === 0) {
        setEqResult({ error: c === 0 ? 'Phương trình vô số nghiệm' : 'Phương trình vô nghiệm' });
      } else {
        const x = -c / b;
        setEqResult({ type: 'linear', x: parseFloat(x.toFixed(6)) });
      }
      return;
    }

    const delta = b * b - 4 * a * c;
    const xVertex = -b / (2 * a);
    const yVertex = -delta / (4 * a);

    if (delta > 0) {
      const x1 = (-b + Math.sqrt(delta)) / (2 * a);
      const x2 = (-b - Math.sqrt(delta)) / (2 * a);
      setEqResult({
        type: 'two_roots',
        x1: parseFloat(x1.toFixed(6)),
        x2: parseFloat(x2.toFixed(6)),
        delta: parseFloat(delta.toFixed(4)),
        vertex: { x: parseFloat(xVertex.toFixed(4)), y: parseFloat(yVertex.toFixed(4)) }
      });
    } else if (delta === 0) {
      const x = -b / (2 * a);
      setEqResult({
        type: 'one_root',
        x: parseFloat(x.toFixed(6)),
        delta: 0,
        vertex: { x: parseFloat(xVertex.toFixed(4)), y: parseFloat(yVertex.toFixed(4)) }
      });
    } else {
      const real = -b / (2 * a);
      const imag = Math.sqrt(-delta) / (2 * a);
      setEqResult({
        type: 'complex',
        real: parseFloat(real.toFixed(4)),
        imag: parseFloat(Math.abs(imag).toFixed(4)),
        delta: parseFloat(delta.toFixed(4))
      });
    }
  };

  // Giải hệ phương trình 2 ẩn
  const solveSimultaneous = () => {
    playKeySound();
    const a1 = parseFloat(simA1), b1 = parseFloat(simB1), c1 = parseFloat(simC1);
    const a2 = parseFloat(simA2), b2 = parseFloat(simB2), c2 = parseFloat(simC2);

    if ([a1, b1, c1, a2, b2, c2].some(v => isNaN(v))) {
      setSimResult({ error: 'Vui lòng nhập đầy đủ 6 hệ số' });
      return;
    }

    const D = a1 * b2 - a2 * b1;
    const Dx = c1 * b2 - c2 * b1;
    const Dy = a1 * c2 - a2 * c1;

    if (D === 0) {
      if (Dx === 0 && Dy === 0) {
        setSimResult({ error: 'Hệ phương trình có vô số nghiệm' });
      } else {
        setSimResult({ error: 'Hệ phương trình vô nghiệm' });
      }
    } else {
      const x = Dx / D;
      const y = Dy / D;
      setSimResult({
        x: parseFloat(x.toFixed(6)),
        y: parseFloat(y.toFixed(6))
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className="fixed z-50 w-[360px] sm:w-[380px] select-none shadow-2xl rounded-3xl bg-slate-900 border-2 border-slate-700/80 backdrop-blur-xl text-slate-100 font-sans overflow-hidden transition-shadow hover:shadow-indigo-500/20"
    >
      {/* --- THANH TIÊU ĐỀ KÉO THẢ (CASIO HEADER) --- */}
      <div
        onMouseDown={handleMouseDown}
        className="px-4 py-2.5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between cursor-move"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-4 h-4 text-slate-500" />
          <div className="flex items-baseline gap-1.5">
            <span className="font-black text-xs text-white tracking-wider">CASIO</span>
            <span className="text-[11px] font-bold text-amber-400">fx-580VN X</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/30 text-indigo-300 font-bold">CLASSWIZ</span>
          </div>
        </div>

        {/* Nút điều khiển cửa sổ */}
        <div className="flex items-center gap-1.5 no-drag">
          <button
            onClick={() => setIsSoundEnabled(!isSoundEnabled)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title={isSoundEnabled ? 'Tắt âm thanh phím' : 'Bật âm thanh phím'}
          >
            {isSoundEnabled ? <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setAngleUnit(angleUnit === 'DEG' ? 'RAD' : 'DEG')}
            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 transition"
            title="Đổi đơn vị góc (Độ / Radian)"
          >
            {angleUnit}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
            title="Đóng máy tính"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* --- CHUYỂN TAB CHẾ ĐỘ: TÍNH TOÁN | GIẢI PT | HÓA HỌC --- */}
      <div className="flex bg-slate-950/80 px-2 pt-2 border-b border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('COMP')}
          className={`flex-1 py-1.5 rounded-t-lg transition flex items-center justify-center gap-1 text-[11px] ${
            activeTab === 'COMP' ? 'bg-slate-800 text-white border-t border-x border-slate-700' : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>Tính toán (COMP)</span>
        </button>
        <button
          onClick={() => setActiveTab('EQN')}
          className={`flex-1 py-1.5 rounded-t-lg transition flex items-center justify-center gap-1 text-[11px] ${
            activeTab === 'EQN' ? 'bg-slate-800 text-white border-t border-x border-slate-700' : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>Giải PT / Hệ PT</span>
        </button>
        <button
          onClick={() => setActiveTab('CHEM')}
          className={`flex-1 py-1.5 rounded-t-lg transition flex items-center justify-center gap-1 text-[11px] ${
            activeTab === 'CHEM' ? 'bg-slate-800 text-white border-t border-x border-slate-700' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Atom className="w-3 h-3 text-cyan-400" />
          <span>Bảng M_mol Hóa</span>
        </button>
      </div>

      <div className="p-3 bg-gradient-to-b from-slate-900 to-slate-950">
        {/* ================= TAB 1: TÍNH TOÁN KHOA HỌC CASIO ================= */}
        {activeTab === 'COMP' && (
          <div className="space-y-2.5">
            {/* --- MÀN HÌNH LCD CHÂN THỰC (NATURAL-V.P.A.M DISPLAY) --- */}
            <div className="bg-[#c2d7cd] text-slate-950 p-2.5 rounded-xl border-2 border-slate-600 shadow-inner font-mono relative">
              {/* Thanh trạng thái LCD Casio */}
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 mb-1 border-b border-slate-400/40 pb-0.5">
                <div className="flex gap-2">
                  <span className={angleUnit === 'DEG' ? 'font-black text-slate-950' : 'text-slate-500'}>DEG</span>
                  <span className={angleUnit === 'RAD' ? 'font-black text-slate-950' : 'text-slate-500'}>RAD</span>
                  {isShift && <span className="bg-amber-600 text-white px-1 rounded text-[9px]">S</span>}
                  {isAlpha && <span className="bg-rose-600 text-white px-1 rounded text-[9px]">A</span>}
                </div>
                <div className="flex gap-2">
                  <span>MATH</span>
                  <span className="text-[9px] text-slate-600">NATURAL-V.P.A.M</span>
                </div>
              </div>

              {/* Dòng biểu thức nhập (Input) */}
              <div className="text-right text-xs text-slate-800 min-h-[22px] tracking-wider overflow-x-auto whitespace-nowrap scrollbar-none font-medium">
                {expression || <span className="text-slate-500">0</span>}
              </div>

              {/* Dòng kết quả (Output) */}
              <div className="text-right text-2xl font-black tracking-tight text-slate-950 mt-1 min-h-[36px] flex items-center justify-end overflow-hidden">
                {result}
              </div>
            </div>

            {/* --- BÀN PHÍM CASIO CHUẨN FX-580VN X --- */}
            <div className="space-y-1.5 no-drag text-xs">
              {/* Hàng 1: SHIFT, ALPHA, D-PAD, OPTN, MENU, ON */}
              <div className="grid grid-cols-6 gap-1.5">
                <button
                  onClick={() => setIsShift(!isShift)}
                  className={`py-1.5 rounded-lg font-bold text-[10px] shadow transition active:scale-95 ${
                    isShift ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-amber-400 hover:bg-slate-700'
                  }`}
                >
                  SHIFT
                </button>
                <button
                  onClick={() => setIsAlpha(!isAlpha)}
                  className={`py-1.5 rounded-lg font-bold text-[10px] shadow transition active:scale-95 ${
                    isAlpha ? 'bg-rose-500 text-white font-black' : 'bg-slate-800 text-rose-400 hover:bg-slate-700'
                  }`}
                >
                  ALPHA
                </button>
                <button
                  onClick={() => inputChar('(')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px]"
                >
                  (
                </button>
                <button
                  onClick={() => inputChar(')')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px]"
                >
                  )
                </button>
                <button
                  onClick={() => setActiveTab('EQN')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-[10px]"
                >
                  MENU
                </button>
                <button
                  onClick={clearAll}
                  className="py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 font-bold text-[10px] border border-rose-500/30"
                >
                  ON
                </button>
              </div>

              {/* Hàng 2: Hàm khoa học (sqrt, x^2, x^y, log, ln, S<=>D) */}
              <div className="grid grid-cols-6 gap-1.5">
                <button
                  onClick={() => inputFunc('sqrt')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                >
                  √
                </button>
                <button
                  onClick={() => inputChar('^2')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                >
                  x²
                </button>
                <button
                  onClick={() => inputChar('^')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                >
                  xⁿ
                </button>
                <button
                  onClick={() => inputFunc('log')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[10px]"
                >
                  log
                </button>
                <button
                  onClick={() => inputFunc('ln')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[10px]"
                >
                  ln
                </button>
                <button
                  onClick={toggleFraction}
                  className={`py-1.5 rounded-lg font-bold text-[10px] border transition active:scale-95 ${
                    fractionMode ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-800 text-amber-300 border-amber-500/40 hover:bg-slate-700'
                  }`}
                  title="Chuyển đổi Phân số sang Số thập phân"
                >
                  S⇔D
                </button>
              </div>

              {/* Hàng 3: Lượng giác (sin, cos, tan, pi, e, %) */}
              <div className="grid grid-cols-6 gap-1.5">
                <button
                  onClick={() => inputFunc(isShift ? 'asin' : 'sin')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 font-semibold text-[11px]"
                >
                  {isShift ? 'sin⁻¹' : 'sin'}
                </button>
                <button
                  onClick={() => inputFunc(isShift ? 'acos' : 'cos')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 font-semibold text-[11px]"
                >
                  {isShift ? 'cos⁻¹' : 'cos'}
                </button>
                <button
                  onClick={() => inputFunc(isShift ? 'atan' : 'tan')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 font-semibold text-[11px]"
                >
                  {isShift ? 'tan⁻¹' : 'tan'}
                </button>
                <button
                  onClick={() => inputChar('π')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-[11px]"
                >
                  π
                </button>
                <button
                  onClick={() => inputChar('e')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-[11px]"
                >
                  e
                </button>
                <button
                  onClick={() => inputChar('%')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[11px]"
                >
                  %
                </button>
              </div>

              {/* BÀN PHÍM SỐ VÀ PHÉP TOÁN (7-8-9-DEL-AC) */}
              <div className="pt-1 space-y-1.5">
                <div className="grid grid-cols-5 gap-1.5">
                  <button onClick={() => inputChar('7')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow">7</button>
                  <button onClick={() => inputChar('8')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow">8</button>
                  <button onClick={() => inputChar('9')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow">9</button>
                  <button onClick={deleteChar} className="py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow">DEL</button>
                  <button onClick={clearAll} className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow">AC</button>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  <button onClick={() => inputChar('4')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow">4</button>
                  <button onClick={() => inputChar('5')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow">5</button>
                  <button onClick={() => inputChar('6')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow">6</button>
                  <button onClick={() => inputChar('×')} className="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-indigo-300 font-bold text-base shadow">×</button>
                  <button onClick={() => inputChar('÷')} className="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-indigo-300 font-bold text-base shadow">÷</button>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  <button onClick={() => inputChar('1')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow">1</button>
                  <button onClick={() => inputChar('2')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow">2</button>
                  <button onClick={() => inputChar('3')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow">3</button>
                  <button onClick={() => inputChar('+')} className="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-indigo-300 font-bold text-base shadow">+</button>
                  <button onClick={() => inputChar('-')} className="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-indigo-300 font-bold text-base shadow">-</button>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  <button onClick={() => inputChar('0')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow">0</button>
                  <button onClick={() => inputChar('.')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow">.</button>
                  <button onClick={() => inputChar('*10^')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs shadow">×10ˣ</button>
                  <button onClick={() => inputChar('Ans')} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs shadow">Ans</button>
                  <button onClick={calculate} className="py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white font-black text-lg shadow-lg shadow-indigo-600/30 transition transform active:scale-95">=</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: GIẢI PHƯƠNG TRÌNH & HỆ PHƯƠNG TRÌNH ================= */}
        {activeTab === 'EQN' && (
          <div className="space-y-3 text-xs">
            {/* Mục 1: Phương trình bậc 2 (ax² + bx + c = 0) */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="font-bold text-amber-400 block text-[11px] uppercase tracking-wider">
                1. Phương trình bậc 2: ax² + bx + c = 0
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block">Hệ số a:</label>
                  <input
                    type="number"
                    value={eqA}
                    onChange={(e) => setEqA(e.target.value)}
                    placeholder="a"
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-center font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Hệ số b:</label>
                  <input
                    type="number"
                    value={eqB}
                    onChange={(e) => setEqB(e.target.value)}
                    placeholder="b"
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-center font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Hệ số c:</label>
                  <input
                    type="number"
                    value={eqC}
                    onChange={(e) => setEqC(e.target.value)}
                    placeholder="c"
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-center font-bold"
                  />
                </div>
              </div>

              <button
                onClick={solveQuadratic}
                className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow transition active:scale-95"
              >
                Giải nghiệm bậc 2 (SOLVE)
              </button>

              {eqResult && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-indigo-500/30 text-[11px]">
                  {eqResult.error && <span className="text-rose-400 font-medium">{eqResult.error}</span>}
                  {eqResult.type === 'two_roots' && (
                    <div className="space-y-1 font-mono">
                      <div className="text-emerald-400 font-bold">x₁ = {eqResult.x1}</div>
                      <div className="text-emerald-400 font-bold">x₂ = {eqResult.x2}</div>
                      <div className="text-slate-400 text-[10px]">Δ = {eqResult.delta} | Đỉnh ({eqResult.vertex.x}, {eqResult.vertex.y})</div>
                    </div>
                  )}
                  {eqResult.type === 'one_root' && (
                    <div className="text-emerald-400 font-bold font-mono">Nghiệm kép: x₁ = x₂ = {eqResult.x}</div>
                  )}
                  {eqResult.type === 'complex' && (
                    <div className="text-amber-400 font-bold font-mono">
                      Nghiệm phức: x = {eqResult.real} ± {eqResult.imag}i
                    </div>
                  )}
                  {eqResult.type === 'linear' && (
                    <div className="text-emerald-400 font-bold font-mono">Nghiệm bậc 1: x = {eqResult.x}</div>
                  )}
                </div>
              )}
            </div>

            {/* Mục 2: Hệ phương trình 2 ẩn */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="font-bold text-cyan-400 block text-[11px] uppercase tracking-wider">
                2. Hệ 2 phương trình bậc nhất (2 ẩn x, y)
              </span>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input type="number" placeholder="a1" value={simA1} onChange={e => setSimA1(e.target.value)} className="w-14 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-center font-bold text-white" />
                  <span className="text-slate-400">x +</span>
                  <input type="number" placeholder="b1" value={simB1} onChange={e => setSimB1(e.target.value)} className="w-14 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-center font-bold text-white" />
                  <span className="text-slate-400">y =</span>
                  <input type="number" placeholder="c1" value={simC1} onChange={e => setSimC1(e.target.value)} className="w-14 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-center font-bold text-white" />
                </div>
                <div className="flex items-center gap-1.5">
                  <input type="number" placeholder="a2" value={simA2} onChange={e => setSimA2(e.target.value)} className="w-14 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-center font-bold text-white" />
                  <span className="text-slate-400">x +</span>
                  <input type="number" placeholder="b2" value={simB2} onChange={e => setSimB2(e.target.value)} className="w-14 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-center font-bold text-white" />
                  <span className="text-slate-400">y =</span>
                  <input type="number" placeholder="c2" value={simC2} onChange={e => setSimC2(e.target.value)} className="w-14 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-center font-bold text-white" />
                </div>
              </div>

              <button
                onClick={solveSimultaneous}
                className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow transition active:scale-95"
              >
                Giải hệ phương trình (SOLVE)
              </button>

              {simResult && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-cyan-500/30 text-[11px] font-mono">
                  {simResult.error ? (
                    <span className="text-rose-400 font-medium">{simResult.error}</span>
                  ) : (
                    <div className="flex justify-around text-emerald-400 font-bold">
                      <span>x = {simResult.x}</span>
                      <span>y = {simResult.y}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: BẢNG KHỐI LƯỢNG MOL HÓA HỌC ================= */}
        {activeTab === 'CHEM' && (
          <div className="space-y-3 text-xs max-h-[360px] overflow-y-auto pr-1">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px]">
              🔬 Bấm vào nguyên tố hoặc hợp chất để tự động đưa khối lượng mol (M) vào biểu thức tính toán!
            </div>

            <div>
              <span className="text-[11px] font-bold text-amber-400 block mb-1.5 uppercase">
                Nguyên tử khối (g/mol):
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {COMMON_ELEMENTS.map(el => (
                  <button
                    key={el.symbol}
                    onClick={() => {
                      inputChar(el.m.toString());
                      setActiveTab('COMP');
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600/40 border border-slate-700 hover:border-indigo-500 text-left transition flex items-center justify-between"
                  >
                    <span className="font-bold text-white text-xs">{el.symbol}</span>
                    <span className="font-mono text-amber-300 font-bold">{el.m}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-1">
              <span className="text-[11px] font-bold text-rose-400 block mb-1.5 uppercase">
                Hợp chất thường gặp:
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {COMMON_COMPOUNDS.map(c => (
                  <button
                    key={c.formula}
                    onClick={() => {
                      inputChar(c.m.toString());
                      setActiveTab('COMP');
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600/30 border border-slate-700 hover:border-rose-500 text-left transition flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-white block text-xs">{c.formula}</span>
                      <span className="text-[9px] text-slate-400">{c.name}</span>
                    </div>
                    <span className="font-mono text-rose-300 font-bold">{c.m}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
