// src/homework/StudentSubmitHomeworkPage.tsx
// Cổng Nộp Bài Học Sinh: Đăng nhập Mã HS + Mật khẩu -> Làm bài trực tuyến hoặc Chỉ chụp vở

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Camera, CheckCircle2, Clock, Calendar, FileText,
  RotateCw, Trash2, AlertCircle, Send, Sparkles, BookOpen,
  Eye, EyeOff, User, Lock, LogOut, Check, ArrowRight,
  HelpCircle, ChevronRight, Image as ImageIcon
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

  // Student auth state
  const [currentStudent, setCurrentStudent] = useState<any>(null);
  const [studentCodeInput, setStudentCodeInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Work Mode State: 'photos_only' (Chỉ chụp vở) | 'online_form' (Làm bài trực tuyến)
  const [workMode, setWorkMode] = useState<'photos_only' | 'online_form'>('photos_only');

  // Mode 1: Photos of notebook
  const [images, setImages] = useState<Array<{ id: string; url: string; rotation: number }>>([]);
  const [studentNote, setStudentNote] = useState('');

  // Mode 2: Online Answers
  const [part1Answers, setPart1Answers] = useState<Record<number, string>>({});
  const [part2Answers, setPart2Answers] = useState<Record<number, Record<string, string>>>({});
  const [part3Answers, setPart3Answers] = useState<Record<number, string>>({});

  // Submission Status
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [previousSubmission, setPreviousSubmission] = useState<HomeworkSubmission | null>(null);

  // Load Assignment và Session học sinh
  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        // Kiểm tra xem học sinh đã đăng nhập trước đó chưa
        const savedStudent = localStorage.getItem('current_student');
        if (savedStudent) {
          try {
            setCurrentStudent(JSON.parse(savedStudent));
          } catch {}
        }

        // Tải thông tin bài tập
        if (assignmentId) {
          const hw = await getAssignmentById(assignmentId);
          setAssignment(hw);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [assignmentId]);

  // Kiểm tra bài nộp trước đó của học sinh
  useEffect(() => {
    if (assignmentId && currentStudent?.id) {
      getSubmissions(assignmentId).then(subs => {
        const found = subs.find(s => s.student_id === currentStudent.id);
        if (found) {
          setPreviousSubmission(found);
          if (found.images && found.images.length > 0) {
            setImages(found.images.map(img => ({ id: img.id, url: img.url, rotation: 0 })));
          }
          if (found.online_answers) {
            if (found.online_answers.part1) setPart1Answers(found.online_answers.part1);
            if (found.online_answers.part2) setPart2Answers(found.online_answers.part2);
            if (found.online_answers.part3) setPart3Answers(found.online_answers.part3);
          }
          if (found.submission_mode === 'online_form') {
            setWorkMode('online_form');
          }
        }
      });
    }
  }, [assignmentId, currentStudent]);

  // Xử lý Đăng nhập Học sinh (Mã HS + Mật khẩu)
  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = studentCodeInput.trim();
    const pass = passwordInput.trim();

    if (!code) {
      toast.error('Vui lòng nhập Mã học sinh hoặc Số điện thoại!');
      return;
    }
    if (!pass) {
      toast.error('Vui lòng nhập Mật khẩu!');
      return;
    }

    try {
      setIsLoggingIn(true);
      // Tra cứu học sinh theo student_code hoặc phone
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .or(`student_code.ilike.${code},parent_phone.eq.${code},phone.eq.${code}`)
        .maybeSingle();

      if (error || !data) {
        toast.error('Không tìm thấy Mã học sinh này! Thầy Thọ vui lòng kiểm tra lại mã.');
        return;
      }

      if (data.status === 'inactive') {
        toast.error('Tài khoản học sinh này hiện đang tạm dừng!');
        return;
      }

      // Kiểm tra mật khẩu (nếu trong DB có mật khẩu thì so khớp, nếu chưa có thì chấp nhận pass hoặc 123456)
      if (data.password && data.password.trim() !== pass) {
        toast.error('Sai mật khẩu! Vui lòng thử lại.');
        return;
      }

      // Đăng nhập thành công
      setCurrentStudent(data);
      localStorage.setItem('current_student', JSON.stringify(data));
      localStorage.setItem('studentName', data.full_name);
      toast.success(`Xin chào em ${data.full_name}! 👋`);
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi kết nối máy chủ!');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Đăng xuất đổi tài khoản
  const handleLogout = () => {
    localStorage.removeItem('current_student');
    setCurrentStudent(null);
    setStudentCodeInput('');
    setPasswordInput('');
    setPreviousSubmission(null);
    setImages([]);
    setPart1Answers({});
    setPart2Answers({});
    setPart3Answers({});
  };

  // Chụp / Tải ảnh vở
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

  // Trả lời Phần 1 (Trắc nghiệm)
  const setPart1Choice = (qNum: number, choice: string) => {
    setPart1Answers(prev => ({ ...prev, [qNum]: choice }));
  };

  // Trả lời Phần 2 (Đúng / Sai)
  const setPart2Choice = (qNum: number, letter: string, val: string) => {
    setPart2Answers(prev => ({
      ...prev,
      [qNum]: {
        ...(prev[qNum] || {}),
        [letter]: val,
      },
    }));
  };

  // Trả lời Phần 3 (Trả lời ngắn)
  const setPart3Text = (qNum: number, val: string) => {
    setPart3Answers(prev => ({ ...prev, [qNum]: val }));
  };

  // Hạn nộp
  const isLate = assignment?.deadline ? new Date(assignment.deadline).getTime() < Date.now() : false;

  // NỘP BÀI
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignment || !currentStudent) return;

    // Kiểm tra tính hợp lệ
    if (workMode === 'photos_only' && images.length === 0) {
      toast.error('Em hãy chụp ít nhất 1 ảnh vở bài làm để nộp nhé!');
      return;
    }

    try {
      setSubmitting(true);
      const submission: HomeworkSubmission = {
        id: previousSubmission?.id || 'sub_' + Date.now(),
        assignment_id: assignment.id,
        student_id: currentStudent.id,
        student_name: currentStudent.full_name,
        student_code: currentStudent.student_code,
        class_id: currentStudent.class_id || (assignment.class_ids?.[0] || ''),
        class_name: currentStudent.class_name,
        parent_phone: currentStudent.parent_phone,
        zalo: currentStudent.zalo,
        submitted_at: new Date().toISOString(),
        is_late: isLate,
        status: 'submitted',
        submission_mode: workMode,
        images: images.map(img => ({
          id: img.id,
          url: img.url,
        })),
        online_answers: workMode === 'online_form' ? {
          part1: part1Answers,
          part2: part2Answers,
          part3: part3Answers,
        } : undefined,
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
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-sm space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-black text-slate-800">Không tìm thấy bài tập</h2>
          <p className="text-xs text-slate-500">
            Đường link bài tập không đúng hoặc đã bị đóng. Em vui lòng kiểm tra lại link Thầy Thọ gửi nhé!
          </p>
        </div>
      </div>
    );
  }

  // MÀN HÌNH BÁO THÀNH CÔNG
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
              Bài làm của em <span className="font-bold text-teal-800">{currentStudent?.full_name}</span> đã được chuyển đến máy Thầy Thọ.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Hình thức nộp:</span>
              <span className="font-bold text-slate-700">
                {workMode === 'photos_only' ? '📷 Chụp vở bài làm' : '📝 Làm bài trực tuyến'}
              </span>
            </div>
            {workMode === 'photos_only' && (
              <div className="flex justify-between">
                <span className="text-slate-400">Số trang ảnh nộp:</span>
                <span className="font-bold text-teal-700">{images.length} trang</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">Thời gian nộp:</span>
              <span className="font-semibold text-slate-700">{formatDateTimeVN(new Date().toISOString())}</span>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Thầy Thọ sẽ chấm bài trực tiếp trên máy và thông báo điểm kèm nhận xét chi tiết nhé!
          </p>

          <button
            onClick={() => setSubmitSuccess(false)}
            className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
          >
            Chỉnh sửa bài nộp / Nộp lại
          </button>
        </div>
      </div>
    );
  }

  // 1. NẾU CHƯA ĐĂNG NHẬP -> HIỂN THỊ FORM ĐĂNG NHẬP MÃ HỌC SINH & MẬT KHẨU
  if (!currentStudent) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-teal-50 via-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-teal-600/30">
              <BookOpen className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-black text-slate-800">LỚP HỌC THẦY THỌ</h1>
            <p className="text-xs text-slate-500">
              Nhập <span className="font-bold text-teal-800">Mã học sinh</span> và <span className="font-bold text-teal-800">Mật khẩu</span> để vào làm bài
            </p>
          </div>

          {/* Thông tin bài tập đang nộp */}
          <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-100 text-xs space-y-1">
            <div className="text-slate-500">Bài tập đang mở:</div>
            <div className="font-black text-teal-900 text-sm">{assignment.title}</div>
            <div className="text-[11px] text-teal-700 flex items-center gap-1 font-semibold">
              <Clock className="w-3.5 h-3.5" /> Hạn nộp: {formatDateTimeVN(assignment.deadline)}
            </div>
          </div>

          {/* Form Login */}
          <form onSubmit={handleStudentLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Mã học sinh hoặc Số điện thoại <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={studentCodeInput}
                  onChange={e => setStudentCodeInput(e.target.value)}
                  placeholder="VD: HS01, 2401, hoặc số điện thoại..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-semibold text-slate-800"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Mật khẩu <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder="Nhập mật khẩu của em..."
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-semibold text-slate-800"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                * Mật khẩu do Thầy Thọ cấp (hoặc mặc định là mã HS / số điện thoại).
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-xs font-black shadow-lg shadow-teal-600/30 transition flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>Đang kiểm tra thông tin...</>
              ) : (
                <>
                  ĐĂNG NHẬP VÀO LÀM BÀI <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. KHI ĐÃ ĐĂNG NHẬP -> GIAO DIỆN LÀM BÀI VÀ NỘP BÀI (CHỈ CHỤP VỞ HOẶC LÀM TRỰC TUYẾN)
  return (
    <div className="min-h-screen bg-slate-100/90 py-6 px-3 sm:px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Thanh Học Sinh Đang Đăng Nhập */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-black text-sm">
              {currentStudent.full_name?.charAt(0) || 'H'}
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Học sinh đang làm bài:</div>
              <div className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                {currentStudent.full_name}
                {currentStudent.student_code && (
                  <span className="text-[11px] font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                    {currentStudent.student_code}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-rose-600 font-bold flex items-center gap-1 p-2 rounded-xl hover:bg-slate-50 transition"
            title="Đổi tài khoản khác"
          >
            <LogOut className="w-3.5 h-3.5" /> Đổi tài khoản
          </button>
        </div>

        {/* Thông Tin Bài Tập */}
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

          <h1 className="text-lg sm:text-xl font-black text-slate-800">{assignment.title}</h1>

          {assignment.description && (
            <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-100 text-xs text-teal-900 leading-relaxed">
              <span className="font-bold text-teal-800">💡 Lời dặn dò của Thầy: </span>
              {assignment.description}
            </div>
          )}

          {/* Đề bài đính kèm */}
          {assignment.attachments && assignment.attachments.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-teal-600" />
                Đề bài & Tài liệu kèm theo ({assignment.attachments.length}):
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
                      <Eye className="w-3.5 h-3.5" /> Xem đề bài
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CHỌN HÌNH THỨC NỘP BÀI: CHỈ CHỤP VỞ HOẶC LÀM TRỰC TUYẾN */}
        <div className="grid grid-cols-2 gap-2 bg-slate-200/80 p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => setWorkMode('photos_only')}
            className={`py-3 px-4 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${
              workMode === 'photos_only'
                ? 'bg-white text-teal-800 shadow-md shadow-slate-300'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-4 h-4 text-teal-600" />
            <span>1. CHỈ CHỤP VỞ (Tự luận)</span>
          </button>
          <button
            type="button"
            onClick={() => setWorkMode('online_form')}
            className={`py-3 px-4 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${
              workMode === 'online_form'
                ? 'bg-white text-teal-800 shadow-md shadow-slate-300'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 text-blue-600" />
            <span>2. LÀM BÀI TRỰC TUYẾN</span>
          </button>
        </div>

        {/* FORM THỰC HIỆN NỘP BÀI */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ============================================================== */}
          {/* LỰA CHỌN 1: CHỈ CHỤP VỞ (TỰ LUẬN)                            */}
          {/* ============================================================== */}
          {workMode === 'photos_only' && (
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-800 uppercase">
                    CHỤP CÁC TRANG VỞ BÀI LÀM CỦA EM
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Chụp thẳng góc, đủ ánh sáng, có thể chụp nhiều trang (Trang 1, Trang 2...)
                  </p>
                </div>
              </div>

              {/* Nút chụp camera / tải ảnh */}
              <div className="p-6 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/40 text-center space-y-3">
                <Camera className="w-12 h-12 mx-auto text-teal-600" />
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    Bấm để Chụp ảnh camera hoặc Chọn ảnh từ thư viện
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Hỗ trợ chụp nhiều trang vở liên tiếp
                  </p>
                </div>

                <label className="inline-flex px-5 py-3 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black cursor-pointer transition shadow-lg shadow-teal-600/30 items-center gap-2">
                  <Camera className="w-4 h-4" /> CHỤP ẢNH TRANG VỞ
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

              {/* Danh sách ảnh đã chụp */}
              {images.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Các trang vở đã chụp ({images.length} trang):</span>
                    <span className="text-[11px] text-slate-400">Bấm xoay nếu ảnh bị ngược</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((img, idx) => (
                      <div
                        key={img.id}
                        className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 aspect-[3/4] flex items-center justify-center"
                      >
                        <img
                          src={img.url}
                          alt={`Trang ${idx + 1}`}
                          style={{ transform: `rotate(${img.rotation}deg)` }}
                          className="max-h-full max-w-full object-contain"
                        />
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold">
                          Trang {idx + 1}
                        </span>
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRotateImage(img.id)}
                            className="w-7 h-7 rounded-full bg-white/90 hover:bg-white text-slate-800 flex items-center justify-center shadow transition"
                            title="Xoay 90 độ"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(img.id)}
                            className="w-7 h-7 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow transition"
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

              {/* Ghi chú */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lời nhắn gửi Thầy Thọ (tùy chọn):
                </label>
                <textarea
                  rows={2}
                  value={studentNote}
                  onChange={e => setStudentNote(e.target.value)}
                  placeholder="VD: Em gửi Thầy bài tập, Thầy xem giúp em câu 3 tự luận ạ..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Nút bấm Nộp Vở */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 hover:from-teal-700 hover:to-emerald-700 text-white text-sm font-black shadow-xl shadow-teal-600/30 transition flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>Đang nộp bài lên máy Thầy Thọ...</>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> BẤM NỘP VỞ BÀI LÀM CHO THẦY THỌ
                  </>
                )}
              </button>
            </div>
          )}

          {/* ============================================================== */}
          {/* LỰA CHỌN 2: LÀM BÀI TRỰC TUYẾN (TRẮC NGHIỆM + ĐÚNG/SAI + NGẮN)  */}
          {/* ============================================================== */}
          {workMode === 'online_form' && (
            <div className="space-y-4">
              {/* PHẦN 1: TRẮC NGHIỆM KHÁCH QUAN (CÂU 1 - 18) */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-black uppercase text-teal-800 tracking-wider">
                    PHẦN I: TRẮC NGHIỆM 4 ĐÁP ÁN (CÂU 1 - 18)
                  </h3>
                  <span className="text-[11px] text-slate-400">Chọn 1 đáp án A, B, C, D</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {Array.from({ length: 18 }, (_, i) => i + 1).map(qNum => {
                    const selected = part1Answers[qNum];
                    return (
                      <div key={qNum} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/70">
                        <span className="text-xs font-bold text-slate-700 w-16">Câu {qNum}:</span>
                        <div className="flex items-center gap-1">
                          {['A', 'B', 'C', 'D'].map(choice => (
                            <button
                              key={choice}
                              type="button"
                              onClick={() => setPart1Choice(qNum, choice)}
                              className={`w-7 h-7 rounded-lg text-xs font-black transition ${
                                selected === choice
                                  ? 'bg-teal-600 text-white shadow-sm'
                                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                              }`}
                            >
                              {choice}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PHẦN 2: ĐÚNG / SAI (CÂU 1 - 4, MỖI CÂU A, B, C, D) */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-black uppercase text-emerald-800 tracking-wider">
                    PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI (CÂU 1 - 4)
                  </h3>
                  <span className="text-[11px] text-slate-400">Chọn Đúng (Đ) hoặc Sai (S)</span>
                </div>

                <div className="space-y-3">
                  {[1, 2, 3, 4].map(qNum => (
                    <div key={qNum} className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2">
                      <div className="text-xs font-black text-slate-800">Câu {qNum}:</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {['a', 'b', 'c', 'd'].map(letter => {
                          const val = part2Answers[qNum]?.[letter];
                          return (
                            <div key={letter} className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-slate-200">
                              <span className="text-xs font-bold text-slate-700 uppercase">{letter + ')'}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setPart2Choice(qNum, letter, 'T')}
                                  className={`px-2 py-0.5 rounded text-[11px] font-black transition ${
                                    val === 'T'
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  Đ
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPart2Choice(qNum, letter, 'F')}
                                  className={`px-2 py-0.5 rounded text-[11px] font-black transition ${
                                    val === 'F'
                                      ? 'bg-rose-600 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  S
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* PHẦN 3: TRẢ LỜI NGẮN (CÂU 1 - 6) */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-black uppercase text-blue-800 tracking-wider">
                    PHẦN III: TRẢ LỜI NGẮN (CÂU 1 - 6)
                  </h3>
                  <span className="text-[11px] text-slate-400">Điền số thập phân hoặc từ</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[1, 2, 3, 4, 5, 6].map(qNum => (
                    <div key={qNum} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/70">
                      <span className="text-xs font-bold text-slate-700 w-16">Câu {qNum}:</span>
                      <input
                        type="text"
                        value={part3Answers[qNum] || ''}
                        onChange={e => setPart3Text(qNum, e.target.value)}
                        placeholder="Điền đáp số..."
                        className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold text-slate-800 bg-white"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* TÙY CHỌN ĐÍNH KÈM ẢNH BÀI LÀM TỰ LUẬN TRONG TRỰC TUYẾN */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-teal-600" />
                  Đính kèm ảnh bài giải chi tiết / nháp (nếu có):
                </div>

                <label className="inline-flex px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition items-center gap-2">
                  <Camera className="w-4 h-4" /> Chụp thêm ảnh bài làm
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>

                {images.length > 0 && (
                  <div className="text-[11px] text-teal-700 font-bold">
                    ✓ Đã đính kèm {images.length} trang ảnh bài làm
                  </div>
                )}
              </div>

              {/* Nút nộp bài trực tuyến */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-teal-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 text-white text-sm font-black shadow-xl shadow-teal-600/30 transition flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>Đang nộp bài thi trực tuyến...</>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> BẤM NỘP BÀI THI TRỰC TUYẾN CHO THẦY THỌ
                  </>
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
