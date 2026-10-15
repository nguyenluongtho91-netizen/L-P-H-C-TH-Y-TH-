// @ts-nocheck
// src/components/PDFExamCreator.tsx
// Wizard tạo đề thi từ file PDF — 5 bước
// ✅ Tích hợp: Tự luận, Lời giải (Split/Full), Import đáp án TXT & Màu sắc mới
// ✅ CẬP NHẬT: Sử dụng SUPABASE STORAGE thay cho Google Drive

import React, { useState, useRef, useCallback } from 'react';
import { Exam, Question, ExamSection, ExamPointsConfig, SectionPointsConfig, QuestionSolutionRange } from '../types';
import PointsConfigEditor from './PointsConfigEditor';
import { uploadPdfToSupabase, SupabaseUploadResult } from '../services/supabaseService';

// ─── Types nội bộ ────────────────────────────────────────────────────────────

interface PDFExamConfig {
  title: string;
  timeLimit: number;
  mcCount: number;
  tfCount: number;
  saCount: number;
  writingCount: number;
}

type MCAnswers = { [qNum: number]: string };
type TFAnswers = { [qNum: number]: string[] };
type SAAnswers = { [qNum: number]: string };
type WritingAnswers = { [qNum: number]: string }; 
type SolutionRanges = { [qNum: number]: QuestionSolutionRange };
type SolutionMode = 'split' | 'full';

interface PDFExamCreatorProps {
  teacherId: string;
  teacherName: string;
  initialPdfFile?: File;
  onSave: (exam: Omit<Exam, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onCancel: () => void;
}

// ─── pdf.js loader ───────────────────────────────────────────────────────────

const loadPdfJs = (): Promise<any> =>
  new Promise((resolve, reject) => {
    const w = window as any;
    if (w.pdfjsLib) { resolve(w.pdfjsLib); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      w.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(w.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Không thể tải thư viện pdf.js từ CDN'));
    document.head.appendChild(script);
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mcRange(n: number) { return Array.from({ length: n }, (_, i) => i + 1); }
function tfRange(n: number) { return Array.from({ length: n }, (_, i) => 201 + i); }
function saRange(n: number) { return Array.from({ length: n }, (_, i) => 301 + i); }
function writingRange(n: number) { return Array.from({ length: n }, (_, i) => 401 + i); }

function buildDefaultPointsConfig(mc: number, tf: number, sa: number, writing: number): ExamPointsConfig {
  const sections: SectionPointsConfig[] = [];
  if (mc > 0) sections.push({ sectionId: 'part1', sectionName: 'PHẦN I. TRẮC NGHIỆM', questionType: 'multiple_choice', totalQuestions: mc, totalPoints: 3, pointsPerQuestion: parseFloat((3 / mc).toFixed(4)) });
  if (tf > 0) sections.push({ sectionId: 'part2', sectionName: 'PHẦN II. ĐÚNG SAI', questionType: 'true_false', totalQuestions: tf, totalPoints: 4, pointsPerQuestion: parseFloat((4 / tf).toFixed(4)), trueFalseMode: 'stepped' });
  if (sa > 0) sections.push({ sectionId: 'part3', sectionName: 'PHẦN III. TRẢ LỜI NGẮN', questionType: 'short_answer', totalQuestions: sa, totalPoints: 2, pointsPerQuestion: parseFloat((2 / sa).toFixed(4)) });
  if (writing > 0) sections.push({ sectionId: 'part4', sectionName: 'PHẦN IV. TỰ LUẬN', questionType: 'writing' as any, totalQuestions: writing, totalPoints: 1, pointsPerQuestion: parseFloat((1 / writing).toFixed(4)) });
  
  const totalPts = sections.reduce((acc, s) => acc + s.totalPoints, 0);
  return { maxScore: totalPts > 0 ? totalPts : 10, sections, autoBalance: false };
}

function buildExamData(config: PDFExamConfig, mcAns: MCAnswers, tfAns: TFAnswers, saAns: SAAnswers, writingAns: WritingAnswers) {
  const questions: Question[] = [];
  const answers: { [k: number]: string } = {};

  mcRange(config.mcCount).forEach(n => {
    const ans = mcAns[n] || '';
    questions.push({ number: n, text: `Câu ${n}`, type: 'multiple_choice', options: ['A', 'B', 'C', 'D'].map(l => ({ letter: l, text: l })), correctAnswer: ans || null, part: 'PHẦN I' });
    if (ans) answers[n] = ans;
  });
  
  tfRange(config.tfCount).forEach((n, idx) => {
    const cells = tfAns[n] || ['', '', '', ''];
    const tfMap: Record<string, boolean> = {};
    ['a', 'b', 'c', 'd'].forEach((lbl, i) => { tfMap[lbl] = cells[i] === 'Đ'; });
    const hasAnswer = cells.some(c => c === 'Đ' || c === 'S');
    questions.push({ number: n, text: `Câu ${idx + 1}`, type: 'true_false', options: [], correctAnswer: hasAnswer ? JSON.stringify(tfMap) : null, part: 'PHẦN II' });
    if (hasAnswer) answers[n] = JSON.stringify(tfMap);
  });
  
  saRange(config.saCount).forEach((n, idx) => {
    const ans = saAns[n] || '';
    questions.push({ number: n, text: `Câu ${idx + 1}`, type: 'short_answer', options: [], correctAnswer: ans || null, part: 'PHẦN III' });
    if (ans) answers[n] = ans;
  });
  
  writingRange(config.writingCount).forEach((n, idx) => {
    const ans = writingAns[n] || '';
    questions.push({ number: n, text: `Câu tự luận ${idx + 1}`, type: 'writing' as any, options: [], correctAnswer: null, solution: ans || undefined, part: 'PHẦN IV' });
  });

  const sections: ExamSection[] = [];
  if (config.mcCount > 0) sections.push({ name: 'PHẦN I. TRẮC NGHIỆM', description: `Thí sinh trả lời từ câu 1 đến câu ${config.mcCount}.`, points: '3', questions: questions.filter(q => q.part === 'PHẦN I'), sectionType: 'multiple_choice' });
  if (config.tfCount > 0) sections.push({ name: 'PHẦN II. ĐÚNG SAI', description: `Thí sinh trả lời từ câu 1 đến câu ${config.tfCount}.`, points: '4', questions: questions.filter(q => q.part === 'PHẦN II'), sectionType: 'true_false' });
  if (config.saCount > 0) sections.push({ name: 'PHẦN III. TRẢ LỜI NGẮN', description: `Thí sinh trả lời từ câu 1 đến câu ${config.saCount}.`, points: '2', questions: questions.filter(q => q.part === 'PHẦN III'), sectionType: 'short_answer' });
  if (config.writingCount > 0) sections.push({ name: 'PHẦN IV. TỰ LUẬN', description: `Thí sinh làm bài tự luận từ câu 1 đến câu ${config.writingCount}.`, points: '1', questions: questions.filter(q => q.part === 'PHẦN IV'), sectionType: 'writing' as any });
  
  return { questions, sections, answers };
}

// ─── StepIndicator (5 bước) ──────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  const labels = ['1.Đề thi', '2.Lời giải', '3.Số câu', '4.Đáp án', '5.Lưu'];
  return (
    <div className="flex items-center gap-0.5 mb-6 overflow-x-auto pb-1">
      {labels.map((label, i) => {
        const s = i + 1;
        const active = step === s, done = step > s;
        return (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold transition whitespace-nowrap
              ${active ? 'bg-teal-600 text-white' : done ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'}`}>
              <span>{done ? '✓' : s}</span>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < 4 && <div className="flex-1 h-0.5 bg-gray-200 mx-0.5 rounded min-w-[8px]" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Supabase Upload Button ──────────────────────────────────────────────────

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

interface SupabaseUploadBlockProps {
  label: string;
  pdfBase64: string;
  pdfFileName: string;
  pdfSizeKB: number;
  examTitle: string;
  result: SupabaseUploadResult | null;
  status: UploadStatus;
  error: string;
  onUpload: () => void;
  onReset: () => void;
}

function SupabaseUploadBlock({ label, pdfBase64, pdfFileName, pdfSizeKB, examTitle, result, status, error, onUpload, onReset }: SupabaseUploadBlockProps) {
  const borderCls = result
    ? 'border-emerald-400 bg-emerald-50'
    : status === 'error'
      ? 'border-red-300 bg-red-50'
      : 'border-teal-300 bg-teal-50';

  return (
    <div className={`rounded-xl border-2 p-4 mb-3 transition ${borderCls}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5">
          {result ? '✅' : status === 'error' ? '❌' : status === 'uploading' ? '⏫' : '⚡'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-800">{label}</p>
          
          {result && (
            <>
              <p className="text-xs text-emerald-700 mt-1">📁 Đã lưu trữ trên Supabase Cloud</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                🔗 <a href={result.fileUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-700">{result.fileUrl}</a>
              </p>
              {result.sizeBytes && <p className="text-xs text-gray-400">{Math.round(result.sizeBytes / 1024)} KB</p>}
              <button onClick={onReset} className="mt-2 text-xs text-gray-400 underline hover:text-gray-600">Upload lại</button>
            </>
          )}

          {status === 'uploading' && !result && (
            <p className="text-xs text-teal-700 mt-1 animate-pulse">⏳ Đang tải <strong>{pdfFileName}</strong> ({pdfSizeKB} KB) lên mây...</p>
          )}

          {status === 'error' && (
            <>
              <p className="text-xs text-red-700 mt-1 whitespace-pre-wrap break-words">{error}</p>
              <button onClick={onUpload} className="mt-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700">Thử lại</button>
            </>
          )}

          {status === 'idle' && !result && (
            <>
              <p className="text-xs text-gray-500 mt-1">
                <strong>{pdfFileName}</strong> ({pdfSizeKB} KB) — Tốc độ cao, không bị chặn.
              </p>
              <button onClick={onUpload} disabled={!pdfBase64}
                className="mt-2 px-4 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-40 flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Tải lên Supabase
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENT CHÍNH ─────────────────────────────────────────────────────────

const PDFExamCreator: React.FC<PDFExamCreatorProps> = ({ teacherId, teacherName, initialPdfFile, onSave, onCancel }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [isSaving, setIsSaving] = useState(false);
  
  // Ref cho Import đáp án
  const answerFileInputRef = useRef<HTMLInputElement>(null);

  // ── Bước 1: PDF đề thi ──
  const [pdfBase64, setPdfBase64] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfSizeKB, setPdfSizeKB] = useState(0);
  const [config, setConfig] = useState<PDFExamConfig>({ title: '', timeLimit: 90, mcCount: 12, tfCount: 4, saCount: 6, writingCount: 0 });
  const examFileRef = useRef<HTMLInputElement>(null);

  // ── Bước 2: PDF lời giải + detect ──
  const [solutionBase64, setSolutionBase64] = useState('');
  const [solutionFileName, setSolutionFileName] = useState('');
  const [solutionSizeKB, setSolutionSizeKB] = useState(0);
  const [solutionMode, setSolutionMode] = useState<SolutionMode>('split');
  const [solutionTotalPages, setSolutionTotalPages] = useState(0);
  const [questionSolutions, setQuestionSolutions] = useState<SolutionRanges>({});
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState('');
  const [detectDone, setDetectDone] = useState(false);
  const [addManualQ, setAddManualQ] = useState('');
  const solutionFileRef = useRef<HTMLInputElement>(null);

  // ── Bước 4: Đáp án ──
  const [mcAnswers, setMcAnswers] = useState<MCAnswers>({});
  const [tfAnswers, setTfAnswers] = useState<TFAnswers>({});
  const [saAnswers, setSaAnswers] = useState<SAAnswers>({});
  const [writingAnswers, setWritingAnswers] = useState<WritingAnswers>({});

  // ── Bước 5: Supabase + Điểm + Lưu ──
  const [pointsConfig, setPointsConfig] = useState<ExamPointsConfig | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState('');
  const [driveResult, setDriveResult] = useState<SupabaseUploadResult | null>(null);
  
  const [solUploadStatus, setSolUploadStatus] = useState<UploadStatus>('idle');
  const [solUploadError, setSolUploadError] = useState('');
  const [solDriveResult, setSolDriveResult] = useState<SupabaseUploadResult | null>(null);

  // ─── File handlers ──────────────────────────────────────────────────────────

  const handleExamFile = useCallback((file: File) => {
    if (file.type !== 'application/pdf') { alert('Vui lòng chọn file PDF hợp lệ.'); return; }
    if (file.size > 50 * 1024 * 1024) { alert('File quá lớn (tối đa 50 MB).'); return; }
    setDriveResult(null); setUploadStatus('idle'); setUploadError('');
    const r = new FileReader();
    r.onload = (e) => {
      const res = e.target?.result as string;
      setPdfBase64(res.split(',')[1]);
      setPdfFileName(file.name);
      setPdfSizeKB(Math.round(file.size / 1024));
    };
    r.readAsDataURL(file);
  }, []);

  // Tự động load file PDF nếu được truyền từ trang ngoài (ví dụ nút Tải lên từ PDF)
  React.useEffect(() => {
    if (initialPdfFile) {
      handleExamFile(initialPdfFile);
    }
  }, [initialPdfFile, handleExamFile]);

  const handleDropExam = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleExamFile(file);
  }, [handleExamFile]);

  const handleSolutionFile = useCallback((file: File) => {
    if (file.type !== 'application/pdf') { alert('Vui lòng chọn file PDF hợp lệ.'); return; }
    if (file.size > 50 * 1024 * 1024) { alert('File quá lớn (tối đa 50 MB).'); return; }
    setSolDriveResult(null); setSolUploadStatus('idle'); setSolUploadError('');
    setDetectDone(false); setDetectError(''); setQuestionSolutions({});
    const r = new FileReader();
    r.onload = (e) => {
      const res = e.target?.result as string;
      setSolutionBase64(res.split(',')[1]);
      setSolutionFileName(file.name);
      setSolutionSizeKB(Math.round(file.size / 1024));
    };
    r.readAsDataURL(file);
  }, []);

  const handleDropSolution = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleSolutionFile(file);
  }, [handleSolutionFile]);

  // ─── Auto-detect câu bằng Regex + pdf.js ────────────────────────────────────

  const handleDetect = async () => {
    if (!solutionBase64) return;
    setIsDetecting(true);
    setDetectError('');
    setDetectDone(false);
    try {
      const lib = await loadPdfJs();
      const raw = atob(solutionBase64);
      const buf = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);

      const pdf = await lib.getDocument({ data: buf }).promise;
      const numPages: number = pdf.numPages;
      setSolutionTotalPages(numPages);

      const firstPage = new Map<number, number>();

      for (let p = 1; p <= numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const text: string = content.items.map((it: any) => it.str || '').join(' ');

        const re = /C[âa]u\s*(\d+)\s*[.:\)]/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const qn = parseInt(m[1], 10);
          if (qn > 0 && qn <= 200 && !firstPage.has(qn)) {
            firstPage.set(qn, p);
          }
        }
      }

      const sorted = [...firstPage.entries()].sort((a, b) => a[0] - b[0]);
      const ranges: SolutionRanges = {};
      sorted.forEach(([qn, sp], idx) => {
        const nextSp = idx < sorted.length - 1 ? sorted[idx + 1][1] : numPages + 1;
        ranges[qn] = {
          pageStart: sp,
          pageEnd: Math.max(sp, nextSp - 1),
        };
      });

      setQuestionSolutions(ranges);
      setDetectDone(true);

      if (Object.keys(ranges).length === 0) {
        setDetectError(
          'Không tìm thấy "Câu X." trong PDF. Có thể do PDF là ảnh scan (không có text), ' +
          'hoặc định dạng câu hỏi khác. Hãy thêm câu thủ công bên dưới hoặc đổi sang Chế độ Hiển thị Nguyên bản.'
        );
      }
    } catch (err: any) {
      setDetectError('Lỗi phân tích PDF: ' + (err?.message || 'không xác định'));
    } finally {
      setIsDetecting(false);
    }
  };

  const updateRange = (qn: number, field: 'pageStart' | 'pageEnd', val: number) => {
    const clamped = Math.max(1, Math.min(solutionTotalPages || 999, val));
    setQuestionSolutions(prev => ({
      ...prev,
      [qn]: { ...prev[qn], [field]: clamped },
    }));
  };

  const removeQuestion = (qn: number) => {
    setQuestionSolutions(prev => {
      const next = { ...prev };
      delete next[qn];
      return next;
    });
  };

  const addManualQuestion = () => {
    const qn = parseInt(addManualQ, 10);
    if (!qn || qn <= 0 || qn > 200) { alert('Số câu không hợp lệ (1–200)'); return; }
    if (questionSolutions[qn]) { alert(`Câu ${qn} đã có rồi`); return; }
    setQuestionSolutions(prev => ({
      ...prev,
      [qn]: { pageStart: 1, pageEnd: Math.min(1, solutionTotalPages || 1) },
    }));
    setAddManualQ('');
  };

  // ─── Import đáp án TXT ──────────────────────────────────────────────────────

  function parseAnswerFile(content: string) {
    const mc: MCAnswers = {};
    const tf: TFAnswers = {};
    const sa: SAAnswers = {};
    const lines = content.split('\n');

    lines.forEach(line => {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 3) return;

      const [part, qIndexStr, ans] = parts;
      const qIndex = parseInt(qIndexStr);

      if (part === 'P1') {
        mc[qIndex] = ans.toUpperCase();
      } else if (part === 'P2') {
        const tfArray = ans.split('').map(char => 
          (char.toUpperCase() === 'D' || char === 'Đ') ? 'Đ' : 'S'
        );
        tf[200 + qIndex] = tfArray; // Offset 200
      } else if (part === 'P3') {
        sa[300 + qIndex] = ans; // Offset 300
      }
    });

    return { mc, tf, sa };
  }

  const handleImportAnswers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = parseAnswerFile(content);
        
        setMcAnswers(prev => ({ ...prev, ...parsed.mc }));
        setTfAnswers(prev => ({ ...prev, ...parsed.tf }));
        setSaAnswers(prev => ({ ...prev, ...parsed.sa }));
      } catch (err) {
        console.error("Lỗi đọc file:", err);
        alert("Định dạng file không hợp lệ!");
      } finally {
        if (answerFileInputRef.current) answerFileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // ─── Supabase uploads ───────────────────────────────────────────────────────

  const handleUploadExam = async () => {
    if (!pdfBase64) return;
    setUploadStatus('uploading'); setUploadError('');
    try {
      const filename = pdfFileName || `${config.title.trim() || 'dethi'}.pdf`;
      const res = await uploadPdfToSupabase(pdfBase64, filename);
      setDriveResult(res); setUploadStatus('done');
    } catch (err: any) {
      setUploadStatus('error');
      setUploadError(err?.message || 'Lỗi không xác định');
    }
  };

  const handleUploadSolution = async () => {
    if (!solutionBase64) return;
    setSolUploadStatus('uploading'); setSolUploadError('');
    try {
      const filename = solutionFileName || `${config.title.trim() || 'loigiai'}_loigiai.pdf`;
      const res = await uploadPdfToSupabase(solutionBase64, filename);
      setSolDriveResult(res); setSolUploadStatus('done');
    } catch (err: any) {
      setSolUploadStatus('error');
      setSolUploadError(err?.message || 'Lỗi không xác định');
    }
  };

  // ─── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!pointsConfig || !driveResult) return;
    setIsSaving(true);
    try {
      const { questions, sections, answers } = buildExamData(config, mcAnswers, tfAnswers, saAnswers, writingAnswers);
      const hasSolution = solutionBase64 && solDriveResult;
      
      await onSave({
        title: config.title.trim(),
        timeLimit: config.timeLimit,
        questions, sections, answers,
        createdBy: teacherId,
        pointsConfig,
        // ✅ Truyền trực tiếp link Supabase
        pdfUrl: driveResult.fileUrl,
        ...(hasSolution && {
          solutionPdfUrl: solDriveResult.fileUrl,
        }),
        ...(hasSolution && solutionMode === 'split' && { questionSolutions }),
      } as any);
    } catch (err) {
      console.error(err);
      alert('Có lỗi khi lưu đề. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  const step1Valid = !!(pdfBase64 && config.title.trim() && config.timeLimit > 0
    && (config.mcCount + config.tfCount + config.saCount + config.writingCount) > 0);

  const enterStep5 = () => {
    if (!pointsConfig) setPointsConfig(buildDefaultPointsConfig(config.mcCount, config.tfCount, config.saCount, config.writingCount));
    setStep(5);
  };

  const totalSolutions = Object.keys(questionSolutions).length;
  const sortedQNums = Object.keys(questionSolutions).map(Number).sort((a, b) => a - b);

  // ══════════════════════════════════════════════════════════════════════
  // BƯỚC 1 — PDF đề thi
  // ══════════════════════════════════════════════════════════════════════
  if (step === 1) return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-2xl shadow-lg">
      <StepIndicator step={1} />
      <h2 className="text-xl font-bold text-gray-800 mb-1">📄 Tải đề thi PDF</h2>
      <p className="text-sm text-gray-500 mb-5">
        Upload file PDF <strong>không có lời giải</strong> — đây là file học sinh sẽ thấy khi thi
      </p>

      <div onDrop={handleDropExam} onDragOver={e => e.preventDefault()}
        onClick={() => examFileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition
          ${pdfBase64 ? 'border-teal-400 bg-teal-50' : 'border-gray-300 bg-gray-50 hover:border-teal-400 hover:bg-teal-50'}`}>
        <input ref={examFileRef} type="file" accept="application/pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleExamFile(f); }} />
        {pdfBase64 ? (
          <><p className="text-3xl mb-2">✅</p>
            <p className="font-semibold text-teal-700">{pdfFileName}</p>
            <p className="text-sm text-teal-600">{pdfSizeKB} KB — nhấn để đổi file</p></>
        ) : (
          <><p className="text-5xl mb-3">📄</p>
            <p className="font-semibold text-gray-600">Kéo thả hoặc nhấn để chọn PDF đề thi</p>
            <p className="text-sm text-gray-400 mt-1">Tối đa 50 MB</p></>
        )}
      </div>

      {pdfBase64 && (
        <div className="mt-5 space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Tiêu đề đề thi *</label>
            <input type="text" placeholder="VD: Kiểm tra Toán 10 HK1 2024-2025"
              value={config.title} onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Thời gian (phút) *</label>
            <input type="number" min={5} max={300} value={config.timeLimit}
              onChange={e => setConfig(c => ({ ...c, timeLimit: Number(e.target.value) }))}
              className="mt-1 w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button onClick={onCancel} className="px-5 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Hủy</button>
        <button disabled={!step1Valid} onClick={() => setStep(2)}
          className="px-6 py-2 bg-teal-600 text-white rounded-lg font-semibold disabled:opacity-40 hover:bg-teal-700">
          Tiếp theo →
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════
  // BƯỚC 2 — PDF lời giải + Auto-detect + Chỉnh tay
  // ══════════════════════════════════════════════════════════════════════
  if (step === 2) return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-2xl shadow-lg">
      <StepIndicator step={2} />
      <h2 className="text-xl font-bold text-gray-800 mb-1">📋 PDF Lời Giải <span className="text-sm font-normal text-gray-400">(tùy chọn)</span></h2>
      <p className="text-sm text-gray-500 mb-5">
        Upload file PDF <strong>có lời giải</strong> để học sinh xem lại sau khi nộp bài
      </p>

      {/* Upload zone */}
      <div onDrop={handleDropSolution} onDragOver={e => e.preventDefault()}
        onClick={() => solutionFileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition mb-4
          ${solutionBase64 ? 'border-purple-400 bg-purple-50' : 'border-gray-300 bg-gray-50 hover:border-purple-400 hover:bg-purple-50'}`}>
        <input ref={solutionFileRef} type="file" accept="application/pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleSolutionFile(f); }} />
        {solutionBase64 ? (
          <><p className="text-3xl mb-2">📋</p>
            <p className="font-semibold text-purple-700">{solutionFileName}</p>
            <p className="text-sm text-purple-500">{solutionSizeKB} KB — nhấn để đổi file</p></>
        ) : (
          <><p className="text-4xl mb-3">📋</p>
            <p className="font-semibold text-gray-600">Kéo thả hoặc nhấn để chọn PDF lời giải</p>
            <p className="text-sm text-gray-400 mt-1">Tối đa 50 MB</p></>
        )}
      </div>

      {/* Tùy chọn Chế độ hiển thị Lời giải */}
      {solutionBase64 && (
        <div className="mb-4 bg-purple-50 p-4 rounded-xl border border-purple-200">
          <label className="font-semibold text-purple-900 block mb-2">⚙️ Chế độ hiển thị lời giải:</label>
          <div className="flex flex-col sm:flex-row gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="solMode" checked={solutionMode === 'split'} onChange={() => { setSolutionMode('split'); setDetectDone(false); }} className="accent-purple-600 w-4 h-4" />
              <span className="text-sm text-purple-800 font-medium">Cắt theo từng câu (Auto-detect)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="solMode" checked={solutionMode === 'full'} onChange={() => { setSolutionMode('full'); setDetectDone(true); }} className="accent-purple-600 w-4 h-4" />
              <span className="text-sm text-purple-800 font-medium">Hiển thị nguyên bản toàn bộ PDF</span>
            </label>
          </div>
          {solutionMode === 'full' && (
            <p className="text-xs text-purple-600 mt-2 italic">Học sinh sẽ cuộn toàn bộ file PDF thay vì xem từng trang ứng với mỗi câu.</p>
          )}
        </div>
      )}

      {/* Detect button (Chỉ hiện nếu split) */}
      {solutionBase64 && solutionMode === 'split' && (
        <button onClick={handleDetect} disabled={isDetecting}
          className={`w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 mb-4 transition
            ${isDetecting ? 'bg-purple-200 text-purple-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
          {isDetecting ? (
            <><span className="animate-spin">⚙️</span> Đang phân tích PDF...</>
          ) : (
            <><span>🔍</span> Phân tích trang (Regex "Câu X.")</>
          )}
        </button>
      )}

      {/* Detect error */}
      {detectError && solutionMode === 'split' && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-800">
          ⚠️ {detectError}
        </div>
      )}

      {/* Results */}
      {detectDone && solutionMode === 'split' && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-sm text-green-800">
          <span className="text-xl">✅</span>
          <span>
            Phát hiện <strong>{totalSolutions} câu</strong> trong <strong>{solutionTotalPages} trang</strong>
            {totalSolutions === 0 && ' — hãy thêm thủ công bên dưới'}
          </span>
        </div>
      )}

      {/* Page range list */}
      {totalSolutions > 0 && solutionMode === 'split' && (
        <div className="mb-4 border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Ranh giới trang — chỉnh nếu cần
            </span>
            <span className="text-xs text-gray-400">{solutionTotalPages > 0 ? `Tổng ${solutionTotalPages} trang` : ''}</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {sortedQNums.map(qn => {
              const range = questionSolutions[qn];
              const isInvalid = range.pageStart > range.pageEnd;
              return (
                <div key={qn} className={`flex items-center gap-3 px-4 py-2.5 ${isInvalid ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                  <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2.5 py-1 rounded-full min-w-[60px] text-center">
                    Câu {qn}
                  </span>
                  <span className="text-xs text-gray-500">Trang</span>
                  <input
                    type="number" min={1} max={solutionTotalPages || 999}
                    value={range.pageStart}
                    onChange={e => updateRange(qn, 'pageStart', parseInt(e.target.value) || 1)}
                    className={`w-14 border rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-400
                      ${isInvalid ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                  />
                  <span className="text-gray-400">→</span>
                  <input
                    type="number" min={1} max={solutionTotalPages || 999}
                    value={range.pageEnd}
                    onChange={e => updateRange(qn, 'pageEnd', parseInt(e.target.value) || 1)}
                    className={`w-14 border rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-400
                      ${isInvalid ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                  />
                  {isInvalid && <span className="text-xs text-red-600">⚠ Sai</span>}
                  <button onClick={() => removeQuestion(qn)} className="ml-auto text-gray-300 hover:text-red-500 text-lg transition">✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add manual question */}
      {solutionBase64 && solutionMode === 'split' && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
          <span className="text-sm text-gray-600 shrink-0">➕ Thêm câu thủ công:</span>
          <input
            type="number" min={1} max={200} placeholder="Số câu"
            value={addManualQ}
            onChange={e => setAddManualQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addManualQuestion(); }}
            className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <button onClick={addManualQuestion}
            className="px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 font-semibold">
            Thêm
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-between mt-4">
        <div className="flex gap-2">
          <button onClick={() => setStep(1)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 text-sm">← Quay lại</button>
          <button onClick={() => { setSolutionBase64(''); setQuestionSolutions({}); setDetectDone(false); setStep(3); }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-400 hover:bg-gray-50 text-sm">
            Bỏ qua
          </button>
        </div>
        <button onClick={() => setStep(3)}
          className="px-6 py-2 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 text-sm">
          {totalSolutions > 0 && solutionMode === 'split' ? `Tiếp theo (${totalSolutions} câu) →` : 'Tiếp theo →'}
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════
  // BƯỚC 3 — Cấu hình số câu
  // ══════════════════════════════════════════════════════════════════════
  if (step === 3) return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-2xl shadow-lg">
      <StepIndicator step={3} />
      <h2 className="text-xl font-bold text-gray-800 mb-1">⚙️ Cấu hình số câu</h2>
      <p className="text-sm text-gray-500 mb-5">Nhập số lượng câu từng phần</p>
      <div className="space-y-3">
        <SectionRow icon="🔘" color="blue" title="PHẦN I – Trắc nghiệm nhiều lựa chọn" desc="Câu 1 → N (đáp án A/B/C/D)" rangeLabel={`Câu 1–${config.mcCount}`} value={config.mcCount} onChange={v => setConfig(c => ({ ...c, mcCount: v }))} />
        <SectionRow icon="☑️" color="purple" title="PHẦN II – Trắc nghiệm Đúng/Sai" desc="Mỗi câu có 4 ý (a/b/c/d)" rangeLabel={`Câu 201–${200 + config.tfCount}`} value={config.tfCount} onChange={v => setConfig(c => ({ ...c, tfCount: v }))} />
        <SectionRow icon="✍️" color="orange" title="PHẦN III – Trả lời ngắn" desc="Nhập số (có thể âm, thập phân)" rangeLabel={`Câu 301–${300 + config.saCount}`} value={config.saCount} onChange={v => setConfig(c => ({ ...c, saCount: v }))} />
        <SectionRow icon="📝" color="green" title="PHẦN IV – Tự luận" desc="Học sinh soạn thảo / chèn ảnh chụp (GV chấm AI / chấm tay)" rangeLabel={`Câu 401–${400 + config.writingCount}`} value={config.writingCount} onChange={v => setConfig(c => ({ ...c, writingCount: v }))} />
      </div>
      <div className="flex justify-between mt-6">
        <button onClick={() => setStep(2)} className="px-5 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">← Quay lại</button>
        <button onClick={() => setStep(4)} disabled={(config.mcCount + config.tfCount + config.saCount + config.writingCount) === 0}
          className="px-6 py-2 bg-teal-600 text-white rounded-lg font-semibold disabled:opacity-40 hover:bg-teal-700">Tiếp theo →</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════
  // BƯỚC 4 — Nhập đáp án
  // ══════════════════════════════════════════════════════════════════════
  if (step === 4) {
    const mcNums = mcRange(config.mcCount);
    const tfNums = tfRange(config.tfCount);
    const saNums = saRange(config.saCount);
    const writingNums = writingRange(config.writingCount);
    const answeredMC = Object.values(mcAnswers).filter(Boolean).length;
    const answeredTF = Object.values(tfAnswers).filter(v => v && v.filter(Boolean).length === 4).length;
    const answeredSA = Object.values(saAnswers).filter(Boolean).length;

    return (
      <div className="max-w-3xl mx-auto p-6 bg-white rounded-2xl shadow-lg">
        <StepIndicator step={4} />
        
        {/* ✅ Header kết hợp Import Đáp án TXT */}
        <div className="flex justify-between items-start mb-5 border-b pb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-1">🔑 Nhập đáp án</h2>
            <p className="text-sm text-gray-500">Điền đáp án đúng cho từng câu tự động chấm</p>
          </div>
          <div>
            <input type="file" accept=".txt" ref={answerFileInputRef} className="hidden" onChange={handleImportAnswers} />
            <button onClick={() => answerFileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm font-bold hover:bg-amber-100 transition shadow-sm">
              📥 Nhập đáp án từ File .TXT
            </button>
          </div>
        </div>

        {/* MC */}
        {mcNums.length > 0 && (
          <div className="mb-8">
            <div className="inline-block bg-teal-600 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-sm mb-4">
              🔘 PHẦN I — Trắc nghiệm ({answeredMC}/{mcNums.length})
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {mcNums.map(n => (
                <div key={n} className="flex items-center gap-2 p-3 bg-cyan-50/50 border border-cyan-100 rounded-2xl">
                  <span className="bg-teal-500 text-white text-xs font-bold px-2 py-1 rounded-full shrink-0">Câu {n}</span>
                  <div className="flex gap-1">
                    {/* ✅ Giao diện đáp án MÀU SẮC mới */}
                    {['A', 'B', 'C', 'D'].map(l => (
                      <button key={l} onClick={() => setMcAnswers(p => ({ ...p, [n]: p[n] === l ? '' : l }))}
                        className={`w-7 h-7 rounded-full text-xs font-bold transition shadow-sm
                          ${mcAnswers[n] === l 
                            ? ({ A: 'bg-pink-500', B: 'bg-sky-500', C: 'bg-green-500', D: 'bg-orange-500' } as any)[l] + ' text-white' 
                            : 'bg-white border border-gray-300 text-gray-600 hover:bg-teal-50'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TF */}
        {tfNums.length > 0 && (
          <div className="mb-8">
            <div className="inline-block bg-teal-600 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-sm mb-4">
              ☑️ PHẦN II — Đúng/Sai ({answeredTF}/{tfNums.length})
            </div>
            <div className="space-y-3">
              {tfNums.map((n, idx) => {
                const cells = tfAnswers[n] || ['', '', '', ''];
                return (
                  <div key={n} className="p-3 bg-cyan-50/50 border border-cyan-100 rounded-2xl">
                    <div className="inline-block bg-teal-500 text-white text-xs font-bold px-2.5 py-1 rounded-full mb-3 shadow-sm">
                      Câu {idx + 1}
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {['a', 'b', 'c', 'd'].map((lbl, i) => (
                        <div key={lbl} className="flex flex-col items-center gap-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm ${['bg-pink-500','bg-sky-500','bg-green-500','bg-orange-500'][i]}`}>
                            {lbl.toUpperCase()}
                          </span>
                          <div className="flex gap-1">
                            {['Đ', 'S'].map(v => (
                              <button key={v}
                                onClick={() => setTfAnswers(p => {
                                  const cur = p[n] || ['', '', '', ''];
                                  const next = [...cur];
                                  next[i] = next[i] === v ? '' : v;
                                  return { ...p, [n]: next };
                                })}
                                className={`px-2 py-1 rounded text-xs font-bold transition
                                  ${cells[i] === v
                                    ? (v === 'Đ' ? 'bg-green-500 text-white' : 'bg-red-500 text-white')
                                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SA */}
        {saNums.length > 0 && (
          <div className="mb-8">
            <div className="inline-block bg-teal-600 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-sm mb-4">
              ✍️ PHẦN III — Trả lời ngắn ({answeredSA}/{saNums.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {saNums.map((n, idx) => {
                const currentVal = (saAnswers[n] || '').padEnd(4, ' ');
                const charArray = currentVal.split('').slice(0, 4);
                const handleChange = (charIdx: number, char: string) => {
                  const inputChar = char.slice(-1);
                  if (inputChar === '') {
                    const newChars = [...charArray]; newChars[charIdx] = ' ';
                    setSaAnswers(p => ({ ...p, [n]: newChars.join('').trimEnd() })); return;
                  }
                  const hasComma = charArray.some(c => c === ',');
                  let isValid = false;
                  switch (charIdx) {
                    case 0: isValid = /^[0-9-]$/.test(inputChar); break;
                    case 1: case 2: isValid = inputChar === ',' ? !hasComma : /^[0-9]$/.test(inputChar); break;
                    case 3: isValid = /^[0-9]$/.test(inputChar); break;
                  }
                  if (isValid) {
                    const newChars = [...charArray]; newChars[charIdx] = inputChar;
                    setSaAnswers(p => ({ ...p, [n]: newChars.join('').trimEnd() }));
                    if (charIdx < 3) document.getElementById(`create-sa-${n}-${charIdx + 1}`)?.focus();
                  }
                };
                return (
                  <div key={n} className="flex items-center gap-3 p-3 bg-cyan-50/50 border border-cyan-100 rounded-2xl">
                    <span className="bg-teal-500 text-white text-[10px] font-bold px-2 py-1.5 rounded-full shrink-0 shadow-sm min-w-[60px] text-center">
                      Câu {idx + 1}
                    </span>
                    <div className="flex gap-1.5">
                      {[0, 1, 2, 3].map(charIdx => (
                        <input key={charIdx} id={`create-sa-${n}-${charIdx}`} type="text" maxLength={1}
                          value={charArray[charIdx] === ' ' ? '' : charArray[charIdx]}
                          onChange={e => handleChange(charIdx, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Backspace' && (charArray[charIdx] === ' ' || !charArray[charIdx]) && charIdx > 0) document.getElementById(`create-sa-${n}-${charIdx - 1}`)?.focus(); }}
                          className="w-9 h-9 border-2 border-gray-300 rounded-lg text-center font-bold text-base focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none bg-white shadow-inner"
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tự luận Info */}
        {writingNums.length > 0 && (
          <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-2xl text-green-800 text-sm">
            <span className="font-bold text-lg">📝 PHẦN IV — Tự luận ({writingNums.length} câu)</span>
            <p className="mt-2">Các câu hỏi tự luận không cần nhập đáp án tại đây vì sẽ được chấm thủ công hoặc sử dụng AI (Gemini) để chấm.</p>
          </div>
        )}

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep(3)} className="px-5 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">← Quay lại</button>
          <button onClick={enterStep5} className="px-6 py-2 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 shadow-md transition-all active:scale-95">Tiếp theo →</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // BƯỚC 5 — Supabase + Điểm + Lưu
  // ══════════════════════════════════════════════════════════════════════
  if (step === 5) {
    const answeredCount = Object.keys({ ...mcAnswers, ...saAnswers }).length
      + Object.values(tfAnswers).filter(v => v.filter(Boolean).length === 4).length;
    const totalAutoQ = config.mcCount + config.tfCount + config.saCount;
    const canSave = !isSaving && !!pointsConfig && !!driveResult;

    return (
      <div className="max-w-3xl mx-auto p-6 bg-white rounded-2xl shadow-lg">
        <StepIndicator step={5} />
        <h2 className="text-xl font-bold text-gray-800 mb-1">⚖️ Upload Supabase & Lưu đề</h2>
        <p className="text-sm text-gray-500 mb-5">Upload lên máy chủ mây, cấu hình điểm, rồi lưu</p>

        {/* Tóm tắt */}
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-4 text-sm">
          <p className="font-semibold text-teal-800 mb-1">📋 {config.title}</p>
          <div className="flex gap-4 text-teal-700 flex-wrap text-xs">
            {config.mcCount > 0 && <span>🔘 {config.mcCount} TN</span>}
            {config.tfCount > 0 && <span>☑️ {config.tfCount} Đ/S</span>}
            {config.saCount > 0 && <span>✍️ {config.saCount} TLN</span>}
            {config.writingCount > 0 && <span>📝 {config.writingCount} TL</span>}
            <span>⏱ {config.timeLimit} phút</span>
            <span className={answeredCount < totalAutoQ ? 'text-orange-600' : 'text-green-700'}>
              🔑 {answeredCount}/{totalAutoQ} đáp án Auto
            </span>
            {solutionBase64 && (
              <span className="text-purple-700">📚 Lời giải ({solutionMode === 'full' ? 'Full' : 'Cắt câu'})</span>
            )}
          </div>
        </div>

        {/* Upload exam PDF */}
        <SupabaseUploadBlock
          label="📄 Upload PDF đề thi lên Supabase Storage"
          pdfBase64={pdfBase64} pdfFileName={pdfFileName} pdfSizeKB={pdfSizeKB}
          examTitle={config.title}
          result={driveResult} status={uploadStatus} error={uploadError}
          onUpload={handleUploadExam}
          onReset={() => { setDriveResult(null); setUploadStatus('idle'); setUploadError(''); }}
        />

        {/* Upload solution PDF (nếu có) */}
        {solutionBase64 && (
          <SupabaseUploadBlock
            label={`📋 Upload PDF lời giải lên Supabase (${solutionMode === 'full' ? 'Nguyên bản' : 'Cắt câu'})`}
            pdfBase64={solutionBase64} pdfFileName={solutionFileName} pdfSizeKB={solutionSizeKB}
            examTitle={`${config.title}_loigiai`}
            result={solDriveResult} status={solUploadStatus} error={solUploadError}
            onUpload={handleUploadSolution}
            onReset={() => { setSolDriveResult(null); setSolUploadStatus('idle'); setSolUploadError(''); }}
          />
        )}

        {!solutionBase64 && (
          <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-500 flex items-center gap-2">
            <span>ℹ️</span>
            <span>Chưa có PDF lời giải — học sinh sẽ không thấy lời giải sau khi nộp bài. <button className="underline text-teal-600 hover:text-teal-800" onClick={() => setStep(2)}>Thêm ở bước 2</button></span>
          </div>
        )}

        {/* Thang điểm */}
        {pointsConfig && (
          <PointsConfigEditor config={pointsConfig} onChange={setPointsConfig}
            onClose={() => { }} closeOnSave={false} isSaving={isSaving} />
        )}

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep(4)} className="px-5 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">← Quay lại</button>
          <button onClick={handleSave} disabled={!canSave}
            className="px-8 py-2 bg-teal-600 text-white rounded-lg font-semibold disabled:opacity-40 hover:bg-teal-700 flex items-center gap-2">
            {isSaving && <span className="animate-spin">⏳</span>}
            {isSaving ? 'Đang lưu...' : !driveResult ? '☁️ Upload Đề thi trước' : '💾 Lưu đề thi'}
          </button>
        </div>
      </div>
    );
  }

  return null;
};

// ─── SectionRow ──────────────────────────────────────────────────────────────

interface SectionRowProps {
  icon: string; color: 'blue' | 'purple' | 'orange' | 'green';
  title: string; desc: string; value: number;
  onChange: (v: number) => void; rangeLabel: string;
}

function SectionRow({ icon, color, title, desc, value, onChange, rangeLabel }: SectionRowProps) {
  const borderCls = { blue: 'border-blue-200 bg-blue-50', purple: 'border-purple-200 bg-purple-50', orange: 'border-orange-200 bg-orange-50', green: 'border-green-200 bg-green-50' }[color];
  const textCls = { blue: 'text-blue-800', purple: 'text-purple-800', orange: 'text-orange-800', green: 'text-green-800' }[color];
  return (
    <div className={`border rounded-xl p-4 ${borderCls}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${textCls}`}>{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
          <p className="text-xs text-gray-400 mt-1">📌 {rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => onChange(Math.max(0, value - 1))} className="w-7 h-7 rounded-full bg-white border border-gray-300 text-gray-600 font-bold hover:bg-gray-100">−</button>
          <input type="number" min={0} max={40} value={value} onChange={e => onChange(Math.max(0, Number(e.target.value)))}
            className="w-14 text-center border border-gray-300 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          <button onClick={() => onChange(value + 1)} className="w-7 h-7 rounded-full bg-white border border-gray-300 text-gray-600 font-bold hover:bg-gray-100">+</button>
        </div>
      </div>
    </div>
  );
}

export default PDFExamCreator;
