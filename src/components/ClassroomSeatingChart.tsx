// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import {
  Users, Hand, Mic, MicOff, Monitor, Sparkles, CheckCircle2,
  AlertCircle, Maximize2, Shield, Eye, Award, Volume2, Search,
  Download, Grid, LayoutGrid, ChevronRight, UserCheck, Video, VideoOff, UserX
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface StudentSeat {
  seatNumber: number;
  id?: string;
  name?: string;
  isHost?: boolean;
  isHandRaised?: boolean;
  isMuted?: boolean;
  cameraActive?: boolean;
  avatarColor?: string;
  score?: number;
  status?: 'active' | 'idle' | 'empty';
}

interface ClassroomSeatingChartProps {
  isHost: boolean;
  studentList: Array<{ id?: string; name: string; isHost?: boolean }>;
  raisedHands: string[];
  focusMode: boolean;
  currentStudentName?: string;
  onLowerHand?: (name: string) => void;
  onSpotlight?: (seat: StudentSeat) => void;
  onSwitchToTileView?: () => void;
  onKickStudent?: (studentName: string) => void;
}

const AVATAR_COLORS = [
  'from-blue-600 to-indigo-600',
  'from-purple-600 to-pink-600',
  'from-emerald-600 to-teal-600',
  'from-amber-600 to-orange-600',
  'from-cyan-600 to-blue-600',
  'from-rose-600 to-red-600',
];

export default function ClassroomSeatingChart({
  isHost,
  studentList = [],
  raisedHands = [],
  focusMode = false,
  currentStudentName = '',
  onLowerHand,
  onSpotlight,
  onSwitchToTileView,
  onKickStudent
}: ClassroomSeatingChartProps) {
  const [totalSeats, setTotalSeats] = useState<number>(24);
  const [selectedSeat, setSelectedSeat] = useState<StudentSeat | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Luồng camera trực tiếp (Live Webcam Feed)
  const teacherVideoRef = useRef<HTMLVideoElement>(null);
  const studentVideoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  // Kích hoạt camera trực tiếp để hiển thị người ngồi thẳng vào Bục Giảng hoặc Bàn học
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let isMounted = true;

    const startCamera = async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30 }
            },
            audio: false
          });

          if (!isMounted) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }

          activeStream = stream;
          setCameraActive(true);
          setCameraError(false);

          if (isHost && teacherVideoRef.current) {
            teacherVideoRef.current.srcObject = stream;
          } else if (!isHost && studentVideoRef.current) {
            studentVideoRef.current.srcObject = stream;
          }
        }
      } catch (err) {
        console.warn('Classroom direct camera stream notice:', err);
        if (isMounted) {
          setCameraError(true);
          setCameraActive(false);
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [isHost]);

  // Cập nhật lại srcObject khi ref sẵn sàng
  useEffect(() => {
    if (cameraActive) {
      navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
        .then(s => {
          if (isHost && teacherVideoRef.current) {
            teacherVideoRef.current.srcObject = s;
          } else if (!isHost && studentVideoRef.current) {
            studentVideoRef.current.srcObject = s;
          }
        })
        .catch(() => {});
    }
  }, [cameraActive, isHost]);

  // Lọc chỉ lấy danh sách học sinh (loại bỏ host Thầy Thọ)
  const actualStudents = studentList.filter(s => !s.name?.includes('Thầy') && !s.isHost);

  // Xác định vị trí bàn của học sinh hiện tại
  const mySeatIndex = actualStudents.findIndex(
    s => s.name === currentStudentName || (currentStudentName && s.name?.includes(currentStudentName))
  );

  // Tạo danh sách bàn học có thứ tự từ 1 đến totalSeats
  const seats: StudentSeat[] = Array.from({ length: totalSeats }, (_, idx) => {
    const seatNum = idx + 1;
    const student = actualStudents[idx];

    if (student) {
      const isRaised = raisedHands.includes(student.name);
      return {
        seatNumber: seatNum,
        id: student.id || `seat-${seatNum}`,
        name: student.name,
        isHost: false,
        isHandRaised: isRaised,
        isMuted: focusMode ? true : false,
        cameraActive: true,
        avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
        score: 9.5,
        status: 'active'
      };
    }

    return {
      seatNumber: seatNum,
      status: 'empty'
    };
  });

  // Học sinh tìm kiếm
  const filteredSeats = searchQuery
    ? seats.filter(s => s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || s.seatNumber.toString() === searchQuery)
    : seats;

  // Điểm danh cả lớp và xuất danh sách
  const handleExportAttendance = () => {
    const presentStudents = seats.filter(s => s.status === 'active');
    const content = `DANH SÁCH ĐIỂM DANH LỚP HỌC THẦY THỌ\n` +
      `Thời gian: ${new Date().toLocaleString('vi-VN')}\n` +
      `Sĩ số có mặt: ${presentStudents.length}/${totalSeats} học sinh\n\n` +
      presentStudents.map(s => `Bàn ${String(s.seatNumber).padStart(2, '0')}: ${s.name}`).join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DiemDanh_ThayTho_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast.success(`📋 Đã xuất danh sách điểm danh: ${presentStudents.length} học sinh có mặt!`);
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto select-none p-3 sm:p-5">
      {/* --- THANH ĐIỀU KHIỂN SƠ ĐỒ LỚP HỌC --- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 mb-4 shadow-xl flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <LayoutGrid className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-black text-white">
                Sơ Đồ Lớp Học & Chỗ Ngồi Học Sinh
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Đang có mặt: {actualStudents.length}/{totalSeats}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Camera trực tiếp tự động chiếu vào đúng khung Bục Giảng và Bàn Học theo số thứ tự
            </p>
          </div>
        </div>

        {/* Nút tùy chọn & Chuyển chế độ xem */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Nút chuyển nhanh sang Lưới Camera thật */}
          {onSwitchToTileView && (
            <button
              onClick={onSwitchToTileView}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-600/20 transition active:scale-95"
              title="Mở toàn màn hình lưới camera thật của tất cả học sinh đang học"
            >
              <Grid className="w-3.5 h-3.5" />
              <span>🔲 Lưới Camera Thật (Xem tất cả)</span>
            </button>
          )}

          {/* Tìm kiếm học sinh */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Tìm bàn hoặc tên..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36 sm:w-44"
            />
          </div>

          {/* Chọn quy mô số bàn */}
          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
            <span className="text-[11px] text-slate-400 px-1.5 hidden sm:inline">Quy mô:</span>
            {[16, 24, 32].map(num => (
              <button
                key={num}
                onClick={() => setTotalSeats(num)}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition ${
                  totalSeats === num ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {num} bàn
              </button>
            ))}
          </div>

          {/* Xuất điểm danh */}
          {isHost && (
            <button
              onClick={handleExportAttendance}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold text-xs flex items-center gap-1 transition"
              title="Xuất danh sách điểm danh theo số thứ tự bàn học"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Điểm danh</span>
            </button>
          )}
        </div>
      </div>

      {/* --- KHU VỰC 1: BỤC GIẢNG & BÀN GIÁO VIÊN (CAMERA TRỰC TIẾP CỦA THẦY THỌ) --- */}
      <div className="mb-6 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-2 border-indigo-500/50 rounded-3xl p-4 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center justify-between gap-5">
          {/* Bảng đen viết phấn */}
          <div className="flex-1 w-full bg-[#1e3a2f] border-4 border-[#3d271d] rounded-2xl p-4 shadow-inner text-emerald-100 font-mono relative">
            <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2 mb-2 text-xs">
              <span className="font-bold tracking-widest text-emerald-300 uppercase">
                📖 BẢNG GIẢNG BÀI TRỰC TUYẾN
              </span>
              <span className="text-[11px] bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-200">
                Hotline: 0345.833.133
              </span>
            </div>
            <div className="text-sm font-sans font-bold text-white mb-1 flex items-center gap-2">
              <span>Thầy Nguyễn Lương Thọ — Giáo viên Toán & Hóa học</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                Phòng Học Chuẩn Full HD
              </span>
            </div>
            <div className="text-xs text-emerald-200/90 flex flex-wrap gap-4 font-sans mt-2">
              <span>🎯 Đang theo dõi toàn bộ {actualStudents.length} bàn học sinh</span>
              {raisedHands.length > 0 && (
                <span className="text-amber-300 font-bold animate-pulse">
                  ✋ Có {raisedHands.length} học sinh đang giơ tay phát biểu!
                </span>
              )}
              {focusMode && (
                <span className="text-rose-300 font-bold">
                  🔒 Đang bật Khóa tập trung (Tắt mic cả lớp)
                </span>
              )}
            </div>
          </div>

          {/* KHUNG BỤC GIẢNG: TỰ ĐỘNG CHIẾU CAMERA THẬT CỦA THẦY THỌ */}
          <div className="shrink-0 flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900/95 border-2 border-indigo-500 shadow-2xl min-w-[240px]">
            <div className="relative mb-2 w-48 h-32 sm:w-56 sm:h-36 rounded-2xl overflow-hidden bg-slate-950 border-2 border-indigo-400 shadow-xl flex items-center justify-center">
              {isHost ? (
                <>
                  {/* Camera trực tiếp của Thầy Thọ tự động nhảy vào đây */}
                  <video
                    ref={teacherVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* Huy hiệu TRỰC TIẾP */}
                  <div className="absolute top-2 left-2 bg-rose-600/95 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg backdrop-blur-sm">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                    <span>TRỰC TIẾP</span>
                  </div>
                  <div className="absolute bottom-1.5 right-2 bg-slate-950/80 backdrop-blur-sm text-[10px] text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-500/30">
                    👨‍🏫 Thầy Lương Thọ
                  </div>
                </>
              ) : (
                /* Góc nhìn học sinh thấy Bục Giảng của Thầy */
                <div className="w-full h-full bg-gradient-to-tr from-indigo-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-3 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-rose-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-indigo-600/40 mb-1">
                    TT
                  </div>
                  <span className="text-xs text-white font-bold">Thầy Lương Thọ</span>
                  <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    Đang chủ trì trên Bục Giảng
                  </span>
                </div>
              )}
            </div>

            <div className="text-center">
              <div className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5 justify-center">
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                <span>Bục Giảng Thầy Thọ</span>
              </div>
              <span className="text-[11px] text-indigo-300 font-semibold">Giáo viên chủ trì</span>
            </div>
          </div>
        </div>
      </div>

      {/* --- KHU VỰC 2: CÁC DÃY BÀN HỌC SINH ĐƯỢC ĐÁNH SỐ THỨ TỰ --- */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span>Dãy Bàn Học Sinh (Sắp xếp theo thứ tự bàn)</span>
            <span className="text-slate-500 text-[11px]">| Bấm vào bàn để xem chi tiết học sinh</span>
          </div>

          {/* Gợi ý bật Lưới Camera thật */}
          {onSwitchToTileView && (
            <button
              onClick={onSwitchToTileView}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 transition"
            >
              <span>Xem mặt tất cả học sinh trên lưới</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* LƯỚI BÀN HỌC SINH (4 CỘT CHUẨN LỚP HỌC) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6 gap-3 pb-6">
          {filteredSeats.map((seat, idx) => {
            const isOccupied = seat.status === 'active';
            const isHandRaised = seat.isHandRaised;
            // Kiểm tra xem đây có phải là bàn của người dùng hiện tại đang ngồi không
            const isMySeat = !isHost && (
              seat.name === currentStudentName ||
              (idx === mySeatIndex && mySeatIndex !== -1) ||
              (!currentStudentName && seat.name === 'Học sinh' && idx === 8)
            );

            return (
              <div
                key={seat.seatNumber}
                onClick={() => isOccupied && setSelectedSeat(seat)}
                className={`relative rounded-2xl border-2 transition-all duration-200 flex flex-col justify-between overflow-hidden cursor-pointer ${
                  isOccupied
                    ? isHandRaised
                      ? 'bg-slate-900 border-amber-400 shadow-xl shadow-amber-500/20 ring-2 ring-amber-400/50 transform -translate-y-1'
                      : isMySeat
                      ? 'bg-slate-900/95 border-emerald-500 shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-500/40'
                      : 'bg-slate-900/90 border-slate-700/80 hover:border-indigo-500/80 hover:shadow-lg hover:-translate-y-0.5'
                    : 'bg-slate-950/60 border-dashed border-slate-800/80 opacity-60'
                }`}
              >
                {/* 1. Thanh tiêu đề bàn học: Số bàn & Trạng thái mic */}
                <div className={`px-2.5 py-1.5 flex items-center justify-between border-b text-[11px] font-bold ${
                  isOccupied
                    ? isMySeat
                      ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-200'
                      : 'bg-slate-800/80 border-slate-700/60 text-slate-200'
                    : 'bg-slate-900/50 border-slate-800/40 text-slate-500'
                }`}>
                  {/* Biển số bàn */}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                    isMySeat
                      ? 'bg-emerald-600 text-white'
                      : isOccupied
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    BÀN {String(seat.seatNumber).padStart(2, '0')}
                  </span>

                  {/* Trạng thái mic & camera */}
                  {isOccupied && (
                    <div className="flex items-center gap-1">
                      {seat.isMuted ? (
                        <MicOff className="w-3 h-3 text-rose-400" />
                      ) : (
                        <Mic className="w-3 h-3 text-emerald-400 animate-pulse" />
                      )}
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    </div>
                  )}
                </div>

                {/* 2. Thân bàn học: Màn hình camera trực tiếp / Avatar học sinh */}
                <div className="p-3 flex flex-col items-center justify-center min-h-[110px] text-center relative">
                  {isOccupied ? (
                    <>
                      {/* KHUNG HÌNH CAMERA: Nếu là bàn của học sinh đang ngồi thì chiếu trực tiếp camera của mình */}
                      {isMySeat ? (
                        <div className="w-20 h-16 sm:w-24 sm:h-18 rounded-xl overflow-hidden bg-slate-950 border-2 border-emerald-500 relative mb-2 flex items-center justify-center shadow-lg">
                          <video
                            ref={studentVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-1 left-1 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow">
                            BẠN
                          </div>
                        </div>
                      ) : (
                        /* Avatar mô phỏng Camera học sinh */
                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${seat.avatarColor || 'from-indigo-600 to-blue-600'} text-white font-black text-lg flex items-center justify-center shadow-lg mb-2 relative group`}>
                          {seat.name ? seat.name.charAt(0).toUpperCase() : 'H'}
                          {/* Biểu tượng phóng to khi hover */}
                          <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                            <Maximize2 className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      )}

                      {/* Họ tên học sinh */}
                      <div className="font-bold text-xs text-white max-w-full truncate px-1" title={seat.name}>
                        {seat.name}
                      </div>

                      {/* Nút bấm phóng to video camera học sinh */}
                      {onSwitchToTileView && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSwitchToTileView();
                          }}
                          className="mt-1 px-2 py-0.5 rounded-md bg-cyan-600/80 hover:bg-cyan-500 text-white font-bold text-[10px] flex items-center gap-1 shadow transition active:scale-95"
                          title="Phóng to camera trực tiếp của học sinh toàn màn hình"
                        >
                          <Maximize2 className="w-2.5 h-2.5" />
                          <span>Xem Video 🔲</span>
                        </button>
                      )}

                      {/* Huy hiệu giơ tay nếu học sinh bấm giơ tay */}
                      {isHandRaised && (
                        <div className="mt-1.5 inline-flex items-center gap-1 bg-amber-500 text-slate-950 font-black px-2 py-0.5 rounded-full text-[10px] shadow-lg animate-bounce">
                          <Hand className="w-3 h-3 fill-current" />
                          <span>GIƠ TAY</span>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Chỗ ngồi trống */
                    <div className="py-2 flex flex-col items-center text-slate-600">
                      <div className="w-10 h-10 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center mb-1">
                        <span className="text-lg">+</span>
                      </div>
                      <span className="text-[11px] font-medium text-slate-500">Chỗ trống</span>
                    </div>
                  )}
                </div>

                {/* 3. Chân bàn học: Nút tương tác nhanh */}
                {isOccupied && isHost && (
                  <div className="px-2 py-1.5 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSeat(seat);
                      }}
                      className="text-slate-400 hover:text-indigo-300 font-medium transition"
                    >
                      Chi tiết ➔
                    </button>
                    {onKickStudent && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Thầy có chắc chắn muốn đuổi học sinh "${seat.name}" ra khỏi lớp học không?`)) {
                            onKickStudent(seat.name!);
                          }
                        }}
                        className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white font-bold transition ml-auto mr-1"
                        title="Đuổi học sinh này ra khỏi lớp ngay"
                      >
                        ✕ Đuổi
                      </button>
                    )}
                    {isHandRaised && onLowerHand && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onLowerHand(seat.name!);
                        }}
                        className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold transition"
                        title="Hạ tay học sinh này"
                      >
                        Hạ tay
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- POPUP CHI TIẾT BÀN HỌC SINH (KHI THẦY CLICK VÀO BÀN) --- */}
      {selectedSeat && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-sm w-full p-5 shadow-2xl relative">
            <button
              onClick={() => setSelectedSeat(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              ✕
            </button>

            <div className="text-center mb-4">
              <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-black uppercase">
                BÀN HỌC SỐ {String(selectedSeat.seatNumber).padStart(2, '0')}
              </span>
              <div className={`w-20 h-20 rounded-3xl bg-gradient-to-tr ${selectedSeat.avatarColor || 'from-indigo-600 to-rose-600'} text-white font-black text-3xl flex items-center justify-center mx-auto my-3 shadow-xl`}>
                {selectedSeat.name?.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-lg font-black text-white">{selectedSeat.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Học sinh lớp trực tuyến Thầy Thọ</p>
            </div>

            <div className="space-y-2 mb-4 text-xs bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Trạng thái:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Đang ngồi học trực tuyến
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Microphone:</span>
                <span className="font-semibold text-white">
                  {selectedSeat.isMuted ? 'Đang tắt mic 🔇' : 'Đang bật mic 🎤'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Giơ tay phát biểu:</span>
                <span className={`font-bold ${selectedSeat.isHandRaised ? 'text-amber-400' : 'text-slate-500'}`}>
                  {selectedSeat.isHandRaised ? '✋ Đang giơ tay' : 'Chưa giơ tay'}
                </span>
              </div>
            </div>

            {/* Các nút hành động của Thầy */}
            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              {selectedSeat.isHandRaised && onLowerHand && (
                <button
                  onClick={() => {
                    onLowerHand(selectedSeat.name!);
                    setSelectedSeat({ ...selectedSeat, isHandRaised: false });
                  }}
                  className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center justify-center gap-1 col-span-2"
                >
                  <Hand className="w-4 h-4" />
                  <span>Hạ tay học sinh này</span>
                </button>
              )}
              <button
                onClick={() => {
                  toast.success(`Đã mời học sinh "${selectedSeat.name}" ở Bàn ${selectedSeat.seatNumber} phát biểu!`);
                  setSelectedSeat(null);
                }}
                className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center justify-center gap-1"
              >
                <Mic className="w-4 h-4" />
                <span>Mời phát biểu</span>
              </button>
              {/* Nút ĐUỔI HỌC SINH CỦA THẦY THỌ */}
              {isHost && onKickStudent && (
                <button
                  onClick={() => {
                    if (window.confirm(`Thầy có chắc chắn muốn đuổi học sinh "${selectedSeat.name}" ra khỏi lớp học không?`)) {
                      onKickStudent(selectedSeat.name!);
                      setSelectedSeat(null);
                    }
                  }}
                  className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center justify-center gap-1.5 col-span-2 shadow-lg shadow-rose-600/30 active:scale-95"
                  title="Đuổi học sinh này ra khỏi phòng học ngay lập tức"
                >
                  <UserX className="w-4 h-4" />
                  <span>🚫 Đuổi học sinh này ra khỏi lớp</span>
                </button>
              )}
              <button
                onClick={() => setSelectedSeat(null)}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
