// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useExamStore } from '@/store/examStore';
import LessonExamRoom from '@/components/LessonExamRoom';
import { playSound, SOUND_EFFECTS, SoundEffectType } from '@/utils/soundEffects';
import toast, { Toaster } from 'react-hot-toast';
import {
  Video, MicOff, Hand, Volume2, Shield, Lock, Unlock,
  Copy, Check, FileText, ArrowLeft, Maximize2,
  Columns, Sparkles, LogIn
} from 'lucide-react';

const TEACHER_PHONE = '0345833133';
const DEFAULT_ROOM_ID = 'LopHocThayTho_0345833133';

export default function LiveClassroomPage() {
  const { roomId } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const { user, profile, isTeacher, isAdmin } = useAuthStore() as any;
  const { exams, loadExams } = useExamStore();

  // Trạng thái người dùng và phòng
  const [hasJoined, setHasJoined] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [hostPinInput, setHostPinInput] = useState('');
  const [showHostLogin, setShowHostLogin] = useState(false);

  // Cấu hình phòng (đồng bộ qua Supabase realtime)
  const [requirePin, setRequirePin] = useState(false);
  const [roomPin, setRoomPin] = useState('2025');
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [activeExamTitle, setActiveExamTitle] = useState<string>('');
  const [layoutMode, setLayoutMode] = useState<'split' | 'video' | 'exam'>('video');

  // Danh sách giơ tay
  const [raisedHands, setRaisedHands] = useState<string[]>([]);
  const [myHandRaised, setMyHandRaised] = useState(false);
  const [copied, setCopied] = useState(false);

  // Jitsi container & API ref
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const channelRef = useRef<any>(null);

  const currentRoomName = roomId ? `LopHocThayTho_${roomId}` : DEFAULT_ROOM_ID;

  // Tự động nhận diện nếu Thầy Thọ đang đăng nhập tài khoản
  useEffect(() => {
    if (isAdmin?.() || isTeacher?.() || user?.email?.includes('tho') || profile?.role === 'teacher' || profile?.role === 'admin') {
      setIsHost(true);
      setStudentName('Thầy Lương Thọ');
    } else {
      const savedName = localStorage.getItem('live_student_name');
      if (savedName) setStudentName(savedName);
    }
    loadExams();
  }, [user, profile]);

  // Kết nối Supabase Realtime Channel để đồng bộ âm thanh, giơ tay, phát đề
  useEffect(() => {
    const channel = supabase.channel(`live-room-${currentRoomName}`, {
      config: { broadcast: { self: false } }
    });

    channel
      .on('broadcast', { event: 'sound' }, ({ payload }) => {
        if (payload?.type) {
          playSound(payload.type as SoundEffectType);
          toast(payload.label || 'Âm thanh từ Thầy Thọ!', {
            icon: payload.icon || '🔊',
            position: 'top-center',
            duration: 2500
          });
        }
      })
      .on('broadcast', { event: 'raise_hand' }, ({ payload }) => {
        if (payload?.name) {
          setRaisedHands(prev => Array.from(new Set([...prev, payload.name])));
          playSound('bell');
          toast(`✋ ${payload.name} giơ tay phát biểu!`, {
            id: 'raise-hand-notification',
            position: 'top-center',
            duration: 3000,
            style: { background: '#f59e0b', color: '#fff', fontWeight: 'bold' }
          });
        }
      })
      .on('broadcast', { event: 'lower_hand' }, ({ payload }) => {
        if (payload?.name) {
          setRaisedHands(prev => prev.filter(n => n !== payload.name));
        }
      })
      .on('broadcast', { event: 'lower_all_hands' }, () => {
        setRaisedHands([]);
        setMyHandRaised(false);
      })
      .on('broadcast', { event: 'broadcast_exam' }, ({ payload }) => {
        if (payload?.examId) {
          setActiveExamId(payload.examId);
          setActiveExamTitle(payload.title || 'Đề thi trực tiếp');
          setLayoutMode('split');
          playSound('tada');
          toast.success(`📝 Thầy Thọ vừa phát đề: "${payload.title || 'Đề thi'}"!`, {
            duration: 5000,
            icon: '🎯'
          });
        } else {
          setActiveExamId(null);
          setLayoutMode('video');
          toast('Thầy đã thu hồi bài kiểm tra.', { icon: 'ℹ️' });
        }
      })
      .on('broadcast', { event: 'room_settings' }, ({ payload }) => {
        if (typeof payload?.requirePin === 'boolean') {
          setRequirePin(payload.requirePin);
          if (payload.pin) setRoomPin(payload.pin);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [currentRoomName]);

  // Nhúng Jitsi External API khi người dùng đã bấm Tham gia
  useEffect(() => {
    if (!hasJoined) return;

    let api: any = null;

    const initJitsi = () => {
      if (!jitsiContainerRef.current) return;
      jitsiContainerRef.current.innerHTML = '';

      const displayName = isHost ? 'Thầy Lương Thọ (Giáo viên)' : (studentName.trim() || 'Học sinh');
      
      if (typeof window !== 'undefined' && (window as any).JitsiMeetExternalAPI) {
        const domain = 'meet.jit.si';
        const options = {
          roomName: currentRoomName,
          width: '100%',
          height: '100%',
          parentNode: jitsiContainerRef.current,
          userInfo: {
            displayName: displayName
          },
          configOverwrite: {
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            startWithAudioMuted: !isHost,
            startWithVideoMuted: false,
            enableWelcomePage: false,
            disableModeratorIndicator: false,
            toolbarButtons: isHost ? [
              'microphone', 'camera', 'desktop', 'fullscreen', 'chat',
              'raisehand', 'tileview', 'mute-everyone', 'settings'
            ] : [
              'microphone', 'camera', 'fullscreen', 'chat', 'raisehand', 'tileview'
            ]
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_REMOTE_DISPLAY_NAME: 'Học sinh Thầy Thọ',
            TOOLBAR_ALWAYS_VISIBLE: true
          }
        };

        api = new (window as any).JitsiMeetExternalAPI(domain, options);
        jitsiApiRef.current = api;

        api.addEventListener('videoConferenceJoined', () => {
          toast.success(isHost ? 'Đã khởi tạo phòng học với quyền Giáo viên!' : 'Đã kết nối vào phòng học trực tuyến!');
        });

// Jitsi native raise hand handled inside video
      } else {
        // Fallback: Iframe chất lượng cao nếu external_api chưa load
        const iframe = document.createElement('iframe');
        iframe.src = `https://meet.jit.si/${encodeURIComponent(currentRoomName)}#userInfo.displayName="${encodeURIComponent(displayName)}"&config.prejoinPageEnabled=false&config.disableDeepLinking=true&config.startWithAudioMuted=${!isHost}&interfaceConfig.SHOW_JITSI_WATERMARK=false`;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.allow = 'camera; microphone; fullscreen; display-capture; autoplay; clipboard-write';
        jitsiContainerRef.current.appendChild(iframe);
      }
    };

    // Load external_api.js nếu chưa có
    if (!(window as any).JitsiMeetExternalAPI) {
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload = initJitsi;
      document.body.appendChild(script);
    } else {
      initJitsi();
    }

    return () => {
      if (api) {
        try { api.dispose(); } catch {}
      }
    };
  }, [hasJoined, isHost]);

  // Hạ tay tất cả học sinh (Dành cho Thầy Thọ)
  const handleLowerAllHands = () => {
    setRaisedHands([]);
    toast.dismiss();
    channelRef.current?.send({
      type: 'broadcast',
      event: 'lower_all_hands',
      payload: {}
    });
    toast.success('Đã hạ tay toàn bộ học sinh!', { duration: 2000 });
  };

  // Xử lý giơ tay phát biểu
  const handleRaiseHand = (forceState?: boolean) => {
    const nextState = forceState !== undefined ? forceState : !myHandRaised;
    setMyHandRaised(nextState);

    const name = studentName.trim() || 'Học sinh';
    if (nextState) {
      playSound('bell');
      channelRef.current?.send({
        type: 'broadcast',
        event: 'raise_hand',
        payload: { name }
      });
      toast.success('Bạn đã giơ tay phát biểu!', { icon: '✋' });
    } else {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'lower_hand',
        payload: { name }
      });
      toast('Đã hạ tay phát biểu.', { icon: '👌' });
    }

    if (jitsiApiRef.current) {
      jitsiApiRef.current.executeCommand('toggleRaiseHand');
    }
  };

  // Thầy Thọ phát âm thanh tương tác
  const triggerSound = (type: SoundEffectType) => {
    const effect = SOUND_EFFECTS.find(s => s.type === type);
    playSound(type);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'sound',
      payload: {
        type,
        label: effect?.label,
        icon: effect?.icon
      }
    });
    toast(`Đã phát âm thanh: ${effect?.label} ${effect?.icon}`, { duration: 1500 });
  };

  // Thầy Thọ tắt mic cả lớp
  const handleMuteAll = () => {
    if (jitsiApiRef.current) {
      try {
        jitsiApiRef.current.executeCommand('muteEveryone');
        toast.success('Đã gửi lệnh tắt mic toàn bộ học sinh trong phòng!');
      } catch (e) {
        toast.error('Chưa thể gửi lệnh tắt mic qua Jitsi');
      }
    } else {
      toast.success('Đã yêu cầu tắt mic học sinh!');
    }
  };

  // Thầy Thọ phát đề thi cho cả lớp
  const handleBroadcastExam = (examId: string) => {
    const selected = exams.find(e => e.id === examId);
    setActiveExamId(examId);
    setActiveExamTitle(selected?.title || 'Bài tập trực tiếp');
    setLayoutMode('split');
    playSound('fanfare');

    channelRef.current?.send({
      type: 'broadcast',
      event: 'broadcast_exam',
      payload: {
        examId,
        title: selected?.title || 'Bài tập trực tiếp'
      }
    });

    toast.success(`Đã phát đề "${selected?.title || 'Đề thi'}" cho học sinh!`, { icon: '🚀' });
  };

  // Thu hồi đề thi
  const handleCloseExam = () => {
    setActiveExamId(null);
    setLayoutMode('video');
    channelRef.current?.send({
      type: 'broadcast',
      event: 'broadcast_exam',
      payload: { examId: null }
    });
    toast('Đã đóng đề thi trên màn hình học sinh.');
  };

  // Bật/tắt bảo vệ mật khẩu phòng
  const toggleRequirePin = (value: boolean) => {
    setRequirePin(value);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'room_settings',
      payload: { requirePin: value, pin: roomPin }
    });
    toast.success(value ? `Đã BẬT mật khẩu phòng: ${roomPin}` : 'Đã TẮT mật khẩu, học sinh vào tự do!');
  };

  // Xác nhận vào phòng học
  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      toast.error('Vui lòng nhập họ và tên của bạn!');
      return;
    }

    if (requirePin && !isHost) {
      if (pinInput.trim() !== roomPin.trim()) {
        toast.error('Mật khẩu phòng không đúng! Vui lòng hỏi Thầy Thọ.');
        return;
      }
    }

    localStorage.setItem('live_student_name', studentName.trim());
    setHasJoined(true);
  };

  // Đăng nhập quyền Giáo viên
  const handleHostLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (hostPinInput.trim() === TEACHER_PHONE || hostPinInput.trim() === '2025' || hostPinInput.trim() === 'thaytho') {
      setIsHost(true);
      setStudentName('Thầy Lương Thọ');
      setShowHostLogin(false);
      toast.success('Xin chào Thầy Thọ! Đã kích hoạt toàn quyền Quản trị phòng học.', { icon: '👨‍🏫' });
    } else {
      toast.error('Mã truy cập quyền giáo viên không chính xác!');
    }
  };

  // Sao chép link phòng
  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}/0345833133`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    toast.success('Đã sao chép link phòng: ' + fullUrl);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      <Toaster position="top-center" toastOptions={{ duration: 3000, max: 2 }} />

      {/* --- THANH HEADER CỐ ĐỊNH --- */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-3 md:px-5 flex items-center justify-between shrink-0 z-30">
        {/* Trái: Logo & Thông tin phòng */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            title="Về trang chủ"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <span className="bg-rose-500/20 text-rose-400 text-xs px-2 py-0.5 rounded font-black tracking-wider uppercase">
              LIVE
            </span>
            <h1 className="text-sm md:text-base font-bold text-white flex items-center gap-1.5">
              Lớp Học Thầy Thọ
              <span className="hidden sm:inline text-xs font-normal text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Hotline: 0345.833.133
              </span>
            </h1>
          </div>
        </div>

        {/* Giữa: Chuyển đổi chế độ màn hình (khi có đề thi) */}
        {activeExamId && hasJoined && (
          <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 text-xs">
            <button
              onClick={() => setLayoutMode('video')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${layoutMode === 'video' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Chỉ Video</span>
            </button>
            <button
              onClick={() => setLayoutMode('split')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${layoutMode === 'split' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Song song (Đề + Live)</span>
            </button>
            <button
              onClick={() => setLayoutMode('exam')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${layoutMode === 'exam' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Tập trung làm bài</span>
            </button>
          </div>
        )}

        {/* Phải: Copy Link, Giơ tay & Thông tin Host */}
        <div className="flex items-center gap-2">
          {hasJoined && !isHost && (
            <button
              onClick={() => handleRaiseHand()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow ${
                myHandRaised
                  ? 'bg-amber-500 text-slate-950 animate-bounce'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30'
              }`}
            >
              <Hand className="w-4 h-4" />
              <span>{myHandRaised ? 'Đang giơ tay' : 'Giơ tay ✋'}</span>
            </button>
          )}

          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition"
            title="Sao chép link gửi cho học sinh/phụ huynh"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
            <span className="hidden md:inline">{copied ? 'Đã sao chép' : 'Link phòng: 0345833133'}</span>
          </button>

          {isHost ? (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Giáo viên: Thầy Thọ</span>
            </span>
          ) : (
            !hasJoined && (
              <button
                onClick={() => setShowHostLogin(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Thầy Thọ?</span>
              </button>
            )
          )}
        </div>
      </header>

      {/* --- BẢNG ĐIỀU KHIỂN CỦA THẦY THỌ (HOST CONTROL BAR) --- */}
      {isHost && hasJoined && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs z-20 shadow-lg">
          {/* Nhóm 1: Bàn nút bấm âm thanh tương tác */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
              <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
              Âm thanh:
            </span>
            {SOUND_EFFECTS.map(sound => (
              <button
                key={sound.type}
                onClick={() => triggerSound(sound.type)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600/80 text-slate-200 hover:text-white border border-slate-700 hover:border-indigo-500 transition shadow-sm shrink-0 active:scale-95"
                title={sound.description}
              >
                <span>{sound.icon}</span>
                <span className="font-medium">{sound.label}</span>
              </button>
            ))}
          </div>

          {/* Nhóm 2: Quyền kiểm soát & Phát đề thi */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Tắt mic cả lớp */}
            <button
              onClick={handleMuteAll}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white font-medium transition shadow active:scale-95"
              title="Tắt mic của tất cả học sinh"
            >
              <MicOff className="w-3.5 h-3.5" />
              <span>Tắt mic cả lớp</span>
            </button>

            {/* Bật/Tắt mật khẩu phòng */}
            <div className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded border border-slate-700">
              {requirePin ? (
                <Lock className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Unlock className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <button
                onClick={() => toggleRequirePin(!requirePin)}
                className={`font-semibold ${requirePin ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`}
              >
                {requirePin ? `Khóa PIN (${roomPin})` : 'Mở tự do'}
              </button>
            </div>

            {/* Dropdown phát đề thi */}
            <div className="flex items-center gap-1.5">
              {activeExamId ? (
                <button
                  onClick={handleCloseExam}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Đóng đề thi</span>
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <select
                    onChange={(e) => {
                      if (e.target.value) handleBroadcastExam(e.target.value);
                    }}
                    defaultValue=""
                    className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 max-w-[150px] truncate"
                  >
                    <option value="" disabled>📝 Chọn đề thi phát...</option>
                    {exams.map(exam => (
                      <option key={exam.id} value={exam.id}>{exam.title}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Học sinh giơ tay badge */}
            {raisedHands.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                <Hand className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-medium max-w-[250px] truncate">{raisedHands.length} bạn giơ tay: {raisedHands.join(', ')}</span>
                <button
                  onClick={handleLowerAllHands}
                  className="ml-1 px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] transition active:scale-95"
                  title="Hạ tay tất cả học sinh"
                >
                  Hạ tay ✕
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- NỘI DUNG CHÍNH (KHU VỰC LIVE & ĐỀ THI) --- */}
      <main className="flex-1 relative flex overflow-hidden">
        {/* MODAL VÀO PHÒNG HỌC (NẾU CHƯA JOIN) */}
        {!hasJoined ? (
          <div className="absolute inset-0 z-40 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-rose-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-3">
                  <Video className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-xl font-black text-white">Phòng Học Trực Tuyến Thầy Thọ</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Đường link cố định: <span className="text-indigo-400 font-mono font-semibold">0345.833.133</span>
                </p>
                <div className="inline-flex items-center gap-1.5 mt-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Không giới hạn thời gian (0đ Zoom)
                </div>
              </div>

              {!showHostLogin ? (
                <form onSubmit={handleJoinSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Họ và tên của bạn:
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Nguyễn Văn An - Lớp 10A1"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>

                  {requirePin && (
                    <div>
                      <label className="block text-xs font-semibold text-amber-300 mb-1.5 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" />
                        Mật khẩu phòng học (Thầy Thọ yêu cầu):
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="Nhập mã PIN phòng..."
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-amber-500/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition transform active:scale-98 flex items-center justify-center gap-2"
                  >
                    <span>Vào phòng học ngay</span>
                    <Sparkles className="w-4 h-4" />
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => setShowHostLogin(true)}
                      className="text-xs text-slate-500 hover:text-slate-300 underline"
                    >
                      Bạn là Thầy Lương Thọ? Bấm để vào quyền Quản trị phòng
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleHostLogin} className="space-y-4">
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                    👨‍🏫 Đăng nhập quyền Giáo viên (Thầy Thọ) để mở khóa thanh âm thanh, tắt mic cả lớp, và phát đề thi.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Mã PIN hoặc Số điện thoại Thầy Thọ:
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Nhập 0345833133 hoặc PIN..."
                      value={hostPinInput}
                      onChange={(e) => setHostPinInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowHostLogin(false)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                    >
                      Quay lại
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition"
                    >
                      Xác nhận Giáo viên
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ) : null}

        {/* CONTAINER 1: VIDEO JITSI MEET */}
        <div
          className={`h-full transition-all duration-300 relative bg-black ${
            !activeExamId || layoutMode === 'video'
              ? 'w-full'
              : layoutMode === 'split'
              ? 'w-full md:w-1/2 border-r border-slate-800'
              : 'w-0 hidden md:block md:w-1/4 opacity-60 hover:opacity-100'
          }`}
        >
          <div ref={jitsiContainerRef} className="w-full h-full" />
        </div>

        {/* CONTAINER 2: BÀI KIỂM TRA / ĐỀ THI TRỰC TIẾP (KHI THẦY PHÁT) */}
        {activeExamId && (
          <div
            className={`h-full transition-all duration-300 overflow-y-auto bg-slate-900 ${
              layoutMode === 'exam'
                ? 'w-full md:w-3/4'
                : layoutMode === 'split'
                ? 'w-full md:w-1/2'
                : 'hidden'
            }`}
          >
            <div className="p-2 sm:p-4 h-full flex flex-col">
              <div className="bg-slate-800/90 rounded-xl p-3 mb-3 border border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                    Đề Thi Trực Tiếp Trong Tiết Học
                  </span>
                  <h3 className="text-sm font-bold text-white">{activeExamTitle}</h3>
                </div>
                {isHost && (
                  <button
                    onClick={handleCloseExam}
                    className="text-xs px-2.5 py-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white font-medium"
                  >
                    Thu hồi đề
                  </button>
                )}
              </div>

              <div className="flex-1 bg-white rounded-xl overflow-hidden shadow-xl text-slate-900">
                <LessonExamRoom
                  examId={activeExamId}
                  studentName={studentName || 'Học sinh'}
                  onSubmitted={(percentage) => {
                    toast.success(`Học sinh đã nộp bài thành công! Điểm: ${percentage}%`);
                    playSound('applause');
                  }}
                  onExit={() => {
                    setLayoutMode('video');
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
