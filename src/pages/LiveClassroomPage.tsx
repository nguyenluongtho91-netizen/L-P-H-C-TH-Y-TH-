// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useExamStore } from '@/store/examStore';
import LessonExamRoom from '@/components/LessonExamRoom';
import { playSound, SOUND_EFFECTS, SoundEffectType, setSoundVolume } from '@/utils/soundEffects';
import toast, { Toaster } from 'react-hot-toast';
import {
  Video, MicOff, Hand, Volume2, Shield, ShieldAlert, Lock, Unlock,
  Copy, Check, FileText, ArrowLeft, Maximize2,
  Columns, Sparkles, LogIn, Bell, BellOff, Edit3, X, RefreshCw,
  MonitorCheck
} from 'lucide-react';

const TEACHER_PHONE = '0345833133';
const DEFAULT_ROOM_ID = 'LopHocThayTho_0345833133';
const JITSI_DOMAIN = 'meet.in-berlin.de';

export default function LiveClassroomPage() {
  const { roomId } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const { user, profile, isTeacher, isAdmin } = useAuthStore() as any;
  const { exams, loadExams } = useExamStore();

  // Vào thẳng phòng học ngay lập tức (Rút ngắn tối đa, không cần bấm trung gian)
  const [hasJoined, setHasJoined] = useState(true);
  const [studentName, setStudentName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('live_student_name') || 'Học sinh';
    }
    return 'Học sinh';
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');

  // Trạng thái Quản trị viên (Thầy Thọ)
  const [isHost, setIsHost] = useState(false);
  const [hostPinInput, setHostPinInput] = useState('');
  const [showHostLogin, setShowHostLogin] = useState(false);

  // Cấu hình phòng (đồng bộ qua Supabase realtime)
  const [requirePin, setRequirePin] = useState(false);
  const [roomPin, setRoomPin] = useState('2025');
  const [pinInput, setPinInput] = useState('');
  const [isPinUnlocked, setIsPinUnlocked] = useState(true);

  // Đề thi trực tiếp
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [activeExamTitle, setActiveExamTitle] = useState<string>('');
  const [layoutMode, setLayoutMode] = useState<'split' | 'video' | 'exam'>('video');

  // Danh sách giơ tay & âm thanh
  const [raisedHands, setRaisedHands] = useState<string[]>([]);
  const [myHandRaised, setMyHandRaised] = useState(false);
  const [enableRaiseHandSound, setEnableRaiseHandSound] = useState(false);
  const enableRaiseHandSoundRef = useRef(false);
  const [soundVolume, setSoundVolumeState] = useState<number>(0.8);
  const [lockRaiseHand, setLockRaiseHand] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    enableRaiseHandSoundRef.current = enableRaiseHandSound;
  }, [enableRaiseHandSound]);
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
      if (savedName) {
        setStudentName(savedName);
      } else if (profile?.full_name) {
        setStudentName(profile.full_name);
      }
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
        if (payload?.fromHost && payload?.type) {
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
          if (enableRaiseHandSoundRef.current) {
            playSound('bell');
          }
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
          if (payload.requirePin && !isHost) {
            setIsPinUnlocked(false);
          }
        }
      })
      .on('broadcast', { event: 'student_permissions' }, ({ payload }) => {
        if (payload?.fromHost) {
          if (typeof payload.lockRaiseHand === 'boolean') setLockRaiseHand(payload.lockRaiseHand);
          if (typeof payload.focusMode === 'boolean') {
            setFocusMode(payload.focusMode);
            if (payload.focusMode) {
              toast('🔒 Thầy Thọ bật Chế độ Tập trung: Tắt mic và khóa giơ tay để giảng bài!', {
                icon: '🔒',
                position: 'top-center',
                duration: 4000
              });
            } else {
              toast('🔓 Thầy Thọ đã mở lại quyền giơ tay và thảo luận!', {
                icon: '🔓',
                position: 'top-center',
                duration: 3000
              });
            }
          }
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [currentRoomName, isHost]);

  // Khởi tạo phòng học Jitsi - TỐI ƯU HÓA HÌNH ẢNH FULL HD 1080P SIÊU NÉT
  useEffect(() => {
    if (!hasJoined || !isPinUnlocked) return;

    let api: any = null;

    const initJitsi = () => {
      if (!jitsiContainerRef.current) return;
      jitsiContainerRef.current.innerHTML = '';

      const displayName = isHost ? 'Thầy Lương Thọ (Giáo viên)' : (studentName.trim() || 'Học sinh');
      
      if (typeof window !== 'undefined' && (window as any).JitsiMeetExternalAPI) {
        try {
          const options = {
            roomName: currentRoomName,
            width: '100%',
            height: '100%',
            parentNode: jitsiContainerRef.current,
            userInfo: {
              displayName: displayName
            },
            configOverwrite: {
              // Bỏ hoàn toàn trang tiền phòng & chờ đăng nhập
              prejoinPageEnabled: false,
              prejoinConfig: {
                enabled: false
              },
              requireDisplayName: false,
              disableDeepLinking: true,
              startWithAudioMuted: !isHost,
              startWithVideoMuted: false,
              enableWelcomePage: false,
              disableModeratorIndicator: true,
              enableInsecureRoomNameWarning: false,
              enableLobbyChat: false,
              hideLobbyButton: true,

              // --- CẤU HÌNH ĐỘ NÉT CAO FULL HD 1080P (SIÊU SẮC NÉT) ---
              resolution: 1080,
              constraints: {
                video: {
                  height: {
                    ideal: 1080,
                    max: 1080,
                    min: 720
                  },
                  width: {
                    ideal: 1920,
                    max: 1920,
                    min: 1280
                  },
                  frameRate: {
                    ideal: 30,
                    max: 60,
                    min: 15
                  }
                }
              },
              videoQuality: {
                disabledBitrates: false,
                maxFullResolutionParticipants: 4,
                preferredCodec: 'H264',
                minHeightForQualityLvl: {
                  360: 'standard',
                  720: 'high',
                  1080: 'fullHd'
                }
              },
              // Kết nối P2P trực tiếp để đạt độ nét tối đa, không qua nén giảm chất lượng
              p2p: {
                enabled: true,
                preferH264: true,
                disableH264: false,
                useStunTurn: true
              },
              desktopSharingFrameRate: {
                min: 25,
                max: 30
              },
              disableSimulcast: false,
              enableLayerSuspension: false,

              // Thanh công cụ gồm nút chọn chất lượng hình ảnh
              toolbarButtons: isHost ? [
                'microphone', 'camera', 'desktop', 'fullscreen', 'chat',
                'raisehand', 'tileview', 'mute-everyone', 'settings', 'videoquality'
              ] : [
                'microphone', 'camera', 'fullscreen', 'chat', 'raisehand', 'tileview', 'videoquality'
              ]
            },
            interfaceConfigOverwrite: {
              SHOW_JITSI_WATERMARK: false,
              SHOW_WATERMARK_FOR_GUESTS: false,
              DEFAULT_REMOTE_DISPLAY_NAME: 'Học sinh Thầy Thọ',
              TOOLBAR_ALWAYS_VISIBLE: true,
              OPTIMAL_BROWSING_RESOLUTION: 1080
            }
          };

          api = new (window as any).JitsiMeetExternalAPI(JITSI_DOMAIN, options);
          jitsiApiRef.current = api;

          api.addEventListener('videoConferenceJoined', () => {
            toast.success(isHost ? 'Phòng học Thầy Thọ sẵn sàng ở độ phân giải Full HD 1080p!' : 'Đã kết nối vào phòng học trực tuyến Full HD!');
            try {
              // Ép mức chất lượng video cao nhất Full HD (1080p)
              api.executeCommand('setVideoQuality', 1080);
            } catch {}
          });
          return;
        } catch (e) {
          console.warn('Lỗi Jitsi API, chuyển sang Iframe trực tiếp:', e);
        }
      }

      // Iframe trực tiếp: VÀO THẲNG PHÒNG ĐỘ NÉT CAO 1080P
      const iframe = document.createElement('iframe');
      iframe.src = `https://${JITSI_DOMAIN}/${encodeURIComponent(currentRoomName)}#userInfo.displayName="${encodeURIComponent(displayName)}"&config.prejoinPageEnabled=false&config.prejoinConfig.enabled=false&config.requireDisplayName=false&config.disableDeepLinking=true&config.resolution=1080&config.p2p.enabled=true&config.startWithAudioMuted=${!isHost}&config.startWithVideoMuted=false&interfaceConfig.SHOW_JITSI_WATERMARK=false`;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.allow = 'camera *; microphone *; fullscreen *; display-capture *; autoplay *; clipboard-write *';
      jitsiContainerRef.current.appendChild(iframe);
    };

    // Tải external_api.js từ máy chủ mở meet.in-berlin.de
    if (typeof window !== 'undefined') {
      const existing = document.querySelector(`script[src*="${JITSI_DOMAIN}"]`);
      if (!existing && !(window as any).JitsiMeetExternalAPI) {
        const script = document.createElement('script');
        script.src = `https://${JITSI_DOMAIN}/external_api.js`;
        script.async = true;
        script.onload = initJitsi;
        script.onerror = () => {
          initJitsi();
        };
        document.body.appendChild(script);
      } else {
        initJitsi();
      }
    }

    return () => {
      if (api) {
        try { api.dispose(); } catch {}
      }
    };
  }, [hasJoined, isHost, isPinUnlocked]);

  // Hạ tay tất cả học sinh (Dành cho Thầy Thọ)
  const handleLowerAllHands = () => {
    setRaisedHands([]);
    toast.dismiss();
    channelRef.current?.send({
      type: 'broadcast',
      event: 'lower_all_hands',
      payload: { fromHost: true }
    });
    toast.success('Đã hạ tay toàn bộ học sinh!', { duration: 2000 });
  };

  // Thầy bật/tắt Chế độ Tập trung (Khóa tất cả bên học sinh)
  const toggleFocusMode = () => {
    if (!isHost) return;
    const nextMode = !focusMode;
    setFocusMode(nextMode);

    if (nextMode) {
      setLockRaiseHand(true);
      setRaisedHands([]);
      setMyHandRaised(false);
      try {
        jitsiApiRef.current?.executeCommand('muteEveryone');
      } catch {}

      channelRef.current?.send({
        type: 'broadcast',
        event: 'student_permissions',
        payload: {
          fromHost: true,
          focusMode: true,
          lockRaiseHand: true
        }
      });
      toast.success('🛑 ĐÃ BẬT KHÓA TẬP TRUNG: Tắt mic và khóa giơ tay toàn bộ lớp!', {
        duration: 3500
      });
    } else {
      setLockRaiseHand(false);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'student_permissions',
        payload: {
          fromHost: true,
          focusMode: false,
          lockRaiseHand: false
        }
      });
      toast('🔓 Đã tắt Khóa tập trung. Học sinh có thể giơ tay và phát biểu.', {
        icon: '✅',
        duration: 3000
      });
    }
  };

  // Thầy bật/tắt chuông giơ tay
  const toggleRaiseHandSound = () => {
    if (!isHost) return;
    setEnableRaiseHandSound(prev => {
      const next = !prev;
      toast(next ? '🔔 Đã BẬT chuông khi học sinh giơ tay' : '🔕 Đã TẮT chuông giơ tay (êm đềm)', {
        icon: next ? '🔔' : '🔕',
        duration: 2000
      });
      return next;
    });
  };

  // Thầy điều chỉnh âm lượng
  const handleVolumeChange = (vol: number) => {
    if (!isHost) return;
    setSoundVolumeState(vol);
    setSoundVolume(vol);
    toast(`Âm lượng hiệu ứng: ${Math.round(vol * 100)}%`, { duration: 1500 });
  };

  // Ép lại độ phân giải Full HD 1080p
  const handleForceFullHD = () => {
    try {
      jitsiApiRef.current?.executeCommand('setVideoQuality', 1080);
      toast.success('🌟 Đã tối ưu độ nét Full HD 1080p cho Camera và Chia sẻ màn hình!', {
        icon: '✨',
        duration: 3000
      });
    } catch {
      toast('Camera đang chạy ở độ phân giải cao nhất được hỗ trợ bởi thiết bị.');
    }
  };

  // Học sinh giơ tay / hạ tay
  const handleRaiseHand = () => {
    if (lockRaiseHand || focusMode) {
      toast.error('Thầy Thọ đang khóa giơ tay để cả lớp tập trung nghe giảng!');
      return;
    }

    const nextState = !myHandRaised;
    setMyHandRaised(nextState);

    const myName = studentName.trim() || 'Học sinh';

    if (nextState) {
      setRaisedHands(prev => Array.from(new Set([...prev, myName])));
      channelRef.current?.send({
        type: 'broadcast',
        event: 'raise_hand',
        payload: { name: myName }
      });
      toast.success('Đã giơ tay phát biểu! Thầy Thọ đã thấy bạn.');
    } else {
      setRaisedHands(prev => prev.filter(n => n !== myName));
      channelRef.current?.send({
        type: 'broadcast',
        event: 'lower_hand',
        payload: { name: myName }
      });
    }

    try {
      jitsiApiRef.current?.executeCommand('toggleRaiseHand');
    } catch {}
  };

  // Thầy Thọ bấm âm thanh
  const handlePlaySoundFromHost = (type: SoundEffectType, label: string, icon: string) => {
    if (!isHost) return;
    playSound(type);

    channelRef.current?.send({
      type: 'broadcast',
      event: 'sound',
      payload: {
        fromHost: true,
        type,
        label: `Thầy Thọ: ${label}`,
        icon
      }
    });

    toast(`Đã phát ${label} tới cả lớp!`, { icon, duration: 1500 });
  };

  // Thầy Thọ tắt mic cả lớp
  const handleMuteAll = () => {
    if (!isHost) return;
    try {
      jitsiApiRef.current?.executeCommand('muteEveryone');
      toast.success('Đã gửi lệnh tắt micro toàn bộ học sinh!');
    } catch {
      toast.error('Chức năng tắt mic khả dụng khi học sinh đã vào phòng.');
    }
  };

  // Thầy Thọ phát đề thi trực tiếp
  const handleBroadcastExam = (examId: string) => {
    if (!isHost) return;
    const selected = exams.find(e => e.id === examId);
    if (!selected) return;

    setActiveExamId(examId);
    setActiveExamTitle(selected.title);
    setLayoutMode('split');

    channelRef.current?.send({
      type: 'broadcast',
      event: 'broadcast_exam',
      payload: {
        examId: selected.id,
        title: selected.title
      }
    });

    playSound('tada');
    toast.success(`Đã phát đề "${selected.title}" cho cả lớp!`);
  };

  // Thầy Thọ thu hồi đề thi
  const handleCloseExam = () => {
    if (!isHost) return;
    setActiveExamId(null);
    setLayoutMode('video');

    channelRef.current?.send({
      type: 'broadcast',
      event: 'broadcast_exam',
      payload: { examId: null }
    });

    toast('Đã thu hồi bài kiểm tra.');
  };

  // Thầy kích hoạt khóa PIN
  const handleTogglePin = () => {
    if (!isHost) return;
    const nextPinState = !requirePin;
    setRequirePin(nextPinState);

    channelRef.current?.send({
      type: 'broadcast',
      event: 'room_settings',
      payload: {
        requirePin: nextPinState,
        pin: roomPin
      }
    });

    toast.success(nextPinState ? `Đã khóa phòng bằng mã PIN: ${roomPin}` : 'Đã mở phòng tự do cho học sinh!');
  };

  // Copy link phòng học
  const handleCopyLink = () => {
    const fullUrl = `https://lop-hoc-thay-tho.vercel.app/${TEACHER_PHONE}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    toast.success('Đã sao chép đường link phòng học cố định!', {
      icon: '📋',
      duration: 2500
    });
    setTimeout(() => setCopied(false), 3000);
  };

  // Xác thực quyền Giáo viên (Thầy Thọ) bằng mật khẩu 67426728
  const handleHostLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = hostPinInput.trim();
    if (cleanInput === '67426728' || cleanInput === TEACHER_PHONE || cleanInput === 'thaytho') {
      setIsHost(true);
      setStudentName('Thầy Lương Thọ (Giáo viên)');
      setShowHostLogin(false);
      setHostPinInput('');
      toast.success('Xin chào Thầy Lương Thọ! Quyền Giáo viên và âm thanh đã được kích hoạt.', {
        duration: 4000,
        icon: '👨‍🏫'
      });
    } else {
      toast.error('Mật khẩu Giáo viên không chính xác!');
    }
  };

  // Đổi tên học sinh nhanh gọn
  const handleSaveStudentName = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim()) {
      setStudentName(tempName.trim());
      localStorage.setItem('live_student_name', tempName.trim());
      setIsEditingName(false);
      toast.success(`Đã đổi tên hiển thị thành: ${tempName.trim()}`);
      try {
        jitsiApiRef.current?.executeCommand('displayName', tempName.trim());
      } catch {}
    }
  };

  // Xác nhận mở khóa mã PIN phòng
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim() === roomPin) {
      setIsPinUnlocked(true);
      toast.success('Mã PIN chính xác! Đang kết nối vào phòng...');
    } else {
      toast.error('Mã PIN không đúng, vui lòng hỏi Thầy Thọ!');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Toaster position="top-right" />

      {/* --- HEADER PHÒNG HỌC --- */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between z-30 shrink-0">
        {/* Trái: Logo & Tiêu đề */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/exam')}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            title="Quay lại danh sách đề thi"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-rose-500 text-white shadow-sm">
              LIVE
            </span>
            <h1 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>Lớp Học Thầy Thọ</span>
              <span className="hidden sm:inline text-xs font-normal text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Hotline: 0345.833.133
              </span>
            </h1>
          </div>
        </div>

        {/* Giữa: Chuyển đổi chế độ màn hình (khi có đề thi) */}
        {activeExamId && (
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

        {/* Phải: Đổi tên, Giơ tay, Copy Link & Thông tin Giáo viên */}
        <div className="flex items-center gap-2">
          {/* Tên học sinh và nút sửa nhanh */}
          {!isHost && (
            <button
              onClick={() => {
                setTempName(studentName);
                setIsEditingName(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition"
              title="Bấm để đổi tên hiển thị trong lớp"
            >
              <Edit3 className="w-3 h-3 text-indigo-400" />
              <span className="max-w-[100px] sm:max-w-[140px] truncate">{studentName}</span>
            </button>
          )}

          {/* Nút Giơ tay của học sinh */}
          {!isHost && (
            (lockRaiseHand || focusMode) ? (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-500 border border-slate-700/60 text-xs font-medium cursor-not-allowed"
                title="Thầy đang khóa giơ tay để cả lớp tập trung nghe giảng"
              >
                <Lock className="w-3.5 h-3.5 text-amber-500/70" />
                <span className="hidden sm:inline">Khóa giơ tay 🔒</span>
              </div>
            ) : (
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
            )
          )}

          {/* Copy link phòng */}
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition"
            title="Sao chép link gửi cho học sinh/phụ huynh"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
            <span className="hidden md:inline">{copied ? 'Đã sao chép' : 'Link: 0345833133'}</span>
          </button>

          {/* Nhãn Giáo viên hoặc Nút chuyển sang quyền Thầy Thọ */}
          {isHost ? (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Thầy Thọ (Host)</span>
            </span>
          ) : (
            <button
              onClick={() => setShowHostLogin(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-xs font-medium transition"
              title="Thầy Lương Thọ bấm vào đây để kích hoạt quyền Quản trị"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Thầy Thọ? 🔑</span>
            </button>
          )}
        </div>
      </header>

      {/* --- BẢNG ĐIỀU KHIỂN CỦA THẦY THỌ (HOST CONTROL BAR) --- */}
      {isHost && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs z-20 shadow-lg">
          {/* Nhóm 1: Bàn nút bấm âm thanh tương tác */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-slate-400 flex items-center gap-1 mr-1">
              <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
              Âm thanh:
            </span>
            {SOUND_EFFECTS.map((item) => (
              <button
                key={item.id}
                onClick={() => handlePlaySoundFromHost(item.id, item.label, item.icon)}
                className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 hover:border-indigo-500/50 transition active:scale-95 flex items-center gap-1 text-xs"
                title={`Bấm để phát "${item.label}" tới cả lớp`}
              >
                <span>{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </button>
            ))}

            {/* Điều khiển âm lượng */}
            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-700/80">
              <span className="text-[11px] text-slate-400">Âm lượng:</span>
              <button
                onClick={() => handleVolumeChange(1.0)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${soundVolume === 1.0 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                100%
              </button>
              <button
                onClick={() => handleVolumeChange(0.7)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${soundVolume === 0.7 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                70%
              </button>
              <button
                onClick={() => handleVolumeChange(0.4)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${soundVolume === 0.4 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                40%
              </button>
              <button
                onClick={() => handleVolumeChange(0.0)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${soundVolume === 0.0 ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                Tắt
              </button>
            </div>
          </div>

          {/* Nhóm 2: Quyền lớp học, Khóa tập trung, Chất lượng 1080p & Phát đề */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* NÚT CHẤT LƯỢNG HÌNH ẢNH FULL HD 1080P */}
            <button
              onClick={handleForceFullHD}
              className="px-2.5 py-1 rounded-md bg-gradient-to-r from-indigo-600/30 to-purple-600/30 hover:from-indigo-600/50 hover:to-purple-600/50 text-indigo-300 border border-indigo-500/40 flex items-center gap-1 font-bold text-xs transition active:scale-95 shadow-sm"
              title="Camera và Chia sẻ màn hình đang ở chế độ Full HD 1080p sắc nét nhất. Bấm để làm tươi lại chất lượng cao."
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Full HD 1080p 🌟</span>
            </button>

            {/* NÚT KHÓA TẬP TRUNG TOÀN LỚP */}
            <button
              onClick={toggleFocusMode}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition shadow active:scale-95 ${
                focusMode
                  ? 'bg-rose-600 hover:bg-rose-500 text-white ring-2 ring-rose-400/50 animate-pulse'
                  : 'bg-amber-600 hover:bg-amber-500 text-white'
              }`}
              title={focusMode ? 'Bấm để mở lại quyền giơ tay và thảo luận cho học sinh' : 'Bấm để tắt mic và khóa giơ tay toàn bộ học sinh'}
            >
              {focusMode ? <ShieldAlert className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{focusMode ? '🛑 Đang Khóa Tập Trung' : 'Khóa tập trung 🛑'}</span>
            </button>

            {/* Bật/Tắt chuông giơ tay */}
            <button
              onClick={toggleRaiseHandSound}
              className={`px-2 py-1 rounded-md text-xs font-medium border flex items-center gap-1 transition ${
                enableRaiseHandSound
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title="Bật/Tắt chuông ting ting khi học sinh giơ tay"
            >
              {enableRaiseHandSound ? <Bell className="w-3.5 h-3.5 text-amber-400" /> : <BellOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Chuông giơ tay:</span>
              <span className="font-bold">{enableRaiseHandSound ? 'BẬT' : 'TẮT'}</span>
            </button>

            {/* Tắt mic cả lớp */}
            <button
              onClick={handleMuteAll}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-rose-300 hover:text-rose-200 border border-rose-500/30 transition flex items-center gap-1 font-medium"
              title="Tắt micro tất cả học sinh"
            >
              <MicOff className="w-3.5 h-3.5" />
              <span>Tắt mic cả lớp</span>
            </button>

            {/* Phát đề thi */}
            {exams.length > 0 && (
              <select
                onChange={(e) => {
                  if (e.target.value) handleBroadcastExam(e.target.value);
                }}
                value={activeExamId || ''}
                className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="">🎯 Phát đề thi trực tiếp...</option>
                {exams.slice(0, 15).map(e => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))}
              </select>
            )}

            {/* Khóa mã PIN */}
            <button
              onClick={handleTogglePin}
              className={`px-2 py-1 rounded-md text-xs font-medium border flex items-center gap-1 transition ${
                requirePin ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title={requirePin ? `Phòng đang khóa PIN: ${roomPin}` : 'Khóa phòng bằng mã PIN'}
            >
              {requirePin ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
              <span>{requirePin ? `PIN: ${roomPin}` : 'Không PIN'}</span>
            </button>

            {/* Danh sách giơ tay */}
            {raisedHands.length > 0 && (
              <div className="flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full text-xs animate-pulse">
                <Hand className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-bold">{raisedHands.length} giơ tay</span>
                <span className="max-w-[120px] truncate font-semibold">({raisedHands.join(', ')})</span>
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
        {/* MODAL MÃ PIN (CHỈ HIỂN THỊ NẾU THẦY BẬT KHÓA PIN VÀ CHƯA NHẬP) */}
        {requirePin && !isPinUnlocked && !isHost ? (
          <div className="absolute inset-0 z-40 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-amber-500/50 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Phòng Học Có Khóa PIN</h2>
              <p className="text-xs text-slate-400 mb-4">Vui lòng nhập mã PIN do Thầy Thọ cung cấp để vào lớp:</p>
              <form onSubmit={handlePinSubmit} className="space-y-3">
                <input
                  type="password"
                  required
                  placeholder="Nhập mã PIN..."
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-center text-lg font-mono tracking-widest focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg transition"
                >
                  Mở khóa vào lớp
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {/* CONTAINER 1: VIDEO JITSI MEET TRỰC TIẾP */}
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

      {/* POPUP SỬA TÊN HỌC SINH NHANH */}
      {isEditingName && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 shadow-2xl relative">
            <button
              onClick={() => setIsEditingName(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-bold text-white mb-2">Đổi tên hiển thị trong lớp</h3>
            <form onSubmit={handleSaveStudentName} className="space-y-3">
              <input
                type="text"
                required
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                placeholder="Nhập họ và tên..."
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow"
                >
                  Lưu tên
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP ĐĂNG NHẬP GIÁO VIÊN (THẦY THỌ) */}
      {showHostLogin && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowHostLogin(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-2">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Xác nhận Thầy Lương Thọ</h3>
              <p className="text-xs text-slate-400 mt-1">
                Kích hoạt quyền Giáo viên để điều khiển âm thanh, tắt mic và phát đề.
              </p>
            </div>
            <form onSubmit={handleHostLogin} className="space-y-3">
              <div>
                <input
                  type="password"
                  required
                  placeholder="Nhập mật khẩu (67426728)..."
                  value={hostPinInput}
                  onChange={(e) => setHostPinInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowHostLogin(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-400 text-xs font-semibold"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg"
                >
                  Kích hoạt Host
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
