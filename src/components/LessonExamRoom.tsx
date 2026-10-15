// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import MathText from '@/components/MathText';
import { Check as CheckIcon, X as XIcon, Clock, ChevronLeft, Send, RotateCw, Smartphone } from 'lucide-react';

interface LessonExamRoomProps {
  examId: string;
  studentName: string;
  onSubmitted: (percentage: number, scoreBreakdown: any) => void;
  onExit: () => void;
}

export default function LessonExamRoom({ examId, studentName, onSubmitted, onExit }: LessonExamRoomProps) {
  const [exam, setExam] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(45 * 60); // Mặc định 45 phút
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  // Xoay ngang / dọc màn hình
  const toggleOrientation = async () => {
    try {
      if (!isLandscape) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen().catch(() => {});
        }
        if (window.screen?.orientation?.lock) {
          await window.screen.orientation.lock('landscape').catch(() => {});
        }
        setIsLandscape(true);
      } else {
        if (window.screen?.orientation?.unlock) {
          window.screen.orientation.unlock();
        }
        if (document.exitFullscreen && document.fullscreenElement) {
          await document.exitFullscreen().catch(() => {});
        }
        setIsLandscape(false);
      }
    } catch {
      setIsLandscape(prev => !prev);
    }
  };

  useEffect(() => {
    const fetchExam = async () => {
      try {
        const { data, error } = await supabase.from('exams').select('data, title').eq('id', examId).single();
        if (error) throw error;
        setExam({ ...data.data, title: data.title });
        if (data.data.timeLimit) setTimeLeft(data.data.timeLimit * 60);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchExam();
  }, [examId]);

  // Đếm ngược thời gian
  useEffect(() => {
    if (loading || !exam) return;
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(t); handleSubmit(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, exam]);

  const handleAnswer = (qNum: number, ans: string) => setAnswers(prev => ({ ...prev, [qNum]: ans }));

  // CHẤM ĐIỂM TRỰC TIẾP
  const handleSubmit = () => {
    let mcTotal = 0, mcCorrect = 0, tfTotal = 0, tfCorrect = 0, saTotal = 0, saCorrect = 0;

    exam.questions.forEach((q: any) => {
      const uAns = answers[q.number];
      if (q.type === 'multiple_choice') {
        mcTotal++; if (uAns && q.correctAnswer && uAns.toUpperCase() === q.correctAnswer.toUpperCase()) mcCorrect++;
      } else if (q.type === 'true_false') {
        tfTotal++;
        if (uAns && q.correctAnswer) {
          const cArr = q.correctAnswer.toLowerCase().split(',').filter(Boolean);
          const uMap = parseTFAnswer(uAns);
          let correctParts = 0;
          q.options?.forEach((opt: any) => {
            const letter = opt.letter.toLowerCase();
            const isTrue = cArr.includes(letter);
            const choseTrue = uMap[letter] === 'T';
            if (choseTrue === isTrue && uMap[letter] !== undefined) correctParts++;
          });
          if (correctParts === 4) tfCorrect++;
        }
      } else if (q.type === 'short_answer') {
        saTotal++; if (uAns && q.correctAnswer && String(uAns).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase()) saCorrect++;
      }
    });

    const totalCorrect = mcCorrect + tfCorrect + saCorrect;
    const totalQ = mcTotal + tfTotal + saTotal;
    const percentage = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;

    onSubmitted(percentage, { mcCorrect, tfCorrect, saCorrect, totalCorrect, totalQ });
  };

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = exam?.questions?.length || 0;

  if (loading) return <div className="h-full flex items-center justify-center bg-gray-50 text-teal-700 font-bold p-6">⏳ Đang tải bài tập...</div>;
  if (!exam) return <div className="h-full flex items-center justify-center text-red-500 bg-gray-50 font-bold p-6">❌ Không tìm thấy dữ liệu bài tập</div>;

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* ── HEADER PHÒNG THI ẢO (TỐI ƯU CỰC MƯỢT TRÊN ĐIỆN THOẠI) ── */}
      <div className="bg-teal-700 text-white px-3 py-2 sm:px-6 sm:py-3.5 flex items-center justify-between gap-2 shadow-md shrink-0 z-30">
        <div className="flex-1 min-w-0 pr-1 sm:pr-4">
          <h2 className="font-extrabold text-xs sm:text-base md:text-lg truncate leading-tight">{exam.title}</h2>
          <p className="text-[10px] sm:text-xs text-teal-200 truncate mt-0.5">Học sinh: <strong className="text-white">{studentName}</strong></p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Đồng hồ đếm ngược */}
          <div className="text-center bg-teal-900/80 px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg border border-teal-500 flex items-center gap-1">
            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-teal-300" />
            <span className="font-mono font-black text-xs sm:text-base leading-none text-teal-100">
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </span>
          </div>

          {/* Nút xoay ngang màn hình */}
          <button
            onClick={toggleOrientation}
            title={isLandscape ? "Chuyển về màn hình dọc" : "Xoay ngang màn hình để nhìn rộng đề thi"}
            className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow"
          >
            <RotateCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isLandscape ? 'rotate-90 text-amber-300' : ''}`} />
            <span>{isLandscape ? 'Dọc' : 'Ngang'}</span>
          </button>

          <button 
            onClick={onExit} 
            className="bg-gray-600 hover:bg-gray-700 active:scale-95 text-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition"
          >
            Thoát
          </button>

          <button 
            onClick={() => setShowConfirm(true)} 
            className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white px-3 py-1 sm:px-4 sm:py-1.5 rounded-lg text-xs sm:text-sm font-black transition shadow flex items-center gap-1"
          >
            <Send className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Nộp bài
          </button>
        </div>
      </div>

      {/* ── DANH SÁCH CÂU HỎI (CUỘN RIÊNG, KHÔNG BỊ CHE KHUẤT) ── */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 max-w-4xl mx-auto w-full space-y-3.5 sm:space-y-5 custom-scrollbar pb-24">
        {exam.questions.map((q: any, i: number) => {
          const displayNum = (q.number % 100) || (i + 1);
          const uAns = answers[q.number];
          let cleanText = (q.text || '').trim();
          cleanText = cleanText.replace(/^(<strong>)?Câu\s*\d+\s*[.:]?(<\/strong>)?\s*/i, '');
          const formattedText = cleanText
            .replace(/([.:;?!,])\s*(\([a-e]\))/g, '$1<br/>$2')
            .replace(/([.:;?!,])\s*(\([1-6]\))/g, '$1<br/>$2')
            .replace(/([.:;?!,])\s*(Bước\s*\d+[:.])/gi, '$1<br/>$2')
            .replace(/([.:;?!,])\s*(Phần\s*\d+[:.])/gi, '$1<br/>$2')
            .replace(/([.:;?!])\s*(Số\s*phát\s*biểu|Các\s*biện\s*pháp|Liệt\s*kê\s*các|Xác\s*định\s*%)/gi, '$1<br/>$2');
          
          return (
            <div key={q.number} className="bg-white p-3.5 sm:p-5 rounded-2xl shadow-sm border border-gray-100">
              {/* Tiêu đề câu hỏi */}
              <div className="flex items-start gap-2.5 sm:gap-3 mb-3 border-b pb-2.5">
                <div className="px-2.5 py-1 rounded-lg bg-teal-600 text-white flex items-center justify-center font-black text-xs sm:text-sm shrink-0 mt-0.5 shadow-sm">
                  Câu {displayNum}
                </div>
                <div className="flex-1 min-w-0 pt-0.5 text-xs sm:text-sm md:text-base text-gray-800 font-medium overflow-x-auto leading-relaxed">
                  <MathText html={formattedText} block />
                </div>
              </div>

              {/* DẠNG 1: Trắc nghiệm 4 lựa chọn (1 cột trên Mobile, 2 cột trên Tablet/Desktop) */}
              {q.type === 'multiple_choice' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 pl-0 sm:pl-9">
                  {q.options?.map((opt: any) => {
                    const isSelected = uAns === opt.letter;
                    return (
                      <label 
                        key={opt.letter} 
                        className={`flex items-start gap-2.5 p-2.5 sm:p-3 border-2 rounded-xl cursor-pointer transition select-none ${
                          isSelected ? 'border-teal-500 bg-teal-50/80 shadow-sm' : 'border-gray-100 hover:border-teal-200 bg-white'
                        }`}
                      >
                        <input 
                          type="radio" 
                          name={`q${q.number}`} 
                          value={opt.letter} 
                          checked={isSelected} 
                          onChange={e => handleAnswer(q.number, e.target.value)} 
                          className="hidden" 
                        />
                        <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 transition ${
                          isSelected ? 'bg-teal-500 text-white shadow' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {opt.letter}
                        </span>
                        <div className="flex-1 overflow-x-auto min-w-0 text-xs sm:text-sm text-gray-800 leading-snug">
                          <MathText html={opt.text} />
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* DẠNG 2: Các câu Đúng / Sai chuẩn format 2025 */}
              {q.type === 'true_false' && (
                <div className="pl-0 sm:pl-9 overflow-x-auto">
                  <TrueFalseGrid options={q.options || []} userAnswer={uAns} onChange={val => handleAnswer(q.number, val)} />
                </div>
              )}

              {/* DẠNG 3: Các câu Trả lời ngắn / Điền số */}
              {q.type === 'short_answer' && (
                <div className="pl-0 sm:pl-9">
                  <input 
                    type="text" 
                    value={uAns || ''} 
                    onChange={e => handleAnswer(q.number, e.target.value)} 
                    placeholder="Nhập đáp án của em..." 
                    className="w-full max-w-md p-2.5 sm:p-3 text-xs sm:text-sm border-2 border-gray-200 rounded-xl outline-none focus:border-teal-500 transition" 
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── MODAL XÁC NHẬN NỘP BÀI ── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-5 sm:p-6 max-w-sm w-full text-center shadow-2xl">
            <h3 className="text-lg sm:text-xl font-extrabold mb-1.5 text-gray-900">Xác nhận nộp bài?</h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-5">
              Em đã hoàn thành <strong className="text-teal-600">{answeredCount}/{totalQuestions}</strong> câu hỏi.
            </p>
            <div className="flex gap-2.5">
              <button 
                onClick={() => setShowConfirm(false)} 
                className="flex-1 py-2.5 rounded-xl border border-gray-300 font-bold text-gray-700 hover:bg-gray-50 text-xs sm:text-sm transition"
              >
                Làm tiếp
              </button>
              <button 
                onClick={handleSubmit} 
                className="flex-1 py-2.5 rounded-xl font-black text-white bg-teal-600 hover:bg-teal-700 text-xs sm:text-sm transition shadow-lg"
              >
                Nộp luôn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Bảng Đúng/Sai tối ưu cho cả điện thoại màn hình hẹp
const TrueFalseGrid: React.FC<any> = ({ options, userAnswer, onChange }) => {
  const tfMap = useMemo(() => parseTFAnswer(userAnswer), [userAnswer]);
  
  const handleSelect = (letter: string, val: 'T' | 'F') => {
    const current = { ...tfMap }; const key = letter.toLowerCase();
    if (current[key] === val) delete current[key]; else current[key] = val;
    onChange(serializeTFAnswer(current));
  };

  return (
    <div className="rounded-xl border-2 border-teal-600 overflow-hidden shadow-sm mt-2">
      {/* HEADER BẢNG */}
      <div className="grid grid-cols-[1fr_60px_60px] sm:grid-cols-[1fr_80px_80px] bg-teal-600 text-[11px] sm:text-xs font-black text-white uppercase divide-x-2 divide-teal-500 border-b-2 border-teal-600">
        <div className="px-3 py-2 flex items-center bg-teal-600">Mệnh đề</div>
        <div className="py-2 flex items-center justify-center gap-1 bg-teal-600"><CheckIcon className="w-3.5 h-3.5"/> Đúng</div>
        <div className="py-2 flex items-center justify-center gap-1 bg-teal-600"><XIcon className="w-3.5 h-3.5"/> Sai</div>
      </div>
      
      {/* CÁC DÒNG MỆNH ĐỀ */}
      <div className="divide-y-2 divide-teal-100">
        {options.map((opt: any, idx: number) => {
          const displayLetter = String.fromCharCode(97 + idx); // a, b, c, d
          const cVal = tfMap[opt.letter.toLowerCase()];
          
          return (
            <div key={opt.letter} className="grid grid-cols-[1fr_60px_60px] sm:grid-cols-[1fr_80px_80px] bg-white divide-x-2 divide-teal-100 hover:bg-teal-50/30 transition-colors">
              <div className="px-3 py-2.5 sm:px-4 sm:py-3 flex gap-2 items-start">
                <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-xs font-black shrink-0 shadow-sm border border-teal-100 mt-0.5">
                  {displayLetter}
                </span>
                <div className="flex-1 text-xs sm:text-sm text-gray-800 leading-snug overflow-x-auto">
                  <MathText html={opt.text || ''} />
                </div>
              </div>

              {/* NÚT ĐÚNG */}
              <button 
                type="button"
                onClick={() => handleSelect(opt.letter, 'T')} 
                className={`flex items-center justify-center transition-all outline-none active:scale-90 ${
                  cVal === 'T' ? 'bg-emerald-500 text-white font-black shadow-inner' : 'text-gray-300 hover:bg-emerald-50'
                }`}
              >
                {cVal === 'T' ? <CheckIcon className="w-5 h-5 stroke-[3]" /> : <span className="text-gray-300 text-xs">Đ</span>}
              </button>

              {/* NÚT SAI */}
              <button 
                type="button"
                onClick={() => handleSelect(opt.letter, 'F')} 
                className={`flex items-center justify-center transition-all outline-none active:scale-90 ${
                  cVal === 'F' ? 'bg-red-500 text-white font-black shadow-inner' : 'text-gray-300 hover:bg-red-50'
                }`}
              >
                {cVal === 'F' ? <XIcon className="w-5 h-5 stroke-[3]" /> : <span className="text-gray-300 text-xs">S</span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
