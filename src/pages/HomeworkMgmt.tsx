// src/pages/HomeworkMgmt.tsx
// Trang Quản lý & Giao bài tập về nhà dành cho Thầy Thọ - Chuẩn Azota

import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen, Plus, Search, Filter, Calendar, Clock,
  Share2, Copy, QrCode, Trash2, Edit3, CheckCircle2,
  AlertCircle, ChevronRight, GraduationCap, Users,
  Sparkles, RefreshCw, Eye, ArrowUpRight, FileSpreadsheet
} from 'lucide-react';
import { HomeworkAssignment, HomeworkSubmission } from '@/homework/types';
import {
  getAssignments,
  deleteAssignment,
  getSubmissions,
  saveSubmission,
  formatDateTimeVN,
  generateZaloShareMessage,
} from '@/homework/homeworkService';
import CreateAssignmentModal from '@/homework/CreateAssignmentModal';
import AssignmentTrackerView from '@/homework/AssignmentTrackerView';
import EssayImageAnnotator from '@/components/EssayImageAnnotator';
import { useDataStore } from '@/store/dataStore';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function HomeworkMgmt() {
  const [assignments, setAssignments] = useState<HomeworkAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Navigation states
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [activeSubmissions, setActiveSubmissions] = useState<HomeworkSubmission[]>([]);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<HomeworkAssignment | null>(null);

  // Studio Chấm bài
  const [gradingSubmission, setGradingSubmission] = useState<{
    submission: HomeworkSubmission;
    studentName: string;
  } | null>(null);
  const [gradingScore, setGradingScore] = useState<string>('8.0');
  const [gradingComment, setGradingComment] = useState<string>('Bài làm tốt, trình bày sạch sẽ.');

  // Store data (classes, students)
  const { classes, loadClasses, students, loadStudents } = useDataStore();

  const loadAll = async () => {
    try {
      setLoading(true);
      await Promise.all([loadClasses?.(), loadStudents?.()]);
      const list = await getAssignments();
      setAssignments(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Khi chọn 1 bài tập để theo dõi
  useEffect(() => {
    if (activeAssignmentId) {
      getSubmissions(activeAssignmentId).then(subs => setActiveSubmissions(subs));
    }
  }, [activeAssignmentId]);

  // Lọc danh sách bài tập
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      if (selectedClassFilter !== 'all') {
        if (!a.class_ids || !a.class_ids.includes(selectedClassFilter)) return false;
      }
      const isExpired = a.deadline ? new Date(a.deadline).getTime() < Date.now() : false;
      if (statusFilter === 'active' && isExpired) return false;
      if (statusFilter === 'closed' && !isExpired) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = a.title.toLowerCase().includes(q);
        const matchCode = a.code?.toLowerCase().includes(q);
        return matchTitle || matchCode;
      }
      return true;
    });
  }, [assignments, selectedClassFilter, statusFilter, searchQuery]);

  // Xóa bài tập
  const handleDeleteAssignment = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Thầy có chắc chắn muốn xóa bài tập này không?')) return;
    try {
      await deleteAssignment(id);
      setAssignments(prev => prev.filter(a => a.id !== id));
      if (activeAssignmentId === id) setActiveAssignmentId(null);
      toast.success('Đã xóa bài tập!');
    } catch (err: any) {
      toast.error('Lỗi xóa bài tập: ' + err.message);
    }
  };

  // Chia sẻ Zalo
  const handleShareZalo = (a: HomeworkAssignment, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = generateZaloShareMessage(a, a.class_names?.join(', ') || '');
    navigator.clipboard.writeText(text);
    toast.success('Đã sao chép tin nhắn Zalo giao bài!');
  };

  // Mở màn hình chấm bài của 1 học sinh
  const handleOpenGrading = (submission: HomeworkSubmission, studentName: string) => {
    setGradingSubmission({ submission, studentName });
    setGradingScore(submission.score !== null && submission.score !== undefined ? String(submission.score) : '8.0');
    setGradingComment(submission.teacher_comment || 'Bài làm tốt, chú ý kiểm tra lại các bước tính toán.');
  };

  // Lưu kết quả chấm bài
  const handleSaveGrading = async () => {
    if (!gradingSubmission) return;
    try {
      const scoreNum = parseFloat(gradingScore) || 0;
      const updatedSub: HomeworkSubmission = {
        ...gradingSubmission.submission,
        status: 'graded',
        score: scoreNum,
        teacher_comment: gradingComment.trim(),
        graded_at: new Date().toISOString(),
      };
      await saveSubmission(updatedSub);
      setActiveSubmissions(prev =>
        prev.map(s => (s.id === updatedSub.id ? updatedSub : s))
      );
      setGradingSubmission(null);
      toast.success('🎉 Đã lưu điểm và nhận xét cho học sinh!');
    } catch (err: any) {
      toast.error('Lỗi lưu điểm: ' + err.message);
    }
  };

  // Tìm bài tập đang active
  const currentActiveAssignment = assignments.find(a => a.id === activeAssignmentId);

  // Danh sách học sinh định dạng chuẩn cho tracker
  const allFormattedStudents = useMemo(() => {
    const classMap = new Map((classes || []).map(c => [c.id, c.name]));
    return (students || []).map(st => ({
      id: st.id,
      full_name: st.full_name,
      student_code: st.student_code,
      parent_phone: st.parent_phone,
      zalo: st.zalo,
      class_id: (st as any).class_id,
      class_name: (st as any).class_id ? classMap.get((st as any).class_id) : undefined,
    }));
  }, [students, classes]);

  return (
    <div className="space-y-6 pb-12">
      {/* NẾU ĐANG CHẤM BÀI -> HIỂN THỊ MODAL CHẤM BÀI VỚI CANVAS ĐÚNG/SAI */}
      {gradingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[95vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-700 via-emerald-700 to-teal-800 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-md">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-black tracking-wide">
                    CHẤM BÀI TỰ LUẬN TRỰC TIẾP TRÊN ẢNH
                  </h2>
                  <p className="text-xs text-teal-100">
                    Học sinh: <span className="font-bold underline">{gradingSubmission.studentName}</span> • 
                    Thời gian nộp: {formatDateTimeVN(gradingSubmission.submission.submitted_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setGradingSubmission(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Studio Canvas chấm ảnh */}
              {gradingSubmission.submission.images && gradingSubmission.submission.images.length > 0 ? (
                <div>
                  <div className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Bộ công cụ chạm chấm Đúng ✓, Sai ✗, Khoanh tròn ⭕ và Viết tay ✏️:
                  </div>
                  <EssayImageAnnotator
                    imageUrl={gradingSubmission.submission.images[0].url}
                    studentName={gradingSubmission.studentName}
                    examTitle={currentActiveAssignment?.title || 'Bài tập về nhà'}
                    studentId={gradingSubmission.submission.student_id}
                    onSaveMarks={annotatedUrl => {
                      toast.success('Đã lưu các nét chấm trên ảnh!');
                    }}
                  />
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  Học sinh chưa đính kèm ảnh bài làm!
                </div>
              )}

              {/* Nhập Điểm & Lời Phê */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Điểm số (/10.0) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={gradingScore}
                    onChange={e => setGradingScore(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-lg font-black text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Lời phê & Nhận xét của Thầy Thọ
                  </label>
                  <input
                    type="text"
                    value={gradingComment}
                    onChange={e => setGradingComment(e.target.value)}
                    placeholder="VD: Trình bày sạch đẹp, bài làm chính xác..."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => setGradingSubmission(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Đóng
              </button>
              <button
                onClick={handleSaveGrading}
                className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black shadow-lg shadow-teal-600/30 transition flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" /> LƯU KẾT QUẢ CHẤM ĐIỂM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: MÀN HÌNH THEO DÕI NỘP BÀI CỦA 1 BÀI TẬP */}
      {currentActiveAssignment ? (
        <AssignmentTrackerView
          assignment={currentActiveAssignment}
          submissions={activeSubmissions}
          allStudents={allFormattedStudents}
          onBack={() => setActiveAssignmentId(null)}
          onRefresh={() => {
            getSubmissions(currentActiveAssignment.id).then(subs => {
              setActiveSubmissions(subs);
              toast.success('Đã cập nhật bài nộp mới nhất!');
            });
          }}
          onOpenGrading={handleOpenGrading}
        />
      ) : (
        /* VIEW 1: DANH SÁCH BÀI TẬP ĐÃ GIAO */
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-teal-100 text-teal-800 text-xs font-black tracking-wider uppercase">
                  AZOTA HOMEWORK
                </span>
                <span className="text-xs text-slate-400 font-medium">Hệ thống bài tập độc lập</span>
              </div>
              <h1 className="text-2xl font-black text-slate-800 mt-1">QUẢN LÝ BÀI TẬP VỀ NHÀ</h1>
              <p className="text-xs text-slate-500 font-medium">
                Giao bài tập đa định dạng, đặt hạn nộp, tự động sinh link nộp bài Zalo và theo dõi tiến độ nộp bài
              </p>
            </div>

            <button
              onClick={() => {
                setEditingAssignment(null);
                setCreateModalOpen(true);
              }}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-xs font-black shadow-lg shadow-teal-600/30 transition flex items-center justify-center gap-2 flex-shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[3]" /> + GIAO BÀI TẬP MỚI (AZOTA)
            </button>
          </div>

          {/* Filter Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Lọc theo lớp */}
              <select
                value={selectedClassFilter}
                onChange={e => setSelectedClassFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50"
              >
                <option value="all">Tất cả các lớp</option>
                {(classes || []).map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* Lọc trạng thái */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang thu bài (Còn hạn)</option>
                <option value="closed">Đã hết hạn nộp</option>
              </select>
            </div>

            {/* Tìm kiếm */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm tên bài, mã bài..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Grid bài tập */}
          {filteredAssignments.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-base font-black text-slate-800">Chưa có bài tập nào được giao!</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Thầy bấm nút "Giao bài tập mới" để tải file đề bài, chọn lớp và gửi link Zalo cho các em làm bài nhé!
              </p>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black transition"
              >
                + Giao bài tập đầu tiên
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAssignments.map(a => {
                const isExpired = a.deadline ? new Date(a.deadline).getTime() < Date.now() : false;
                return (
                  <div
                    key={a.id}
                    onClick={() => setActiveAssignmentId(a.id)}
                    className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md hover:border-teal-300 transition cursor-pointer flex flex-col justify-between group space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-800 text-[11px] font-black tracking-wider uppercase">
                          {a.code || 'HW'}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                            isExpired
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {isExpired ? 'Đã hết hạn' : 'Đang thu bài'}
                        </span>
                      </div>

                      <h3 className="text-base font-black text-slate-800 group-hover:text-teal-700 transition line-clamp-2">
                        {a.title}
                      </h3>

                      <div className="space-y-1.5 text-xs text-slate-500 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-teal-600" />
                          <span>Lớp: <span className="font-bold text-slate-700">{a.class_names?.join(', ') || 'Tất cả'}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-teal-600" />
                          <span>Hạn nộp: <span className="font-bold text-slate-700">{formatDateTimeVN(a.deadline)}</span></span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={e => handleShareZalo(a, e)}
                          className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 transition"
                          title="Sao chép tin nhắn Zalo gửi cả lớp"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setEditingAssignment(a);
                            setCreateModalOpen(true);
                          }}
                          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                          title="Chỉnh sửa bài tập"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => handleDeleteAssignment(a.id, e)}
                          className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
                          title="Xóa bài tập"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-xs font-black text-teal-700 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        Xem chi tiết & Chấm bài <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal Giao bài tập */}
          <CreateAssignmentModal
            isOpen={createModalOpen}
            onClose={() => setCreateModalOpen(false)}
            onCreated={newAssignment => {
              loadAll();
            }}
            classes={(classes || []).map(c => ({ id: c.id, name: c.name }))}
            initialData={editingAssignment}
          />
        </div>
      )}
    </div>
  );
}
