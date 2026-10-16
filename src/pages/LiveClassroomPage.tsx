// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useExamStore } from '@/store/examStore';
import LessonExamRoom from '@/components/LessonExamRoom';
import CasioCalculator from '@/components/CasioCalculator';
import ClassroomSeatingChart from '@/components/ClassroomSeatingChart';
import ClassroomGamesModal from '@/components/ClassroomGamesModal';
import { playSound, SOUND_EFFECTS, SoundEffectType, setSoundVolume } from '@/utils/soundEffects';
import toast, { Toaster } from 'react-hot-toast';
import {
  Video, MicOff, Hand, Volume2, Shield, ShieldAlert, Lock, Unlock,
  Copy, Check, FileText, ArrowLeft, Maximize2,
  Columns, Sparkles, LogIn, Bell, BellOff, Edit3, X, RefreshCw,
  Radio, Square, Download, Grid, LayoutGrid, Users
} from 'lucide-react';

const TEACHER_PHONE = '0345833133';
const DEFAULT_ROOM_ID = 'LopHocThayTho_0345833133';
const JITSI_DOMAIN = 'meet.in-berlin.de';

export default function LiveClassroomPage() {
  const { roomId } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const { user, profile, isTeacher, isAdmin } = useAuthStore() as any;
  const { exams, loadExams } = useExamStore();

  // Vào thẳng phòng học: Học sinh chỉ cần nhập Họ và Tên là vào phòng ngay lập tức (không chờ đợi)
  const [studentName, setStudentName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('live_student_name') || '';
    }
    return '';
  });

  const [hasJoined, setHasJoined] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedRole = localStorage.getItem('user_role');
      if (savedRole === 'teacher' || savedRole === 'admin') return true;
      const savedName = localStorage.getItem('live_student_name');
      // Nếu đã có tên cụ thể (không phải mặc định) thì có thể vào thẳng
      if (savedName && savedName.trim() && savedName !== 'Học sinh') return true;
    }
    return false;
  });

  const [joinNameInput, setJoinNameInput] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('live_student_name');
      return (saved && saved !== 'Học sinh') ? saved : '';
    }
    return '';
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [isKicked, setIsKicked] = useState(false);
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

  // Chế độ xem: 'video' (chỉ video), 'classroom' (sơ đồ bàn học), 'split' (song song), 'exam' (làm bài)
  const [layoutMode, setLayoutMode] = useState<'video' | 'classroom' | 'split' | 'exam'>('video');

  // Danh sách học sinh thực tế trong phòng (Không dùng dữ liệu ảo, chỉ hiển thị người thật vào học)
  const [studentList, setStudentList] = useState<Array<{ id?: string; name: string; isHost?: boolean }>>([]);

  // Danh sách giơ tay & âm thanh
  const [raisedHands, setRaisedHands] = useState<string[]>([]);
  const [myHandRaised, setMyHandRaised] = useState(false);
  const [enableRaiseHandSound, setEnableRaiseHandSound] = useState(false);
  const enableRaiseHandSoundRef = useRef(false);
  const [soundVolume, setSoundVolumeState] = useState<number>(0.8);
  const [lockRaiseHand, setLockRaiseHand] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showCasio, setShowCasio] = useState(false);
  const [showGamesModal, setShowGamesModal] = useState(false);

  // --- CHẾ ĐỘ GHI MÀN HÌNH BÀI GIẢNG (SCREEN RECORDER) ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<any>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<any>(null);

  useEffect(() => {
    enableRaiseHandSoundRef.current = enableRaiseHandSound;
  }, [enableRaiseHandSound]);
  const [copied, setCopied] = useState(false);

  // Jitsi container & API ref
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const channelRef = useRef<any>(null);

  const currentRoomName = roomId ? `LopHocThayTho_${roomId}` : DEFAULT_ROOM_ID;

  // Định dạng tên có kèm số BÀN học sinh hoặc BỤC GIẢNG Thầy Thọ
  const getFormattedDisplayName = (name: string, host: boolean) => {
    if (host || name.includes('Thầy') || name.includes('Lương Thọ')) {
      return '👨‍🏫 [BỤC GIẢNG] Thầy Lương Thọ';
    }
    const clean = name.trim() || 'Học sinh';
    const idx = studentList.findIndex(s => s.name === clean || s.name.includes(clean));
    const seatNum = idx >= 0 ? idx + 1 : 1;
    return `🪑 [BÀN ${String(seatNum).padStart(2, '0')}] ${clean}`;
  };


  // Dọn dẹp luồng ghi màn hình khi thoát trang
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Tự động nhận diện nếu Thầy Thọ đang đăng nhập tài khoản
  useEffect(() => {
    if (isAdmin?.() || isTeacher?.() || user?.email?.includes('tho') || profile?.role === 'teacher' || profile?.role === 'admin') {
      setIsHost(true);
      setStudentName('Thầy Lương Thọ');
      setHasJoined(true);
      try {
        jitsiApiRef.current?.executeCommand('displayName', '👨‍🏫 [BỤC GIẢNG] Thầy Lương Thọ');
      } catch {}
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

  // Cập nhật học sinh hiện tại vào danh sách bàn
  useEffect(() => {
    if (studentName && !studentName.includes('Thầy') && !isHost) {
      setStudentList(prev => {
        if (prev.some(s => s.name === studentName)) return prev;
        return [...prev, { name: studentName, isHost: false }];
      });
    }
  }, [studentName, isHost]);

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
      .on('broadcast', { event: 'student_join' }, ({ payload }) => {
        if (payload?.name && !payload.isHost && !payload.name.includes('Thầy')) {
          const clean = payload.name.replace(/🪑\s*\[BÀN\s*\d+\]\s*/i, '').trim();
          setStudentList(prev => {
            if (prev.some(s => s.name === clean)) return prev;
            return [...prev, { name: clean, isHost: false }];
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
      .on('broadcast', { event: 'kick_student' }, ({ payload }) => {
        if (payload?.name) {
          // Xóa học sinh khỏi danh sách
          setStudentList(prev => prev.filter(s => s.name !== payload.name));
          setRaisedHands(prev => prev.filter(n => n !== payload.name));

          // Nếu chính là học sinh này bị đuổi
          if (studentName && (studentName === payload.name || studentName.includes(payload.name))) {
            setIsKicked(true);
            setHasJoined(false);
            try {
              jitsiApiRef.current?.dispose?.();
            } catch {}
            toast.error('Bạn đã bị Thầy Thọ mời ra khỏi lớp học!', { duration: 10000 });
          }
        }
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'student_join',
            payload: { name: isHost ? 'Thầy Lương Thọ' : studentName, isHost }
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [currentRoomName, isHost, studentName]);

  // Khởi tạo phòng học Jitsi - TỐI ƯU HÓA HÌNH ẢNH FULL HD 1080P SIÊU NÉT
  useEffect(() => {
    if (!hasJoined || !isPinUnlocked) return;

    let api: any = null;

    const initJitsi = () => {
      if (!jitsiContainerRef.current) return;
      jitsiContainerRef.current.innerHTML = '';

      const displayName = getFormattedDisplayName(studentName, isHost);
      
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
              channelLastN: -1, // Hiển thị đầy đủ tất cả camera không bị ẩn

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
                maxFullResolutionParticipants: 8,
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

              // Thanh công cụ gồm nút chọn chất lượng hình ảnh & ghi hình
              toolbarButtons: isHost ? [
                'microphone', 'camera', 'desktop', 'fullscreen', 'chat',
                'raisehand', 'tileview', 'mute-everyone', 'settings', 'videoquality', 'localrecording'
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
              
              // Tự động quét tất cả học sinh thật đang có mặt trong phòng
              const participants = api.getParticipantsInfo?.();
              if (Array.isArray(participants)) {
                participants.forEach((p: any) => {
                  const raw = p?.displayName || '';
                  const clean = raw.replace(/🪑\s*\[BÀN\s*\d+\]\s*/i, '').replace(/👨‍🏫\s*\[BỤC GIẢNG\]\s*/i, '').trim();
                  if (clean && !clean.includes('Thầy')) {
                    setStudentList(prev => {
                      if (prev.some(s => s.name === clean || (p.participantId && s.id === p.participantId))) return prev;
                      return [...prev, { id: p.participantId, name: clean, isHost: false }];
                    });
                  }
                });
              }
            } catch {}
          });

          api.addEventListener('participantJoined', (event: any) => {
            const raw = event?.displayName || '';
            const clean = raw.replace(/🪑\s*\[BÀN\s*\d+\]\s*/i, '').replace(/👨‍🏫\s*\[BỤC GIẢNG\]\s*/i, '').trim();
            if (clean && !clean.includes('Thầy')) {
              setStudentList(prev => {
                if (prev.some(s => s.name === clean || (event.id && s.id === event.id))) return prev;
                return [...prev, { id: event.id, name: clean, isHost: false }];
              });
            }
          });

          // Tự động xóa học sinh khỏi bàn khi rời phòng
          api.addEventListener('participantLeft', (event: any) => {
            if (event?.id) {
              setStudentList(prev => prev.filter(s => s.id !== event.id));
            }
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

  // Thầy Thọ đuổi học sinh ra khỏi lớp
  const handleKickStudent = (name: string) => {
    if (!isHost) return;

    // Gửi tín hiệu đuổi qua Supabase Broadcast
    channelRef.current?.send({
      type: 'broadcast',
      event: 'kick_student',
      payload: { name, fromHost: true }
    });

    // Thử đuổi qua Jitsi API
    try {
      const parts = jitsiApiRef.current?.getParticipantsInfo?.();
      if (Array.isArray(parts)) {
        const target = parts.find((p: any) => p?.displayName?.includes(name));
        if (target) {
          jitsiApiRef.current?.executeCommand('kickParticipant', target.participantId || target.id);
        }
      }
    } catch {}

    // Cập nhật danh sách tại máy Thầy
    setStudentList(prev => prev.filter(s => s.name !== name));
    setRaisedHands(prev => prev.filter(n => n !== name));
    toast.success(`Đã đuổi học sinh "${name}" ra khỏi lớp học!`, { icon: '🚫', duration: 4000 });
  };

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

  // Định dạng thời gian ghi hình (MM:SS)
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // --- BẮT ĐẦU GHI MÀN HÌNH BÀI GIẢNG (100% MIỄN PHÍ, KHÔNG GIỚI HẠN) ---
  const handleStartRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        toast.error('Trình duyệt của bạn không hỗ trợ tính năng ghi màn hình trực tiếp.');
        return;
      }

      // Mở hộp thoại chọn màn hình/thẻ muốn ghi
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });

      recordingStreamRef.current = stream;
      recordedChunksRef.current = [];

      let mimeType = 'video/webm;codecs=vp9,opus';
      if (typeof MediaRecorder !== 'undefined') {
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
        const filename = `Bai_Giang_Thay_Tho_${dateStr}.webm`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        toast.success(`🎉 Đã lưu video bài giảng về máy: ${filename}`, { duration: 6000 });
        setIsRecording(false);
        setRecordingDuration(0);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };

      // Tự động dừng khi Thầy bấm nút "Dừng chia sẻ" của trình duyệt
      stream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      };

      recorder.start(1000);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      toast.success('🔴 Đang ghi màn hình bài giảng! Bấm "Dừng ghi" khi muốn lưu video.', {
        duration: 4000
      });
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        toast.error('Không thể bắt đầu ghi hình: ' + (err.message || 'Lỗi'));
      }
    }
  };

  // --- DỪNG VÀ TẢI VIDEO BÀI GIẢNG VỀ MÁY TÍNH ---
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
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
      setStudentName('Thầy Lương Thọ');
      setHasJoined(true);
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
        jitsiApiRef.current?.executeCommand('displayName', getFormattedDisplayName(tempName.trim(), isHost));
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

        {/* Giữa: Chuyển đổi các chế độ xem linh hoạt (Video, Sơ đồ bàn học, Lưới Camera, Đề thi) */}
        <div className="flex items-center bg-slate-800/80 p-0.5 rounded-xl border border-slate-700/60 text-xs">
          <button
            onClick={() => {
              setLayoutMode('video');
              try { jitsiApiRef.current?.executeCommand('setTileView', false); } catch {}
            }}
            className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${layoutMode === 'video' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-white'}`}
            title="Chế độ xem video thông thường"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Chỉ Video</span>
          </button>

          {/* NÚT CHẾ ĐỘ SƠ ĐỒ BÀN HỌC SINH */}
          <button
            onClick={() => {
              setLayoutMode('classroom');
              try { jitsiApiRef.current?.executeCommand('setTileView', true); } catch {}
            }}
            className={`px-3 py-1 rounded-lg transition flex items-center gap-1.5 font-bold ${
              layoutMode === 'classroom'
                ? 'bg-gradient-to-r from-indigo-600 to-rose-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-amber-400 hover:text-white'
            }`}
            title="Xem toàn bộ sơ đồ lớp học: Các dãy bàn học sinh được đánh số thứ tự"
          >
            <span>🏫</span>
            <span>Sơ đồ Bàn học</span>
          </button>

          {/* NÚT CHẾ ĐỘ LƯỚI TOÀN BỘ CAMERA (TILE VIEW) */}
          <button
            onClick={() => {
              setLayoutMode('video');
              try {
                jitsiApiRef.current?.executeCommand('setTileView', true);
                toast.success('🔲 Đã kích hoạt lưới camera xem tất cả học sinh!');
              } catch {
                toast('Đã bật chế độ xem lưới camera');
              }
            }}
            className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white transition flex items-center gap-1"
            title="Xem tất cả camera học sinh đồng thời trên 1 màn hình lưới"
          >
            <Grid className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Lưới Camera</span>
          </button>

          {activeExamId && (
            <>
              <button
                onClick={() => setLayoutMode('split')}
                className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${layoutMode === 'split' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-white'}`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Song song</span>
              </button>
              <button
                onClick={() => setLayoutMode('exam')}
                className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${layoutMode === 'exam' ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-white'}`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Làm bài</span>
              </button>
            </>
          )}
        </div>

        {/* Phải: Đổi tên, Giơ tay, Máy tính Casio, Copy Link & Thông tin Giáo viên */}
        <div className="flex items-center gap-2">
          {/* NÚT TRÒ CHƠI GỌI TÊN HỌC SINH VUI NHỘN & GAY CẤN */}
          <button
            onClick={() => setShowGamesModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition shadow-lg bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 hover:from-amber-400 hover:to-rose-400 text-white animate-pulse"
            title="Mở các trò chơi gọi tên học sinh ngẫu nhiên cực vui và gay cấn (Vòng quay, Hộp quà bí ẩn, Slot machine)"
          >
            <span>🎲</span>
            <span className="hidden sm:inline">Trò Chơi Gọi Tên</span>
          </button>

          {/* NÚT MÁY TÍNH CASIO FX-580 CHO THẦY VÀ HỌC SINH */}
          <button
            onClick={() => setShowCasio(!showCasio)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition shadow ${
              showCasio
                ? 'bg-amber-500 text-slate-950 font-black'
                : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40'
            }`}
            title="Mở máy tính Casio fx-580VN X cầm tay nổi trên màn hình"
          >
            <span>🧮</span>
            <span className="hidden sm:inline">Casio 580</span>
          </button>

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

            {/* Nút Gọi tên ngẫu nhiên cho Thầy */}
            <button
              onClick={() => setShowGamesModal(true)}
              className="px-2.5 py-1 rounded-md bg-gradient-to-r from-amber-500/20 to-rose-500/20 hover:from-amber-500/40 hover:to-rose-500/40 text-amber-300 border border-amber-500/40 flex items-center gap-1 font-bold text-xs transition active:scale-95"
              title="Mở các trò chơi gọi tên học sinh lên bảng phát biểu"
            >
              <span>🎲</span>
              <span>Trò chơi gọi tên 🎯</span>
            </button>

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

          {/* Nhóm 2: Quyền lớp học, Khóa tập trung, Ghi màn hình & Phát đề */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* NÚT GHI MÀN HÌNH BÀI GIẢNG (SCREEN RECORDER) */}
            {!isRecording ? (
              <button
                onClick={handleStartRecording}
                className="px-2.5 py-1 rounded-md bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 font-bold text-xs transition active:scale-95 shadow-sm"
                title="Bấm để ghi lại video bài giảng và màn hình (tải file trực tiếp về máy tính)"
              >
                <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                <span>Ghi màn hình ⏺️</span>
              </button>
            ) : (
              <button
                onClick={handleStopRecording}
                className="px-3 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-2 font-bold text-xs transition active:scale-95 shadow-lg shadow-rose-600/40 animate-pulse"
                title="Bấm để dừng ghi và tải ngay video bài giảng về máy tính"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Dừng ghi ({formatDuration(recordingDuration)}) ⏹️</span>
              </button>
            )}

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

      {/* --- MÀN HÌNH NHẬP HỌ TÊN VÀ VÀO THẲNG LỚP HỌC (KHÔNG PHẢI CHỜ ĐỢI) --- */}
      {!hasJoined && !isHost && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-indigo-500/50 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl text-center relative overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-rose-600 flex items-center justify-center text-white text-3xl font-black mx-auto mb-4 shadow-xl shadow-indigo-600/30">
              🎓
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white mb-1 tracking-tight">
              Lớp Học Trực Tuyến Thầy Thọ
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mb-6">
              Nhập họ và tên để <span className="text-emerald-400 font-bold">vào thẳng phòng học ngay</span> (Không cần chờ đợi)
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = joinNameInput.trim();
                if (!trimmed) {
                  toast.error('Vui lòng nhập họ và tên của bạn!');
                  return;
                }
                if (trimmed.toLowerCase().includes('thầy thọ') || trimmed.toLowerCase().includes('lương thọ')) {
                  setShowHostLogin(true);
                  return;
                }
                setStudentName(trimmed);
                localStorage.setItem('live_student_name', trimmed);
                setHasJoined(true);
                toast.success(`Chào mừng ${trimmed} đã vào lớp học!`, { icon: '👋' });
              }}
              className="space-y-4 text-left"
            >
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Họ và Tên Học Sinh:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ví dụ: Nguyễn Văn An (10A1)..."
                  value={joinNameInput}
                  onChange={(e) => setJoinNameInput(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-2xl bg-slate-800 border-2 border-slate-700 text-white placeholder-slate-500 font-semibold text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition shadow-inner"
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white font-black text-base shadow-xl shadow-indigo-600/30 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🚀 Vào Lớp Học Ngay</span>
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setShowHostLogin(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition"
              >
                <span>👨‍🏫 Bạn là Thầy Lương Thọ? Bấm vào đây</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- NỘI DUNG CHÍNH (KHU VỰC LIVE, SƠ ĐỒ LỚP HỌC & ĐỀ THI) --- */}
      <main className="flex-1 relative flex overflow-hidden">
        {/* MODAL PHÒNG CHỜ DUYỆT & MẬT KHẨU: HÃY CHỜ ĐỢI */}
        {requirePin && !isPinUnlocked && !isHost ? (
          <div className="absolute inset-0 z-40 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl text-center relative overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mx-auto mb-4 text-3xl font-black shadow-lg shadow-amber-500/20">
                ✋
              </div>
              <h2 className="text-2xl font-black text-amber-400 mb-2 uppercase tracking-wide">
                HÃY CHỜ ĐỢI
              </h2>
              <p className="text-sm text-slate-300 mb-3 leading-relaxed">
                Thầy Lương Thọ đang chuẩn bị bài giảng hoặc phòng học đang tạm khóa chờ duyệt.
              </p>
              <p className="text-xs text-slate-400 mb-5">
                Nếu bạn có mật khẩu mở phòng, vui lòng nhập mật khẩu bên dưới để vào thẳng lớp ngay:
              </p>
              <form onSubmit={handlePinSubmit} className="space-y-3.5">
                <input
                  type="password"
                  required
                  placeholder="Nhập mật khẩu / mã PIN..."
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 border-2 border-slate-700 text-white text-center text-lg font-mono tracking-widest focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition"
                />
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition active:scale-95"
                >
                  🔓 Mở Khóa Vào Lớp Ngay
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-center gap-2 text-xs text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Vui lòng giữ nguyên màn hình, Thầy Thọ sẽ mở lớp cho bạn!</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* CONTAINER 1: VIDEO JITSI MEET TRỰC TIẾP */}
        <div
          className={`h-full transition-all duration-300 relative bg-black ${
            layoutMode === 'video'
              ? 'w-full'
              : layoutMode === 'classroom'
              ? 'w-full md:w-1/2 border-r border-slate-800'
              : layoutMode === 'split'
              ? 'w-full md:w-1/2 border-r border-slate-800'
              : 'w-0 hidden md:block md:w-1/4 opacity-60 hover:opacity-100'
          }`}
        >
          <div ref={jitsiContainerRef} className="w-full h-full" />
        </div>

        {/* CONTAINER 2: SƠ ĐỒ LỚP HỌC & CÁC DÃY BÀN HỌC SINH (SEATING CHART) */}
        {layoutMode === 'classroom' && (
          <div className="w-full md:w-1/2 h-full overflow-hidden bg-slate-950">
            <ClassroomSeatingChart
              isHost={isHost}
              studentList={studentList}
              raisedHands={raisedHands}
              focusMode={focusMode}
              currentStudentName={isHost ? 'Thầy Lương Thọ' : studentName}
              onLowerHand={(name) => {
                setRaisedHands(prev => prev.filter(n => n !== name));
                channelRef.current?.send({
                  type: 'broadcast',
                  event: 'lower_hand',
                  payload: { name }
                });
                toast.success(`Đã hạ tay học sinh "${name}"`);
              }}
              onKickStudent={handleKickStudent}
              onSwitchToTileView={() => {
                setLayoutMode('video');
                try {
                  jitsiApiRef.current?.executeCommand('setTileView', true);
                  toast.success('🔲 Đã kích hoạt lưới camera xem tất cả học sinh theo số bàn!');
                } catch {
                  toast('Đã bật chế độ xem lưới camera');
                }
              }}
            />
          </div>
        )}

        {/* CONTAINER 3: BÀI KIỂM TRA / ĐỀ THI TRỰC TIẾP (KHI THẦY PHÁT) */}
        {activeExamId && (layoutMode === 'split' || layoutMode === 'exam') && (
          <div
            className={`h-full transition-all duration-300 overflow-y-auto bg-slate-900 ${
              layoutMode === 'exam'
                ? 'w-full md:w-3/4'
                : 'w-full md:w-1/2'
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

      {/* MODAL THÔNG BÁO BỊ ĐUỔI KHỎI LỚP */}
      {isKicked && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-rose-600 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-600/20 text-rose-500 border border-rose-500/40 flex items-center justify-center mx-auto mb-4 text-3xl font-black">
              🚫
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-rose-400 mb-2">
              BẠN ĐÃ BỊ THẦY THỌ MỜI RA KHỎI LỚP
            </h2>
            <p className="text-sm text-slate-300 mb-4 leading-relaxed">
              Bạn đã bị đưa ra khỏi phòng học do vi phạm nội quy lớp hoặc Thầy yêu cầu rời phòng.
            </p>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400 mb-6">
              Nếu có nhầm lẫn, vui lòng liên hệ Thầy Lương Thọ qua Hotline / Zalo: <span className="text-amber-400 font-bold">0345.833.133</span>
            </div>
            <button
              onClick={() => navigate('/exam')}
              className="w-full py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition"
            >
              Quay lại danh sách đề thi
            </button>
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
                Kích hoạt quyền Giáo viên để điều khiển âm thanh, tắt mic, ghi màn hình và phát đề.
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

      {/* CỬA SỔ MÁY TÍNH CASIO FX-580VN X NỔI */}
      <CasioCalculator isOpen={showCasio} onClose={() => setShowCasio(false)} />

      {/* TRUNG TÂM CÁC TRÒ CHƠI GỌI TÊN HỌC SINH */}
      <ClassroomGamesModal
        isOpen={showGamesModal}
        onClose={() => setShowGamesModal(false)}
        studentList={studentList}
      />
    </div>
  );
}
