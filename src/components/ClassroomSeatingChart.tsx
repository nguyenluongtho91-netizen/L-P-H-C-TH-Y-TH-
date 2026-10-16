// @ts-nocheck
import React, { useState } from 'react';
import {
  Users, Hand, Mic, MicOff, Monitor, Sparkles, CheckCircle2,
  AlertCircle, Maximize2, Shield, Eye, Award, Volume2, Search,
  Download, Grid, LayoutGrid, ChevronRight, UserCheck
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
  onLowerHand?: (name: string) => void;
  onSpotlight?: (seat: StudentSeat) => void;
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
  onLowerHand,
  onSpotlight
}: ClassroomSeatingChartProps) {
  const [totalSeats, setTotalSeats] = useState<number>(24);
  const [viewStyle, setViewStyle] = useState<'classroom' | 'grid'>('classroom');
  const [selectedSeat, setSelectedSeat] = useState<StudentSeat | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Lọc chỉ lấy danh sách học sinh (loại bỏ host Thầy Thọ)
  const actualStudents = studentList.filter(s => !s.name?.includes('Thầy') && !s.isHost);

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
              Quản lý trật tự lớp, theo dõi camera từng bàn học sinh theo số thứ tự
            </p>
          </div>
        </div>

        {/* Nút tùy chọn & Chế độ xem */}
        <div className="flex items-center gap-2 flex-wrap">
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

          {/* Chọn số bàn */}
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

          {/* Chuyển kiểu xem */}
          <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
            <button
              onClick={() => setViewStyle('classroom')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                viewStyle === 'classroom' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🏫 Bàn học</span>
            </button>
            <button
              onClick={() => setViewStyle('grid')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                viewStyle === 'grid' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Lưới Camera</span>
            </button>
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

      {/* --- KHU VỰC 1: BỤC GIẢNG & BÀN GIÁO VIÊN (THẦY THỌ) --- */}
      <div className="mb-6 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-2 border-indigo-500/40 rounded-3xl p-4 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Bảng đen viết phấn tượng trưng */}
          <div className="flex-1 w-full bg-[#1e3a2f] border-4 border-[#3d271d] rounded-2xl p-4 shadow-inner text-emerald-100 font-mono relative">
            <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2 mb-2 text-xs">
              <span className="font-bold tracking-widest text-emerald-300 uppercase">
                📖 BẢNG GIẢNG BÀI TRỰC TUYẾN
              </span>
              <span className="text-[11px] bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-200">
                Hotline: 0345.833.133
              </span>
            </div>
            <div className="text-sm font-sans font-bold text-white mb-1">
              Thầy Nguyễn Lương Thọ — Giáo viên Toán & Hóa học
            </div>
            <div className="text-xs text-emerald-200/90 flex flex-wrap gap-4 font-sans">
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

          {/* Bàn giáo viên & Bục giảng */}
          <div className="shrink-0 flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900/90 border border-indigo-500/50 shadow-xl min-w-[200px]">
            <div className="relative mb-2">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-rose-500 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-indigo-500/40 ring-4 ring-indigo-400/30">
                TT
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center text-[10px] text-white">
                ✓
              </span>
            </div>
            <div className="text-center">
              <div className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1 justify-center">
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
        </div>

        {/* LƯỚI BÀN HỌC SINH (4 CỘT CHUẨN LỚP HỌC) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6 gap-3 pb-6">
          {filteredSeats.map((seat) => {
            const isOccupied = seat.status === 'active';
            const isHandRaised = seat.isHandRaised;

            return (
              <div
                key={seat.seatNumber}
                onClick={() => isOccupied && setSelectedSeat(seat)}
                className={`relative rounded-2xl border-2 transition-all duration-200 flex flex-col justify-between overflow-hidden cursor-pointer ${
                  isOccupied
                    ? isHandRaised
                      ? 'bg-slate-900 border-amber-400 shadow-xl shadow-amber-500/20 ring-2 ring-amber-400/50 transform -translate-y-1'
                      : 'bg-slate-900/90 border-slate-700/80 hover:border-indigo-500/80 hover:shadow-lg hover:-translate-y-0.5'
                    : 'bg-slate-950/60 border-dashed border-slate-800/80 opacity-60'
                }`}
              >
                {/* 1. Thanh tiêu đề bàn học: Số bàn & Trạng thái mic */}
                <div className={`px-2.5 py-1.5 flex items-center justify-between border-b text-[11px] font-bold ${
                  isOccupied
                    ? 'bg-slate-800/80 border-slate-700/60 text-slate-200'
                    : 'bg-slate-900/50 border-slate-800/40 text-slate-500'
                }`}>
                  {/* Biển số bàn */}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                    isOccupied ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
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

                {/* 2. Thân bàn học: Màn hình camera / Avatar học sinh */}
                <div className="p-3 flex flex-col items-center justify-center min-h-[110px] text-center relative">
                  {isOccupied ? (
                    <>
                      {/* Avatar mô phỏng Camera học sinh */}
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${seat.avatarColor || 'from-indigo-600 to-blue-600'} text-white font-black text-lg flex items-center justify-center shadow-lg mb-2 relative group`}>
                        {seat.name ? seat.name.charAt(0).toUpperCase() : 'H'}
                        {/* Biểu tượng phóng to khi hover */}
                        <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                          <Maximize2 className="w-4 h-4 text-white" />
                        </div>
                      </div>

                      {/* Họ tên học sinh */}
                      <div className="font-bold text-xs text-white max-w-full truncate px-1" title={seat.name}>
                        {seat.name}
                      </div>

                      {/* Huy hiệu giơ tay rực rỡ nếu học sinh bấm giơ tay */}
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
