// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Room, Exam, StudentInfo, Submission, Question, QuestionOption } from '../types';
import { ensureSignedIn, createSubmission, submitExam, saveAnswersProgress } from '../services/submissionService';
import { getTabDetectionService } from '../services/tabDetectionService';
import { useExamSession, generateSessionId } from '../services/sessionService';
import MathText from './MathText';
import EssayQuestionInput from './EssayQuestionInput';
import { hasEssayAnswer } from '../services/essayGradingService';

// ✅ Import Icon cực đẹp từ Lucide
import { List, CheckCircle2, Type, FileEdit, Check as CheckIcon, X as XIcon } from 'lucide-react';

// ─── Seeded shuffle (Fisher-Yates với seed đơn giản) ─────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  const rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function strToSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

export function parseTFAnswer(answer?: string): Record<string, 'T' | 'F'> {
  const map: Record<string, 'T' | 'F'> = {};
  if (!answer || !answer.trim()) return map;
  try {
    const parsed = JSON.parse(answer);
    if (typeof parsed === 'object' && parsed !== null) {
      for (const [key, val] of Object.entries(parsed)) {
        map[key.toLowerCase()] = val === true ? 'T' : 'F';
      }
      return map;
    }
  } catch {}
  for (const part of answer.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (part.includes(':')) {
      const [letter, val] = part.split(':');
      if (letter && (val === 'T' || val === 'F')) {
        map[letter.toLowerCase()] = val as 'T' | 'F';
      }
    } else {
      if (part) map[part.toLowerCase()] = 'T';
    }
  }
  return map;
}

export function serializeTFAnswer(map: Record<string, 'T' | 'F'>): string {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, val]) => `${letter}:${val}`)
    .join(',');
}

export function isTFFullyAnswered(answer: string | undefined, options: Array<{ letter: string }>): boolean {
  if (!answer) return false;
  const map = parseTFAnswer(answer);
  return options.every((opt) => map[opt.letter.toLowerCase()] !== undefined);
}

// ─────────────────────────────────────────────────────────────────────────────

interface ExamRoomProps {
  room: Room;
  exam: Exam;
  student: StudentInfo;
  existingSubmissionId?: string;
  initialAnswers?: Record<number, string>;
  onSubmitted: (submission: Submission) => void;
  onExit: () => void;
}

const ExamRoom: React.FC<ExamRoomProps> = ({ room, exam, student, existingSubmissionId, initialAnswers, onSubmitted, onExit }) => {
  const [submissionId, setSubmissionId] = useState<string | null>(existingSubmissionId || null);
  const [userAnswers, setUserAnswers] = useState<{ [key: number]: string }>(initialAnswers || {});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [tabSwitchWarnings, setTabSwitchWarnings] = useState<Date[]>([]);
  const [showTabWarning, setShowTabWarning] = useState(false);

  const [mySessionId] = useState<string>(() => generateSessionId());
  const [isKicked, setIsKicked] = useState(false);
  const [kickedByDevice, setKickedByDevice] = useState('');

  const limit = room.timeLimit || (room as any).time_limit || 45;
  const closesAtStr = (room as any).closes_at || room.closesAt;
  const closesAtMs = closesAtStr ? new Date(closesAtStr).getTime() : null;

  // ✅ FIX: Chỉ xáo phương án khi phòng BẬT xáo trộn (settings.shuffle === true).
  // Trước đây QuestionCard luôn xáo phương án A/B/C/D bất kể cài đặt phòng,
  // khiến phòng "không xáo" vẫn bị đảo vị trí đáp án.
  const shuffleEnabled = (room as any).settings?.shuffle === true;

  const [timeLeft, setTimeLeft] = useState(() => {
    if (closesAtMs) return Math.max(0, Math.floor((closesAtMs - Date.now()) / 1000));
    return limit * 60;
  });

  const isSubmittingRef = useRef(false);

  const handleSubmit = useCallback(async (force = false, auto = false) => {
    if (!force && !showConfirmSubmit) { setShowConfirmSubmit(true); return; }
    if (!exam || !submissionId || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setShowConfirmSubmit(false);

    // FIX: Convert Date[] sang ISO string[] truoc khi gui Supabase
    // (Date object khong serialize dung vao JSONB -> co the gay treo request)
    const safeWarnings = (tabSwitchWarnings || []).map((d: any) =>
      d instanceof Date ? d.toISOString() : String(d)
    );

    // FIX: Timeout 20s -- neu Supabase khong phan hoi, tu mo khoa nut
    const TIMEOUT_MS = 20_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
    );

    try {
      const submission = await Promise.race([
        submitExam(submissionId, userAnswers, exam, {
          tabSwitchCount,
          tabSwitchWarnings: safeWarnings as any,
          autoSubmitted: auto,
          duration: (limit * 60) - timeLeft
        }),
        timeoutPromise
      ]);

      if (submission) {
        const breakdown = submission.score_breakdown || {};
        const totalCorrect =
          (breakdown.multipleChoice?.correct || 0) +
          (breakdown.trueFalse?.correct || 0) +
          (breakdown.shortAnswer?.correct || 0);

        const formatted = {
          ...submission,
          student,
          percentage: breakdown.percentage || 0,
          totalScore: submission.score || breakdown.totalScore || 0,
          correctCount: totalCorrect,
          wrongCount: exam.questions.length - totalCorrect,
          totalQuestions: exam.questions.length,
          scoreBreakdown: breakdown,
          answers: submission.answers
        };
        onSubmitted(formatted);
      } else {
        console.warn('submitExam returned null');
        alert('Khong the nop bai. Vui long thu lai.');
      }
    } catch (err: any) {
      console.error('Submit error:', err);
      if (err?.message === 'TIMEOUT') {
        alert('Ket noi cham! Bai lam co the da duoc luu.\nHay bam "Nop bai" lai de kiem tra.');
      } else {
        const msg = err?.message || err?.code || JSON.stringify(err);
        alert('Loi nop bai: ' + msg + '\nVui long thu lai.');
      }
    } finally {
      // LUON mo khoa nut du thanh cong hay that bai
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [exam, submissionId, userAnswers, tabSwitchCount, tabSwitchWarnings, timeLeft]);

  const { reportTabSwitch, reportViolation, updateProgress, submitSession } = useExamSession({
    roomId: room.id, studentId: student.id, studentName: student.name,
    sessionId: mySessionId, className: student.className, totalQuestions: exam?.questions?.length ?? 0,
    onKicked: (deviceInfo) => { setKickedByDevice(deviceInfo); setIsKicked(true); },
  });

  useEffect(() => {
    if (existingSubmissionId) return;
    const init = async () => {
      try {
        await ensureSignedIn();
        const newId = await createSubmission({ roomId: room.id, roomCode: room.code, examId: exam.id, student });
        setSubmissionId(newId);
      } catch (err) { console.error('Error creating submission:', err); }
    };
    init();
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft((p) => {
        if (p <= 1) { submitSession(); handleSubmit(true, true); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const tabService = getTabDetectionService();
    tabService.start({
      onTabSwitch: (count: number, warnings: Date[]) => {
        setTabSwitchCount(count); setTabSwitchWarnings(warnings);
        setShowTabWarning(true); setTimeout(() => setShowTabWarning(false), 5000);
        reportTabSwitch();
      },
      onAutoSubmit: () => {
        reportViolation({ type: 'auto_submit', timestamp: new Date().toISOString(), detail: 'Chuyển tab quá nhiều lần' });
        submitSession(); handleSubmit(true, true);
      }
    });
    return () => tabService.stop();
  }, []);

  // Tự động lưu tiến trình làm bài có debounce (2 giây)
  useEffect(() => {
    if (!submissionId || isSubmitting) return;

    const timer = setTimeout(() => {
      void saveAnswersProgress(submissionId, userAnswers);
    }, 2000);

    return () => clearTimeout(timer);
  }, [userAnswers, submissionId, isSubmitting]);

  const formatMMSS = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const formatTimeHuman = (s: number): { line1: string; line2?: string } => {
    if (s <= 0) return { line1: '0:00' };
    const days = Math.floor(s / 86400); const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60); const secs = s % 60;
    if (days >= 1) return { line1: `${days} ngày ${hours}h`, line2: `${mins}p ${secs.toString().padStart(2, '0')}s` };
    if (hours >= 1) return { line1: `${hours}h ${mins.toString().padStart(2, '0')}m`, line2: `${secs.toString().padStart(2, '0')}s` };
    return { line1: `${mins}:${secs.toString().padStart(2, '0')}` };
  };

  const handleAnswerChange = (qNum: number, ans: string) => setUserAnswers((prev) => ({ ...prev, [qNum]: ans }));

  const shuffleSeed = useMemo(() => strToSeed(`${student.id}|${room.id}|${submissionId ?? 'init'}`), [student.id, room.id, submissionId]);

  const groupedQuestions = useMemo(() => {
    if (!exam?.questions) return [];
    const groups: any[] = [];
    
    const mc = exam.questions.filter(q => q.type === 'multiple_choice');
    const tf = exam.questions.filter(q => q.type === 'true_false');
    const sa = exam.questions.filter(q => q.type === 'short_answer');
    const wr = exam.questions.filter(q => q.type === 'writing');

    // Numbering resets per section (Câu 1..N)
    if (mc.length > 0) {
      groups.push({ part: 1, title: 'PHẦN 1. TRẮC NGHIỆM', desc: 'Chọn một phương án đúng A, B, C hoặc D',
        questions: mc.map((q, idx) => ({ q, displayNum: (q.number % 100) || (idx + 1) }))
      });
    }
    if (tf.length > 0) {
      groups.push({ part: 2, title: 'PHẦN 2. ĐÚNG SAI', desc: 'Chọn Đúng hoặc Sai cho mỗi mệnh đề',
        questions: tf.map((q, idx) => ({ q, displayNum: (q.number % 100) || (idx + 1) }))
      });
    }
    if (sa.length > 0) {
      groups.push({ part: 3, title: 'PHẦN 3. TRẢ LỜI NGẮN', desc: 'Điền đáp án số vào ô trống',
        questions: sa.map((q, idx) => ({ q, displayNum: (q.number % 100) || (idx + 1) }))
      });
    }
    if (wr.length > 0) {
      groups.push({ part: 4, title: 'PHẦN 4. TỰ LUẬN', desc: 'Viết bài giải chi tiết, đính kèm ảnh chụp',
        questions: wr.map((q, idx) => ({ q, displayNum: (q.number % 100) || (idx + 1) }))
      });
    }

    return groups;
  }, [exam]);

  const answeredCount = useMemo(() => {
    if (!exam?.questions) return 0;
    return exam.questions.filter((q) => {
      const ans = userAnswers[q.number];
      if (!ans) return false;
      const qType = q.type || 'multiple_choice';
      if (qType === 'true_false') return isTFFullyAnswered(ans, q.options || []);
      return true;
    }).length;
  }, [exam, userAnswers]);

  useEffect(() => { updateProgress(answeredCount, timeLeft); }, [answeredCount, timeLeft, updateProgress]);

  const totalQuestions = exam?.questions.length || 0;
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <DynamicWatermark studentId={student.id} studentName={student.name} roomCode={room.code} />

      {isKicked && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl animate-bounce">
            <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5 text-5xl">📱</div>
            <h2 className="text-2xl font-bold text-red-700 mb-3">Phiên thi bị ngắt!</h2>
            <p className="text-gray-600 mb-2">Tài khoản đăng nhập trên thiết bị khác:</p>
            <div className="px-4 py-3 bg-gray-100 rounded-xl mb-4 font-semibold">{kickedByDevice}</div>
            <button onClick={onExit} className="w-full py-3 rounded-xl font-bold text-white bg-red-600">Thoát</button>
          </div>
        </div>
      )}

      {/* ─── Sticky Header ─── */}
      <div className="sticky top-0 z-50 shadow-xl" style={{ background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold text-white">
                {(student?.name || 'HS').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-white leading-tight">{student?.name || 'Học sinh'}</p>
                <p className="text-xs text-teal-100">Mã: <span className="font-mono font-semibold">{room.code}</span></p>
              </div>
            </div>
            <div className={`px-4 py-2 rounded-xl text-center min-w-[100px] ${timeLeft < 60 ? 'bg-red-500 animate-pulse' : 'bg-white/15'}`}>
              <div className="text-[10px] text-teal-100 leading-none mb-0.5">⏱ Còn lại</div>
              <div className="text-2xl font-mono font-bold text-white leading-tight">{formatTimeHuman(timeLeft).line1}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-teal-100 mb-1">
                <span className="font-medium">✍️ {answeredCount}/{totalQuestions} câu</span>
                <span className="font-bold text-white">{Math.round(progress)}%</span>
              </div>
              <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <button
              onClick={() => { if (!isSubmitting) setShowConfirmSubmit(true); }}
              disabled={isSubmitting || !submissionId}
              className={`flex items-center gap-2 px-5 py-2 rounded-full font-bold text-sm text-white shadow-lg transition-all ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-amber-400 to-orange-500 hover:scale-105'}`}
            >
              {isSubmitting
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />Đang nộp...</>
                : <>📤 Nộp bài</>}
            </button>
          </div>
        </div>
      </div>

      {showTabWarning && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-bounce bg-red-500 text-white px-6 py-3 rounded-xl shadow-2xl font-bold text-sm">
          ⚠️ CẢNH BÁO: Phát hiện chuyển tab! ({tabSwitchCount}/2)
        </div>
      )}

      {/* ─── Main Content ─── */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden mb-6">
          <div className="px-6 py-5 text-center bg-gradient-to-r from-teal-500 to-teal-700">
            <h1 className="text-xl font-bold text-white">{exam?.title || 'Đề thi'}</h1>
          </div>
        </div>

        <div className="space-y-8">
          {groupedQuestions.map((group) => {
            // ✅ Phân tách màu nền rõ ràng cho từng phần (Title)
            const partColors = {
              1: 'bg-gradient-to-r from-blue-600 to-indigo-700 border-blue-400',
              2: 'bg-gradient-to-r from-teal-600 to-emerald-700 border-teal-400',
              3: 'bg-gradient-to-r from-amber-500 to-orange-600 border-amber-300',
              4: 'bg-gradient-to-r from-purple-600 to-fuchsia-700 border-purple-400',
            };
            const bgClass = partColors[group.part as keyof typeof partColors] || 'bg-gradient-to-r from-gray-600 to-gray-700 border-gray-400';

            return (
              <div key={group.part}>
                <div className={`${bgClass} rounded-2xl p-4 mb-5 shadow-lg text-white border-b-4`}>
                  <h2 className="font-black text-lg tracking-wide">{group.title}</h2>
                  <p className="text-white/90 text-sm mt-1 font-medium">{group.desc}</p>
                </div>
                <div className="space-y-4">
                  {group.questions.map(({ q, displayNum }) => (
                    <QuestionCard
                      key={q.number}
                      question={q}
                      displayNum={displayNum}
                      userAnswer={userAnswers[q.number]}
                      onChange={(ans) => handleAnswerChange(q.number, ans)}
                      shuffleSeed={shuffleSeed + q.number}
                      shuffleEnabled={shuffleEnabled}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Confirm Submit Modal ─── */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <h3 className="text-xl font-bold text-gray-800 mb-2">Xác nhận nộp bài?</h3>
            <p className="text-gray-500 text-sm">Đã trả lời <strong className="text-teal-600">{answeredCount}/{totalQuestions}</strong> câu</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowConfirmSubmit(false)} className="flex-1 py-3 rounded-xl font-semibold text-gray-600 bg-gray-100">Tiếp tục làm</button>
              <button
                onClick={() => { submitSession(); handleSubmit(true); }}
                disabled={isSubmitting}
                className={`flex-1 py-3 rounded-xl font-bold text-white transition-all ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'}`}
              >
                {isSubmitting
                  ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />Đang nộp bài...</span>
                  : '🚀 Nộp bài!'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamRoom;

// ============================================================
// QUESTION CARD & OTHERS
// ============================================================

const QuestionCard: React.FC<any> = ({ question, displayNum, userAnswer, onChange, shuffleSeed = 0, shuffleEnabled = false }) => {
  const qType = question.type || 'multiple_choice';
  const isAnswered = qType === 'true_false' ? isTFFullyAnswered(userAnswer, question.options || []) : qType === 'writing' ? hasEssayAnswer(userAnswer) : !!userAnswer;
  const questionImages = question.images || [];

  const imageUrls = useMemo(() => {
    return questionImages.map((img: any) => {
      if (img.base64) {
        const contentType = img.contentType || 'image/png';
        return img.base64.startsWith('data:') ? img.base64 : `data:${contentType};base64,${img.base64}`;
      }
      return null;
    }).filter(Boolean);
  }, [questionImages]);

  const shuffledOptions = useMemo(() => {
    if (!question.options) return [];
    // ✅ FIX: Phòng KHÔNG bật xáo trộn → giữ nguyên thứ tự phương án gốc.
    if (!shuffleEnabled) return question.options;
    if (qType === 'multiple_choice') return seededShuffle(question.options, shuffleSeed);
    if (qType === 'true_false') {
      const dOpt = question.options.find((o: any) => o.letter.toLowerCase() === 'd');
      const movable = question.options.filter((o: any) => o.letter.toLowerCase() !== 'd');
      const shuffled = seededShuffle(movable, shuffleSeed);
      return dOpt ? [...shuffled, dOpt] : shuffled;
    }
    return question.options;
  }, [question.options, qType, shuffleSeed, shuffleEnabled]);

  // ✅ Định dạng Icon và Label theo loại câu hỏi
  const TypeBadge = {
    multiple_choice: { icon: <List className="w-3.5 h-3.5" />, label: 'Trắc nghiệm', color: 'text-blue-700 bg-blue-100 border-blue-300' },
    true_false: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'Đúng / Sai', color: 'text-teal-700 bg-teal-100 border-teal-300' },
    short_answer: { icon: <Type className="w-3.5 h-3.5" />, label: 'Trả lời ngắn', color: 'text-amber-700 bg-amber-100 border-amber-300' },
    writing: { icon: <FileEdit className="w-3.5 h-3.5" />, label: 'Tự luận', color: 'text-purple-700 bg-purple-100 border-purple-300' },
  }[qType as keyof typeof TypeBadge];

  return (
    <div className={`bg-white rounded-2xl border-2 overflow-hidden shadow-sm ${isAnswered ? 'border-teal-400' : 'border-gray-200'}`}>
      
      {/* ✅ Bổ sung header mới: Chữ "Câu X" và Nhãn phân loại */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-slate-50">
        <div className="flex items-center gap-3">
          <div className={`px-4 py-1.5 rounded-lg font-black text-sm text-white shadow-sm ${isAnswered ? 'bg-teal-500' : 'bg-gray-500'}`}>
            Câu {displayNum}
          </div>
          {TypeBadge && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold ${TypeBadge.color}`}>
              {TypeBadge.icon} {TypeBadge.label}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        {/* Nội dung câu hỏi */}
        {(() => {
          let cleanText = (question.text || '').trim();
          cleanText = cleanText.replace(/^(<strong>)?Câu\s*\d+\s*[.:]?(<\/strong>)?\s*/i, '');
          cleanText = cleanText
            .replace(/([.:;?!,])\s*(\([a-e]\))/g, '$1<br/>$2')
            .replace(/([.:;?!,])\s*(\([1-6]\))/g, '$1<br/>$2')
            .replace(/([.:;?!,])\s*(Bước\s*\d+[:.])/gi, '$1<br/>$2')
            .replace(/([.:;?!,])\s*(Phần\s*\d+[:.])/gi, '$1<br/>$2')
            .replace(/([.:;?!])\s*(Số\s*phát\s*biểu|Các\s*biện\s*pháp|Liệt\s*kê\s*các|Xác\s*định\s*%)/gi, '$1<br/>$2');

          return (
            <MathText html={cleanText} className="text-gray-800 leading-relaxed text-[15px] mb-3" block />
          );
        })()}
        
        {imageUrls.map((url: string, idx: number) => (
          <img key={idx} src={url} alt={`Hình ${idx + 1}`} className="max-w-full h-auto mt-3 mb-4 rounded-lg border border-gray-200 mx-auto max-h-[300px]" />
        ))}

        <div className="pt-2">
          {qType === 'multiple_choice' && (
            <div className="space-y-2.5">
              {shuffledOptions.map((opt: any, idx: number) => {
                const displayLetter = String.fromCharCode(65 + idx);
                const selected = userAnswer?.toUpperCase() === opt.letter.toUpperCase();
                return (
                  <label key={opt.letter} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer ${selected ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                    <input type="radio" value={opt.letter} checked={selected} onChange={(e) => onChange(e.target.value)} className="hidden" />
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white ${selected ? 'bg-amber-400' : 'bg-teal-500'}`}>{displayLetter}</span>
                    <MathText html={opt.text || ''} className="flex-1 text-gray-700 text-sm" />
                  </label>
                );
              })}
            </div>
          )}
          {qType === 'true_false' && <TrueFalseGrid options={shuffledOptions} userAnswer={userAnswer} onChange={onChange} />}
          {qType === 'short_answer' && (
            <input type="text" value={userAnswer || ''} onChange={(e) => onChange(e.target.value)} placeholder="Nhập đáp án số..." className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-teal-400 outline-none font-bold text-gray-700" />
          )}
          {qType === 'writing' && <EssayQuestionInput value={userAnswer} onChange={onChange} maxImages={3} />}
        </div>
      </div>
    </div>
  );
};

// ✅ NÂNG CẤP BẢNG ĐÚNG/SAI
const TrueFalseGrid: React.FC<any> = ({ options, userAnswer, onChange }) => {
  const tfMap = useMemo(() => parseTFAnswer(userAnswer), [userAnswer]);
  
  const handleSelect = (letter: string, val: 'T' | 'F') => {
    const current = { ...tfMap }; const key = letter.toLowerCase();
    if (current[key] === val) delete current[key]; else current[key] = val;
    onChange(serializeTFAnswer(current));
  };

  return (
    <div className="rounded-xl border-2 border-teal-600 overflow-hidden shadow-sm mt-3">
      {/* HEADER BẢNG MÀU TEAL */}
      <div className="grid grid-cols-[1fr_70px_70px] sm:grid-cols-[1fr_90px_90px] bg-teal-600 text-xs font-black text-white uppercase divide-x-2 divide-teal-500 border-b-2 border-teal-600">
        <div className="px-4 py-3 flex items-center">Mệnh đề</div>
        <div className="py-3 flex items-center justify-center gap-1"><CheckIcon className="w-4 h-4"/> Đúng</div>
        <div className="py-3 flex items-center justify-center gap-1"><XIcon className="w-4 h-4"/> Sai</div>
      </div>
      
      {/* CÁC DÒNG MỆNH ĐỀ */}
      <div className="divide-y-2 divide-teal-100">
        {options.map((opt: any, idx: number) => {
          const displayLetter = String.fromCharCode(97 + idx); // a, b, c, d
          const cVal = tfMap[opt.letter.toLowerCase()];
          
          return (
            <div key={opt.letter} className="grid grid-cols-[1fr_70px_70px] sm:grid-cols-[1fr_90px_90px] bg-white divide-x-2 divide-teal-100 hover:bg-teal-50/30 transition-colors">
              
              <div className="px-4 py-4 flex gap-3 items-start">
                <span className="w-7 h-7 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-[13px] font-black shrink-0 shadow-sm border border-teal-100">
                  {displayLetter}
                </span>
                <MathText html={opt.text || ''} className="flex-1 text-[15px] pt-0.5 text-gray-800" />
              </div>

              {/* NÚT ĐÚNG: Nút nhỏ, tinh tế */}
              <button 
                onClick={() => handleSelect(opt.letter, 'T')} 
                className={`flex items-center justify-center transition-all outline-none hover:bg-emerald-50 ${cVal === 'T' ? 'bg-emerald-500 text-white shadow-inner' : 'text-gray-300'}`}
              >
                {cVal === 'T' ? <CheckIcon className="w-6 h-6 stroke-[3]" /> : ''}
              </button>

              {/* NÚT SAI: Nút nhỏ, tinh tế */}
              <button 
                onClick={() => handleSelect(opt.letter, 'F')} 
                className={`flex items-center justify-center transition-all outline-none hover:bg-red-50 ${cVal === 'F' ? 'bg-red-500 text-white shadow-inner' : 'text-gray-300'}`}
              >
                {cVal === 'F' ? <XIcon className="w-6 h-6 stroke-[3]" /> : ''}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const DynamicWatermark: React.FC<any> = ({ studentId, studentName, roomCode }) => (
  <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden opacity-[0.06] select-none text-black font-black text-2xl md:text-4xl whitespace-nowrap tracking-widest flex flex-col justify-between">
    <div style={{ transform: 'rotate(-30deg) translate(-20%, 50%)' }}>{studentId} - {studentName} - {roomCode}</div>
    <div style={{ transform: 'rotate(-30deg) translate(20%, -50%)' }}>{studentId} - {studentName} - {roomCode}</div>
  </div>
);
