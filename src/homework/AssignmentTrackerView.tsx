// src/homework/AssignmentTrackerView.tsx
// Màn hình Giám sát nộp bài & Chấm điểm theo thời gian thực - Chuẩn Azota

import React, { useState, useMemo } from 'react';
import {
  ArrowLeft, Share2, Copy, QrCode, FileSpreadsheet, Send,
  CheckCircle2, Clock, AlertCircle, Search, Filter,
  GraduationCap, MessageCircle, ExternalLink, RefreshCw,
  Eye, Edit3, X, Check, AlertTriangle, ChevronRight
} from 'lucide-react';
import { HomeworkAssignment, HomeworkSubmission, MissingStudentInfo } from './types';
import {
  generateZaloShareMessage,
  generateZaloReminderMessage,
  generatePersonalReminderMessage,
  formatDateTimeVN,
  exportHomeworkToExcel,
  saveSubmission
} from './homeworkService';
import toast from 'react-hot-toast';

interface AssignmentTrackerViewProps {
  assignment: HomeworkAssignment;
  submissions: HomeworkSubmission[];
  allStudents: Array<{
    id: string;
    full_name: string;
    student_code?: string;
    parent_phone?: string;
    zalo?: string;
    class_id?: string;
    class_name?: string;
  }>;
  onBack: () => void;
  onRefresh: () => void;
  onOpenGrading: (submission: HomeworkSubmission, studentName: string) => void;
}

export default function AssignmentTrackerView({
  assignment,
  submissions,
  allStudents,
  onBack,
  onRefresh,
  onOpenGrading,
}: AssignmentTrackerViewProps) {
  const [filterTab, setFilterTab] = useState<'all' | 'submitted' | 'missing' | 'need_grade' | 'graded'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showZaloReminderModal, setShowZaloReminderModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedStudentForPrompt, setSelectedStudentForPrompt] = useState<string | null>(null);

  // Tạo map tra cứu bài nộp theo student_id
  const submissionMap = useMemo(() => {
    const map = new Map<string, HomeworkSubmission>();
    submissions.forEach(s => map.set(s.student_id, s));
    return map;
  }, [submissions]);

  // Danh sách học sinh của bài tập này
  const relevantStudents = useMemo(() => {
    if (!assignment.class_ids || assignment.class_ids.length === 0) return allStudents;
    return allStudents.filter(s => s.class_id && assignment.class_ids.includes(s.class_id));
  }, [allStudents, assignment.class_ids]);

  // Thống kê nhanh
  const totalCount = relevantStudents.length;
  const submittedCount = relevantStudents.filter(s => submissionMap.has(s.id)).length;
  const missingCount = totalCount - submittedCount;
  const gradedCount = relevantStudents.filter(s => {
    const sub = submissionMap.get(s.id);
    return sub && sub.status === 'graded';
  }).length;
  const needGradeCount = submittedCount - gradedCount;

  // Điểm trung bình
  const avgScore = useMemo(() => {
    let sum = 0;
    let count = 0;
    submissions.forEach(s => {
      if (s.score !== null && s.score !== undefined && !isNaN(Number(s.score))) {
        sum += Number(s.score);
        count++;
      }
    });
    return count > 0 ? (sum / count).toFixed(1) : '—';
  }, [submissions]);

  // Danh sách các bạn chưa nộp
  const missingStudentsList: MissingStudentInfo[] = useMemo(() => {
    return relevantStudents
      .filter(s => !submissionMap.has(s.id))
      .map(s => ({
        student_id: s.id,
        full_name: s.full_name,
        student_code: s.student_code,
        class_name: s.class_name,
        parent_phone: s.parent_phone,
        zalo: s.zalo,
      }));
  }, [relevantStudents, submissionMap]);

  // Lọc theo Tab và Search
  const filteredStudents = useMemo(() => {
    return relevantStudents.filter(st => {
      const sub = submissionMap.get(st.id);
      const isSub = !!sub;
      const isGraded = sub?.status === 'graded';

      if (filterTab === 'submitted' && !isSub) return false;
      if (filterTab === 'missing' && isSub) return false;
      if (filterTab === 'need_grade' && (!isSub || isGraded)) return false;
      if (filterTab === 'graded' && (!isSub || !isGraded)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = st.full_name?.toLowerCase().includes(q);
        const matchCode = st.student_code?.toLowerCase().includes(q);
        return matchName || matchCode;
      }
      return true;
    });
  }, [relevantStudents, submissionMap, filterTab, searchQuery]);

  // Kiểm tra hạn nộp
  const isExpired = assignment.deadline ? new Date(assignment.deadline).getTime() < Date.now() : false;

  // Sao chép Link nộp bài
  const handleCopyLink = () => {
    const link = `${window.location.origin}/nop-bai/${assignment.id}`;
    navigator.clipboard.writeText(link);
    toast.success('Đã sao chép Link nộp bài cho học sinh!');
  };

  // Sao chép tin nhắn Zalo gửi cả lớp
  const handleCopyZaloShare = () => {
    const text = generateZaloShareMessage(assignment, assignment.class_names?.join(', ') || '');
    navigator.clipboard.writeText(text);
    toast.success('Đã sao chép tin nhắn Zalo giao bài!');
  };

  // Xuất Excel
  const handleExportExcel = () => {
    exportHomeworkToExcel(assignment, submissions, relevantStudents);
    toast.success('Đang tải file Excel bảng điểm bài tập...');
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Navigation Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600 transition"
              title="Quay lại danh sách bài tập"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-teal-100 text-teal-800 text-xs font-black uppercase tracking-wider">
                  {assignment.code || 'BÀI TẬP'}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                    isExpired
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {isExpired ? 'Đã hết hạn' : 'Đang thu bài'}
                </span>
              </div>
              <h1 className="text-xl font-black text-slate-800 mt-1">{assignment.title}</h1>
              <p className="text-xs text-slate-500 font-medium">
                Lớp: <span className="font-bold text-slate-700">{assignment.class_names?.join(', ') || 'Tất cả'}</span> • 
                Hạn chót: <span className="font-bold text-slate-700">{formatDateTimeVN(assignment.deadline)}</span>
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onRefresh}
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowQrModal(true)}
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 transition flex items-center gap-1.5 text-xs font-bold"
              title="Mã QR nộp bài"
            >
              <QrCode className="w-4 h-4 text-teal-600" /> Mã QR
            </button>
            <button
              onClick={handleCopyLink}
              className="px-3 py-2 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Copy className="w-4 h-4" /> Link nộp bài
            </button>
            <button
              onClick={handleCopyZaloShare}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm shadow-blue-200"
            >
              <Share2 className="w-4 h-4" /> Gửi Zalo Lớp
            </button>
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm shadow-emerald-200"
            >
              <FileSpreadsheet className="w-4 h-4" /> Xuất Excel
            </button>
          </div>
        </div>

        {/* Banner nhắc Zalo nếu có học sinh chưa nộp */}
        {missingCount > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <span className="font-bold text-amber-900">
                  Có {missingCount} học sinh chưa nộp bài!
                </span>
                <p className="text-amber-700 text-[11px] mt-0.5">
                  Thầy có thể gửi tin nhắn nhắc nhở trực tiếp vào nhóm Zalo lớp để phụ huynh đôn đốc các em.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowZaloReminderModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              <MessageCircle className="w-4 h-4" /> 📢 Nhắc Zalo {missingCount} bạn chưa nộp
            </button>
          </div>
        )}
      </div>

      {/* 2. Thẻ Thống Kê Nhanh (5 Real-time Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sĩ số lớp</div>
          <div className="text-2xl font-black text-slate-800 mt-1">{totalCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Học sinh được giao</div>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Đã nộp bài</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">
            {submittedCount} <span className="text-xs font-semibold text-slate-400">({totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0}%)</span>
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Đúng hạn & Nộp muộn</div>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="text-[11px] font-bold text-rose-500 uppercase tracking-wider">Chưa nộp</div>
          <div className="text-2xl font-black text-rose-600 mt-1">{missingCount}</div>
          <div className="text-[11px] text-rose-500 mt-0.5">Cần nhắc nhở</div>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Cần chấm điểm</div>
          <div className="text-2xl font-black text-blue-700 mt-1">{needGradeCount}</div>
          <div className="text-[11px] text-blue-600 mt-0.5">Đã nộp chờ thầy chấm</div>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm col-span-2 sm:col-span-1">
          <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Điểm trung bình</div>
          <div className="text-2xl font-black text-amber-700 mt-1">{avgScore}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Thang điểm 10.0</div>
        </div>
      </div>

      {/* 3. Bảng Danh Sách Học Sinh & Bài Làm */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Thanh công cụ lọc & tìm kiếm */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: `Tất cả (${totalCount})` },
              { id: 'submitted', label: `Đã nộp (${submittedCount})` },
              { id: 'missing', label: `Chưa nộp (${missingCount})` },
              { id: 'need_grade', label: `Cần chấm (${needGradeCount})` },
              { id: 'graded', label: `Đã chấm (${gradedCount})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  filterTab === tab.id
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên, mã HS..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Bảng dữ liệu */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200/70">
              <tr>
                <th className="py-3 px-4 w-12 text-center">STT</th>
                <th className="py-3 px-4">Họ và tên</th>
                <th className="py-3 px-4">Lớp</th>
                <th className="py-3 px-4">Thời gian nộp</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-center">Ảnh bài làm</th>
                <th className="py-3 px-4 text-center">Điểm số</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Không có học sinh nào thỏa mãn bộ lọc!
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st, idx) => {
                  const sub = submissionMap.get(st.id);
                  const isSubmitted = !!sub;
                  const isGraded = sub?.status === 'graded';
                  const isLate = sub?.is_late ?? false;

                  return (
                    <tr key={st.id} className="hover:bg-teal-50/30 transition">
                      <td className="py-3.5 px-4 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{st.full_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {st.student_code || '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600">
                        {st.class_name || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {sub?.submitted_at ? formatDateTimeVN(sub.submitted_at) : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {isSubmitted ? (
                          isLate ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                              Nộp muộn
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                              Đã nộp đúng hạn
                            </span>
                          )
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-bold">
                            Chưa nộp bài
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {sub?.images?.length ? (
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[11px]">
                            {sub.images.length} trang ảnh
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {sub?.score !== null && sub?.score !== undefined ? (
                          <span className="px-2.5 py-1 rounded-lg bg-teal-100 text-teal-900 font-black text-sm">
                            {sub.score}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-bold">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isSubmitted ? (
                            <button
                              onClick={() => onOpenGrading(sub, st.full_name)}
                              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition"
                            >
                              <GraduationCap className="w-3.5 h-3.5" />
                              {isGraded ? 'Chấm lại' : 'Chấm bài'}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                const msg = generatePersonalReminderMessage(assignment, st.full_name);
                                navigator.clipboard.writeText(msg);
                                toast.success(`Đã sao chép tin nhắn nhắc em ${st.full_name}!`);
                              }}
                              className="px-2.5 py-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs flex items-center gap-1 transition"
                              title="Sao chép tin nhắn Zalo gửi phụ huynh"
                            >
                              <MessageCircle className="w-3.5 h-3.5" /> Nhắc Zalo
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Modal Nhắc Nhở Zalo Nhóm (Chưa nộp) */}
      {showZaloReminderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-amber-600" />
                SOẠN TIN NHẮN ZALO NHẮC HỌC SINH CHƯA NỘP
              </h3>
              <button onClick={() => setShowZaloReminderModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Tin nhắn mẫu tự động đính kèm danh sách {missingStudentsList.length} học sinh chưa nộp bài và link nộp bài trực tiếp:
            </p>

            <textarea
              readOnly
              rows={8}
              value={generateZaloReminderMessage(assignment, missingStudentsList)}
              className="w-full p-3 text-xs font-mono bg-slate-50 rounded-xl border border-slate-200 text-slate-800 focus:outline-none"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowZaloReminderModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  const text = generateZaloReminderMessage(assignment, missingStudentsList);
                  navigator.clipboard.writeText(text);
                  toast.success('Đã sao chép tin nhắn Zalo nhắc nộp bài!');
                  setShowZaloReminderModal(false);
                }}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-amber-600/30"
              >
                <Copy className="w-4 h-4" /> Sao chép tin nhắn Zalo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal Mã QR Nộp Bài */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800">MÃ QR NỘP BÀI TẬP</h3>
              <button onClick={() => setShowQrModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 font-medium">{assignment.title}</p>

            {/* Tạo ảnh QR bằng QuickChart API */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block mx-auto">
              <img
                src={`https://quickchart.io/qr?text=${encodeURIComponent(`${window.location.origin}/nop-bai/${assignment.id}`)}&size=200`}
                alt="QR Nop Bai"
                className="w-48 h-48 mx-auto"
              />
            </div>

            <p className="text-xs text-slate-600 font-semibold">
              Học sinh dùng Camera điện thoại hoặc Zalo quét mã để nộp bài ngay!
            </p>

            <button
              onClick={() => {
                const link = `${window.location.origin}/nop-bai/${assignment.id}`;
                navigator.clipboard.writeText(link);
                toast.success('Đã sao chép link nộp bài!');
              }}
              className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" /> Sao chép Link nộp bài
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
