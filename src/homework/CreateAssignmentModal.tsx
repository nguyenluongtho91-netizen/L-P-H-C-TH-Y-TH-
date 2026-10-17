// src/homework/CreateAssignmentModal.tsx
// Modal Tạo & Giao bài tập về nhà 2 cột - Chuẩn Azota 100%

import React, { useState, useEffect, useRef } from 'react';
import {
  X, UploadCloud, FileText, Image as ImageIcon, FileCode, Plus,
  Calendar, Clock, Check, AlertCircle, Link as LinkIcon,
  Trash2, Sparkles, BookOpen, Lock, Unlock, Eye, Users,
  Share2, Copy, CheckCheck, QrCode, ArrowRight, ExternalLink,
  HelpCircle, ShieldCheck
} from 'lucide-react';
import { HomeworkAssignment, HomeworkAttachment } from './types';
import { parseWordToExam } from '@/services/mathWordParserService';
import { parseTexToExam } from '@/services/texParserService';
import type { Question } from '@/types';
import { saveAssignment, generateZaloShareMessage, formatDateTimeVN } from './homeworkService';
import toast from 'react-hot-toast';

interface CreateAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (assignment: HomeworkAssignment) => void;
  classes: Array<{ id: string; name: string }>;
  initialData?: HomeworkAssignment | null;
}

export default function CreateAssignmentModal({
  isOpen,
  onClose,
  onCreated,
  classes,
  initialData,
}: CreateAssignmentModalProps) {
  // Cột trái: Nội dung & Đề bài
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<HomeworkAttachment[]>([]);
  const [customLink, setCustomLink] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<Question[]>([]);
  const [isParsingDocx, setIsParsingDocx] = useState(false);
  const [showQuestionPreview, setShowQuestionPreview] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cột phải: Cấu hình & Chọn lớp
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [noDeadline, setNoDeadline] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('23:59');
  const [allowLate, setAllowLate] = useState(true);
  const [requirePassword, setRequirePassword] = useState(false);
  const [assignmentPassword, setAssignmentPassword] = useState('');
  const [viewScoreRule, setViewScoreRule] = useState<'immediate' | 'graded_only' | 'hidden'>('graded_only');
  const [viewSolutionRule, setViewSolutionRule] = useState<'immediate' | 'after_deadline' | 'hidden'>('after_deadline');

  const [saving, setSaving] = useState(false);

  // Modal Share sau khi xuất bản
  const [publishedAssignment, setPublishedAssignment] = useState<HomeworkAssignment | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedZalo, setCopiedZalo] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title || '');
        setDescription(initialData.description || '');
        setSelectedClassIds(initialData.class_ids || []);
        if (initialData.no_deadline) {
          setNoDeadline(true);
        } else if (initialData.deadline) {
          const d = new Date(initialData.deadline);
          setDeadlineDate(d.toISOString().slice(0, 10));
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          setDeadlineTime(`${hh}:${mm}`);
          setNoDeadline(false);
        }
        setAllowLate(initialData.allow_late ?? true);
        setRequirePassword(initialData.require_password ?? false);
        setAssignmentPassword(initialData.assignment_password || '');
        setViewScoreRule(initialData.view_score_rule || 'graded_only');
        setViewSolutionRule(initialData.view_solution_rule || 'after_deadline');
        setAttachments(initialData.attachments || []);
        setParsedQuestions(initialData.parsed_questions || []);
        if (initialData.parsed_questions?.length) setShowQuestionPreview(true);
      } else {
        // Mặc định tạo mới: Hạn nộp là 23:59 sau 3 ngày
        setTitle('');
        setDescription('Các em làm bài cẩn thận ra vở ghi, trình bày chi tiết lời giải, chụp ảnh ngay ngắn đủ sáng rồi bấm Nộp bài nhé!');
        setSelectedClassIds(classes.length > 0 ? [classes[0].id] : []);
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 3);
        setDeadlineDate(defaultDate.toISOString().slice(0, 10));
        setDeadlineTime('23:59');
        setNoDeadline(false);
        setAllowLate(true);
        setRequirePassword(false);
        setAssignmentPassword('');
        setViewScoreRule('graded_only');
        setViewSolutionRule('after_deadline');
        setAttachments([]);
        setParsedQuestions([]);
        setShowQuestionPreview(false);
      }
      setPublishedAssignment(null);
      setCopiedLink(false);
      setCopiedZalo(false);
    }
  }, [isOpen, initialData, classes]);

  if (!isOpen) return null;

  // Xử lý tệp tải lên & TỰ ĐỘNG BÓC TÁCH CÂU HỎI CHUẨN AZOTA
  const processFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      let type: 'pdf' | 'docx' | 'image' | 'video' = 'image';
      const nameLower = file.name.toLowerCase();
      if (nameLower.endsWith('.pdf')) type = 'pdf';
      else if (nameLower.endsWith('.docx') || nameLower.endsWith('.doc')) type = 'docx';
      else if (nameLower.endsWith('.mp4') || nameLower.endsWith('.mov')) type = 'video';

      // 1. Lưu file đính kèm
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        const newAttachment: HomeworkAttachment = {
          id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          name: file.name,
          size: file.size,
          type,
          url,
        };
        setAttachments(prev => [...prev, newAttachment]);
      };
      reader.readAsDataURL(file);

      // 2. NẾU LÀ FILE WORD (.docx) -> TỰ ĐỘNG BÓC TÁCH CÂU HỎI TRẮC NGHIỆM & TỰ LUẬN CHUẨN AZOTA!
      if (nameLower.endsWith('.docx')) {
        setIsParsingDocx(true);
        const toastId = toast.loading('⚡ Azota đang tự động nhận diện câu hỏi từ file Word...');
        try {
          const examData = await parseWordToExam(file);
          if (examData && examData.questions && examData.questions.length > 0) {
            setParsedQuestions(examData.questions);
            setShowQuestionPreview(true);
            setTitle(prev => prev.trim() ? prev : file.name.replace(/\.docx$/i, ''));
            toast.success(`🎉 Azota đã bóc tách thành công ${examData.questions.length} câu hỏi từ file Word!`, { id: toastId });
          } else {
            toast.dismiss(toastId);
          }
        } catch (err: any) {
          console.warn('Lỗi parse Word:', err);
          toast.error('File Word không đúng chuẩn đề thi, đã đính kèm file gốc!', { id: toastId });
        } finally {
          setIsParsingDocx(false);
        }
      }

      // 3. NẾU LÀ FILE LATEX (.tex)
      if (nameLower.endsWith('.tex')) {
        setIsParsingDocx(true);
        const toastId = toast.loading('⚡ Đang nhận diện câu hỏi từ file LaTeX...');
        try {
          const examData = await parseTexToExam(file);
          if (examData && examData.questions && examData.questions.length > 0) {
            setParsedQuestions(examData.questions);
            setShowQuestionPreview(true);
            setTitle(prev => prev.trim() ? prev : file.name.replace(/\.tex$/i, ''));
            toast.success(`🎉 Đã nhận diện ${examData.questions.length} câu hỏi LaTeX!`, { id: toastId });
          }
        } catch (err) {
          toast.dismiss(toastId);
        } finally {
          setIsParsingDocx(false);
        }
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleAddLink = () => {
    if (!customLink.trim()) return;
    const newAtt: HomeworkAttachment = {
      id: 'att_' + Date.now(),
      name: customLink.length > 40 ? customLink.slice(0, 40) + '...' : customLink,
      type: 'link',
      url: customLink.startsWith('http') ? customLink : `https://${customLink}`,
    };
    setAttachments(prev => [...prev, newAtt]);
    setCustomLink('');
  };

  const handleToggleCorrectOption = (qIdx: number, optIdx: number) => {
    setParsedQuestions(prev => {
      const copy = [...prev];
      const q = { ...copy[qIdx] };
      if (q.options) {
        const targetLetter = q.options[optIdx].letter;
        q.options = q.options.map((opt, i) => ({
          ...opt,
          isCorrect: i === optIdx,
        }));
        q.correctAnswer = targetLetter;
      }
      copy[qIdx] = q;
      return copy;
    });
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleToggleClass = (classId: string) => {
    setSelectedClassIds(prev =>
      prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
    );
  };

  const handleSelectAllClasses = () => {
    if (selectedClassIds.length === classes.length) {
      setSelectedClassIds([]);
    } else {
      setSelectedClassIds(classes.map(c => c.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Vui lòng nhập tên bài tập!');
      return;
    }
    if (selectedClassIds.length === 0) {
      toast.error('Vui lòng chọn ít nhất 1 lớp để giao bài!');
      return;
    }
    if (!noDeadline && !deadlineDate) {
      toast.error('Vui lòng chọn ngày hết hạn nộp bài hoặc chọn Không giới hạn!');
      return;
    }

    try {
      setSaving(true);
      const deadlineIso = noDeadline ? undefined : new Date(`${deadlineDate}T${deadlineTime || '23:59'}:00`).toISOString();
      const code = initialData?.code || 'HW' + Math.floor(100 + Math.random() * 900);
      const selectedClassNames = classes
        .filter(c => selectedClassIds.includes(c.id))
        .map(c => c.name);

      const assignment: HomeworkAssignment = {
        id: initialData?.id || 'hw_' + Date.now(),
        code,
        title: title.trim(),
        description: description.trim(),
        class_ids: selectedClassIds,
        class_names: selectedClassNames,
        created_at: initialData?.created_at || new Date().toISOString(),
        deadline: deadlineIso,
        no_deadline: noDeadline,
        allow_late: allowLate,
        require_login: false, // Học sinh chọn tên theo danh sách lớp
        require_password: requirePassword,
        assignment_password: assignmentPassword.trim() || undefined,
        view_score_rule: viewScoreRule,
        view_solution_rule: viewSolutionRule,
        attachments,
        parsed_questions: parsedQuestions.length > 0 ? parsedQuestions : undefined,
        status: 'active',
      };

      await saveAssignment(assignment);
      toast.success(initialData ? 'Đã cập nhật bài tập!' : '🎉 Giao bài tập thành công!');
      onCreated(assignment);

      // Nếu tạo mới -> Hiện màn hình chia sẻ Zalo & Copy Link chuẩn Azota
      if (!initialData) {
        setPublishedAssignment(assignment);
      } else {
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi lưu bài tập: ' + (err.message || 'Thử lại sau'));
    } finally {
      setSaving(false);
    }
  };

  const getShareLink = () => {
    if (!publishedAssignment) return '';
    return `${window.location.origin}/nop-bai/${publishedAssignment.id}`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getShareLink());
    setCopiedLink(true);
    toast.success('Đã sao chép link nộp bài!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyZalo = () => {
    if (!publishedAssignment) return;
    const classNames = publishedAssignment.class_names?.join(', ') || '';
    const msg = generateZaloShareMessage(publishedAssignment, classNames, window.location.origin);
    navigator.clipboard.writeText(msg);
    setCopiedZalo(true);
    toast.success('Đã sao chép tin nhắn Zalo gửi phụ huynh & học sinh!');
    setTimeout(() => setCopiedZalo(false), 2500);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MÀN HÌNH CHIA SẺ SAU KHI XUẤT BẢN THÀNH CÔNG (CHUẨN AZOTA)
  // ══════════════════════════════════════════════════════════════════════════
  if (publishedAssignment) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(getShareLink())}`;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
        <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-8">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 p-6 text-white text-center relative">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center mx-auto mb-3 shadow-inner">
              <Check className="w-9 h-9 text-white stroke-[3]" />
            </div>
            <h2 className="text-xl font-black tracking-wide uppercase">
              XUẤT BẢN BÀI TẬP THÀNH CÔNG!
            </h2>
            <p className="text-xs text-blue-100 mt-1 font-medium">
              Bài tập đã sẵn sàng. Thầy Thọ hãy chia sẻ link hoặc gửi vào nhóm Zalo để học sinh nộp bài nhé!
            </p>
            <button
              onClick={onClose}
              className="absolute right-4 top-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Tóm tắt bài tập */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                  {publishedAssignment.code}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {publishedAssignment.no_deadline ? 'Không giới hạn thời gian' : `Hạn nộp: ${formatDateTimeVN(publishedAssignment.deadline)}`}
                </span>
              </div>
              <h3 className="text-base font-black text-slate-800 leading-snug">
                {publishedAssignment.title}
              </h3>
              <p className="text-xs text-slate-600 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                Giao cho: <span className="font-bold text-slate-700">{publishedAssignment.class_names?.join(', ') || 'Chưa chọn lớp'}</span>
              </p>
            </div>

            {/* Link nộp bài & Nút Copy */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Đường dẫn nộp bài (Học sinh chọn tên là nộp được ngay):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getShareLink()}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-700 select-all"
                />
                <button
                  onClick={handleCopyLink}
                  className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition flex-shrink-0 shadow-md ${
                    copiedLink
                      ? 'bg-emerald-600 text-white shadow-emerald-200'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
                  }`}
                >
                  {copiedLink ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedLink ? 'ĐÃ COPY' : 'COPY LINK'}
                </button>
              </div>
            </div>

            {/* 2 Nút lớn: Gửi Zalo & Mở trang làm bài */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleCopyZalo}
                className={`w-full py-3 px-4 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition shadow-md ${
                  copiedZalo
                    ? 'bg-emerald-600 text-white shadow-emerald-200'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-blue-200'
                }`}
              >
                <Share2 className="w-4 h-4" />
                {copiedZalo ? 'ĐÃ COPY MẪU ZALO!' : 'GỬI QUA ZALO CHO LỚP'}
              </button>

              <a
                href={getShareLink()}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 px-4 rounded-2xl text-xs font-black border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-2 transition"
              >
                <ExternalLink className="w-4 h-4 text-slate-500" />
                XEM TRANG NỘP BÀI
              </a>
            </div>

            {/* Mã QR Code nộp bài */}
            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 flex items-center gap-4">
              <img
                src={qrUrl}
                alt="QR nộp bài"
                className="w-20 h-20 rounded-xl border border-white shadow-sm bg-white p-1"
              />
              <div className="text-xs">
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-blue-600" /> Mã QR nộp bài
                </p>
                <p className="text-slate-500 mt-0.5 leading-relaxed">
                  Học sinh có thể dùng camera điện thoại hoặc Zalo quét mã này để vào nộp bài trực tiếp.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md shadow-blue-200 transition flex items-center gap-2"
            >
              VÀO THEO DÕI BÀI TẬP <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MÀN HÌNH TẠO BÀI TẬP 2 CỘT CHUẨN AZOTA
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 py-4 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-md">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wide">
                {initialData ? 'CHỈNH SỬA BÀI TẬP' : 'TẠO BÀI TẬP VỀ NHÀ MỚI (AZOTA)'}
              </h2>
              <p className="text-xs text-blue-100 font-medium">
                Giao bài theo lớp, đính kèm đề PDF/Word, học sinh chọn tên chụp ảnh vở nộp bài
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* 2 Cột Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
          {/* ══════════════════════════════════════════════════════════════════
              CỘT TRÁI (60%): NỘI DUNG & TÀI LIỆU ĐỀ BÀI
             ══════════════════════════════════════════════════════════════════ */}
          <div className="flex-[3] p-6 space-y-6">
            {/* 1. Tên bài tập */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Tên bài tập <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="VD: Bài tập Este - Lipit (Buổi 2), Ôn tập chương 1..."
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-800 placeholder:text-slate-400 bg-slate-50/50"
                required
              />
              {/* Mẫu tên nhanh */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                  <Sparkles className="w-3 h-3 text-amber-500" /> Mẫu nhanh:
                </span>
                {['Bài tập về nhà Tuần 1', 'Chuyên đề Tự luận Hóa', 'Phiếu bài tập Buổi 2', 'Đề kiểm tra 15 phút'].map(sug => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setTitle(sug)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 transition font-medium"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Đính kèm tài liệu đề bài (Drag & Drop Zone chuẩn Azota) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                <span>File Đề Bài Đính Kèm (PDF, Word, Ảnh)</span>
                <span className="text-[11px] text-slate-400 font-normal">Học sinh sẽ xem đề này để làm</span>
              </label>

              {/* Vùng kéo thả */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 rounded-2xl border-2 border-dashed text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/70 scale-[0.99]'
                    : 'border-blue-200 hover:border-blue-400 bg-blue-50/30 hover:bg-blue-50/60'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.mp4"
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-inner">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">
                    Kéo thả file đề bài vào đây, hoặc <span className="text-blue-600 underline">bấm để chọn từ máy</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Hỗ trợ file PDF, Word (.docx), Ảnh (.png, .jpg), Video bài giảng
                  </p>
                </div>
              </div>

              {/* Danh sách file đã tải lên */}
              {attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachments.map(att => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white shadow-sm"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${
                          att.type === 'pdf' ? 'bg-rose-500' :
                          att.type === 'docx' ? 'bg-blue-500' :
                          att.type === 'image' ? 'bg-purple-500' : 'bg-slate-500'
                        }`}>
                          {att.type === 'pdf' && <FileText className="w-4 h-4" />}
                          {att.type === 'docx' && <FileCode className="w-4 h-4" />}
                          {att.type === 'image' && <ImageIcon className="w-4 h-4" />}
                          {att.type === 'link' && <LinkIcon className="w-4 h-4" />}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-800 truncate">{att.name}</p>
                          {att.size && (
                            <p className="text-[10px] text-slate-400 font-medium">
                              {(att.size / 1024).toFixed(1)} KB
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {att.url && (
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Xem thử file"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Xóa tệp"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Thêm liên kết ngoài */}
              <div className="flex items-center gap-2 mt-3">
                <input
                  type="text"
                  value={customLink}
                  onChange={e => setCustomLink(e.target.value)}
                  placeholder="Hoặc dán đường link tài liệu ngoài (Google Drive, YouTube, Web)..."
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 placeholder:text-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddLink}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-xs font-bold transition flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm link
                </button>
              </div>
            </div>

            {/* KHU VỰC CÂU HỎI ĐÃ NHẬN DIỆN TỰ ĐỘNG CHUẨN AZOTA */}
            {isParsingDocx && (
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-center space-y-2 animate-pulse">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-blue-900">
                  ⚡ Đang phân tích file đề, bóc tách câu hỏi trắc nghiệm & tự luận theo chuẩn Azota...
                </p>
              </div>
            )}

            {parsedQuestions.length > 0 && (
              <div className="p-4 rounded-3xl bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-blue-50/80 border border-blue-200 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                      ✓
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-blue-950 uppercase tracking-wide">
                        AZOTA ĐÃ NHẬN DIỆN {parsedQuestions.length} CÂU HỎI TỰ ĐỘNG
                      </h4>
                      <p className="text-[11px] text-blue-700 font-medium">
                        Học sinh làm trắc nghiệm trực tuyến (tự động chấm) và chụp vở phần tự luận!
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowQuestionPreview(!showQuestionPreview)}
                    className="px-3 py-1.5 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-50 transition flex items-center gap-1.5 shadow-xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {showQuestionPreview ? 'Thu gọn' : 'Xem chi tiết câu hỏi'}
                  </button>
                </div>

                {/* Thống kê từng phần */}
                <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                  <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800">
                    Phần I (Trắc nghiệm): {parsedQuestions.filter(q => q.part === 1 || q.type === 'multiple_choice').length} câu
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800">
                    Phần II (Đúng/Sai): {parsedQuestions.filter(q => q.part === 2 || q.type === 'true_false').length} câu
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800">
                    Phần III (Trả lời ngắn): {parsedQuestions.filter(q => q.part === 3 || q.type === 'short_answer').length} câu
                  </span>
                  {parsedQuestions.filter(q => q.part === 4 || q.type === 'writing').length > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800">
                      Phần IV (Tự luận): {parsedQuestions.filter(q => q.part === 4 || q.type === 'writing').length} câu
                    </span>
                  )}
                </div>

                {/* Danh sách câu hỏi chi tiết */}
                {showQuestionPreview && (
                  <div className="mt-3 max-h-72 overflow-y-auto space-y-2 pr-1 border-t border-blue-200/60 pt-3">
                    {parsedQuestions.map((q, idx) => (
                      <div key={idx} className="p-3 rounded-2xl bg-white border border-slate-200 text-xs space-y-2 shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-slate-800">
                            Câu {q.number || idx + 1}: {q.part === 1 ? 'Trắc nghiệm' : q.part === 2 ? 'Đúng/Sai' : q.part === 3 ? 'Trả lời ngắn' : 'Tự luận'}
                          </span>
                          {q.correctAnswer && (
                            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 text-[11px]">
                              Đáp án: {q.correctAnswer}
                            </span>
                          )}
                        </div>

                        <div className="text-slate-700 leading-relaxed font-serif text-xs" dangerouslySetInnerHTML={{ __html: q.text }} />

                        {/* Các lựa chọn A, B, C, D */}
                        {q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                            {q.options.map((opt, oIdx) => {
                              const isCorr = opt.isCorrect || q.correctAnswer === opt.letter;
                              return (
                                <div
                                  key={oIdx}
                                  onClick={() => handleToggleCorrectOption(idx, oIdx)}
                                  className={`px-2.5 py-1.5 rounded-xl border text-[11px] flex items-center gap-1.5 cursor-pointer transition ${
                                    isCorr
                                      ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold'
                                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                  }`}
                                  title="Bấm để chọn làm đáp án đúng"
                                >
                                  <span className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] ${
                                    isCorr ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-300'
                                  }`}>
                                    {opt.letter}
                                  </span>
                                  <span className="truncate" dangerouslySetInnerHTML={{ __html: opt.text }} />
                                  {isCorr && <Check className="w-3.5 h-3.5 text-emerald-600 ml-auto flex-shrink-0 stroke-[3]" />}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. Nội dung / Lời dặn bài tập */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Nội dung câu hỏi hoặc lời dặn dò học sinh
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Gõ trực tiếp đề bài tại đây nếu không có file đề, hoặc dặn dò các em lưu ý cách trình bày..."
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs leading-relaxed text-slate-800 placeholder:text-slate-400 bg-slate-50/50"
              />
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              CỘT PHẢI (40%): CẤU HÌNH & ĐỐI TƯỢNG GIAO BÀI
             ══════════════════════════════════════════════════════════════════ */}
          <div className="flex-[2] p-6 space-y-6 bg-slate-50/40">
            {/* 1. Chọn Lớp Giao Bài */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  Chọn Lớp Nhận Bài <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleSelectAllClasses}
                  className="text-[11px] font-bold text-blue-600 hover:underline"
                >
                  {selectedClassIds.length === classes.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {classes.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Chưa có lớp học nào trong hệ thống.</p>
                ) : (
                  classes.map(c => {
                    const isSelected = selectedClassIds.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleToggleClass(c.id)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-400 text-blue-900 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{c.name}</span>
                        <div className={`w-4 h-4 rounded-md flex items-center justify-center transition ${
                          isSelected ? 'bg-blue-600 text-white' : 'border border-slate-300'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 2. Thời Hạn Nộp Bài */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  Hạn nộp bài
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={noDeadline}
                    onChange={e => setNoDeadline(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  Không giới hạn
                </label>
              </div>

              {!noDeadline && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Ngày hết hạn</span>
                    <input
                      type="date"
                      value={deadlineDate}
                      onChange={e => setDeadlineDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required={!noDeadline}
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Giờ hết hạn</span>
                    <input
                      type="time"
                      value={deadlineTime}
                      onChange={e => setDeadlineTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required={!noDeadline}
                    />
                  </div>
                </div>
              )}

              {/* Chặn nộp trễ */}
              {!noDeadline && (
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 pt-1">
                  <input
                    type="checkbox"
                    checked={!allowLate}
                    onChange={e => setAllowLate(!e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                  />
                  <span>Chặn nộp bài khi quá hạn (Không cho nộp trễ)</span>
                </label>
              )}
            </div>

            {/* 3. Cấu hình Học sinh & Bảo mật (Chuẩn Azota) */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3.5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                Cấu hình học sinh & Nộp bài
              </div>

              {/* Học sinh chọn tên trong danh sách */}
              <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 flex items-start gap-2.5">
                <Check className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-slate-700 leading-relaxed">
                  <strong className="text-blue-900 block">Chọn tên trong danh sách lớp:</strong>
                  Học sinh vào link chỉ cần bấm chọn tên mình trong lớp để nộp ảnh vở, không cần nhớ mã học sinh.
                </div>
              </div>

              {/* Yêu cầu mật khẩu */}
              <div>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    Yêu cầu mật khẩu khi nộp bài
                  </span>
                  <input
                    type="checkbox"
                    checked={requirePassword}
                    onChange={e => setRequirePassword(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                </label>
                {requirePassword && (
                  <div className="mt-2 pl-5">
                    <input
                      type="text"
                      value={assignmentPassword}
                      onChange={e => setAssignmentPassword(e.target.value)}
                      placeholder="Nhập mật khẩu chung của bài tập (hoặc để trống để dùng mật khẩu riêng của học sinh)..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Xem điểm */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-700 block mb-1">Cho học sinh xem điểm:</span>
                <select
                  value={viewScoreRule}
                  onChange={e => setViewScoreRule(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="graded_only">Sau khi Thầy Thọ chấm bài xong</option>
                  <option value="immediate">Xem ngay sau khi nộp</option>
                  <option value="hidden">Không cho xem điểm</option>
                </select>
              </div>

              {/* Xem lời giải */}
              <div>
                <span className="text-xs font-semibold text-slate-700 block mb-1">Cho xem đáp án & lời giải:</span>
                <select
                  value={viewSolutionRule}
                  onChange={e => setViewSolutionRule(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="after_deadline">Khi hết hạn nộp bài</option>
                  <option value="immediate">Sau khi nộp bài xong</option>
                  <option value="hidden">Không cho xem lời giải</option>
                </select>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
          >
            Hủy bỏ
          </button>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-7 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black shadow-lg shadow-blue-500/30 transition flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <span>Đang lưu...</span>
            ) : (
              <>
                <BookOpen className="w-4 h-4" />
                {initialData ? 'CẬP NHẬT BÀI TẬP' : '🚀 XUẤT BẢN BÀI TẬP (AZOTA)'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
