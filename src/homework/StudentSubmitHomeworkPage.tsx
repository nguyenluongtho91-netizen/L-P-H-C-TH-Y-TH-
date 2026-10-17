// src/homework/StudentSubmitHomeworkPage.tsx
// Trang Nộp Bài Tập Về Nhà Dành Cho Học Sinh - Chuẩn Azota (Tối ưu 100% Mobile)

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Camera, UploadCloud, CheckCircle2, Clock, Calendar,
  FileText, Image as ImageIcon, RotateCw, Trash2,
  ChevronRight, AlertCircle, ArrowLeft, Send, Sparkles,
  BookOpen, Eye, User, Lock, Download
} from 'lucide-react';
import { HomeworkAssignment, HomeworkSubmission, HomeworkAttachment } from './types';
import { getAssignmentById, getSubmissions, saveSubmission, formatDateTimeVN } from './homeworkService';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function StudentSubmitHomeworkPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<HomeworkAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Array<{ id: string; full_name: string; student_code?: string; class_id?: string; class_name?: string }>>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);

  // Form State
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [searchStudentText, setSearchStudentText] = useState('');
  const [images, setImages] = useState<Array<{ id: string; url: string; rotation: number }>>([]);
  const [studentNote, setStudentNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [previousSubmission, setPreviousSubmission] = useState<HomeworkSubmission | null>(null);

  // Load Assignment và danh sách học sinh
  useEffect(() => {
    async function loadData() {
      if (!assignmentId) return;
      try {
        setLoading(true);
        const hw = await getAssignmentById(assignmentId);
        if (hw) {
          setAssignment(hw);
          if (hw.class_ids && hw.class_ids.length > 0) {
            setSelectedClassId(hw.class_ids[0]);
          }
        }

        // Tải danh sách lớp và học sinh từ Supabase
        const { data: clsData } = await supabase.from('classes').select('id, name').order('name');
        if (clsData) setClasses(clsData);

        const { data: stdData } = await supabase
          .from('students')
          .select('id, full_name, student_code, status')
          .eq('status', 'active')
          .order('full_name');

        const { data: enrollData } = await supabase.from('enrollments').select('student_id, class_id');

        if (stdData && enrollData && clsData) {
          const classMap = new Map(clsData.map(c => [c.id, c.name]));
          const enrollMap = new Map(enrollData.map(e => [e.student_id, e.class_id]));

          const mappedStudents = stdData.map(st => {
            const cId = enrollMap.get(st.id);
            return {
              id: st.id,
              full_name: st.full_name,
              student_code: st.student_code,
              class_id: cId,
              class_name: cId ? classMap.get(cId) : undefined,
            };
          });
          setStudents(mappedStudents);
        }
      } catch (e) {
        console.error('Lỗi nạp bài tập:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [assignmentId]);

  // Kiểm tra nếu học sinh này đã từng nộp bài
  useEffect(() => {
    if (assignmentId && selectedStudentId) {
      getSubmissions(assignmentId).then(subs => {
        const found = subs.find(s => s.student_id === selectedStudentId);
        setPreviousSubmission(found || null);
      });
    } else {
      setPreviousSubmission(null);
    }
  }, [assignmentId, selectedStudentId]);

  // Danh sách học sinh theo lớp đã chọn
  const filteredStudents = useMemo(() => {
    let list = students;
    if (selectedClassId) {
      list = list.filter(s => s.class_id === selectedClassId);
    }
    if (searchStudentText.trim()) {
      const q = searchStudentText.toLowerCase().trim();
      list = list.filter(s => s.full_name.toLowerCase().includes(q) || (s.student_code && s.student_code.toLowerCase().includes(q)));
    }
    return list;
  }, [students, selectedClassId, searchStudentText]);

  // Học sinh được chọn
  const selectedStudent = useMemo(() => {
    return students.find(s => s.id === selectedStudentId);
  }, [students, selectedStudentId]);

  // Xử lý nạp ảnh từ camera hoặc thư viện
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        setImages(prev => [
          ...prev,
          {
            id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            url,
            rotation: 0,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // Xoay ảnh 90 độ
  const handleRotateImage = (id: string) => {
    setImages(prev =>
      prev.map(img => (img.id === id ? { ...img, rotation: (img.rotation + 90) % 360 } : img))
    );
  };

  // Xóa ảnh
  const handleRemoveImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  // Kiểm tra hạn nộp
  const isLate = assignment?.deadline ? new Date(assignment.deadline).getTime() < Date.now() : false;

  // Xử lý nộp bài
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignment) return;
    if (!selectedStudentId) {
      toast.error('Vui lòng chọn tên của em trong danh sách lớp!');
      return;
    }
    if (images.length === 0) {
      toast.error('Vui lòng chụp ảnh hoặc tải ảnh bài làm lên!');
      return;
    }

    try {
      setSubmitting(true);
      const studentObj = selectedStudent;

      const submission: HomeworkSubmission = {
        id: previousSubmission?.id || 'sub_' + Date.now(),
        assignment_id: assignment.id,
        student_id: selectedStudentId,
        student_name: studentObj?.full_name || 'Học sinh',
        student_code: studentObj?.student_code,
        class_id: selectedClassId || studentObj?.class_id || '',
        class_name: studentObj?.class_name,
        submitted_at: new Date().toISOString(),
        is_late: isLate,
        status: 'submitted',
        images: images.map(img => ({
          id: img.id,
          url: img.url,
        })),
        student_note: studentNote.trim(),
      };

      await saveSubmission(submission);
      setSubmitSuccess(true);
      toast.success('🎉 Nộp bài thành công!');
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi nộp bài: ' + (err.message || 'Thử lại sau'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-bold text-teal-800 uppercase tracking-widest">Đang tải bài tập...</p>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-black text-slate-800">Không tìm thấy bài tập</h2>
          <p className="text-xs text-slate-500">
            Đường link bài tập không tồn tại hoặc đã bị gỡ bỏ. Em vui lòng kiểm tra lại tin nhắn Zalo của Thầy Thọ nhé!
          </p>
        </div>
      </div>
    );
  }

  // Màn hình nộp thành công
  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-teal-50 to-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center border border-teal-100 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
          </div>

          <div>
            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              {isLate ? 'Đã nộp bài (Nộp muộn)' : 'Đã nộp bài đúng hạn'}
            </span>
            <h1 className="text-2xl font-black text-slate-800 mt-2">NỘP BÀI THÀNH CÔNG!</h1>
            <p className="text-xs text-slate-500 mt-1">
              Bài làm của em <span className="font-bold text-teal-800">{selectedStudent?.full_name}</span> đã được ghi nhận vào hệ thống Lớp Học Thầy Thọ.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Bài tập:</span>
              <span className="font-bold text-slate-700">{assignment.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Số trang ảnh nộp:</span>
              <span className="font-bold text-teal-700">{images.length} trang</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Thời gian nộp:</span>
              <span className="font-semibold text-slate-700">{formatDateTimeVN(new Date().toISOString())}</span>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Thầy Thọ sẽ chấm bài trực tiếp trên ảnh và gửi nhận xét sớm nhất nhé!
          </p>

          <button
            onClick={() => setSubmitSuccess(false)}
            className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
          >
            Nộp lại bài khác / Chụp thêm ảnh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/80 py-6 px-3 sm:px-4">
      <div className="max-w-xl mx-auto space-y-4">
        {/* 1. Header Bài Tập */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 rounded-full bg-teal-100 text-teal-800 text-xs font-black tracking-wider uppercase">
              {assignment.code || 'BÀI TẬP'}
            </span>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
              <Clock className="w-3.5 h-3.5 text-teal-600" />
              <span>Hạn nộp: {formatDateTimeVN(assignment.deadline)}</span>
            </div>
          </div>

          <h1 className="text-lg sm:text-xl font-black text-slate-800 leading-snug">
            {assignment.title}
          </h1>

          {/* Lời dặn dò của Thầy */}
          {assignment.description && (
            <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-100 text-xs text-teal-900 leading-relaxed">
              <span className="font-bold text-teal-800">💡 Thầy Thọ dặn dò: </span>
              {assignment.description}
            </div>
          )}

          {/* Tài liệu đề bài đính kèm */}
          {assignment.attachments && assignment.attachments.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-teal-600" />
                Đề bài & Tài liệu đính kèm ({assignment.attachments.length}):
              </div>
              <div className="space-y-1.5">
                {assignment.attachments.map(att => (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-teal-50 border border-slate-200 text-xs font-semibold text-slate-700 transition"
                  >
                    <span className="truncate pr-2">{att.name}</span>
                    <span className="text-[11px] font-bold text-teal-700 flex items-center gap-1 flex-shrink-0">
                      <Eye className="w-3.5 h-3.5" /> Xem đề
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2. Form Nộp Bài */}
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-5">
          {/* Bước 1: Chọn Tên Học Sinh */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-black">
                1
              </span>
              <h2 className="text-sm font-black text-slate-800">
                CHỌN TÊN CỦA EM TRONG DANH SÁCH LỚP
              </h2>
            </div>

            {/* Chọn Lớp (nếu bài tập giao cho nhiều lớp) */}
            {assignment.class_ids && assignment.class_ids.length > 1 && (
              <div className="mb-3">
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Chọn Lớp học của em:
                </label>
                <select
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50"
                >
                  {classes
                    .filter(c => assignment.class_ids.includes(c.id))
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Tìm kiếm & Chọn tên */}
            <div className="space-y-2">
              <input
                type="text"
                value={searchStudentText}
                onChange={e => setSearchStudentText(e.target.value)}
                placeholder="Gõ tên của em để tìm kiếm nhanh..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />

              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-slate-50/50">
                {filteredStudents.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    Không tìm thấy học sinh nào theo tên này!
                  </div>
                ) : (
                  filteredStudents.map(st => {
                    const isSelected = selectedStudentId === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSelectedStudentId(st.id)}
                        className={`w-full p-2.5 text-left text-xs flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-teal-600 text-white font-bold'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <User className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                          <span>{st.full_name}</span>
                          {st.student_code && (
                            <span className={`text-[10px] font-mono ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                              ({st.student_code})
                            </span>
                          )}
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Đã chọn học sinh nào */}
            {selectedStudent && (
              <div className="mt-2.5 p-3 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-between">
                <div className="text-xs">
                  <span className="text-slate-500">Đang chọn: </span>
                  <span className="font-black text-teal-900">{selectedStudent.full_name}</span>
                  {selectedStudent.class_name && (
                    <span className="text-teal-700 font-semibold ml-1">({selectedStudent.class_name})</span>
                  )}
                </div>
                {previousSubmission && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    Đã nộp trước đó
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Bước 2: Chụp ảnh bài làm */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-black">
                2
              </span>
              <h2 className="text-sm font-black text-slate-800">
                CHỤP ẢNH BÀI LÀM TRONG VỞ GHI
              </h2>
            </div>

            <div className="p-4 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/40 text-center space-y-3">
              <Camera className="w-10 h-10 mx-auto text-teal-600" />
              <div>
                <p className="text-xs font-bold text-slate-800">
                  Chụp ảnh thẳng góc, rõ chữ từ vở bài làm của em
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Có thể chụp nhiều trang (Trang 1, Trang 2, Trang 3...)
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <label className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black cursor-pointer transition shadow-md shadow-teal-600/30 flex items-center gap-2">
                  <Camera className="w-4 h-4" /> Chụp ảnh / Tải ảnh lên
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Danh sách ảnh đã chụp */}
            {images.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Ảnh bài làm đã chọn ({images.length} trang):</span>
                  <span className="text-[11px] text-slate-400">Bấm xoay nếu ảnh chụp bị ngược</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {images.map((img, idx) => (
                    <div
                      key={img.id}
                      className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 aspect-[3/4] flex items-center justify-center group"
                    >
                      <img
                        src={img.url}
                        alt={`Trang ${idx + 1}`}
                        style={{ transform: `rotate(${img.rotation}deg)` }}
                        className="max-h-full max-w-full object-contain transition-transform"
                      />
                      {/* Badge số trang */}
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold">
                        Trang {idx + 1}
                      </span>
                      {/* Thao tác xoay / xóa */}
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleRotateImage(img.id)}
                          className="w-7 h-7 rounded-full bg-white/90 hover:bg-white text-slate-800 flex items-center justify-center shadow-md transition"
                          title="Xoay 90 độ"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(img.id)}
                          className="w-7 h-7 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-md transition"
                          title="Xóa trang này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bước 3: Lời nhắn cho Thầy Thọ (Tùy chọn) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-black">
                3
              </span>
              <h2 className="text-sm font-black text-slate-800">
                GHI CHÚ GỬI THẦY THỌ (NẾU CÓ)
              </h2>
            </div>
            <textarea
              rows={2}
              value={studentNote}
              onChange={e => setStudentNote(e.target.value)}
              placeholder="VD: Thầy xem kĩ giúp em câu 3 tự luận, hoặc em làm thiếu 1 câu..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Nút NỘP BÀI */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 hover:from-teal-700 hover:to-emerald-700 text-white text-sm font-black shadow-xl shadow-teal-600/30 transition flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>Đang nộp bài lên hệ thống...</>
              ) : (
                <>
                  <Send className="w-4 h-4" /> BẤM NỘP BÀI CHO THẦY THỌ
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
