// @ts-nocheck
import React, { useState, useRef, useCallback, useEffect } from "react";
import type { CSSProperties } from "react";
import * as XLSX from "xlsx";
import { useDataStore } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import EssayImageAnnotator from '@/components/EssayImageAnnotator';
import {
  KeyRound, Users, GraduationCap, UploadCloud, Check, X, Circle,
  PenTool, Type, RotateCw, ZoomIn, ZoomOut, Undo2, Trash2, Download,
  Sparkles, MessageCircle, FileText, ChevronRight, Award, Send, Save,
  Eye, RefreshCw, Smartphone, CheckSquare, Layers, ShieldCheck,
  HelpCircle, Calendar, BookOpen
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface AnswerKey {
  p1: string[];
  p2: string[];
  p3: string[];
  p4: string;
}

interface Weights {
  p1: number;
  p2: number;
  p3: number;
  p4: number;
}

interface ImgData {
  data: string;
  type: string;
}

interface GradingStudent {
  id: string;
  name: string;
  student_code?: string;
  phone?: string;
  zalo?: string;
  images: ImgData[];
}

interface P1Result { student: string; correct: string; ok: boolean; }
interface P2Sub  { student: string; correct: string; ok: boolean; }
interface P2Result { subs: P2Sub[]; qScore: number; }
interface P3Result { student: string; correct: string; ok: boolean; }
interface P4SubStep { text: string; ok: boolean; }
interface P4SubQ   { q: number; score: number; max: number; steps: P4SubStep[]; comment: string; }
interface GradeP4   { score: number; feedback: string; detail?: P4SubQ[]; }

interface StudentResult {
  p1: { score: number; results: P1Result[] };
  p2: { score: number; results: P2Result[] };
  p3: { score: number; results: P3Result[] };
  p4: GradeP4;
  total: number;
}

// ─── HÀM GỌI GEMINI VISION CHO TỰ LUẬN ──────────────────────────────────────
async function directGeminiVision(apiKey: string, parts: any[]) {
  if (!apiKey) throw new Error("Vui lòng nhập API Key của Gemini!");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts }],
    generationConfig: { 
      temperature: 0.1, 
      responseMimeType: "application/json" 
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.candidates[0].content.parts[0].text;
}

async function gradeEssayWithAI(apiKey: string, imgBase64: string, rubric: string, maxScore: number) {
  const parts = [
    {
      inlineData: {
        data: imgBase64.replace(/^data:image\/\w+;base64,/, ''),
        mimeType: 'image/jpeg'
      }
    },
    {
      text: `Bạn là trợ lý chấm thi môn Hóa học/Toán học chuyên nghiệp của Thầy Thọ.
Hãy đọc ảnh bài làm viết tay tự luận của học sinh và chấm điểm theo tiêu chí:
${rubric ? `Tiêu chí chấm (Rubric / Lời giải mẫu): ${rubric}` : 'Chấm các bước giải, tính toán, kết luận và sự chặt chẽ.'}
Điểm tối đa của câu tự luận này là: ${maxScore} điểm.

Yêu cầu trả về đúng định dạng JSON sau (không dùng markdown backticks):
{
  "score": 1.75,
  "feedback": "Nhận xét tổng quan ưu điểm và các lỗi sai cần khắc phục...",
  "detail": [
    { "text": "Bước 1: Viết phương trình phản ứng đúng", "score": 0.5 },
    { "text": "Bước 2: Tính số mol chính xác", "score": 0.5 },
    { "text": "Bước 3: Nhầm khối lượng chất tan", "score": 0.0, "comment": "Tính nhầm m = 5.6g thành 6.5g" }
  ]
}`
    }
  ];

  const rawJson = await directGeminiVision(apiKey, parts);
  const clean = rawJson.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── HELPERS CHẤM ĐIỂM ────────────────────────────────────────────────────────
function parseAnswerKey(txt: string): AnswerKey {
  const key: AnswerKey = { p1: [], p2: [], p3: [], p4: "" };
  const p4Lines: string[] = [];
  txt.split("\n").forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split("|").map(s => s.trim());
    if (parts.length < 3) return;
    const section = parts[0].toUpperCase();
    const num = parseInt(parts[1]) - 1;
    const ans = parts.slice(2).join("|").trim();
    if (section === "P1") key.p1[num] = ans;
    else if (section === "P2") key.p2[num] = ans;
    else if (section === "P3") key.p3[num] = ans;
    else if (section === "P4") p4Lines.push(ans);
  });
  if (p4Lines.length) key.p4 = p4Lines.join("\n");
  return key;
}

async function fileToBase64(file: File): Promise<ImgData> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ data: (r.result as string).split(",")[1], type: file.type || "image/jpeg" });
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function normalizeAns(s: string): string { return String(s).trim().replace(",", ".").toLowerCase(); }

const MINISTRY_PCT: Record<number, number> = { 0: 0, 1: 0.10, 2: 0.25, 3: 0.50, 4: 1.0 };

export default function PhieuGrader() {
  // Tab 0: Studio Chấm Tương Tác (Trọng tâm Thầy yêu cầu)
  // Tab 1: Phòng Thi Online (Lấy từ bài nộp trực tuyến)
  // Tab 2: Quét Phiếu AI Hàng Loạt
  // Tab 3: Cấu Hình Đáp Án & Thang Điểm
  const [tab, setTab] = useState(0);

  // Gemini API Key
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  useEffect(() => { localStorage.setItem('gemini_api_key', apiKey); }, [apiKey]);

  // Supabase Data Store
  const { classes, students, enrollments, loadClasses, loadStudents, loadEnrollments } = useDataStore() as any;
  const { user, isAdmin } = useAuthStore() as any;
  const myClasses = isAdmin() ? classes : classes?.filter((c: any) => c.teacher_id === user?.id);

  useEffect(() => {
    loadClasses(); loadStudents(); loadEnrollments();
    loadOnlineRooms();
  }, []);

  // ── CẤU HÌNH ĐÁP ÁN & TRỌNG SỐ ĐIỂM ──
  const [keyRaw, setKeyRaw] = useState(
`P1 | 1 | A
P1 | 2 | B
P1 | 3 | C
P1 | 4 | D
P1 | 5 | A
P1 | 6 | B
P1 | 7 | C
P1 | 8 | D
P1 | 9 | A
P1 | 10 | B
P1 | 11 | C
P1 | 12 | D
P1 | 13 | A
P1 | 14 | B
P1 | 15 | C
P1 | 16 | D
P1 | 17 | A
P1 | 18 | B
P2 | 1 | DDSS
P2 | 2 | SDSD
P2 | 3 | DSDD
P2 | 4 | SSDD
P3 | 1 | 2026
P3 | 2 | 0.5
P3 | 3 | 12.4
P3 | 4 | 3
P3 | 5 | 100
P3 | 6 | -2.5
P4 | 1 | Trình bày phương trình phản ứng, số mol, tính nồng độ và kết luận.`
  );
  const [answerKey, setAnswerKey] = useState<AnswerKey>(() => parseAnswerKey(keyRaw));
  const [p4Rubric, setP4Rubric] = useState("Trình bày phương trình phản ứng, số mol, tính nồng độ và kết luận.");
  const [weights, setWeights] = useState<Weights>({ p1: 3.0, p2: 4.0, p3: 1.5, p4: 1.5 });
  const [p2Mode, setP2Mode] = useState<'equal' | 'ministry'>('ministry');

  // ── TRẠNG THÁI CHẤM TƯƠNG TÁC (STUDIO CHẤM BÀI) ──
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentImages, setStudentImages] = useState<string[]>([]);
  
  // Đáp án học sinh đang chấm
  const [stuP1, setStuP1] = useState<Record<number, string>>({});
  const [stuP2, setStuP2] = useState<Record<number, Record<string, string>>>({}); // { qIndex: { a: 'D', b: 'S' } }
  const [stuP3, setStuP3] = useState<Record<number, string>>({});
  const [essayScore, setEssayScore] = useState<number>(0);
  const [essayFeedback, setEssayFeedback] = useState<string>('');

  // ── TRẠNG THÁI PHÒNG THI ONLINE ──
  const [onlineRooms, setOnlineRooms] = useState<any[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [roomSubmissions, setRoomSubmissions] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Danh sách học sinh theo lớp đã chọn
  const rosterStudents = selectedClassId 
    ? enrollments.filter((e: any) => e.class_id === selectedClassId && e.status === 'active')
                 .map((e: any) => students.find((s: any) => s.id === e.student_id))
                 .filter(Boolean)
    : [];

  const currentStudentObj = students.find((s: any) => s.id === selectedStudentId);

  // Nạp danh sách phòng thi online từ Supabase
  const loadOnlineRooms = async () => {
    setLoadingRooms(true);
    try {
      const { data, error } = await supabase
        .from('exam_rooms')
        .select('id, name, room_code, exam_id, class_id, status, created_at, exams(id, title, data)')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error && data) setOnlineRooms(data);
    } catch (e) {
      console.warn('Lỗi nạp phòng thi:', e);
    } finally {
      setLoadingRooms(false);
    }
  };

  // Nạp bài nộp của phòng thi
  const handleSelectRoom = async (roomId: string) => {
    setSelectedRoomId(roomId);
    if (!roomId) { setRoomSubmissions([]); return; }
    try {
      const { data, error } = await supabase
        .from('exam_submissions')
        .select('*, students(id, full_name, student_code, parent_phone, zalo)')
        .eq('room_id', roomId)
        .order('submitted_at', { ascending: false });
      if (!error && data) setRoomSubmissions(data);
    } catch (e) {
      toast.error('Không nạp được bài nộp phòng thi');
    }
  };

  // Chọn bài thi online để đưa vào Studio chấm
  const loadSubmissionIntoStudio = (sub: any) => {
    const student = sub.students;
    if (student) {
      setSelectedClassId('');
      setSelectedStudentId(student.id);
    }

    // Đổ đáp án học sinh đã nộp vào P1, P2, P3
    const answers = sub.answers || {};
    const newP1: Record<number, string> = {};
    const newP2: Record<number, Record<string, string>> = {};
    const newP3: Record<number, string> = {};

    answerKey.p1.forEach((_, i) => {
      if (answers[i + 1]) newP1[i] = String(answers[i + 1]).toUpperCase();
    });

    answerKey.p2.forEach((_, i) => {
      const raw = String(answers[i + 1] || '????');
      newP2[i] = {
        a: raw[0] === 'D' ? 'D' : (raw[0] === 'S' ? 'S' : ''),
        b: raw[1] === 'D' ? 'D' : (raw[1] === 'S' ? 'S' : ''),
        c: raw[2] === 'D' ? 'D' : (raw[2] === 'S' ? 'S' : ''),
        d: raw[3] === 'D' ? 'D' : (raw[3] === 'S' ? 'S' : ''),
      };
    });

    answerKey.p3.forEach((_, i) => {
      if (answers[i + 1]) newP3[i] = String(answers[i + 1]);
    });

    setStuP1(newP1);
    setStuP2(newP2);
    setStuP3(newP3);

    // Ảnh tự luận (nếu học sinh có nộp)
    if (sub.writing_images && Array.isArray(sub.writing_images)) {
      setStudentImages(sub.writing_images);
    } else if (sub.writing_image) {
      setStudentImages([sub.writing_image]);
    }

    if (sub.score_breakdown?.p4) {
      setEssayScore(Number(sub.score_breakdown.p4) || 0);
    }
    if (sub.score_breakdown?.feedback) {
      setEssayFeedback(sub.score_breakdown.feedback);
    }

    setTab(0);
    toast.success(`Đã nạp bài của ${student?.full_name || 'học sinh'} vào Studio chấm bài!`);
  };

  // ── TÍNH ĐIỂM TỰ ĐỘNG CHO CẢ 4 PHẦN ──
  // Phần I: Trắc nghiệm
  const p1Results = answerKey.p1.map((cor, i) => {
    const userVal = stuP1[i] || '';
    const ok = userVal.toUpperCase() === cor.toUpperCase();
    return { student: userVal, correct: cor, ok };
  });
  const p1CorrectCount = p1Results.filter(r => r.ok).length;
  const p1Score = answerKey.p1.length > 0 
    ? Math.round(((p1CorrectCount * weights.p1) / answerKey.p1.length) * 100) / 100 
    : 0;

  // Phần II: Đúng/Sai
  const p2Results = answerKey.p2.map((corStr, i) => {
    const userSub = stuP2[i] || {};
    const subs = corStr.split('').map((corChar, j) => {
      const lbl = ['a', 'b', 'c', 'd'][j];
      const userChar = userSub[lbl] || '?';
      return { student: userChar, correct: corChar, ok: userChar.toUpperCase() === corChar.toUpperCase() };
    });
    const correctCount = subs.filter(s => s.ok).length;
    const perQ = weights.p2 / (answerKey.p2.length || 1);
    const qScore = p2Mode === 'ministry'
      ? perQ * (MINISTRY_PCT[Math.min(correctCount, 4)] || 0)
      : perQ * (correctCount / 4);
    return { subs, qScore: Math.round(qScore * 100) / 100 };
  });
  const p2Score = Math.round(p2Results.reduce((sum, q) => sum + q.qScore, 0) * 100) / 100;

  // Phần III: Trả lời ngắn
  const p3Results = answerKey.p3.map((cor, i) => {
    const userVal = stuP3[i] || '';
    const ok = userVal.trim() !== '' && normalizeAns(userVal) === normalizeAns(cor);
    return { student: userVal, correct: cor, ok };
  });
  const p3CorrectCount = p3Results.filter(r => r.ok).length;
  const p3Score = answerKey.p3.length > 0 
    ? Math.round(((p3CorrectCount * weights.p3) / answerKey.p3.length) * 100) / 100 
    : 0;

  // Phần IV: Tự luận
  const p4Score = Math.min(weights.p4, Math.max(0, essayScore));

  // TỔNG KẾT ĐIỂM (/ 10.0)
  const totalScore = Math.round((p1Score + p2Score + p3Score + p4Score) * 100) / 100;

  // Xếp loại học lực
  const rank = totalScore >= 9.0 ? 'Xuất sắc' : totalScore >= 8.0 ? 'Giỏi' : totalScore >= 6.5 ? 'Khá' : totalScore >= 5.0 ? 'Trung bình' : 'Yếu';
  const rankColor = totalScore >= 8.0 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : totalScore >= 6.5 ? 'text-blue-600 bg-blue-50 border-blue-200' : totalScore >= 5.0 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-rose-600 bg-rose-50 border-rose-200';

  // Thêm ảnh chụp bài làm tự luận
  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const base64List = await Promise.all(
      files.map(async file => {
        const item = await fileToBase64(file);
        return `data:${item.type};base64,${item.data}`;
      })
    );
    setStudentImages(prev => [...prev, ...base64List]);
    toast.success(`Đã thêm ${files.length} ảnh bài làm!`);
    e.target.value = '';
  };

  // Lưu điểm vào hệ thống Supabase
  const handleSaveToSystem = async () => {
    if (!currentStudentObj && !selectedStudentId) {
      toast.error('Vui lòng chọn học sinh trước khi lưu!');
      return;
    }
    const toastId = toast.loading('Đang lưu kết quả vào hệ thống...');
    try {
      const studentId = currentStudentObj?.id || selectedStudentId;
      const studentName = currentStudentObj?.full_name || 'Học sinh';

      // Lưu vào bảng exam_submissions nếu có phòng thi
      if (selectedRoomId) {
        await supabase.from('exam_submissions').upsert({
          room_id: selectedRoomId,
          student_id: studentId,
          score: totalScore,
          answers: stuP1,
          score_breakdown: {
            p1: p1Score,
            p2: p2Score,
            p3: p3Score,
            p4: p4Score,
            feedback: essayFeedback
          },
          status: 'submitted',
          submitted_at: new Date().toISOString()
        });
      }

      toast.success(`🎉 Đã lưu kết quả của ${studentName} (${totalScore} điểm) vào hệ thống!`, { id: toastId });
    } catch (err: any) {
      toast.error('Lỗi khi lưu: ' + err.message, { id: toastId });
    }
  };

  // Gửi tin nhắn kết quả qua Zalo
  const handleSendZalo = () => {
    const studentName = currentStudentObj?.full_name || 'Học sinh';
    const rawPhone = currentStudentObj?.zalo || currentStudentObj?.parent_phone || '';
    const phone = rawPhone.replace(/\D/g, '').replace(/^84/, '0');

    const msg = `Chào Quý phụ huynh.\n`
              + `Thầy Thọ gửi kết quả chấm bài của em ${studentName}:\n\n`
              + `• Phần I (Trắc nghiệm): ${p1Score} / ${weights.p1} đ (${p1CorrectCount}/${answerKey.p1.length} câu đúng)\n`
              + `• Phần II (Đúng/Sai): ${p2Score} / ${weights.p2} đ\n`
              + `• Phần III (Trả lời ngắn): ${p3Score} / ${weights.p3} đ (${p3CorrectCount}/${answerKey.p3.length} câu đúng)\n`
              + `• Phần IV (Tự luận): ${p4Score} / ${weights.p4} đ\n`
              + `👉 TỔNG ĐIỂM: ${totalScore} / 10.0 đ (Xếp loại: ${rank})\n\n`
              + (essayFeedback ? `• Nhận xét của Thầy: ${essayFeedback}\n\n` : '')
              + `Thầy cảm ơn Quý phụ huynh!`;

    navigator.clipboard.writeText(msg);
    toast.success('Đã copy nội dung báo điểm! Đang mở Zalo...');

    setTimeout(() => {
      const url = phone ? `https://zalo.me/${phone}` : 'https://chat.zalo.me';
      window.open(url, '_blank');
    }, 400);
  };

  return (
    <div className="min-h-screen bg-slate-50/70 p-4 md:p-6 space-y-6">
      {/* ── HEADER CHÍNH ── */}
      <div className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
              <GraduationCap className="w-7 h-7 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black tracking-tight">Chấm Bài Học Sinh</h1>
                <span className="bg-amber-400 text-teal-950 font-black text-[11px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Chuẩn Bộ GD 2025
                </span>
              </div>
              <p className="text-teal-100 text-xs md:text-sm mt-0.5 font-medium">
                Chấm Trắc nghiệm, Đúng/Sai, Trả lời ngắn & Chấm ảnh tự luận bằng Chạm tay / AI
              </p>
            </div>
          </div>

          {/* Huy hiệu thông số */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-white/15 backdrop-blur-md px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-white/10">
              <KeyRound className="w-4 h-4 text-amber-300" />
              <span>{apiKey ? '✓ Đã có Gemini API' : '⚠️ Chưa có API Key'}</span>
            </div>
            <button
              onClick={() => setTab(3)}
              className="bg-white text-teal-800 hover:bg-teal-50 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
            >
              ⚙️ Cấu hình đáp án
            </button>
          </div>
        </div>

        {/* ── THANH CHUYỂN TAB ── */}
        <div className="flex gap-2 mt-6 border-b border-teal-600/50 pb-0 overflow-x-auto">
          {[
            { id: 0, label: '✍️ Studio Chấm Tương Tác', desc: 'Chạm Đúng/Sai & AI' },
            { id: 1, label: '🏫 Phòng Thi Online', desc: 'Lấy bài nộp web' },
            { id: 2, label: '⚡ Quét Phiếu AI Hàng Loạt', desc: 'OCR Phiếu giấy' },
            { id: 3, label: '🔑 Cấu Hình Đáp Án & Thang Điểm', desc: 'Đáp án & Rubric' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 font-black text-xs md:text-sm rounded-t-2xl transition-all cursor-pointer whitespace-nowrap ${
                tab === t.id
                  ? 'bg-slate-50/90 text-teal-900 shadow-md'
                  : 'text-teal-100 hover:text-white hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 0: STUDIO CHẤM TƯƠNG TÁC (TỰ LUẬN + TRẮC NGHIỆM) ── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === 0 && (
        <div className="space-y-6 animate-fade-in">
          {/* Thanh Chọn Học Sinh & Tải Ảnh Bài Làm */}
          <div className="bg-white p-5 rounded-3xl border border-teal-100 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1.5">
                <Users className="w-3.5 h-3.5 text-teal-600" /> Chọn Lớp học:
              </label>
              <select
                value={selectedClassId}
                onChange={e => { setSelectedClassId(e.target.value); setSelectedStudentId(''); }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-teal-600"
              >
                <option value="">-- Chọn một lớp học --</option>
                {myClasses?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name || c.class_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-teal-600" /> Chọn Học sinh:
              </label>
              <select
                value={selectedStudentId}
                onChange={e => setSelectedStudentId(e.target.value)}
                disabled={!selectedClassId && !selectedRoomId}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-teal-600 disabled:opacity-50"
              >
                <option value="">-- Chọn học sinh cần chấm --</option>
                {rosterStudents?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>
                ))}
              </select>
            </div>

            {/* Nút nạp ảnh bài làm chụp tay */}
            <div>
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1.5">
                <Smartphone className="w-3.5 h-3.5 text-teal-600" /> Ảnh bài làm tự luận chụp tay:
              </label>
              <label className="flex items-center justify-center gap-2 w-full bg-teal-50 hover:bg-teal-100 border border-dashed border-teal-300 rounded-xl py-2 px-3 text-xs font-extrabold text-teal-800 cursor-pointer transition-all">
                <UploadCloud className="w-4 h-4 text-teal-600" />
                <span>{studentImages.length > 0 ? `Đã có ${studentImages.length} ảnh (Thêm)` : 'Tải ảnh bài làm lên'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadImages}
                  className="hidden"
                />
              </label>
            </div>

            {/* Thẻ Điểm Tổng Kết Nhanh */}
            <div className="bg-gradient-to-r from-teal-50 to-emerald-50 p-3 rounded-2xl border border-teal-200 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-teal-700 tracking-wider">Tổng Điểm</p>
                <p className="text-2xl font-black text-teal-900 leading-none">{totalScore}<span className="text-xs text-slate-400 font-bold">/10đ</span></p>
              </div>
              <span className={`text-xs font-extrabold px-2.5 py-1 rounded-xl border ${rankColor}`}>
                {rank}
              </span>
            </div>
          </div>

          {/* BỐ CỤC CHÍNH: 2 CỘT (CỘT TRÁI: ẢNH TỰ LUẬN CHẠM TAY - CỘT PHẢI: TRẮC NGHIỆM 3 PHẦN) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── CỘT TRÁI (7 PHẦN): TỰ LUẬN & CANVAS CHẠM ĐỂ CHẤM ── */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-teal-700" />
                  PHẦN IV: TỰ LUẬN (CHẠM ĐỂ GHI ĐÚNG / SAI HOẶC KHOANH LỖI)
                </h3>
                <span className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-lg">
                  Trọng số: {weights.p4} điểm
                </span>
              </div>

              {/* Component Canvas tương tác chạm tay */}
              <EssayImageAnnotator
                images={studentImages}
                studentName={currentStudentObj?.full_name || 'Học sinh'}
                studentCode={currentStudentObj?.student_code || ''}
                maxScore={weights.p4}
                score={essayScore}
                onScoreChange={setEssayScore}
                feedback={essayFeedback}
                onFeedbackChange={setEssayFeedback}
                rubricText={p4Rubric}
                apiKey={apiKey}
                onAIGrade={async (imgBase64, rubric) => {
                  return await gradeEssayWithAI(apiKey, imgBase64, rubric, weights.p4);
                }}
              />
            </div>

            {/* ── CỘT PHẢI (5 PHẦN): TRẮC NGHIỆM P1, P2, P3 ── */}
            <div className="lg:col-span-5 space-y-4">
              {/* PHẦN I: TRẮC NGHIỆM 4 LỰA CHỌN */}
              <div className="bg-white p-4 rounded-3xl border border-teal-100 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-black text-xs text-slate-800 uppercase flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5 text-teal-600" />
                    Phần I: Trắc Nghiệm ({p1Score}/{weights.p1} đ)
                  </h4>
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                    Đúng: {p1CorrectCount} / {answerKey.p1.length} câu
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {answerKey.p1.map((correctChoice, idx) => {
                    const studentChoice = stuP1[idx] || '';
                    const isOk = studentChoice.toUpperCase() === correctChoice.toUpperCase();
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs ${
                          studentChoice
                            ? (isOk ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/60 border-rose-200')
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <span className="font-bold text-slate-600">Câu {idx + 1}:</span>
                        <div className="flex gap-1">
                          {['A', 'B', 'C', 'D'].map(ch => (
                            <button
                              key={ch}
                              type="button"
                              onClick={() => setStuP1(prev => ({ ...prev, [idx]: ch }))}
                              className={`w-6 h-6 rounded-lg font-black text-xs transition-all cursor-pointer ${
                                studentChoice === ch
                                  ? (ch === correctChoice ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white')
                                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {ch}
                            </button>
                          ))}
                        </div>
                        {studentChoice && !isOk && (
                          <span className="text-[10px] font-extrabold text-emerald-600">→{correctChoice}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PHẦN II: ĐÚNG / SAI (CHUẨN BỘ GD 2025) */}
              <div className="bg-white p-4 rounded-3xl border border-teal-100 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-black text-xs text-slate-800 uppercase flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-teal-600" />
                    Phần II: Đúng / Sai ({p2Score}/{weights.p2} đ)
                  </h4>
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-lg">
                    Chuẩn Bộ GD 2025
                  </span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {answerKey.p2.map((correctStr, idx) => {
                    const subMap = stuP2[idx] || {};
                    const qRes = p2Results[idx];
                    return (
                      <div key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                          <span>Câu {idx + 1}</span>
                          <span className="text-teal-700 font-extrabold">{qRes?.qScore?.toFixed(2) || 0} đ</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {['a', 'b', 'c', 'd'].map((lbl, j) => {
                            const corChar = correctStr[j] || 'D';
                            const stuChar = subMap[lbl] || '';
                            const isSubOk = stuChar.toUpperCase() === corChar.toUpperCase();
                            return (
                              <div key={lbl} className="bg-white p-1 rounded-lg border border-slate-200 flex flex-col items-center gap-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">{lbl}</span>
                                <div className="flex gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => setStuP2(prev => ({
                                      ...prev,
                                      [idx]: { ...(prev[idx] || {}), [lbl]: 'D' }
                                    }))}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer ${
                                      stuChar === 'D'
                                        ? (corChar === 'D' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white')
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    Đ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setStuP2(prev => ({
                                      ...prev,
                                      [idx]: { ...(prev[idx] || {}), [lbl]: 'S' }
                                    }))}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer ${
                                      stuChar === 'S'
                                        ? (corChar === 'S' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white')
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
                    );
                  })}
                </div>
              </div>

              {/* PHẦN III: TRẢ LỜI NGẮN */}
              <div className="bg-white p-4 rounded-3xl border border-teal-100 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-black text-xs text-slate-800 uppercase flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-teal-600" />
                    Phần III: Trả Lời Ngắn ({p3Score}/{weights.p3} đ)
                  </h4>
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                    Đúng: {p3CorrectCount} / {answerKey.p3.length} câu
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {answerKey.p3.map((cor, idx) => {
                    const userVal = stuP3[idx] || '';
                    const isOk = userVal.trim() !== '' && normalizeAns(userVal) === normalizeAns(cor);
                    return (
                      <div key={idx} className="bg-slate-50 p-2 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                          <span>Câu {idx + 1}:</span>
                          <span className="text-[10px] text-slate-400 font-mono">ĐA: {cor}</span>
                        </div>
                        <input
                          type="text"
                          value={userVal}
                          onChange={e => setStuP3(prev => ({ ...prev, [idx]: e.target.value }))}
                          placeholder="Đáp án học sinh..."
                          className={`w-full text-xs font-bold px-2 py-1 rounded-lg border transition-all ${
                            userVal
                              ? (isOk ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800')
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── BẢNG TỔNG KẾT & HÀNH ĐỘNG CUỐI CÙNG ── */}
              <div className="bg-gradient-to-br from-teal-800 to-emerald-900 p-5 rounded-3xl text-white space-y-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-teal-200 uppercase tracking-wider">Tổng Kết Bài Thi</p>
                    <h3 className="text-3xl font-black text-amber-300">
                      {totalScore} <span className="text-sm font-normal text-teal-200">/ 10.0 đ</span>
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-black text-white">
                      {rank}
                    </span>
                    <p className="text-[10px] text-teal-200 mt-1">P1: {p1Score} | P2: {p2Score} | P3: {p3Score} | P4: {p4Score}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-teal-700/60">
                  <button
                    onClick={handleSaveToSystem}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-extrabold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Lưu vào hệ thống</span>
                  </button>

                  <button
                    onClick={handleSendZalo}
                    className="w-full bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-extrabold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Gửi Zalo phụ huynh</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: PHÒNG THI ONLINE (LẤY TỪ BÀI NỘP TRÊN WEB) ── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === 1 && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-5 rounded-3xl border border-teal-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800 text-base">Danh Sách Phòng Thi Trực Tuyến</h3>
                <p className="text-xs text-slate-400">Chọn phòng thi để xem bài nộp và đưa vào Studio chấm tự luận</p>
              </div>
              <button
                onClick={loadOnlineRooms}
                className="p-2 text-teal-700 hover:bg-teal-50 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Làm mới
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {onlineRooms.map(r => (
                <div
                  key={r.id}
                  onClick={() => handleSelectRoom(r.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    selectedRoomId === r.id
                      ? 'border-teal-600 bg-teal-50/60 shadow-xs'
                      : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-xs text-slate-800">{r.name}</span>
                    <span className="text-[10px] font-mono font-bold bg-slate-200 px-1.5 py-0.5 rounded text-slate-700">
                      Mã: {r.room_code}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium truncate">{r.exams?.title || 'Đề thi'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Danh sách bài nộp của phòng thi */}
          {selectedRoomId && (
            <div className="bg-white p-5 rounded-3xl border border-teal-100 shadow-xs space-y-4">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-600" />
                Danh Sách Bài Nộp ({roomSubmissions.length} học sinh)
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3 text-left">Học sinh</th>
                      <th className="py-2.5 px-3 text-left">Mã HS</th>
                      <th className="py-2.5 px-3 text-left">Điểm đã có</th>
                      <th className="py-2.5 px-3 text-left">Thời gian nộp</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {roomSubmissions.map(sub => (
                      <tr key={sub.id} className="hover:bg-teal-50/40 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-800">{sub.students?.full_name || 'Học sinh'}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{sub.students?.student_code || '–'}</td>
                        <td className="py-2.5 px-3 font-extrabold text-teal-800">{sub.score?.toFixed(2) || '0.00'} đ</td>
                        <td className="py-2.5 px-3 text-slate-400">{sub.submitted_at ? new Date(sub.submitted_at).toLocaleTimeString('vi-VN') : '–'}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => loadSubmissionIntoStudio(sub)}
                            className="bg-teal-700 hover:bg-teal-800 text-white font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-xs"
                          >
                            ✍️ Chấm bài này
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: QUÉT PHIẾU CHẤM AI HÀNG LOẠT (OCR) ── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === 2 && (
        <div className="bg-white p-6 rounded-3xl border border-teal-100 shadow-xs space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-600" />
            <h3 className="font-black text-slate-800 text-base">Quét Phiếu Trắc Nghiệm Bằng Trí Tuệ Nhân Tạo</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Thầy có thể chụp ảnh phiếu trả lời trắc nghiệm giấy của cả lớp và tải lên. AI sẽ tự động đọc các ô tô A, B, C, D, Đúng/Sai, Điền số và tính điểm tự động.
          </p>
          <div className="p-8 border-2 border-dashed border-teal-200 rounded-2xl bg-teal-50/30 text-center space-y-3">
            <UploadCloud className="w-10 h-10 text-teal-600 mx-auto" />
            <p className="font-extrabold text-sm text-teal-900">Kéo thả ảnh phiếu trả lời hoặc bấm để chọn ảnh</p>
            <input type="file" accept="image/*" multiple className="hidden" id="mass-upload" />
            <label htmlFor="mass-upload" className="inline-block bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer shadow-xs">
              Chọn ảnh phiếu học sinh
            </label>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 3: CẤU HÌNH ĐÁP ÁN & THANG ĐIỂM ── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === 3 && (
        <div className="bg-white p-6 rounded-3xl border border-teal-100 shadow-xs space-y-6 animate-fade-in">
          <div>
            <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-teal-600" />
              Cấu Hình Đáp Án Chuẩn & Trọng Số Điểm
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Nhập đáp án chuẩn của đề thi để máy tự động so khớp và tính điểm cho học sinh.
            </p>
          </div>

          {/* Ô nhập Gemini API Key */}
          <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl space-y-1.5">
            <label className="text-xs font-black text-amber-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              Gemini API Key (Dùng để AI chấm chữ viết tay tự luận):
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Nhập khóa API bắt đầu bằng AIzaSy..."
              className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-teal-600"
            />
          </div>

          {/* Trọng số điểm 4 phần */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: 'p1', label: 'Phần I (Trắc nghiệm)', val: weights.p1 },
              { id: 'p2', label: 'Phần II (Đúng/Sai)', val: weights.p2 },
              { id: 'p3', label: 'Phần III (Trả lời ngắn)', val: weights.p3 },
              { id: 'p4', label: 'Phần IV (Tự luận)', val: weights.p4 },
            ].map(w => (
              <div key={w.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-600 block mb-1">{w.label}</span>
                <input
                  type="number"
                  step="0.5"
                  value={w.val}
                  onChange={e => setWeights(prev => ({ ...prev, [w.id]: Number(e.target.value) || 0 }))}
                  className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-sm font-black text-teal-800"
                />
              </div>
            ))}
          </div>

          {/* Nội dung đáp án */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-700 uppercase">
              Cấu trúc đáp án (.txt):
            </label>
            <textarea
              rows={10}
              value={keyRaw}
              onChange={e => setKeyRaw(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 font-mono text-xs text-slate-800 focus:outline-teal-600 leading-relaxed"
            />
            <button
              onClick={() => {
                const parsed = parseAnswerKey(keyRaw);
                setAnswerKey(parsed);
                if (parsed.p4) setP4Rubric(parsed.p4);
                toast.success('Đã lưu và áp dụng cấu hình đáp án mới!');
              }}
              className="bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-xs"
            >
              Áp dụng đáp án này
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
