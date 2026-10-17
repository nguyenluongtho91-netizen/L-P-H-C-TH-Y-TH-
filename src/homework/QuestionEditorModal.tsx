import React, { useState, useEffect, useRef } from 'react';
import {
  X, Check, Sparkles, Image as ImageIcon, LineChart,
  Plus, Trash2, Eye, HelpCircle, Upload, ArrowRight,
  Calculator, Beaker, FileText, CheckCircle2
} from 'lucide-react';
import type { Question, QuestionOption } from '@/types';
import MathText from '@/components/MathText';
import { generateSvgDataUri, GraphOptions } from '@/services/graphGeneratorService';
import toast from 'react-hot-toast';

interface QuestionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (question: Question) => void;
  initialQuestion?: Question | null;
  questionIndex?: number;
}

export default function QuestionEditorModal({
  isOpen,
  onClose,
  onSave,
  initialQuestion,
  questionIndex = 0
}: QuestionEditorModalProps) {
  const [part, setPart] = useState<number>(1);
  const [qType, setQType] = useState<string>('multiple_choice');
  const [stem, setStem] = useState<string>('');
  const [options, setOptions] = useState<QuestionOption[]>([
    { letter: 'A', text: '', isCorrect: true },
    { letter: 'B', text: '', isCorrect: false },
    { letter: 'C', text: '', isCorrect: false },
    { letter: 'D', text: '', isCorrect: false }
  ]);
  const [correctAnswer, setCorrectAnswer] = useState<string>('A');
  const [solution, setSolution] = useState<string>('');

  // Sub-modal sinh đồ thị
  const [showGraphStudio, setShowGraphStudio] = useState(false);
  const [graphType, setGraphType] = useState<GraphOptions['type']>('parabola');
  const [graphTitle, setGraphTitle] = useState('Đồ thị minh họa');
  const [paramA, setParamA] = useState(1);
  const [paramB, setParamB] = useState(-2);
  const [paramC, setParamC] = useState(-1);
  const [paramD, setParamD] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stemTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialQuestion) {
        setPart(initialQuestion.part || 1);
        setQType(initialQuestion.type || 'multiple_choice');
        setStem(initialQuestion.text || '');
        setCorrectAnswer(initialQuestion.correctAnswer || 'A');
        setSolution(initialQuestion.solution || '');
        if (initialQuestion.options && initialQuestion.options.length > 0) {
          setOptions(initialQuestion.options);
        } else {
          setOptions([
            { letter: 'A', text: '', isCorrect: true },
            { letter: 'B', text: '', isCorrect: false },
            { letter: 'C', text: '', isCorrect: false },
            { letter: 'D', text: '', isCorrect: false }
          ]);
        }
      } else {
        setPart(1);
        setQType('multiple_choice');
        setStem('');
        setCorrectAnswer('A');
        setSolution('');
        setOptions([
          { letter: 'A', text: '', isCorrect: true },
          { letter: 'B', text: '', isCorrect: false },
          { letter: 'C', text: '', isCorrect: false },
          { letter: 'D', text: '', isCorrect: false }
        ]);
      }
      setShowGraphStudio(false);
    }
  }, [isOpen, initialQuestion]);

  if (!isOpen) return null;

  // Chèn text vào vị trí con trỏ trong ô đề bài
  const insertTextToStem = (snippet: string) => {
    if (!stemTextareaRef.current) {
      setStem(prev => prev + snippet);
      return;
    }
    const el = stemTextareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = stem.substring(0, start) + snippet + stem.substring(end);
    setStem(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    }, 50);
  };

  // Upload ảnh chèn vào câu hỏi
  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = reader.result as string;
        const imgTag = `\n<div style="text-align:center;margin:12px 0;"><img src="${b64}" style="max-height:320px;max-width:100%;height:auto;border-radius:8px;border:1px solid #cbd5e1;display:inline-block;" alt="${file.name}" /></div>\n`;
        insertTextToStem(imgTag);
        toast.success(`Đã chèn ảnh "${file.name}" vào câu hỏi!`);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  // Chèn đồ thị vừa sinh vào đề bài
  const handleInsertGraph = () => {
    const params: Record<string, number> = {
      a: paramA,
      b: paramB,
      c: paramC,
      d: paramD,
      c0: 1.0,
      k: 0.35,
      eqV: 25
    };
    const dataUri = generateSvgDataUri({
      type: graphType,
      title: graphTitle,
      params,
      showGrid: true
    });
    const imgTag = `\n<div style="text-align:center;margin:12px 0;"><img src="${dataUri}" style="max-height:340px;max-width:100%;height:auto;border-radius:8px;border:1px solid #cbd5e1;display:inline-block;" alt="${graphTitle}" /></div>\n`;
    insertTextToStem(imgTag);
    setShowGraphStudio(false);
    toast.success('🎉 Đã chèn đồ thị Oxy vào câu hỏi!');
  };

  const handleSaveQuestion = () => {
    if (!stem.trim()) {
      toast.error('Vui lòng nhập nội dung câu hỏi!');
      return;
    }

    const qNum = initialQuestion?.number || questionIndex + 1;
    const finalQuestion: Question = {
      number: qNum,
      part,
      type: qType as any,
      text: stem.trim(),
      options: part === 1 || part === 2 ? options : [],
      correctAnswer: part === 1 ? correctAnswer : undefined,
      solution: solution.trim() || undefined,
      images: initialQuestion?.images || []
    };

    onSave(finalQuestion);
    toast.success('Đã lưu câu hỏi thành công!');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 via-indigo-50/40 to-teal-50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800">
                {initialQuestion ? `Chỉnh Sửa Câu ${initialQuestion.number || questionIndex + 1}` : 'Thêm Mới Câu Hỏi & Vũ Khí Toán - Hóa'}
              </h3>
              <p className="text-xs text-slate-500">Soạn thảo đề bài, công thức hóa học, công thức toán và đồ thị sắc nét</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          
          {/* Phân loại câu hỏi */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80">
            <span className="font-bold text-slate-600 mr-2">Dạng câu hỏi:</span>
            {[
              { p: 1, type: 'multiple_choice', label: 'Trắc nghiệm 4 lựa chọn (Phần 1)' },
              { p: 2, type: 'true_false', label: 'Đúng / Sai 4 ý a,b,c,d (Phần 2)' },
              { p: 3, type: 'short_answer', label: 'Trả lời ngắn (Phần 3)' },
              { p: 4, type: 'writing', label: 'Tự luận / Ví dụ (Phần 4)' },
            ].map(item => (
              <button
                key={item.p}
                type="button"
                onClick={() => { setPart(item.p); setQType(item.type); }}
                className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                  part === item.p
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* VŨ KHÍ TOÁN - HÓA TOOLBAR */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-teal-50/70 border border-blue-200/70 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-black text-blue-900 flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                <Calculator className="w-3.5 h-3.5 text-blue-600" />
                Vũ Khí Toán Học & Hóa Học (Bấm để chèn nhanh):
              </span>
              
              <div className="flex items-center gap-2">
                {/* Nút upload ảnh */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleUploadImage}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-blue-400 text-slate-700 font-bold flex items-center gap-1.5 shadow-2xs hover:bg-blue-50 transition cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                  Chèn hình ảnh
                </button>

                {/* Nút sinh đồ thị Oxy */}
                <button
                  type="button"
                  onClick={() => setShowGraphStudio(true)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <LineChart className="w-3.5 h-3.5" />
                  Sinh đồ thị Oxy
                </button>
              </div>
            </div>

            {/* Dãy nút bấm Hóa học */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-blue-100">
              <span className="text-[10px] font-bold text-teal-800 uppercase bg-teal-100/70 px-1.5 py-0.5 rounded">Hóa:</span>
              {[
                { label: 'H₂SO₄', val: 'H2SO4' },
                { label: 'R₂O₅', val: 'R2O5' },
                { label: 'RH₃', val: 'RH3' },
                { label: 'ns²np⁴', val: 'ns²np⁴' },
                { label: '1s²2s²2p⁶', val: '1s²2s²2p⁶' },
                { label: 'Fe³⁺', val: 'Fe³⁺' },
                { label: 'SO₄²⁻', val: 'SO4 2-' },
                { label: '→', val: ' $\\rightarrow$ ' },
                { label: '⇌', val: ' $\\rightleftharpoons$ ' },
                { label: '⇒', val: ' $\\Rightarrow$ ' },
                { label: 'ΔᵣH°₂₉₈', val: 'ΔrH°298 = -92 kJ' },
                { label: 'AₓBᵧ', val: 'AxBy' },
                { label: 'M_R', val: 'MR' }
              ].map((btn, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => insertTextToStem(btn.val)}
                  className="px-2 py-1 rounded-lg bg-white border border-teal-200 hover:border-teal-400 hover:bg-teal-50 text-teal-900 font-bold text-[11px] transition shadow-2xs cursor-pointer"
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Dãy nút bấm Toán học */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-blue-100">
              <span className="text-[10px] font-bold text-blue-800 uppercase bg-blue-100/70 px-1.5 py-0.5 rounded">Toán:</span>
              {[
                { label: 'a/b', val: ' $\\frac{a}{b}$ ' },
                { label: '√x', val: ' $\\sqrt{x}$ ' },
                { label: '³√x', val: ' $\\sqrt[3]{x}$ ' },
                { label: 'x²', val: '$x^2$' },
                { label: 'Hệ PT', val: '\n\\[\\begin{cases} x + y = 10 \\\\ 2x - y = 5 \\end{cases}\\]\n' },
                { label: 'u⃗', val: ' $\\vec{u}$ ' },
                { label: '∫dx', val: ' $\\int_a^b f(x)dx$ ' },
                { label: 'lim', val: ' $\\lim_{x \\to 0}$ ' },
                { label: '∠ABC', val: ' $\\widehat{ABC} = 60^\\circ$ ' },
                { label: '·', val: ' $\\cdot$ ' },
                { label: '≈', val: ' $\\approx$ ' }
              ].map((btn, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => insertTextToStem(btn.val)}
                  className="px-2 py-1 rounded-lg bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-blue-900 font-bold text-[11px] transition shadow-2xs cursor-pointer"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ô nhập đề bài */}
          <div className="space-y-1.5">
            <label className="font-black text-slate-700 flex items-center justify-between">
              <span>Nội dung câu hỏi (Hỗ trợ HTML, LaTeX $...$, $$, và công thức hóa học):</span>
              <span className="text-slate-400 font-normal">Gõ $...$ để chèn công thức Toán/Hóa</span>
            </label>
            <textarea
              ref={stemTextareaRef}
              rows={4}
              value={stem}
              onChange={(e) => setStem(e.target.value)}
              placeholder="Nhập nội dung đề bài (Ví dụ: Cho m gam Fe vào dung dịch H2SO4 loãng...)"
              className="w-full p-3.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none leading-relaxed transition"
            />
          </div>

          {/* KHUNG XEM TRƯỚC TRỰC TIẾP (LIVE PREVIEW) */}
          {stem && (
            <div className="p-4 rounded-2xl bg-amber-50/40 border border-amber-200/80 space-y-2">
              <span className="font-bold text-amber-900 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <Eye className="w-3.5 h-3.5 text-amber-700" />
                Xem trước câu hỏi trực tiếp (Live MathText):
              </span>
              <div className="p-3 bg-white rounded-xl border border-amber-100 text-slate-800 font-serif leading-relaxed text-xs">
                <MathText html={stem} block />
              </div>
            </div>
          )}

          {/* CÁC PHƯƠNG ÁN LỰA CHỌN A, B, C, D (NẾU LÀ PHẦN 1 HOẶC 2) */}
          {part === 1 && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <label className="font-black text-slate-700 block">
                Các phương án lựa chọn (Bấm nút tròn để chọn đáp án đúng):
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {options.map((opt, idx) => {
                  const isCorr = correctAnswer === opt.letter;
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-2xl border flex items-center gap-2.5 transition ${
                        isCorr ? 'bg-emerald-50 border-emerald-400' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setCorrectAnswer(opt.letter);
                          setOptions(prev => prev.map((o, i) => ({ ...o, isCorrect: i === idx })));
                        }}
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 transition cursor-pointer ${
                          isCorr ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-300 text-slate-600'
                        }`}
                      >
                        {opt.letter}
                      </button>

                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOptions(prev => prev.map((o, i) => (i === idx ? { ...o, text: val } : o)));
                        }}
                        placeholder={`Nội dung phương án ${opt.letter}...`}
                        className="flex-1 bg-transparent border-none outline-none font-serif text-xs text-slate-800"
                      />

                      {isCorr && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* NỘI DUNG LỜI GIẢI CHI TIẾT */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="font-black text-slate-700 flex items-center justify-between">
              <span>Hướng dẫn giải / Lời giải chi tiết (Tùy chọn):</span>
              <span className="text-slate-400 font-normal">Học sinh xem sau khi nộp hoặc hết hạn</span>
            </label>
            <textarea
              rows={3}
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              placeholder="Nhập lời giải hoặc hướng dẫn chi tiết (Ví dụ: Ta có số mol Fe là 0,1 mol...)"
              className="w-full p-3.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none leading-relaxed transition"
            />
          </div>

          {solution && (
            <div className="p-3 bg-white rounded-xl border border-slate-200 text-slate-700 font-serif text-xs">
              <span className="font-bold text-amber-800 block mb-1">Xem trước lời giải:</span>
              <MathText html={solution} block />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-white text-slate-600 font-bold transition cursor-pointer"
          >
            Hủy
          </button>

          <button
            type="button"
            onClick={handleSaveQuestion}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs flex items-center gap-2 shadow-md shadow-blue-500/20 transition cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            Lưu câu hỏi
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SUB-MODAL: STUDIO VẼ ĐỒ THỊ OXY TỰ ĐỘNG BẰNG SVG
         ══════════════════════════════════════════════════════════════ */}
      {showGraphStudio && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <LineChart className="w-5 h-5 text-indigo-600" />
                <h4 className="font-black text-slate-800 text-sm">Vũ Khí Sinh Đồ Thị Oxy Tự Động</h4>
              </div>
              <button
                onClick={() => setShowGraphStudio(false)}
                className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chọn dạng đồ thị */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { type: 'parabola', label: 'Parabol y = ax² + bx + c' },
                { type: 'cubic', label: 'Bậc 3: y = ax³ + cx + d' },
                { type: 'rational', label: 'Phân thức: y = (ax+b)/(cx+d)' },
                { type: 'kinetics', label: 'Động học Hóa học: C(t)' },
                { type: 'titration', label: 'Chuẩn độ Axit - Bazơ: pH' }
              ].map(item => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setGraphType(item.type as any)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition cursor-pointer ${
                    graphType === item.type
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Thông số hệ số */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              {graphType === 'parabola' && (
                <>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block">Hệ số a:</label>
                    <input type="number" value={paramA} onChange={e => setParamA(Number(e.target.value))} className="w-full p-1.5 border rounded-lg bg-white" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block">Hệ số b:</label>
                    <input type="number" value={paramB} onChange={e => setParamB(Number(e.target.value))} className="w-full p-1.5 border rounded-lg bg-white" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block">Hệ số c:</label>
                    <input type="number" value={paramC} onChange={e => setParamC(Number(e.target.value))} className="w-full p-1.5 border rounded-lg bg-white" />
                  </div>
                </>
              )}

              {graphType === 'rational' && (
                <>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block">Tử số a:</label>
                    <input type="number" value={paramA} onChange={e => setParamA(Number(e.target.value))} className="w-full p-1.5 border rounded-lg bg-white" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block">Tử số b:</label>
                    <input type="number" value={paramB} onChange={e => setParamB(Number(e.target.value))} className="w-full p-1.5 border rounded-lg bg-white" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block">Mẫu số c:</label>
                    <input type="number" value={paramC} onChange={e => setParamC(Number(e.target.value))} className="w-full p-1.5 border rounded-lg bg-white" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block">Mẫu số d:</label>
                    <input type="number" value={paramD} onChange={e => setParamD(Number(e.target.value))} className="w-full p-1.5 border rounded-lg bg-white" />
                  </div>
                </>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-600 block">Tiêu đề đồ thị:</label>
                <input type="text" value={graphTitle} onChange={e => setGraphTitle(e.target.value)} className="w-full p-1.5 border rounded-lg bg-white" />
              </div>
            </div>

            {/* Xem trước đồ thị SVG */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center">
              <span className="text-[11px] font-bold text-slate-400 mb-2">Xem trước đồ thị vector SVG sắc nét:</span>
              <img
                src={generateSvgDataUri({
                  type: graphType,
                  title: graphTitle,
                  params: { a: paramA, b: paramB, c: paramC, d: paramD, c0: 1.0, k: 0.35, eqV: 25 },
                  showGrid: true
                })}
                alt="Xem trước"
                className="max-h-60 rounded-xl shadow-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowGraphStudio(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleInsertGraph}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Check className="w-4 h-4" />
                Chèn đồ thị vào đề bài
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
