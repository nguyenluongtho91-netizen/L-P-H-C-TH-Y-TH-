import React, { useEffect, useState } from 'react';
import { X, Search, BookOpen, Clock, FileText, Check, Loader2, Sparkles } from 'lucide-react';
import { useExamStore } from '@/store/examStore';
import type { Question } from '@/types';
import toast from 'react-hot-toast';

interface ExamBankSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExam: (title: string, questions: Question[]) => void;
}

export default function ExamBankSelectorModal({
  isOpen,
  onClose,
  onSelectExam
}: ExamBankSelectorModalProps) {
  const { exams, loading, loadExams, getExamData } = useExamStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingExamId, setLoadingExamId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadExams();
    }
  }, [isOpen, loadExams]);

  if (!isOpen) return null;

  const filteredExams = exams.filter((e: any) =>
    (e.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleChooseExam = async (exam: any) => {
    setLoadingExamId(exam.id);
    try {
      const fullData = await getExamData(exam.id);
      const questions: Question[] = fullData?.questions || fullData?.data?.questions || [];
      if (!questions || questions.length === 0) {
        toast.error('Đề thi này chưa có câu hỏi trắc nghiệm/tự luận bóc tách sẵn!');
        return;
      }
      onSelectExam(exam.title || 'Đề thi nhập từ thư viện', questions);
      toast.success(`🎉 Đã nhập ${questions.length} câu hỏi từ "${exam.title}"!`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải chi tiết đề thi này');
    } finally {
      setLoadingExamId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800">Ngân Hàng Đề Thi Thầy Thọ</h3>
              <p className="text-xs text-slate-500">Chọn đề thi có sẵn để nạp câu hỏi vào bài tập 1 chạm</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm đề thi theo tên hoặc chuyên đề..."
              className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition"
            />
          </div>
        </div>

        {/* List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
              <span className="text-xs">Đang tải kho đề thi...</span>
            </div>
          ) : filteredExams.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <FileText className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
              <p className="text-xs">Không tìm thấy đề thi phù hợp trong thư viện</p>
            </div>
          ) : (
            filteredExams.map((exam: any) => (
              <div
                key={exam.id}
                className="pt-2 pb-2 flex items-center justify-between gap-3 hover:bg-blue-50/40 p-2.5 rounded-2xl transition"
              >
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-800 truncate">{exam.title}</h4>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(exam.created_at).toLocaleDateString('vi-VN')}
                    </span>
                    {exam.pdfUrl && (
                      <span className="px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 font-semibold text-[10px]">
                        PDF
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={loadingExamId === exam.id}
                  onClick={() => handleChooseExam(exam)}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {loadingExamId === exam.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Lấy đề này
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-white text-xs font-bold transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
