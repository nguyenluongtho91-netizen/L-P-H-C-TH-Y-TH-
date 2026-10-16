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


const CLASS_KEYS = ['online', '6', '7', '7H', '8', '8H', '9', '9H', '10', '11', '12'] as const;
const CLASS_NAMES: Record<string, string> = {
  'online': 'Phòng Online',
  '6': 'Lớp 6',
  '7': 'Lớp 7',
  '7H': 'Lớp 7H (Hóa)',
  '8': 'Lớp 8',
  '8H': 'Lớp 8H (Hóa)',
  '9': 'Lớp 9',
  '9H': 'Lớp 9H (Hóa)',
  '10': 'Lớp 10',
  '11': 'Lớp 11',
  '12': 'Lớp 12'
};

const DEFAULT_CLASS_DATA: Record<string, string[]> = {
  '6': [
    'Nguyễn Tuấn Khang (6A1)', 'Trần Quỳnh Anh (6A1)', 'Lê Gia Hưng (6A2)', 'Phạm Thảo Linh (6A2)',
    'Vũ Đức Minh (6A1)', 'Hoàng Ngọc Ánh (6A3)', 'Đỗ Nhật Quang (6A2)', 'Bùi Hoàng Long (6A1)',
    'Đinh Minh Trang (6A3)', 'Ngô Khánh Linh (6A2)', 'Mai Thế Vinh (6A1)', 'Phan Thanh Tú (6A3)'
  ],
  '7': [
    'Nguyễn Văn Đức (7A1)', 'Trần Thùy Dương (7A1)', 'Lê Bảo Nam (7A2)', 'Phạm Quang Minh (7A2)',
    'Vũ Mỹ Uyên (7A1)', 'Hoàng Tuấn Anh (7A3)', 'Đỗ Gia Huy (7A2)', 'Bùi Thanh Mai (7A1)',
    'Đinh Quốc Trung (7A3)', 'Ngô Thục Trinh (7A2)', 'Mai Công Thành (7A1)', 'Phan Ánh Nguyệt (7A3)'
  ],
  '7H': [
    'Nguyễn Hà My (7H)', 'Trần Gia Bảo (7H)', 'Lê Đình Khôi (7H)', 'Phạm Minh Hạnh (7H)',
    'Vũ Trung Hiếu (7H)', 'Hoàng Bích Ngân (7H)', 'Đỗ Việt Dũng (7H)', 'Bùi Thúy An (7H)',
    'Đinh Xuân Bách (7H)', 'Ngô Phương Linh (7H)', 'Mai Anh Quân (7H)', 'Phan Diệu Linh (7H)'
  ],
  '8': [
    'Nguyễn Thành Long (8A1)', 'Trần Ngọc Bích (8A1)', 'Lê Hoàng Phong (8A2)', 'Phạm Diệu Thảo (8A2)',
    'Vũ Hải Đăng (8A1)', 'Hoàng Trọng Nghĩa (8A3)', 'Đỗ Mai Trang (8A2)', 'Bùi Thế Hiển (8A1)',
    'Đinh Huyền Trang (8A3)', 'Ngô Quang Huy (8A2)', 'Mai Nhật Lam (8A1)', 'Phan Thùy Trang (8A3)'
  ],
  '8H': [
    'Nguyễn Duy Khang (8H)', 'Trần Thanh Vân (8H)', 'Lê Nguyên Khôi (8H)', 'Phạm Ngọc Trâm (8H)',
    'Vũ Anh Dũng (8H)', 'Hoàng Lan Chi (8H)', 'Đỗ Mạnh Hùng (8H)', 'Bùi Diễm Quỳnh (8H)',
    'Đinh Minh Trí (8H)', 'Ngô Tú Uyên (8H)', 'Mai Tuấn Kiệt (8H)', 'Phan Như Quỳnh (8H)'
  ],
  '9': [
    'Nguyễn Quang Dũng (9A1)', 'Trần Minh Hằng (9A1)', 'Lê Đình Phúc (9A2)', 'Phạm Hồng Nhung (9A2)',
    'Vũ Quốc Khánh (9A1)', 'Hoàng Kim Ngân (9A3)', 'Đỗ Hữu Thắng (9A2)', 'Bùi Thanh Trúc (9A1)',
    'Đinh Vĩnh Khang (9A3)', 'Ngô Diệu Hương (9A2)', 'Mai Trung Kiên (9A1)', 'Phan Yến Nhi (9A3)'
  ],
  '9H': [
    'Nguyễn Đức Thắng (9H)', 'Trần Ánh Hồng (9H)', 'Lê Quốc Toàn (9H)', 'Phạm Diệu Nga (9H)',
    'Vũ Hoàng Quân (9H)', 'Hoàng Thục Đoan (9H)', 'Đỗ Trọng Hiếu (9H)', 'Bùi Thùy Trâm (9H)',
    'Đinh Tùng Lâm (9H)', 'Ngô Bích Thảo (9H)', 'Mai Gia Khiêm (9H)', 'Phan Ngọc Hà (9H)'
  ],
  '10': [
    'Nguyễn Văn An (10A1)', 'Trần Thị Mai (10A1)', 'Lê Hoàng Nam (10A2)', 'Phạm Minh Đức (10A2)',
    'Vũ Thùy Linh (10A1)', 'Đặng Tuấn Kiệt (10A3)', 'Hoàng Bảo Ngọc (10A2)', 'Bùi Gia Huy (10A1)',
    'Nguyễn Hải Đăng (10A3)', 'Trần Ngọc Ánh (10A2)', 'Đỗ Quang Hải (10A1)', 'Lê Minh Khôi (10A3)'
  ],
  '11': [
    'Nguyễn Đức Thịnh (11A1)', 'Trần Hồng Gấm (11A1)', 'Lê Xuân Trường (11A2)', 'Phạm Thùy Chi (11A2)',
    'Vũ Đình Trọng (11A1)', 'Hoàng Khánh Chi (11A3)', 'Đỗ Bá Đạt (11A2)', 'Bùi Mỹ Lệ (11A1)',
    'Đinh Thành Nam (11A3)', 'Ngô Lan Hương (11A2)', 'Mai Hữu Phước (11A1)', 'Phan Thu Thảo (11A3)'
  ],
  '12': [
    'Nguyễn Tuấn Anh (12A1)', 'Trần Mai Hoa (12A1)', 'Lê Minh Nhật (12A2)', 'Phạm Quỳnh Giang (12A2)',
    'Vũ Cao Thắng (12A1)', 'Hoàng Thảo My (12A3)', 'Đỗ Đức Thọ (12A2)', 'Bùi Ánh Tuyết (12A1)',
    'Đinh Phúc Lâm (12A3)', 'Ngô Thúy Quỳnh (12A2)', 'Mai Hoàng Bách (12A1)', 'Phan Bảo Hân (12A3)'
  ]
};

export default function ClassroomGamesModal({
  isOpen,
  onClose,
  studentList = [],
  onSpotlightStudent
}: ClassroomGamesModalProps) {
  const [currentClassKey, setCurrentClassKey] = useState<string>('10');

  const handleSelectClass = (key: string) => {
    setCurrentClassKey(key);
    setWinner(null);
    if (key === 'online') {
      const actual = studentList.filter(s => !s.name?.includes('Thầy') && !s.isHost).map(s => s.name);
      setNames(actual.length >= 2 ? actual : DEFAULT_CLASS_DATA['10']);
    } else {
      setNames(DEFAULT_CLASS_DATA[key] || []);
    }
  };

  const [activeTab, setActiveTab] = useState<'wheel' | 'mystery' | 'slot' | 'race' | 'lightning' | 'chest'>('wheel');
  
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
      ctx.font = 'bold 20px sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      const displayName = name.length > 16 ? name.slice(0, 14) + '...' : name;
      ctx.fillText(displayName, radius - 15, 4);
      ctx.restore();
    });

    // Vẽ tâm vòng quay
    ctx.beginPath();
    ctx.arc(centerX, centerY, 56, 0, 2 * Math.PI);
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
          ctx.font = 'bold 20px sans-serif';
          const displayName = name.length > 16 ? name.slice(0, 14) + '...' : name;
          ctx.fillText(displayName, radius - 15, 4);
          ctx.restore();
        });

        // Tâm vòng quay
        ctx.beginPath();
        ctx.arc(centerX, centerY, 56, 0, 2 * Math.PI);
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

  // --- TRÒ CHƠI 4: ĐUA XE F1 THẦN TỐC ---
  const [raceRacers, setRaceRacers] = useState<Array<{ name: string; progress: number; icon: string; color: string }>>([]);
  const [isRacing, setIsRacing] = useState(false);

  useEffect(() => {
    if (activeTab === 'race' && names.length > 0) {
      const CAR_ICONS = ['🏎️', '🚗', '🚙', '🚖'];
      const CAR_COLORS = [
        'from-red-500 to-orange-500',
        'from-amber-400 to-yellow-500',
        'from-blue-500 to-cyan-400',
        'from-purple-500 to-pink-500'
      ];
      const shuffled = [...names].sort(() => 0.5 - Math.random()).slice(0, 4);
      setRaceRacers(shuffled.map((name, i) => ({
        name,
        progress: 5,
        icon: CAR_ICONS[i % CAR_ICONS.length],
        color: CAR_COLORS[i % CAR_COLORS.length]
      })));
    }
  }, [activeTab, names]);

  const handleStartRace = () => {
    if (isRacing || raceRacers.length === 0) return;
    setIsRacing(true);
    setWinner(null);

    const winnerIdx = Math.floor(Math.random() * raceRacers.length);
    let step = 0;

    const timer = setInterval(() => {
      step++;
      sfx.engineRev(1 + (step % 4) * 0.2);

      let finished = false;
      setRaceRacers(prev => prev.map((r, idx) => {
        let boost = Math.random() * 3.5 + 1.5;
        if (idx === winnerIdx && step > 20) boost += 2.0;
        const newProg = Math.min(r.progress + boost, 100);
        if (newProg >= 100 && idx === winnerIdx) finished = true;
        return { ...r, progress: newProg };
      }));

      if (finished || step >= 45) {
        clearInterval(timer);
        const champion = raceRacers[winnerIdx].name;
        setRaceRacers(prev => prev.map((r, idx) => idx === winnerIdx ? { ...r, progress: 100 } : r));
        setIsRacing(false);
        setWinner(champion);
        sfx.fanfare();

        if (removeAfterPick) {
          setNames(prev => prev.filter(n => n !== champion));
        }
      }
    }, 100);
  };

  // --- TRÒ CHƠI 5: TIA SÉT THOR ---
  const [lightningCards, setLightningCards] = useState<string[]>([]);
  const [activeLightningIdx, setActiveLightningIdx] = useState<number>(-1);
  const [struckLightningIdx, setStruckLightningIdx] = useState<number>(-1);
  const [isLightningStriking, setIsLightningStriking] = useState(false);

  useEffect(() => {
    if (activeTab === 'lightning' && names.length > 0) {
      const shuffled = [...names].sort(() => 0.5 - Math.random()).slice(0, Math.min(names.length, 9));
      setLightningCards(shuffled);
      setActiveLightningIdx(-1);
      setStruckLightningIdx(-1);
    }
  }, [activeTab, names]);

  const handleStartLightning = () => {
    if (isLightningStriking || lightningCards.length === 0) return;
    setIsLightningStriking(true);
    setWinner(null);
    setStruckLightningIdx(-1);

    const winnerIdx = Math.floor(Math.random() * lightningCards.length);
    let count = 0;
    const totalCount = 35;

    const timer = setInterval(() => {
      count++;
      sfx.zap();
      setActiveLightningIdx(Math.floor(Math.random() * lightningCards.length));

      if (count >= totalCount) {
        clearInterval(timer);
        setActiveLightningIdx(-1);
        setStruckLightningIdx(winnerIdx);
        sfx.thunderCrash();
        const luckyOne = lightningCards[winnerIdx];
        setIsLightningStriking(false);
        setWinner(luckyOne);
        sfx.fanfare();

        if (removeAfterPick) {
          setNames(prev => prev.filter(n => n !== luckyOne));
        }
      }
    }, 80);
  };

  // --- TRÒ CHƠI 6: CHIẾC RƯƠNG BÍ ẨN ---
  const [chestShaking, setChestShaking] = useState(false);
  const [openedChestIdx, setOpenedChestIdx] = useState<number | null>(null);
  const [chestRewardName, setChestRewardName] = useState<string>('');

  const handleOpenChest = (idx: number) => {
    if (chestShaking || names.length === 0) return;
    setChestShaking(true);
    setWinner(null);
    setOpenedChestIdx(null);

    let beats = 0;
    const timer = setInterval(() => {
      beats++;
      sfx.heartbeat();

      if (beats >= 18) {
        clearInterval(timer);
        setChestShaking(false);
        setOpenedChestIdx(idx);
        const luckyStudent = names[Math.floor(Math.random() * names.length)];
        setChestRewardName(luckyStudent);
        sfx.magicChime();
        setWinner(luckyStudent);
        sfx.fanfare();

        if (removeAfterPick) {
          setNames(prev => prev.filter(n => n !== luckyStudent));
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
      <div className="bg-slate-950/95 backdrop-blur-2xl border-2 border-sky-400/50 rounded-3xl shadow-2xl shadow-sky-500/20 max-w-6xl w-[98vw] max-h-[96vh] flex flex-col shadow-2xl shadow-amber-500/20 overflow-hidden relative">
        
        {/* --- HEADER MODAL TRÒ CHƠI --- */}
        <div className="bg-gradient-to-r from-amber-600 via-rose-600 to-indigo-700 p-4 sm:px-6 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl shadow-inner">
              🎲
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>📐 TOÁN & 🧪 HÓA HỌC — TRÒ CHƠI GỌI TÊN THẦY THỌ</span>
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

                {/* --- THANH CHỌN 10 LỚP HỌC (LỚP 6 ĐẾN LỚP 12 + 7H, 8H, 9H) --- */}
        <div className="bg-slate-950 border-b border-slate-800 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
          <div className="flex items-center gap-1.5 shrink-0 text-xs font-black text-sky-400 uppercase tracking-wider">
            <span>🏫</span>
            <span className="hidden sm:inline">CHỌN LỚP:</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {CLASS_KEYS.map((k) => {
              const isHoa = k.endsWith('H');
              const isCurrent = currentClassKey === k;
              return (
                <button
                  key={k}
                  onClick={() => handleSelectClass(k)}
                  className={`px-3 py-1 rounded-xl text-xs font-black transition flex items-center gap-1 whitespace-nowrap ${
                    isCurrent
                      ? isHoa
                        ? 'bg-gradient-to-r from-red-600 to-amber-500 text-white shadow-md shadow-red-500/30 ring-1 ring-amber-300'
                        : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-blue-500/30 ring-1 ring-sky-300'
                      : isHoa
                      ? 'bg-red-950/60 text-red-300 hover:bg-red-900/60 border border-red-800/60'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  <span>{CLASS_NAMES[k]}</span>
                </button>
              );
            })}
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900 px-3 py-1 rounded-xl border border-slate-800 shrink-0 font-bold">
            <span>Đang chọn:</span>
            <span className="text-sky-400 font-black">{CLASS_NAMES[currentClassKey]}</span>
            <span className="text-slate-500">({names.length} bạn)</span>
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
            <button
              onClick={() => { setActiveTab('race'); setWinner(null); }}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition ${
                activeTab === 'race'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span>🏎️</span>
              <span>4. Đua Xe F1</span>
            </button>
            <button
              onClick={() => { setActiveTab('lightning'); setWinner(null); }}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition ${
                activeTab === 'lightning'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span>⚡</span>
              <span>5. Tia Sét Thor</span>
            </button>
            <button
              onClick={() => { setActiveTab('chest'); setWinner(null); }}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition ${
                activeTab === 'chest'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span>🎁</span>
              <span>6. Rương Bí Ẩn</span>
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
          <div className="md:col-span-2 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-xl border border-sky-500/30 rounded-3xl p-4 sm:p-6 relative min-h-[420px] shadow-inner">
            
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
                  <p className="text-xs text-slate-300 mb-3">
                    Mời bạn bật mic lên bảng / trả lời câu hỏi của Thầy Thọ!
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-white/10">
                    <button
                      onClick={() => {
                        setWinner(null);
                        setTimeout(() => {
                          if (activeTab === 'wheel') spinWheel();
                          else if (activeTab === 'bomb') startBomb();
                          else if (activeTab === 'slot') startSlot();
                          else if (activeTab === 'race') startRace();
                          else if (activeTab === 'lightning') startLightning();
                          else if (activeTab === 'chest') startChest();
                        }, 150);
                      }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/40 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5"
                    >
                      <span>▶️</span> TIẾP TỤC (QUAY TIẾP)
                    </button>

                    <button
                      onClick={() => {
                        if (winner) {
                          setCustomNames(prev => prev.filter(n => n !== winner));
                        }
                        setWinner(null);
                        setTimeout(() => {
                          if (activeTab === 'wheel') spinWheel();
                          else if (activeTab === 'bomb') startBomb();
                          else if (activeTab === 'slot') startSlot();
                          else if (activeTab === 'race') startRace();
                          else if (activeTab === 'lightning') startLightning();
                          else if (activeTab === 'chest') startChest();
                        }, 150);
                      }}
                      className="px-3 py-2 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white border border-rose-500/30 font-bold text-xs hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5"
                    >
                      <span>🗑️</span> LOẠI & QUAY TIẾP
                    </button>

                    <button
                      onClick={() => setWinner(null)}
                      className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700 font-bold text-xs transition-all"
                    >
                      <span>✕</span> Đóng
                    </button>
                  </div>
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
                  className={`px-16 py-5 rounded-3xl font-black text-2xl shadow-2xl transition active:scale-95 flex items-center gap-2 ${
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
                  className={`px-16 py-5 rounded-3xl font-black text-2xl shadow-2xl transition active:scale-95 flex items-center gap-2 ${
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
                  className={`px-16 py-5 rounded-3xl font-black text-2xl shadow-2xl transition active:scale-95 flex items-center gap-2 ${
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
          
            {/* --- GAME 4: ĐUA XE F1 THẦN TỐC --- */}
            {activeTab === 'race' && (
              <div className="flex flex-col items-center justify-center w-full max-w-lg py-2">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">
                  🏎️ ĐƯỜNG ĐUA F1 GRAND PRIX — XE NÀO VỀ ĐÍCH ĐẦU TIÊN?
                </div>
                <div className="w-full space-y-2.5 mb-5">
                  {raceRacers.map((racer, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="text-white flex items-center gap-1">
                          <span>{racer.icon}</span> <b>Xe {idx + 1}:</b> {racer.name}
                        </span>
                        <span className="text-emerald-400 font-mono">{Math.floor(racer.progress)}%</span>
                      </div>
                      <div className="h-6 bg-slate-950 rounded-full relative overflow-hidden border border-slate-800">
                        <div
                          className={`h-full bg-gradient-to-r ${racer.color} transition-all duration-100 rounded-full flex items-center justify-end pr-1`}
                          style={{ width: `${Math.max(racer.progress, 6)}%` }}
                        >
                          <span className="text-sm drop-shadow">{racer.icon}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleStartRace}
                  disabled={isRacing || raceRacers.length === 0}
                  className={`px-16 py-5 rounded-3xl font-black text-2xl shadow-2xl transition active:scale-95 flex items-center gap-2 ${
                    isRacing || raceRacers.length === 0
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-emerald-500/30'
                  }`}
                >
                  <span>🏎️💨</span>
                  <span>{isRacing ? 'CÁC TAY ĐUA ĐANG BỨT TỐC...' : 'BẮT ĐẦU ĐUA XE 🏁'}</span>
                </button>
              </div>
            )}

            {/* --- GAME 5: TIA SÉT THOR --- */}
            {activeTab === 'lightning' && (
              <div className="flex flex-col items-center justify-center w-full max-w-lg py-2">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3">
                  ⚡ BÃO SẤM SÉT THOR — TIA SÉT GIÁNG XUỐNG AI?
                </div>
                <div className="grid grid-cols-3 gap-2 w-full mb-5">
                  {lightningCards.map((name, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl text-center text-xs font-black transition-all duration-75 border ${
                        struckLightningIdx === idx
                          ? 'bg-gradient-to-r from-red-600 to-amber-500 text-white border-yellow-300 scale-105 shadow-2xl shadow-yellow-500/50 animate-bounce'
                          : activeLightningIdx === idx
                          ? 'bg-amber-500/30 border-amber-400 text-amber-300 scale-105 shadow-lg shadow-amber-500/40'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="text-base mb-0.5">⚡</div>
                      <div className="truncate">{name}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleStartLightning}
                  disabled={isLightningStriking || lightningCards.length === 0}
                  className={`px-16 py-5 rounded-3xl font-black text-2xl shadow-2xl transition active:scale-95 flex items-center gap-2 ${
                    isLightningStriking || lightningCards.length === 0
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 shadow-amber-400/30'
                  }`}
                >
                  <Zap className="w-5 h-5 fill-current" />
                  <span>{isLightningStriking ? 'BÃO SẤM SÉT ĐANG QUÉT...' : 'TRIỆU HỒI SẤM SÉT ⚡'}</span>
                </button>
              </div>
            )}

            {/* --- GAME 6: RƯƠNG BÍ ẨN --- */}
            {activeTab === 'chest' && (
              <div className="flex flex-col items-center justify-center w-full max-w-md py-2">
                <div className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3">
                  🎁 4 CHIẾC RƯƠNG BÍ MẬT — CHỌN 1 RƯƠNG MAY MẮN
                </div>
                <div className="grid grid-cols-2 gap-3 w-full mb-5">
                  {[
                    { title: 'Rương Hoàng Kim 👑', color: 'from-amber-900/60 to-slate-900 border-amber-500/60' },
                    { title: 'Rương Dung Nham 🔥', color: 'from-red-900/60 to-slate-900 border-red-500/60' },
                    { title: 'Rương Băng Giá ❄️', color: 'from-cyan-900/60 to-slate-900 border-cyan-500/60' },
                    { title: 'Rương Ma Thuật 🔮', color: 'from-purple-900/60 to-slate-900 border-purple-500/60' }
                  ].map((chest, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleOpenChest(idx)}
                      disabled={chestShaking}
                      className={`p-4 rounded-2xl border-2 flex flex-col items-center justify-center transition-all bg-gradient-to-b ${chest.color} ${
                        chestShaking ? 'animate-bounce' : 'hover:scale-105 active:scale-95'
                      } ${openedChestIdx === idx ? 'ring-4 ring-amber-400 bg-amber-500/20' : ''}`}
                    >
                      <div className="text-4xl mb-2">{openedChestIdx === idx ? '🎁✨' : '📦'}</div>
                      <div className="text-xs font-bold text-white mb-1">{chest.title}</div>
                      <div className="text-[11px] text-slate-400 font-semibold truncate max-w-full">
                        {openedChestIdx === idx ? (
                          <span className="text-amber-400 font-black">{chestRewardName}</span>
                        ) : (
                          'Bấm để mở'
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => handleOpenChest(Math.floor(Math.random() * 4))}
                  disabled={chestShaking || names.length === 0}
                  className={`px-16 py-5 rounded-3xl font-black text-2xl shadow-2xl transition active:scale-95 flex items-center gap-2 ${
                    chestShaking || names.length === 0
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/30'
                  }`}
                >
                  <Gift className="w-5 h-5 fill-current" />
                  <span>{chestShaking ? 'ĐANG MỞ RƯƠNG BÍ ẨN...' : 'MỞ NGẪU NHIÊN 1 RƯƠNG 🎁'}</span>
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
