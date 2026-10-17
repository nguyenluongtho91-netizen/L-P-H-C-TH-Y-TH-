// src/homework/StudentSubmitHomeworkPage.tsx
// Cổng Nộp Bài Học Sinh - Chuẩn Azota 100%: Chọn tên trong danh sách lớp -> Xem đề -> Chụp vở nộp

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Camera, CheckCircle2, Clock, Calendar, FileText,
  RotateCw, Trash2, AlertCircle, Send, Sparkles, BookOpen,
  Eye, EyeOff, User, Lock, LogOut, Check, ArrowRight,
  HelpCircle, ChevronRight, Image as ImageIcon, Search,
  Users, RefreshCw, ZoomIn, ZoomOut, CheckCheck, UploadCloud,
  FileCheck2, Award, MessageSquare, ChevronLeft, ArrowLeft
} from 'lucide-react';
import { HomeworkAssignment, HomeworkSubmission, HomeworkAttachment } from './types';
import { getAssignmentById, getSubmissions, saveSubmission, formatDateTimeVN } from './homeworkService';
import { supabase } from '@/lib/supabase';
import { getStudentCredential } from '@/services/studentCredentialsService';
import toast from 'react-hot-toast';

export default function StudentSubmitHomeworkPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<HomeworkAssignment | null>(null);
  const [loading, setLoading] = useState(true);

  // Danh sách học sinh theo lớp
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState('');

  // Học sinh đang được chọn để làm bài
  const [currentStudent, setCurrentStudent] = useState<any>(null);
  const [previousSubmission, setPreviousSubmission] = useState<HomeworkSubmission | null>(null);

  // Password popup (nếu bài tập yêu cầu mật khẩu)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pendingStudent, setPendingStudent] = useState<any>(null);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Tự nhập tên học sinh mới nếu chưa có trong danh sách
  const [customNameModalOpen, setCustomNameModalOpen] = useState(false);
  const [customFullName, setCustomFullName] = useState('');
  const [customPhone, setCustomPhone] = useState('');

  // Dữ liệu làm bài
  const [images, setImages] = useState<Array<{ id: string; url: string; rotation: number }>>([]);
  const [studentNote, setStudentNote] = useState('');
  const [onlinePart1, setOnlinePart1] = useState<Record<number, string>>({});
  const [onlinePart2, setOnlinePart2] = useState<Record<number, Record<string, string>>>({});
  const [onlinePart3, setOnlinePart3] = useState<Record<number, string>>({});
  const [showOnlineForm, setShowOnlineForm] = useState(false);

  // Trạng thái nộp bài
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);

  // Preview ảnh phóng to
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // 1. TẢI THÔNG TIN BÀI TẬP
  useEffect(() => {
    async function fetchAssignment() {
      if (!assignmentId) return;
      setLoading(true);
      try {
        const a = await getAssignmentById(assignmentId);
        if (a) {
          setAssignment(a);
          if (a.class_ids && a.class_ids.length > 0) {
            setSelectedClassId(a.class_ids[0]);
          }
        } else {
          toast.error('Không tìm thấy bài tập!');
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchAssignment();
  }, [assignmentId]);

  // 2. TẢI DANH SÁCH HỌC SINH THEO CÁC LỚP ĐƯỢC GIAO BÀI
  useEffect(() => {
    async function fetchStudents() {
      if (!assignment || !assignment.class_ids || assignment.class_ids.length === 0) return;
      setLoadingStudents(true);
      try {
        // Lấy enrollments của các lớp này
        const { data: enrollments } = await supabase
          .from('enrollments')
          .select('student_id, class_id')
          .in('class_id', assignment.class_ids)
          .eq('status', 'active');

        const studentIds = (enrollments || []).map((e: any) => e.student_id);

        if (studentIds.length > 0) {
          const { data: stus } = await supabase
            .from('students')
            .select('*')
            .in('id', studentIds)
            .order('full_name');

          // Map lại học sinh theo từng lớp
          const studentMap = new Map((stus || []).map((s: any) => [s.id, s]));
          const list: any[] = [];
          (enrollments || []).forEach((e: any) => {
            const st = studentMap.get(e.student_id);
            if (st) {
              list.push({ ...st, class_id: e.class_id });
            }
          });
          setClassStudents(list);
        } else {
          // Fallback: nếu không có enrollments thì lấy toàn bộ students
          const { data: stus } = await supabase.from('students').select('*').order('full_name');
          setClassStudents(stus || []);
        }
      } catch (err) {
        console.warn('Lỗi tải danh sách học sinh:', err);
      } finally {
        setLoadingStudents(false);
      }
    }
    fetchStudents();
  }, [assignment]);

  // 3. TẢI CÁC BÀI ĐÃ NỘP ĐỂ ĐÁNH DẤU NHÃN
  const [submissionsList, setSubmissionsList] = useState<HomeworkSubmission[]>([]);
  const loadSubmissions = async () => {
    if (!assignmentId) return;
    const subs = await getSubmissions(assignmentId);
    setSubmissionsList(subs);
  };

  useEffect(() => {
    loadSubmissions();
  }, [assignmentId]);

  // Map kiểm tra bài nộp theo student_id
  const submissionByStudentId = useMemo(() => {
    const map = new Map<string, HomeworkSubmission>();
    submissionsList.forEach(s => map.set(s.student_id, s));
    return map;
  }, [submissionsList]);

  // Lọc học sinh theo lớp và ô tìm kiếm
  const filteredStudents = useMemo(() => {
    return classStudents.filter(st => {
      if (selectedClassId && st.class_id && st.class_id !== selectedClassId) return false;
      if (studentSearch.trim()) {
        const q = studentSearch.toLowerCase().trim();
        const matchName = (st.full_name || '').toLowerCase().includes(q);
        const matchCode = (st.student_code || '').toLowerCase().includes(q);
        return matchName || matchCode;
      }
      return true;
    });
  }, [classStudents, selectedClassId, studentSearch]);

  // ── XỬ LÝ CHỌN HỌC SINH ──
  const handleSelectStudent = async (student: any) => {
    // Kiểm tra nếu bài tập yêu cầu mật khẩu
    if (assignment?.require_password) {
      setPendingStudent(student);
      setEnteredPassword('');
      setPasswordModalOpen(true);
      return;
    }
    await activateStudent(student);
  };

  const handleConfirmPassword = async () => {
    if (!pendingStudent) return;
    const pass = enteredPassword.trim();
    if (!pass) {
      toast.error('Vui lòng nhập mật khẩu!');
      return;
    }

    // Nếu bài tập có mật khẩu chung
    if (assignment?.assignment_password && assignment.assignment_password === pass) {
      setPasswordModalOpen(false);
      await activateStudent(pendingStudent);
      return;
    }

    // So khớp mật khẩu riêng của học sinh
    const cred = await getStudentCredential(pendingStudent.student_code);
    const expected = cred?.password || pendingStudent.password || '123456';

    if (pass !== expected) {
      toast.error('Sai mật khẩu! Vui lòng thử lại.');
      return;
    }

    setPasswordModalOpen(false);
    await activateStudent(pendingStudent);
  };

  const activateStudent = async (student: any) => {
    setCurrentStudent(student);
    localStorage.setItem('azota_current_student', JSON.stringify(student));

    // Kiểm tra xem học sinh đã có bài nộp trước đó chưa
    const prev = submissionByStudentId.get(student.id);
    if (prev) {
      setPreviousSubmission(prev);
      setSubmitSuccess(true);
      toast.success(`Em ${student.full_name} đã nộp bài trước đó!`);
    } else {
      setPreviousSubmission(null);
      setSubmitSuccess(false);
      setImages([]);
      setStudentNote('');
    }
  };

  // Tự tạo học sinh mới nếu chưa có trong danh sách
  const handleCreateCustomStudent = () => {
    if (!customFullName.trim()) {
      toast.error('Vui lòng nhập họ và tên!');
      return;
    }
    const tempStudent = {
      id: 'custom_' + Date.now(),
      full_name: customFullName.trim(),
      student_code: 'GUEST_' + Math.floor(1000 + Math.random() * 9000),
      parent_phone: customPhone.trim() || undefined,
      class_id: selectedClassId || 'default',
    };
    setCustomNameModalOpen(false);
    activateStudent(tempStudent);
  };

  // Đổi học sinh khác
  const handleLogoutStudent = () => {
    setCurrentStudent(null);
    setPreviousSubmission(null);
    setSubmitSuccess(false);
    setImages([]);
    setStudentNote('');
    localStorage.removeItem('azota_current_student');
  };

  // ── XỬ LÝ ẢNH BÀI LÀM (CHỤP VỞ HOẶC CHỌN TỪ MÁY) ──
  // Nén ảnh canvas để tối ưu dung lượng (chống tràn LocalStorage) và tăng tốc nộp bài
  const compressImage = (file: File, maxWidth = 1600, quality = 0.8): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth || height > maxWidth) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxWidth) / height);
              height = maxWidth;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const handleProcessImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast.error('Vui lòng chỉ chọn file ảnh (JPG, PNG)!');
        continue;
      }

      try {
        const compressedUrl = await compressImage(file);
        if (compressedUrl) {
          const newImg = {
            id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            url: compressedUrl,
            rotation: 0,
          };
          setImages(prev => [...prev, newImg]);
        }
      } catch (err) {
        console.warn('Lỗi xử lý ảnh:', err);
      }
    }
  };

  const handleRotateImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setImages(prev =>
      prev.map(img => (img.id === id ? { ...img, rotation: (img.rotation + 90) % 360 } : img))
    );
  };

  const handleRemoveImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setImages(prev => prev.filter(img => img.id !== id));
  };

  // ── XỬ LÝ NỘP BÀI ──
  const handleSubmitHomework = async () => {
    if (!assignment || !currentStudent) return;

    // Kiểm tra hết hạn
    if (!assignment.no_deadline && assignment.deadline) {
      const isExpired = new Date(assignment.deadline).getTime() < Date.now();
      if (isExpired && !assignment.allow_late) {
        toast.error('Bài tập đã hết hạn nộp và không cho phép nộp trễ!');
        return;
      }
    }

    if (images.length === 0 && Object.keys(onlinePart1).length === 0 && Object.keys(onlinePart2).length === 0 && Object.keys(onlinePart3).length === 0) {
      toast.error('Vui lòng chụp ít nhất 1 trang vở bài làm hoặc làm bài trực tuyến!');
      return;
    }

    try {
      setIsSubmitting(true);
      const isLate = !assignment.no_deadline && assignment.deadline ? new Date(assignment.deadline).getTime() < Date.now() : false;

      // ── TỰ ĐỘNG CHẤM ĐIỂM TRẮC NGHIỆM CHUẨN AZOTA NẾU BÀI TẬP CÓ CÂU HỎI ──
      let autoScore = 0;
      let part1Correct = 0;
      let part2Correct = 0;
      let part3Correct = 0;

      if (assignment.parsed_questions && assignment.parsed_questions.length > 0) {
        assignment.parsed_questions.forEach(q => {
          const qNum = Number(q.number);
          // Phần 1: Trắc nghiệm khách quan A, B, C, D
          if (q.part === 1 || q.type === 'multiple_choice') {
            const studentAns = onlinePart1[qNum];
            let correctLetter = q.correctAnswer;
            if (!correctLetter && q.options) {
              const corrOpt = q.options.find(o => o.isCorrect);
              if (corrOpt) correctLetter = corrOpt.letter;
            }
            if (studentAns && correctLetter && studentAns.toUpperCase() === correctLetter.toUpperCase()) {
              autoScore += 0.25;
              part1Correct += 1;
            }
          }

          // Phần 2: Đúng / Sai a, b, c, d (Chuẩn Bộ GD&ĐT 2025: 1 ý=0.1đ, 2 ý=0.25đ, 3 ý=0.5đ, 4 ý=1.0đ)
          if (q.part === 2 || q.type === 'true_false') {
            const studentChoices = onlinePart2[qNum] || {};
            let matchCount = 0;
            if (q.options) {
              q.options.forEach(opt => {
                const ans = studentChoices[opt.letter];
                const expected = opt.isCorrect ? 'T' : 'F';
                if (ans && ans.toUpperCase() === expected) {
                  matchCount++;
                }
              });
            }
            if (matchCount === 1) autoScore += 0.1;
            else if (matchCount === 2) autoScore += 0.25;
            else if (matchCount === 3) autoScore += 0.5;
            else if (matchCount === 4) autoScore += 1.0;
            part2Correct += matchCount;
          }

          // Phần 3: Trả lời ngắn
          if (q.part === 3 || q.type === 'short_answer') {
            const studentAns = (onlinePart3[qNum] || '').trim().replace(/,/g, '.');
            const expected = (q.correctAnswer || '').trim().replace(/,/g, '.');
            if (studentAns && expected && studentAns.toLowerCase() === expected.toLowerCase()) {
              autoScore += 0.25;
              part3Correct += 1;
            }
          }
        });
      }

      autoScore = Math.round(autoScore * 100) / 100;
      const hasWriting = assignment.parsed_questions?.some(q => q.part === 4 || q.type === 'writing');

      const submission: HomeworkSubmission = {
        id: previousSubmission?.id || 'sub_' + Date.now(),
        assignment_id: assignment.id,
        student_id: currentStudent.id,
        student_name: currentStudent.full_name,
        student_code: currentStudent.student_code,
        class_id: currentStudent.class_id || selectedClassId || 'default',
        parent_phone: currentStudent.parent_phone,
        zalo: currentStudent.zalo,
        submitted_at: new Date().toISOString(),
        is_late: isLate,
        status: hasWriting || images.length > 0 ? 'submitted' : 'graded',
        score: hasWriting ? null : autoScore,
        score_breakdown: {
          trac_nghiem: autoScore,
        },
        submission_mode: images.length > 0 ? (assignment.parsed_questions?.length ? 'hybrid' : 'photos_only') : 'online_form',
        images: images.map(img => ({
          id: img.id,
          url: img.url,
        })),
        online_answers: {
          part1: Object.keys(onlinePart1).length > 0 ? onlinePart1 : undefined,
          part2: Object.keys(onlinePart2).length > 0 ? onlinePart2 : undefined,
          part3: Object.keys(onlinePart3).length > 0 ? onlinePart3 : undefined,
          score_details: {
            auto_score: autoScore,
            part1_correct: part1Correct,
            part2_correct: part2Correct,
            part3_correct: part3Correct,
          },
        },
        student_note: studentNote.trim() || undefined,
      };

      await saveSubmission(submission);
      setPreviousSubmission(submission);
      setSubmitSuccess(true);
      setIsResubmitting(false);
      await loadSubmissions();
      toast.success('🎉 Nộp bài thành công! Thầy Thọ sẽ sớm chấm bài cho em.');
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi nộp bài: ' + (err.message || 'Thử lại sau'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-600">Đang tải bài tập về nhà...</p>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-800">Không tìm thấy bài tập</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Đường dẫn bài tập không tồn tại hoặc đã bị xóa. Vui lòng kiểm tra lại link từ Thầy Thọ nhé!
        </p>
      </div>
    );
  }

  const isExpired = !assignment.no_deadline && assignment.deadline ? new Date(assignment.deadline).getTime() < Date.now() : false;

  return (
    <div className="min-h-screen bg-slate-100/70 pb-16">
      {/* ══════════════════════════════════════════════════════════════════
          TOP HEADER THANH ĐIỀU HƯỚNG AZOTA
         ══════════════════════════════════════════════════════════════════ */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 font-black text-sm">
              T
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-black text-slate-800 line-clamp-1">
                LỚP HỌC THẦY THỌ
              </h1>
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                Cổng Nộp Bài Tập (Azota)
              </p>
            </div>
          </div>

          {currentStudent && (
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <span className="text-xs font-black text-slate-800 block">{currentStudent.full_name}</span>
                <span className="text-[10px] text-slate-400 font-medium">Mã: {currentStudent.student_code || 'HS'}</span>
              </div>
              <button
                onClick={handleLogoutStudent}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold flex items-center gap-1 transition"
                title="Đổi học sinh khác"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Đổi bạn khác</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* THÔNG TIN BÀI TẬP */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-3 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-blue-50 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-black tracking-wider uppercase border border-blue-100">
              {assignment.code}
            </span>

            <div className="flex items-center gap-1.5 text-xs font-bold">
              {assignment.no_deadline ? (
                <span className="text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                  Không giới hạn thời gian nộp
                </span>
              ) : isExpired ? (
                <span className="text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-100 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Đã quá hạn: {formatDateTimeVN(assignment.deadline)}
                </span>
              ) : (
                <span className="text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Hạn nộp: {formatDateTimeVN(assignment.deadline)}
                </span>
              )}
            </div>
          </div>

          <h2 className="text-lg sm:text-xl font-black text-slate-800 leading-snug">
            {assignment.title}
          </h2>

          {assignment.description && (
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              {assignment.description}
            </p>
          )}

          {/* ĐÍNH KÈM ĐỀ BÀI (XEM FILE PDF HOẶC ẢNH) */}
          {assignment.attachments && assignment.attachments.length > 0 && (
            <div className="pt-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-2 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                Tài liệu & Đề bài đính kèm ({assignment.attachments.length} tệp):
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {assignment.attachments.map(att => (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 transition flex items-center justify-between group shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white flex-shrink-0 ${
                        att.type === 'pdf' ? 'bg-rose-500' :
                        att.type === 'docx' ? 'bg-blue-600' : 'bg-purple-600'
                      }`}>
                        {att.type === 'pdf' && <FileText className="w-4 h-4" />}
                        {att.type === 'docx' && <FileText className="w-4 h-4" />}
                        {att.type === 'image' && <ImageIcon className="w-4 h-4" />}
                      </div>
                      <span className="text-xs font-bold text-slate-700 truncate group-hover:text-blue-700">
                        {att.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-blue-600 flex-shrink-0 ml-2 group-hover:underline">
                      Mở xem đề
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            BƯỚC 1: HỌC SINH CHƯA CHỌN TÊN -> DANH SÁCH HỌC SINH TRONG LỚP (AZOTA)
           ══════════════════════════════════════════════════════════════════ */}
        {!currentStudent ? (
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  BƯỚC 1: CHỌN TÊN CỦA EM ĐỂ NỘP BÀI
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bấm vào họ tên của em trong danh sách bên dưới để bắt đầu nộp bài nhé!
                </p>
              </div>

              {/* Nếu có nhiều lớp: Tabs chọn lớp */}
              {assignment.class_ids && assignment.class_ids.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {assignment.class_ids.map(cid => (
                    <button
                      key={cid}
                      onClick={() => setSelectedClassId(cid)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        selectedClassId === cid
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Lớp {cid}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Ô tìm kiếm tên nhanh */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                placeholder="🔍 Nhập họ và tên của em để tìm nhanh..."
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-semibold text-slate-800 placeholder:text-slate-400 bg-slate-50/50"
              />
              {studentSearch && (
                <button
                  onClick={() => setStudentSearch('')}
                  className="absolute right-3.5 top-3.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Danh sách học sinh dạng Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[500px] overflow-y-auto pr-1">
              {loadingStudents ? (
                <div className="col-span-full py-8 text-center text-xs text-slate-400">
                  Đang tải danh sách học sinh...
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="col-span-full py-8 text-center space-y-2">
                  <p className="text-xs text-slate-500">Không tìm thấy học sinh nào phù hợp với từ khóa.</p>
                  <button
                    onClick={() => setCustomNameModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition"
                  >
                    + Em là học sinh mới (Tự nhập tên)
                  </button>
                </div>
              ) : (
                filteredStudents.map(st => {
                  const sub = submissionByStudentId.get(st.id);
                  const isSubmitted = !!sub;

                  return (
                    <div
                      key={st.id}
                      onClick={() => handleSelectStudent(st)}
                      className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-2.5 ${
                        isSubmitted
                          ? 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50'
                          : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${
                          isSubmitted ? 'bg-emerald-600 text-white' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {st.full_name ? st.full_name.charAt(st.full_name.lastIndexOf(' ') + 1 || 0).toUpperCase() : 'H'}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-black text-slate-800 truncate">{st.full_name}</p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {st.student_code ? `Mã: ${st.student_code}` : 'Học sinh'}
                          </p>
                        </div>
                      </div>

                      {isSubmitted ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-0.5">
                          <Check className="w-3 h-3 stroke-[3]" /> Đã nộp
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-blue-600 flex-shrink-0">
                          Chọn ➔
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Nút thêm học sinh nếu chưa có tên */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Chưa thấy tên em trong danh sách lớp?</span>
              <button
                onClick={() => setCustomNameModalOpen(true)}
                className="font-bold text-blue-600 hover:underline"
              >
                + Tự nhập họ tên của em
              </button>
            </div>
          </div>
        ) : submitSuccess && !isResubmitting ? (
          /* ══════════════════════════════════════════════════════════════════
              BƯỚC 3: MÀN HÌNH ĐÃ NỘP BÀI THÀNH CÔNG / XEM ĐIỂM ĐÃ CHẤM
             ══════════════════════════════════════════════════════════════════ */
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-6 text-center">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-800">
                CHÚC MỪNG EM ĐÃ NỘP BÀI THÀNH CÔNG! 🎉
              </h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                Học sinh: <strong className="text-slate-800">{currentStudent.full_name}</strong> • 
                Nộp lúc: <span className="text-blue-600 font-bold">{formatDateTimeVN(previousSubmission?.submitted_at)}</span>
              </p>
            </div>

            {/* NẾU THẦY THỌ ĐÃ CHẤM BÀI -> HIỂN THỊ ĐIỂM VÀ LỜI PHÊ */}
            {previousSubmission?.status === 'graded' && (
              <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50/70 border border-amber-200 space-y-4 max-w-lg mx-auto shadow-sm">
                <div className="flex items-center justify-center gap-2 text-amber-800 font-black text-sm uppercase">
                  <Award className="w-5 h-5 text-amber-600" /> KẾT QUẢ CHẤM BÀI TỪ THẦY THỌ
                </div>

                <div className="w-24 h-24 rounded-full bg-white shadow-lg border-4 border-amber-400 flex flex-col items-center justify-center mx-auto">
                  <span className="text-3xl font-black text-amber-600 leading-none">
                    {previousSubmission.score !== null ? previousSubmission.score : '—'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 mt-0.5">/ 10.0</span>
                </div>

                {previousSubmission.teacher_comment && (
                  <div className="p-3.5 rounded-2xl bg-white/80 border border-amber-200/60 text-xs text-slate-700 leading-relaxed text-left">
                    <strong className="text-amber-900 block mb-1 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-600" /> Lời phê của Thầy Thọ:
                    </strong>
                    {previousSubmission.teacher_comment}
                  </div>
                )}
              </div>
            )}

            {/* CÁC TRANG ẢNH ĐÃ NỘP */}
            {previousSubmission?.images && previousSubmission.images.length > 0 && (
              <div className="space-y-3 text-left">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                  Bài làm em đã gửi ({previousSubmission.images.length} trang):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {previousSubmission.images.map((img, i) => (
                    <div
                      key={img.id}
                      onClick={() => setPreviewImage(img.annotated_url || img.url)}
                      className="relative rounded-2xl border border-slate-200 overflow-hidden group cursor-pointer aspect-[3/4] bg-slate-100 shadow-xs"
                    >
                      <img
                        src={img.annotated_url || img.url}
                        alt={`Trang ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-bold">
                        Trang {i + 1}
                      </div>
                      {img.annotated_url && (
                        <div className="absolute bottom-2 left-2 right-2 px-2 py-1 rounded-md bg-emerald-600 text-white text-[10px] font-bold text-center">
                          ✓ Đã có bút tích chấm
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nút nộp lại hoặc đổi học sinh */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={() => {
                  setIsResubmitting(true);
                  setImages([]);
                }}
                className="px-6 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Nộp lại bài khác
              </button>

              <button
                onClick={handleLogoutStudent}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition"
              >
                Hoàn tất & Thoát
              </button>
            </div>
          </div>
        ) : (
          /* ══════════════════════════════════════════════════════════════════
              BƯỚC 2: MÀN HÌNH CHỤP ẢNH VỞ & NỘP BÀI (CHUẨN AZOTA)
             ══════════════════════════════════════════════════════════════════ */
          <div className="space-y-4">
            {/* Thanh hiển thị tên học sinh đang làm bài */}
            <div className="bg-blue-50/80 border border-blue-200/80 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-sm">
                  {currentStudent.full_name ? currentStudent.full_name.charAt(currentStudent.full_name.lastIndexOf(' ') + 1 || 0).toUpperCase() : 'H'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-900">Em đang nộp bài với tên:</span>
                    <span className="text-xs text-blue-600 font-mono">({currentStudent.student_code || 'HS'})</span>
                  </div>
                  <h3 className="text-base font-black text-slate-900">{currentStudent.full_name}</h3>
                </div>
              </div>

              <button
                onClick={handleLogoutStudent}
                className="px-3 py-1.5 rounded-xl border border-blue-200 bg-white hover:bg-blue-50 text-blue-700 text-xs font-bold transition"
              >
                Đổi bạn khác
              </button>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                NẾU BÀI TẬP CÓ CÂU HỎI TRẮC NGHIỆM ĐƯỢC BÓC TÁCH TỪ FILE (AZOTA ONLINE TEST)
               ══════════════════════════════════════════════════════════════════ */}
            {assignment.parsed_questions && assignment.parsed_questions.length > 0 && (
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-blue-200 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-blue-600" />
                      LÀM BÀI TRỰC TUYẾN ({assignment.parsed_questions.length} CÂU HỎI CHUẨN AZOTA)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Em bấm chọn đáp án đúng bên dưới. Hệ thống sẽ tự động chấm điểm ngay khi nộp bài!
                    </p>
                  </div>

                  {/* Thanh tiến độ số câu đã làm */}
                  <div className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-100 text-xs font-bold text-blue-800 flex items-center gap-2 flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    Đã làm: {Object.keys(onlinePart1).length + Object.keys(onlinePart2).length + Object.keys(onlinePart3).length} / {assignment.parsed_questions.length} câu
                  </div>
                </div>

                {/* BẢNG QUESTION PALETTE: DÃY NÚT NHẢY NHANH CÂU HỎI NHƯ AZOTA */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Bảng câu hỏi (Bấm số câu để nhảy nhanh):
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {assignment.parsed_questions.map((q, idx) => {
                      const qNum = Number(q.number || idx + 1);
                      const isAnswered = q.part === 1 ? !!onlinePart1[qNum] : q.part === 2 ? !!onlinePart2[qNum] : !!onlinePart3[qNum];
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const el = document.getElementById(`azota_q_${qNum}`);
                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}
                          className={`w-8 h-8 rounded-xl text-xs font-black transition flex items-center justify-center ${
                            isAnswered
                              ? 'bg-blue-600 text-white shadow-sm shadow-blue-300'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {qNum}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* DANH SÁCH CHI TIẾT CÁC CÂU HỎI */}
                <div className="space-y-5 pt-2">
                  {assignment.parsed_questions.map((q, idx) => {
                    const qNum = Number(q.number || idx + 1);

                    return (
                      <div
                        key={idx}
                        id={`azota_q_${qNum}`}
                        className="p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-white hover:border-blue-300 transition space-y-3.5 shadow-xs"
                      >
                        {/* Header câu hỏi */}
                        <div className="flex items-center justify-between">
                          <span className="px-3 py-1 rounded-xl bg-blue-50 text-blue-800 text-xs font-black border border-blue-100">
                            Câu {qNum} {q.part === 1 ? '(Trắc nghiệm)' : q.part === 2 ? '(Đúng / Sai)' : q.part === 3 ? '(Trả lời ngắn)' : '(Tự luận)'}
                          </span>
                        </div>

                        {/* Đề bài câu hỏi */}
                        <div
                          className="text-xs sm:text-sm text-slate-800 leading-relaxed font-serif"
                          dangerouslySetInnerHTML={{ __html: q.text }}
                        />

                        {/* PHẦN 1: 4 NÚT CHỌN A, B, C, D */}
                        {(q.part === 1 || q.type === 'multiple_choice') && q.options && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {q.options.map((opt, oIdx) => {
                              const isSelected = onlinePart1[qNum] === opt.letter;
                              return (
                                <button
                                  key={oIdx}
                                  type="button"
                                  onClick={() => setOnlinePart1(prev => ({ ...prev, [qNum]: opt.letter }))}
                                  className={`p-3 rounded-xl border text-left text-xs font-medium flex items-center gap-3 transition cursor-pointer ${
                                    isSelected
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                                      : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-blue-50/50 hover:border-blue-200'
                                  }`}
                                >
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs flex-shrink-0 ${
                                    isSelected ? 'bg-white text-blue-700' : 'bg-white border border-slate-300 text-slate-700'
                                  }`}>
                                    {opt.letter}
                                  </div>
                                  <span className="leading-snug" dangerouslySetInnerHTML={{ __html: opt.text }} />
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* PHẦN 2: CHỌN ĐÚNG / SAI TỪNG Ý a, b, c, d */}
                        {(q.part === 2 || q.type === 'true_false') && q.options && (
                          <div className="space-y-2 pt-1">
                            {q.options.map((opt, oIdx) => {
                              const currentVal = onlinePart2[qNum]?.[opt.letter];
                              return (
                                <div
                                  key={oIdx}
                                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                                >
                                  <div className="flex items-start gap-2">
                                    <span className="font-black text-blue-700 uppercase">{opt.letter + ')'}</span>
                                    <span className="text-slate-700 leading-snug" dangerouslySetInnerHTML={{ __html: opt.text }} />
                                  </div>

                                  <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                                    <button
                                      type="button"
                                      onClick={() => setOnlinePart2(prev => ({
                                        ...prev,
                                        [qNum]: { ...(prev[qNum] || {}), [opt.letter]: 'T' }
                                      }))}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                                        currentVal === 'T'
                                          ? 'bg-emerald-600 text-white shadow-sm'
                                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50'
                                      }`}
                                    >
                                      ✓ Đúng
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setOnlinePart2(prev => ({
                                        ...prev,
                                        [qNum]: { ...(prev[qNum] || {}), [opt.letter]: 'F' }
                                      }))}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                                        currentVal === 'F'
                                          ? 'bg-rose-600 text-white shadow-sm'
                                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-rose-50'
                                      }`}
                                    >
                                      ✗ Sai
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* PHẦN 3: TRẢ LỜI NGẮN */}
                        {(q.part === 3 || q.type === 'short_answer') && (
                          <div className="pt-1">
                            <span className="text-[11px] font-bold text-slate-500 block mb-1">Nhập kết quả:</span>
                            <input
                              type="text"
                              value={onlinePart3[qNum] || ''}
                              onChange={e => setOnlinePart3(prev => ({ ...prev, [qNum]: e.target.value }))}
                              placeholder="Ví dụ: 12.5 hoặc Fe2O3..."
                              className="w-full max-w-xs px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
                            />
                          </div>
                        )}

                        {/* PHẦN 4: TỰ LUẬN */}
                        {(q.part === 4 || q.type === 'writing') && (
                          <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 text-xs text-purple-900 flex items-center gap-2">
                            <Camera className="w-4 h-4 text-purple-600 flex-shrink-0" />
                            <span>Câu này là tự luận. Em hãy làm ra vở ghi rồi chụp ảnh trang vở ở mục bên dưới để nộp nhé!</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* KHU VỰC CHỤP ẢNH VỞ NỘP BÀI */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-5">
              <div>
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-blue-600" />
                  BƯỚC 2: CHỤP ẢNH VỞ BÀI LÀM CỦA EM
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Em hãy chụp từng trang vở bài làm rõ nét, đủ sáng, ngay ngắn để Thầy Thọ dễ chấm nhé!
                </p>
              </div>

              {/* 2 Nút chụp ảnh: Camera & Thư viện */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Input chụp thẳng camera điện thoại */}
                <input
                  type="file"
                  ref={cameraInputRef}
                  onChange={e => handleProcessImages(e.target.files)}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-left transition flex items-center gap-3.5 shadow-md shadow-blue-500/20 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-black block">CHỤP ẢNH TỪ CAMERA</span>
                    <span className="text-[11px] text-blue-100 font-medium">
                      Mở máy ảnh điện thoại chụp ngay
                    </span>
                  </div>
                </button>

                {/* Input chọn ảnh từ máy / thư viện */}
                <input
                  type="file"
                  ref={galleryInputRef}
                  onChange={e => handleProcessImages(e.target.files)}
                  accept="image/*"
                  multiple
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="p-4 sm:p-5 rounded-2xl border-2 border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/50 text-left transition flex items-center gap-3.5 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 text-blue-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition shadow-xs">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-black text-slate-800 block">CHỌN ẢNH TỪ MÁY</span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      Tải nhiều ảnh từ thư viện thiết bị
                    </span>
                  </div>
                </button>
              </div>

              {/* LƯỚI DANH SÁCH ẢNH ĐÃ CHỤP */}
              {images.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Các trang bài làm đã chụp ({images.length} trang):
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Bấm vào nút xoay 🔄 nếu ảnh bị nghiêng
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {images.map((img, index) => (
                      <div
                        key={img.id}
                        className="relative rounded-2xl border border-slate-200 overflow-hidden group aspect-[3/4] bg-slate-100 shadow-xs"
                      >
                        <img
                          src={img.url}
                          alt={`Trang ${index + 1}`}
                          style={{ transform: `rotate(${img.rotation}deg)` }}
                          className="w-full h-full object-cover transition-transform duration-200"
                        />

                        {/* Badge số trang */}
                        <div className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-xs text-white text-[11px] font-black">
                          Trang {index + 1}
                        </div>

                        {/* Các nút thao tác nhanh: Xoay, Phóng to, Xóa */}
                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-center gap-1.5 bg-black/60 backdrop-blur-xs p-1.5 rounded-xl">
                          <button
                            type="button"
                            onClick={e => handleRotateImage(img.id, e)}
                            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 text-white transition"
                            title="Xoay ảnh 90 độ"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewImage(img.url)}
                            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 text-white transition"
                            title="Xem phóng to"
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={e => handleRemoveImage(img.id, e)}
                            className="p-1.5 rounded-lg bg-rose-500/80 hover:bg-rose-600 text-white transition"
                            title="Xóa trang này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 text-center space-y-2 bg-slate-50/50">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                    <Camera className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">Chưa có trang bài làm nào được chụp</p>
                  <p className="text-[11px] text-slate-400">
                    Bấm nút "CHỤP ẢNH TỪ CAMERA" phía trên để chụp vở nộp cho Thầy Thọ nhé!
                  </p>
                </div>
              )}

              {/* Lời nhắn gửi Thầy Thọ */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  💬 Lời nhắn gửi Thầy Thọ (nếu có):
                </label>
                <textarea
                  rows={2}
                  value={studentNote}
                  onChange={e => setStudentNote(e.target.value)}
                  placeholder="Ví dụ: Em gửi bài ạ, câu 3 em còn phân vân kết quả..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
                />
              </div>

              {/* NÚT NỘP BÀI TO RỰC RỠ */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSubmitHomework}
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-sm tracking-wide shadow-xl shadow-blue-500/30 transition flex items-center justify-center gap-2.5 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Đang nộp bài lên hệ thống...</span>
                  ) : (
                    <>
                      <Send className="w-5 h-5" /> NỘP BÀI TẬP VỀ NHÀ (AZOTA)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════════════════
          POPUP NHẬP MẬT KHẨU (NẾU BÀI TẬP YÊU CẦU BẢO MẬT)
         ══════════════════════════════════════════════════════════════════ */}
      {passwordModalOpen && pendingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 space-y-4">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-800">XÁC THỰC MẬT KHẨU</h3>
              <p className="text-xs text-slate-500">
                Bài tập yêu cầu mật khẩu để vào làm bài với tên: <strong className="text-slate-700">{pendingStudent.full_name}</strong>
              </p>
            </div>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={enteredPassword}
                onChange={e => setEnteredPassword(e.target.value)}
                placeholder="Nhập mật khẩu của em..."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPasswordModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmPassword}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition shadow-md shadow-blue-200"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          POPUP TỰ NHẬP HỌ TÊN HỌC SINH MỚI
         ══════════════════════════════════════════════════════════════════ */}
      {customNameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 space-y-4">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
                <User className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-800">NHẬP THÔNG TIN CỦA EM</h3>
              <p className="text-xs text-slate-500">
                Dành cho học sinh mới chưa có tên trong danh sách lớp
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Họ và tên của em <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={customFullName}
                  onChange={e => setCustomFullName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Số điện thoại phụ huynh (hoặc Zalo)
                </label>
                <input
                  type="tel"
                  value={customPhone}
                  onChange={e => setCustomPhone(e.target.value)}
                  placeholder="09xx..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCustomNameModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCreateCustomStudent}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition shadow-md shadow-blue-200"
              >
                Vào làm bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM PHÓNG TO ẢNH */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
