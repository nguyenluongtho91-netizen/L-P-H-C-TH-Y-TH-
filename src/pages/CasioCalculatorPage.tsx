// @ts-nocheck
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CasioCalculator from '@/components/CasioCalculator';
import { ArrowLeft, Sparkles, Video, FileText, CheckCircle2 } from 'lucide-react';

export default function CasioCalculatorPage() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-indigo-600 text-white">
              CASIO
            </span>
            <h1 className="text-base font-bold text-white">
              Máy Tính Khoa Học Casio fx-580VN X (Thầy Thọ)
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/0345833133')}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Vào Phòng Live</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-8 flex flex-col lg:flex-row items-center justify-center gap-8 relative overflow-hidden">
        {/* Máy tính trung tâm */}
        <div className="w-full max-w-[380px] flex justify-center">
          <CasioCalculator isOpen={true} onClose={() => {}} />
        </div>

        {/* Hướng dẫn và tính năng nổi bật */}
        <div className="max-w-md w-full space-y-4">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>Máy Tính Độc Quyền Cho Học Sinh Thầy Thọ</span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Mô phỏng máy tính cầm tay <strong>Casio fx-580VN X ClassWiz</strong> với đầy đủ tính năng giải Toán và Hóa học phục vụ học online và làm bài kiểm tra.
            </p>

            <div className="space-y-2 pt-2 text-xs">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Chuyển đổi Phân số ⇔ Thập phân:</strong> Nút bấm <code>S⇔D</code> chính xác như máy tính thật.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Giải phương trình bậc 2 & Hệ 2 ẩn:</strong> Tự động tìm nghiệm thực, nghiệm kép, nghiệm phức và tọa độ đỉnh parabol.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Tra cứu khối lượng Mol Hóa học (M_mol):</strong> Bấm 1 chạm để lấy ngay phân tử khối của H₂SO₄, CaCO₃, Fe, Cu,... tính số mol cực nhanh.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Gõ trực tiếp từ bàn phím máy tính:</strong> Phím số 0-9, dấu phép tính +, -, *, /, Enter để ra kết quả, Esc để xóa AC.</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
