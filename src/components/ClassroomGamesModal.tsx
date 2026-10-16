// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import {
  X, Sparkles, Volume2, VolumeX, Trophy, RefreshCw, UserCheck,
  Flame, Zap, Play, Dice5, HelpCircle, Gift, Bomb, RotateCcw,
  CheckCircle2, Plus, Trash2, ArrowRight
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ClassroomGamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentList: Array<{ id?: string; name: string; isHost?: boolean }>;
  onSpotlightStudent?: (name: string) => void;
}

// Bộ tạo âm thanh bằng Web Audio API không phụ thuộc file ngoài
class SoundFX {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Tiếng kim quay bánh xe 'tách... tách'
  tick() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch {}
  }

  // Tiếng tim đập hồi hộp 'thình thịch'
  heartbeat() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.6, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch {}
  }

  // Tiếng máy đánh bạc Slot machine
  slotReel() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {}
  }

  // Tiếng kèn chiến thắng / nổ pháo hoa
  fanfare() {
    try {
      this.init();
      if (!this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.4, this.ctx!.currentTime + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + idx * 0.1 + 0.6);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(this.ctx!.currentTime + idx * 0.1);
        osc.stop(this.ctx!.currentTime + idx * 0.1 + 0.6);
      });
    } catch {}
  }
}

const sfx = new SoundFX();

const DEFAULT_DEMO_NAMES = [
  'Nguyễn Văn An (10A1)',
  'Trần Thị Mai (10A1)',
  'Lê Hoàng Nam (10A2)',
  'Phạm Minh Đức (10A2)',
  'Vũ Thùy Linh (10A1)',
  'Đặng Tuấn Kiệt (10A3)',
  'Hoàng Bảo Ngọc (10A2)',
  'Bùi Gia Huy (10A1)',
  'Nguyễn Hải Đăng (10A3)',
  'Trần Ngọc Ánh (10A2)'
];

const WHEEL_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6'
];

export default function ClassroomGamesModal({
  isOpen,
  onClose,
  studentList = [],
  onSpotlightStudent
}: ClassroomGamesModalProps) {
  const [activeTab, setActiveTab] = useState<'wheel' | 'mystery' | 'slot'>('wheel');
  
  // Danh sách tên tham gia trò chơi
  const [names, setNames] = useState<string[]>(() => {
    const actual = studentList.filter(s => !s.name?.includes('Thầy') && !s.isHost).map(s => s.name);
    return actual.length >= 2 ? actual : DEFAULT_DEMO_NAMES;
  });

  const [newNameInput, setNewNameInput] = useState('');
  const [removeAfterPick, setRemoveAfterPick] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);

  // Canvas Vòng quay may mắn
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wheelAngleRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  // Đồng bộ danh sách học sinh thực tế nếu có
  useEffect(() => {
    const actual = studentList.filter(s => !s.name?.includes('Thầy') && !s.isHost).map(s => s.name);
    if (actual.length >= 2) {
      setNames(actual);
    }
  }, [studentList]);

  // Vẽ Vòng Quay May Mắn trên Canvas
  useEffect(() => {
    if (!canvasRef.current || activeTab !== 'wheel') return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const numSlices = Math.max(names.length, 1);
    const sliceAngle = (2 * Math.PI) / numSlices;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = centerX - 12;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Vẽ từng lát cắt của vòng quay
    names.forEach((name, idx) => {
      const angle = wheelAngleRef.current + idx * sliceAngle;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, angle, angle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = WHEEL_COLORS[idx % WHEEL_COLORS.length];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Vẽ tên học sinh trên lát cắt
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(angle + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      const displayName = name.length > 16 ? name.slice(0, 14) + '...' : name;
      ctx.fillText(displayName, radius - 15, 4);
      ctx.restore();
    });

    // Vẽ tâm vòng quay
    ctx.beginPath();
    ctx.arc(centerX, centerY, 24, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎯', centerX, centerY);
  }, [names, activeTab]);

  // --- TRÒ CHƠI 1: QUAY VÒNG QUAY MAY MẮN ---
  const handleSpinWheel = () => {
    if (isSpinning || names.length === 0) return;
    setIsSpinning(true);
    setWinner(null);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const winnerIdx = Math.floor(Math.random() * names.length);
    const chosenName = names[winnerIdx];
    const sliceAngle = (2 * Math.PI) / names.length;

    // Tính toán góc dừng sao cho kim chỉ ở trên cùng (3 * PI / 2) chỉ đúng lát cắt
    const targetAngleOnCircle = 3 * Math.PI / 2 - (winnerIdx + 0.5) * sliceAngle;
    const extraSpins = 5 + Math.floor(Math.random() * 3); // Quay 5 - 7 vòng
    const totalRotation = extraSpins * 2 * Math.PI + (targetAngleOnCircle - (wheelAngleRef.current % (2 * Math.PI)));

    const duration = 4500; // 4.5 giây kịch tính
    const startTime = performance.now();
    const startAngle = wheelAngleRef.current;
    let lastTickAngle = startAngle;

    const animateWheel = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Hiệu ứng giảm tốc cubic ease-out
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentAngle = startAngle + totalRotation * easeOut;
      wheelAngleRef.current = currentAngle;

      // Phát tiếng 'tách' khi kim lướt qua ranh giới lát cắt
      if (Math.abs(currentAngle - lastTickAngle) >= sliceAngle) {
        sfx.tick();
        lastTickAngle = currentAngle;
      }

      // Vẽ lại frame
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = centerX - 12;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        names.forEach((name, idx) => {
          const angle = currentAngle + idx * sliceAngle;
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, radius, angle, angle + sliceAngle);
          ctx.closePath();
          ctx.fillStyle = WHEEL_COLORS[idx % WHEEL_COLORS.length];
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          ctx.save();
          ctx.translate(centerX, centerY);
          ctx.rotate(angle + sliceAngle / 2);
          ctx.textAlign = 'right';
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px sans-serif';
          const displayName = name.length > 16 ? name.slice(0, 14) + '...' : name;
          ctx.fillText(displayName, radius - 15, 4);
          ctx.restore();
        });

        // Tâm vòng quay
        ctx.beginPath();
        ctx.arc(centerX, centerY, 24, 0, 2 * Math.PI);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#f59e0b';
        ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎯', centerX, centerY);
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animateWheel);
      } else {
        // Dừng lại và vinh danh người thắng
        setIsSpinning(false);
        setWinner(chosenName);
        sfx.fanfare();

        if (removeAfterPick) {
          setNames(prev => prev.filter(n => n !== chosenName));
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(animateWheel);
  };

  // --- TRÒ CHƠI 2: HỘP BÍ ẨN / QUẢ BOM ĐẾM NGƯỢC ---
  const [mysteryPhase, setMysteryPhase] = useState<'idle' | 'ticking' | 'boom'>('idle');
  const [mysteryDisplayName, setMysteryDisplayName] = useState<string>('???');
  const [countdownNum, setCountdownNum] = useState<number>(3);

  const handleStartMystery = () => {
    if (mysteryPhase === 'ticking' || names.length === 0) return;
    setMysteryPhase('ticking');
    setWinner(null);
    setCountdownNum(3);

    let step = 0;
    const intervalTime = 80;
    const totalSteps = 45;

    const timer = setInterval(() => {
      step++;
      const randIdx = Math.floor(Math.random() * names.length);
      setMysteryDisplayName(names[randIdx]);
      sfx.heartbeat();

      if (step === 15) setCountdownNum(2);
      if (step === 30) setCountdownNum(1);

      if (step >= totalSteps) {
        clearInterval(timer);
        const finalWinner = names[Math.floor(Math.random() * names.length)];
        setMysteryDisplayName(finalWinner);
        setMysteryPhase('boom');
        setWinner(finalWinner);
        sfx.fanfare();

        if (removeAfterPick) {
          setNames(prev => prev.filter(n => n !== finalWinner));
        }
      }
    }, intervalTime);
  };

  // --- TRÒ CHƠI 3: MÁY QUAY SỐ JACKPOT (SLOT MACHINE) ---
  const [slotNames, setSlotNames] = useState<[string, string, string]>(['???', '???', '???']);
  const [isSlotSpinning, setIsSlotSpinning] = useState(false);

  const handleStartSlot = () => {
    if (isSlotSpinning || names.length === 0) return;
    setIsSlotSpinning(true);
    setWinner(null);

    const chosenWinner = names[Math.floor(Math.random() * names.length)];
    let step = 0;

    const interval = setInterval(() => {
      step++;
      sfx.slotReel();
      setSlotNames([
        names[Math.floor(Math.random() * names.length)],
        names[Math.floor(Math.random() * names.length)],
        names[Math.floor(Math.random() * names.length)]
      ]);

      if (step >= 35) {
        clearInterval(interval);
        setSlotNames([chosenWinner, chosenWinner, chosenWinner]);
        setIsSlotSpinning(false);
        setWinner(chosenWinner);
        sfx.fanfare();

        if (removeAfterPick) {
          setNames(prev => prev.filter(n => n !== chosenWinner));
        }
      }
    }, 90);
  };

  // Thêm tên học sinh thủ công
  const handleAddName = (e: React.FormEvent) => {
    e.preventDefault();
    if (newNameInput.trim() && !names.includes(newNameInput.trim())) {
      setNames(prev => [...prev, newNameInput.trim()]);
      setNewNameInput('');
      toast.success(`Đã thêm: ${newNameInput.trim()}`);
    }
  };

  // Reset về danh sách mặc định
  const handleResetDefault = () => {
    const actual = studentList.filter(s => !s.name?.includes('Thầy') && !s.isHost).map(s => s.name);
    setNames(actual.length >= 2 ? actual : DEFAULT_DEMO_NAMES);
    setWinner(null);
    toast.success('Đã tải lại danh sách học sinh!');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-200">
      <div className="bg-slate-900 border-2 border-amber-500/50 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl shadow-amber-500/20 overflow-hidden relative">
        
        {/* --- HEADER MODAL TRÒ CHƠI --- */}
        <div className="bg-gradient-to-r from-amber-600 via-rose-600 to-indigo-700 p-4 sm:px-6 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl shadow-inner">
              🎲
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>VÒNG QUAY & TRÒ CHƠI GỌI TÊN HỌC SINH</span>
                <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  Vui nhộn & Gay cấn
                </span>
              </h2>
              <p className="text-xs text-white/80">
                Gọi ngẫu nhiên học sinh lên bảng, phát biểu, trả lời câu hỏi sôi nổi
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/TRO_CHOI_GOI_TEN_THAY_THO.html"
              download="TRO_CHOI_GOI_TEN_THAY_THO.html"
              className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center gap-1.5 shadow backdrop-blur-sm transition active:scale-95 no-underline"
              title="Tải trọn bộ trò chơi này về máy tính để dùng Offline trực tiếp không cần mạng"
            >
              <span>📥</span>
              <span className="hidden sm:inline">Tải về máy tính</span>
            </a>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white transition active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* --- THANH ĐIỀU HƯỚNG 3 TRÒ CHƠI --- */}
        <div className="bg-slate-950 border-b border-slate-800 p-2 sm:px-6 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setActiveTab('wheel'); setWinner(null); }}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition ${
                activeTab === 'wheel'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span>🎡</span>
              <span>1. Vòng Quay May Mắn</span>
            </button>
            <button
              onClick={() => { setActiveTab('mystery'); setWinner(null); }}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition ${
                activeTab === 'mystery'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span>💣</span>
              <span>2. Quả Bom Đếm Ngược</span>
            </button>
            <button
              onClick={() => { setActiveTab('slot'); setWinner(null); }}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition ${
                activeTab === 'slot'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span>🎰</span>
              <span>3. Máy Quay Jackpot</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 font-medium cursor-pointer bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700/80">
              <input
                type="checkbox"
                checked={removeAfterPick}
                onChange={(e) => setRemoveAfterPick(e.target.checked)}
                className="rounded accent-amber-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span>Loại bỏ sau khi gọi</span>
            </label>
          </div>
        </div>

        {/* --- NỘI DUNG CHÍNH (TRÒ CHƠI + DANH SÁCH HỌC SINH) --- */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* CỘT TRÁI/GIỮA: KHU VỰC CHƠI GAME (CHIẾM 2 CỘT) */}
          <div className="md:col-span-2 flex flex-col items-center justify-center bg-slate-950/60 border border-slate-800 rounded-3xl p-4 sm:p-6 relative min-h-[360px]">
            
            {/* THÔNG BÁO NGƯỜI THẮNG CUỘC NỔ BẬT */}
            {winner && (
              <div className="absolute inset-x-4 top-4 z-20 bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 p-1 rounded-2xl shadow-2xl animate-in zoom-in duration-300">
                <div className="bg-slate-950 rounded-xl p-4 text-center">
                  <div className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center justify-center gap-1.5 mb-1">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                    <span>XIN CHÚC MỪNG HỌC SINH ĐƯỢC CHỌN!</span>
                    <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white my-1 drop-shadow-md">
                    🎉 {winner} 🎉
                  </h3>
                  <p className="text-xs text-slate-300">
                    Mời bạn bật mic lên bảng / trả lời câu hỏi của Thầy Thọ!
                  </p>
                </div>
              </div>
            )}

            {/* --- GAME 1: VÒNG QUAY MAY MẮN --- */}
            {activeTab === 'wheel' && (
              <div className="flex flex-col items-center justify-center w-full">
                <div className="relative mb-4">
                  {/* Kim chỉ trên đỉnh vòng quay */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[24px] border-t-amber-400 filter drop-shadow-lg animate-pulse" />
                  <canvas
                    ref={canvasRef}
                    width={320}
                    height={320}
                    className="rounded-full shadow-2xl border-4 border-slate-800/80 bg-slate-900"
                  />
                </div>

                <button
                  onClick={handleSpinWheel}
                  disabled={isSpinning || names.length === 0}
                  className={`px-8 py-3.5 rounded-2xl font-black text-base shadow-2xl transition active:scale-95 flex items-center gap-2 ${
                    isSpinning || names.length === 0
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-slate-950 shadow-amber-500/30'
                  }`}
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>{isSpinning ? 'ĐANG QUAY TÍT...' : 'QUAY NGAY 🎯'}</span>
                </button>
              </div>
            )}

            {/* --- GAME 2: QUẢ BOM ĐẾM NGƯỢC --- */}
            {activeTab === 'mystery' && (
              <div className="flex flex-col items-center justify-center w-full py-4 text-center">
                <div className={`w-32 h-32 rounded-3xl flex items-center justify-center text-6xl mb-6 shadow-2xl transition-all duration-200 ${
                  mysteryPhase === 'ticking'
                    ? 'bg-rose-600/30 border-4 border-rose-500 scale-110 animate-bounce'
                    : mysteryPhase === 'boom'
                    ? 'bg-amber-500/30 border-4 border-amber-400 scale-125'
                    : 'bg-slate-800/80 border-4 border-slate-700'
                }`}>
                  {mysteryPhase === 'ticking' ? '💣' : mysteryPhase === 'boom' ? '💥' : '🎁'}
                </div>

                {mysteryPhase === 'ticking' && (
                  <div className="text-3xl font-black text-rose-400 mb-2 font-mono animate-pulse">
                    ĐẾM NGƯỢC: {countdownNum}
                  </div>
                )}

                <div className="bg-slate-900 border-2 border-slate-700 px-6 py-4 rounded-2xl max-w-sm w-full mb-6 text-center shadow-inner">
                  <span className="text-xs text-slate-400 font-bold block mb-1 uppercase tracking-wider">
                    {mysteryPhase === 'boom' ? 'Người được chọn:' : 'Học sinh đang nhắm tới:'}
                  </span>
                  <div className="text-lg sm:text-xl font-black text-white truncate">
                    {mysteryDisplayName}
                  </div>
                </div>

                <button
                  onClick={handleStartMystery}
                  disabled={mysteryPhase === 'ticking' || names.length === 0}
                  className={`px-8 py-3.5 rounded-2xl font-black text-base shadow-2xl transition active:scale-95 flex items-center gap-2 ${
                    mysteryPhase === 'ticking' || names.length === 0
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-600/30'
                  }`}
                >
                  <Flame className="w-5 h-5 fill-current" />
                  <span>{mysteryPhase === 'ticking' ? 'HỒI HỘP ĐẾM NGƯỢC...' : 'KÍCH HOẠT QUẢ BOM 💣'}</span>
                </button>
              </div>
            )}

            {/* --- GAME 3: MÁY QUAY SỐ JACKPOT --- */}
            {activeTab === 'slot' && (
              <div className="flex flex-col items-center justify-center w-full py-4 text-center">
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3">
                  🎰 VÒNG QUAY MAY MẮN CASINO JACKPOT
                </div>

                {/* 3 Khung Slot Machine */}
                <div className="grid grid-cols-3 gap-2.5 max-w-md w-full mb-6 bg-slate-900 p-4 rounded-3xl border-4 border-indigo-500 shadow-2xl shadow-indigo-600/30">
                  {slotNames.map((name, i) => (
                    <div
                      key={i}
                      className={`h-24 sm:h-28 rounded-2xl bg-slate-950 border-2 border-indigo-500/50 flex flex-col items-center justify-center p-2 text-center overflow-hidden shadow-inner ${
                        isSlotSpinning ? 'animate-pulse' : ''
                      }`}
                    >
                      <span className="text-xl sm:text-2xl mb-1">⭐</span>
                      <span className="text-xs font-black text-white truncate max-w-full">
                        {name}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleStartSlot}
                  disabled={isSlotSpinning || names.length === 0}
                  className={`px-8 py-3.5 rounded-2xl font-black text-base shadow-2xl transition active:scale-95 flex items-center gap-2 ${
                    isSlotSpinning || names.length === 0
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white shadow-indigo-600/30'
                  }`}
                >
                  <Dice5 className="w-5 h-5" />
                  <span>{isSlotSpinning ? 'ĐANG QUAY JACKPOT...' : 'KÉO CẦN QUAY SỐ 🎰'}</span>
                </button>
              </div>
            )}
          </div>

          {/* CỘT PHẢI: QUẢN LÝ DANH SÁCH HỌC SINH THAM GIA (1 CỘT) */}
          <div className="flex flex-col bg-slate-950/90 border border-slate-800 rounded-3xl p-4">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">
                  Danh Sách Quay Thưởng
                </h4>
                <span className="text-[11px] text-slate-400">
                  Tổng cộng: <b className="text-amber-400">{names.length}</b> bạn
                </span>
              </div>
              <button
                onClick={handleResetDefault}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition"
                title="Tải lại danh sách học sinh ban đầu"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Ô thêm học sinh nhanh */}
            <form onSubmit={handleAddName} className="flex gap-1.5 mb-3">
              <input
                type="text"
                placeholder="Thêm tên học sinh..."
                value={newNameInput}
                onChange={(e) => setNewNameInput(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>

            {/* Danh sách cuộn các tên */}
            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[220px] pr-1">
              {names.map((name, idx) => (
                <div
                  key={idx}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs text-slate-200 group hover:border-slate-700"
                >
                  <span className="truncate flex-1 font-medium">{idx + 1}. {name}</span>
                  <button
                    onClick={() => setNames(prev => prev.filter((_, i) => i !== idx))}
                    className="text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition p-1"
                    title="Xóa học sinh này"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {names.length === 0 && (
                <div className="text-center py-6 text-xs text-slate-500">
                  Chưa có tên học sinh nào. Thêm tên ở trên!
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
