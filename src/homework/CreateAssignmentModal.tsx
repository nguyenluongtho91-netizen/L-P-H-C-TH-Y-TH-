// src/homework/CreateAssignmentModal.tsx
// Modal Tạo & Giao bài tập về nhà - Chuẩn Azota

import React, { useState, useEffect } from 'react';
import {
  X, UploadCloud, FileText, Image, FileCode, Plus,
  Calendar, Clock, Check, AlertCircle, Link as LinkIcon,
  Trash2, Sparkles, BookOpen, Lock, Unlock, Eye
} from 'lucide-react';
import { HomeworkAssignment, HomeworkAttachment } from './types';
import { saveAssignment } from './homeworkService';
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('23:59');
  const [allowLate, setAllowLate] = useState(true);
  const [requireLogin, setRequireLogin] = useState(false);
  const [viewScoreRule, setViewScoreRule] = useState<'immediate' | 'graded_only' | 'hidden'>('graded_only');
  const [viewSolutionRule, setViewSolutionRule] = useState<'immediate' | 'after_deadline' | 'hidden'>('after_deadline');
  const [attachments, setAttachments] = useState<HomeworkAttachment[]>([]);
  const [customLink, setCustomLink] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title || '');
        setDescription(initialData.description || '');
        setSelectedClassIds(initialData.class_ids || []);
        if (initialData.deadline) {
          const d = new Date(initialData.deadline);
          setDeadlineDate(d.toISOString().slice(0, 10));
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          setDeadlineTime(`${hh}:${mm}`);
        }
        setAllowLate(initialData.allow_late ?? true);
        setRequireLogin(initialData.require_login ?? false);
        setViewScoreRule(initialData.view_score_rule || 'graded_only');
        setViewSolutionRule(initialData.view_solution_rule || 'after_deadline');
        setAttachments(initialData.attachments || []);
      } else {
        // Mặc định tạo mới: Hạn nộp là 23:59 sau 3 ngày
        setTitle('');
        setDescription('Các em làm bài cẩn thận ra vở ghi, trình bày chi tiết lời giải, chụp ảnh ngay ngắn đủ sáng rồi bấm Nộp bài nhé!');
        setSelectedClassIds(classes.length > 0 ? [classes[0].id] : []);
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 3);
        setDeadlineDate(defaultDate.toISOString().slice(0, 10));
        setDeadlineTime('23:59');
        setAllowLate(true);
        setRequireLogin(false);
        setViewScoreRule('graded_only');
        setViewSolutionRule('after_deadline');
        setAttachments([]);
      }
    }
  }, [isOpen, initialData, classes]);

  if (!isOpen) return null;

  // Xử lý upload file đề bài (PDF, DOCX, Ảnh)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      let type: 'pdf' | 'docx' | 'image' | 'video' = 'image';
      if (file.name.endsWith('.pdf')) type = 'pdf';
      else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) type = 'docx';

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
    });
    e.target.value = '';
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

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleToggleClass = (classId: string) => {
    setSelectedClassIds(prev =>
      prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
    );
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
    if (!deadlineDate) {
      toast.error('Vui lòng chọn ngày hết hạn nộp bài!');
      return;
    }

    try {
      setSaving(true);
      const deadlineIso = new Date(`${deadlineDate}T${deadlineTime || '23:59'}:00`).toISOString();
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
        allow_late: allowLate,
        require_login: requireLogin,
        view_score_rule: viewScoreRule,
        view_solution_rule: viewSolutionRule,
        attachments,
        status: 'active',
      };

      await saveAssignment(assignment);
      toast.success(initialData ? 'Đã cập nhật bài tập!' : '🎉 Giao bài tập thành công!');
      onCreated(assignment);
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi lưu bài tập: ' + (err.message || 'Thử lại sau'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-md">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wide">
                {initialData ? 'CHỈNH SỬA BÀI TẬP' : 'GIAO BÀI TẬP VỀ NHÀ MỚI (AZOTA)'}
              </h2>
              <p className="text-xs text-teal-100 font-medium">
                Giao bài cho lớp, đặt hạn nộp và nhận bài làm ảnh từ học sinh
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* 1. Tên bài tập */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Tên bài tập <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="VD: Bài tập Este - Lipit (Buổi 2), Đề ôn tập thi học kì..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm font-semibold text-slate-800 placeholder:text-slate-400"
              required
            />
            {/* Gợi ý tên nhanh */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" /> Mẫu:
              </span>
              {['Bài tập về nhà Tuần 1', 'Chuyên đề Tự luận Hóa', 'Phiếu bài tập Buổi 2'].map(sug => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setTitle(sug)}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 transition"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Lớp áp dụng */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Chọn Lớp Giao Bài <span className="text-rose-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {classes.map(c => {
                const isSelected = selectedClassIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleToggleClass(c.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition ${
                      isSelected
                        ? 'bg-teal-600 text-white border-teal-600 shadow-sm shadow-teal-200'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center ${isSelected ? 'bg-white text-teal-700' : 'border border-slate-300'}`}>
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Đính kèm tài liệu đề bài */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Tài liệu & Đề bài đính kèm (PDF, Word, Ảnh)
            </label>
            <div className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-teal-400 bg-slate-50/50 text-center transition">
              <UploadCloud className="w-8 h-8 mx-auto text-teal-600 mb-2" />
              <p className="text-xs font-bold text-slate-700">
                Kéo thả file vào đây hoặc bấm để chọn file đề bài
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Hỗ trợ PDF, file Word (.docx), file Ảnh (.png, .jpg)
              </p>
              <label className="mt-3 inline-block px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer transition shadow-sm">
                Chọn file từ máy tính
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Hoặc chèn link web/video */}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={customLink}
                onChange={e => setCustomLink(e.target.value)}
                placeholder="Hoặc dán link Google Drive / Video bài giảng Youtube..."
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                type="button"
                onClick={handleAddLink}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm link
              </button>
            </div>

            {/* Danh sách đính kèm */}
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map(att => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {att.type === 'pdf' ? (
                        <FileText className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      ) : att.type === 'docx' ? (
                        <FileCode className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      ) : att.type === 'link' ? (
                        <LinkIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <Image className="w-4 h-4 text-teal-600 flex-shrink-0" />
                      )}
                      <span className="font-semibold text-slate-800 truncate">{att.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="text-slate-400 hover:text-rose-500 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Hạn nộp bài */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-600" /> Ngày hết hạn <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={deadlineDate}
                onChange={e => setDeadlineDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-semibold text-slate-800"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-teal-600" /> Giờ hết hạn
              </label>
              <input
                type="time"
                value={deadlineTime}
                onChange={e => setDeadlineTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-semibold text-slate-800"
              />
            </div>
          </div>

          {/* 5. Cấu hình nộp bài chuẩn Azota */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3.5">
            <h3 className="text-xs font-black uppercase text-teal-800 tracking-wider flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-teal-600" /> Cấu hình nộp bài thông minh (Azota)
            </h3>

            {/* Cho phép nộp muộn */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-800">Cho phép nộp quá hạn</div>
                <div className="text-[11px] text-slate-500">
                  Học sinh nộp sau giờ hẹn vẫn được ghi nhận kèm nhãn "Nộp muộn"
                </div>
              </div>
              <input
                type="checkbox"
                checked={allowLate}
                onChange={e => setAllowLate(e.target.checked)}
                className="w-4 h-4 accent-teal-600 rounded cursor-pointer"
              />
            </div>

            {/* Yêu cầu đăng nhập */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
              <div>
                <div className="text-xs font-bold text-slate-800">
                  {requireLogin ? 'Yêu cầu đăng nhập tài khoản' : 'Nộp bài nhanh không cần mật khẩu (Khuyên dùng)'}
                </div>
                <div className="text-[11px] text-slate-500">
                  {requireLogin
                    ? 'Học sinh phải có tài khoản và mật khẩu mới được nộp'
                    : 'Học sinh chỉ cần chọn đúng tên mình từ danh sách lớp để nộp bài'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={!requireLogin}
                onChange={e => setRequireLogin(!e.target.checked)}
                className="w-4 h-4 accent-teal-600 rounded cursor-pointer"
              />
            </div>

            {/* Xem điểm */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
              <div>
                <div className="text-xs font-bold text-slate-800">Quyền xem điểm số</div>
                <div className="text-[11px] text-slate-500">Khi nào học sinh được xem điểm bài tập</div>
              </div>
              <select
                value={viewScoreRule}
                onChange={e => setViewScoreRule(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 bg-white"
              >
                <option value="graded_only">Chỉ xem khi Thầy đã chấm xong</option>
                <option value="immediate">Xem ngay sau khi nộp</option>
                <option value="hidden">Không cho xem điểm</option>
              </select>
            </div>
          </div>

          {/* 6. Lời dặn dò của Thầy */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Lời dặn dò & Hướng dẫn làm bài
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="VD: Các em nhớ ghi rõ số trang, làm câu tự luận ra giấy đôi và chụp ảnh thẳng..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs text-slate-800"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-xs font-black shadow-lg shadow-teal-600/30 transition flex items-center gap-2"
            >
              {saving ? (
                <>Đang lưu bài tập...</>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {initialData ? 'CẬP NHẬT BÀI TẬP' : 'XUẤT BẢN & GIAO BÀI (AZOTA)'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
