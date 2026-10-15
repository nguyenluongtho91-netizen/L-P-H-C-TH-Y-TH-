// @ts-nocheck
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Lock, CheckCircle, PlayCircle, ChevronLeft, Menu, X, BookOpen, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LessonExamRoom from '@/components/LessonExamRoom'
import InteractiveVideoPlayer from '@/components/InteractiveVideoPlayer'
import toast from 'react-hot-toast'

const sortLessons = (lessons: any[]) => {
  return [...lessons].sort((a, b) => {
    const getNum = (title: string) => {
      const match = title.match(/(?:buổi|buoi|bài|bai|lớp|lop)\s*(\d+)/i) || title.match(/(\d+)/)
      return match ? parseInt(match[1], 10) : Infinity
    }
    const numA = getNum(a.title || '')
    const numB = getNum(b.title || '')
    if (numA !== numB) return numA - numB
    return (a.title || '').localeCompare(b.title || '', 'vi', { numeric: true, sensitivity: 'base' })
  })
}

export default function StudentCourseViewer({ courseId: propCourseId, studentId: propStudentId }: { courseId?: string, studentId?: string }) {
  const params = useParams<{ courseId: string, studentId: string }>()
  const courseId = propCourseId || params.courseId
  const studentId = propStudentId || params.studentId

  const [course, setCourse] = useState<any>(null)
  const [progress, setProgress] = useState<any[]>([])
  const [activeLesson, setActiveLesson] = useState<any>(null)
  const [activePracticeExamId, setActivePracticeExamId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState('Học sinh')
  const [exams, setExams] = useState<any[]>([])
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const sessionStr = localStorage.getItem('current_student')
    if (sessionStr) {
      const currentStudent = JSON.parse(sessionStr)
      setStudentName(currentStudent.full_name || currentStudent.name || 'Học sinh')
    }

    const fetchData = async () => {
      const { data: courseData } = await supabase.from('courses')
        .select('*, chapters(*, lessons(*))').eq('id', courseId).single()
      
      const { data: progressData } = await supabase.from('student_progress')
        .select('*').eq('student_id', studentId)

      const { data: examsData } = await supabase.from('exams').select('id, title')

      setCourse(courseData)
      setProgress(progressData || [])
      setExams(examsData || [])
      
      if (courseData?.chapters && courseData.chapters.length > 0) {
        const sortedChapters = [...courseData.chapters].sort((a: any, b: any) => a.order_index - b.order_index)
        const firstChapter = sortedChapters[0]
        if (firstChapter?.lessons && firstChapter.lessons.length > 0) {
          const sortedLessons = sortLessons(firstChapter.lessons)
          setActiveLesson(sortedLessons[0])
        }
      }
    }
    fetchData()
  }, [courseId, studentId])

  useEffect(() => {
    if (activeLesson) {
      const currentPdfs = activeLesson.pdf_list || (activeLesson.pdf_url ? [{ name: 'Tài liệu PDF', url: activeLesson.pdf_url }] : []);
      if (currentPdfs.length > 0) {
        setActivePdfUrl(currentPdfs[0].url)
      } else {
        setActivePdfUrl(null)
      }
    } else {
      setActivePdfUrl(null)
    }
  }, [activeLesson])

  const isUnlocked = (_lesson: any) => true

  const handlePracticeSubmitted = async (percentage: number) => {
    try {
      await supabase.from('student_progress').upsert({
        student_id: studentId,
        lesson_id: activeLesson.id,
        is_passed: percentage >= 80,
        highest_score: percentage
      });

      if (percentage >= 80) {
        toast.success('🎉 Bạn đã đạt trên 80% và hoàn thành bài học!')
        const { data: progressData } = await supabase.from('student_progress').select('*').eq('student_id', studentId)
        setProgress(progressData || [])
      } else {
        toast.error(`⚠️ Điểm của bạn là ${percentage}%. Cần đạt 80% để qua bài.`)
      }
    } catch(e) {
      console.error(e);
    } finally {
      setActivePracticeExamId(null);
    }
  }

  if (activePracticeExamId) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="px-3 py-2 sm:p-4 bg-gray-100 flex items-center border-b shadow-sm">
          <button 
            onClick={() => setActivePracticeExamId(null)} 
            className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-700 hover:text-red-600 font-bold transition py-1 px-2 rounded-lg hover:bg-gray-200"
          >
            <ChevronLeft className="w-4 h-4" /> Thoát luyện tập
          </button>
        </div>
        <div className="flex-1 relative overflow-hidden">
          <LessonExamRoom 
            examId={activePracticeExamId} 
            studentName={studentName}
            onSubmitted={handlePracticeSubmitted}
            onExit={() => setActivePracticeExamId(null)} 
          />
        </div>
      </div>
    )
  }

  const currentExamIds = activeLesson ? (activeLesson.exam_ids || (activeLesson.exam_id ? [activeLesson.exam_id] : [])) : [];
  const currentPdfs = activeLesson ? (activeLesson.pdf_list || (activeLesson.pdf_url ? [{ name: 'Tài liệu PDF', url: activeLesson.pdf_url }] : [])) : [];

  return (
    <div className="flex flex-col md:flex-row h-screen bg-white overflow-hidden">
      {/* ── THANH TIÊU ĐỀ MOBILE (CHỈ HIỆN TRÊN ĐIỆN THOẠI) ── */}
      <div className="md:hidden flex items-center justify-between px-3 py-2.5 bg-teal-700 text-white shadow-md z-30 shrink-0">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="flex items-center gap-1.5 text-xs font-bold bg-teal-800 hover:bg-teal-900 active:scale-95 px-3 py-1.5 rounded-lg border border-teal-500 shadow-sm transition"
        >
          <Menu className="w-4 h-4" /> Đề cương bài học
        </button>
        <span className="text-xs font-bold truncate max-w-[190px]">{course?.title || 'Khóa học trực tuyến'}</span>
      </div>

      {/* ── BACKDROP MỜ KHI MỞ MENU TRÊN ĐIỆN THOẠI ── */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR ĐỀ CƯƠNG (RESPONSIVE DRAWER TRÊN MOBILE, CỐ ĐỊNH TRÊN DESKTOP) ── */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] border-r overflow-y-auto p-4 bg-gray-50 custom-scrollbar transition-transform duration-300 md:static md:translate-x-0 ${
        isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="flex items-center justify-between mb-4 md:mb-6 pb-2 border-b md:border-none">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-600 shrink-0" />
            <h2 className="font-extrabold text-base sm:text-lg text-teal-950 line-clamp-2">{course?.title}</h2>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition"
            title="Đóng menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {course?.chapters?.sort((a:any, b:any) => a.order_index - b.order_index).map((chapter: any) => (
          <div key={chapter.id} className="mb-5">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2.5 px-1">{chapter.title}</h3>
            <div className="space-y-1.5">
              {sortLessons(chapter.lessons || []).map((lesson: any) => {
                const unlocked = isUnlocked(lesson)
                const passed = progress.find(p => p.lesson_id === lesson.id)?.is_passed
                const isSelected = activeLesson?.id === lesson.id
                return (
                  <button 
                    key={lesson.id}
                    disabled={!unlocked}
                    onClick={() => {
                      setActiveLesson(lesson);
                      setIsSidebarOpen(false); // Tự động đóng sidebar trên mobile sau khi chọn bài
                    }}
                    className={`w-full flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl transition-all text-left ${
                      isSelected ? 'bg-teal-600 text-white shadow-md' : 'hover:bg-teal-50 text-gray-700'
                    } ${!unlocked ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                  >
                    {passed ? (
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 shrink-0" />
                    ) : unlocked ? (
                      <PlayCircle className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${isSelected ? 'text-white' : 'text-teal-500'}`} />
                    ) : (
                      <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 shrink-0" />
                    )}
                    <span className="text-xs sm:text-sm font-semibold line-clamp-2 leading-snug">{lesson.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </aside>

      {/* ── KHU VỰC NỘI DUNG CHÍNH (MAIN) ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto md:overflow-hidden bg-gray-50">
        {activeLesson ? (
          <div className="flex-1 flex flex-col min-w-0 h-full">
            {/* Header bài học + Nút làm bài thi online */}
            <div className="p-3 sm:p-4 border-b bg-white shadow-sm z-10 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold uppercase bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">Bài học đang chọn</span>
                  </div>
                  <h1 className="font-extrabold text-base sm:text-xl text-gray-900 leading-snug break-words">
                    {activeLesson.title}
                  </h1>
                </div>

                {/* Các nút đề thi Online */}
                {currentExamIds.length > 0 && (
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto shrink-0">
                    {currentExamIds.map((exId: string, idx: number) => {
                      const examObj = exams.find((e: any) => e.id === exId);
                      const displayTitle = examObj?.title || `Đề thi ${idx + 1}`;
                      return (
                        <button 
                          key={exId} 
                          onClick={() => setActivePracticeExamId(exId)} 
                          className="w-full sm:w-auto bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-95 text-white font-bold px-4 py-2.5 rounded-xl shadow-md transition text-xs sm:text-sm flex items-center justify-center gap-1.5"
                        >
                          <span>✏️</span> Làm bài Online: {displayTitle}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Thông báo hướng dẫn nếu bài có đề thi online */}
              {currentExamIds.length > 0 && (
                <div className="mt-2.5 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-1.5">
                  <span className="font-bold">💡 Hướng dẫn:</span>
                  <span>Bài học có <strong>{currentExamIds.length} đề thi online</strong>. Bấm nút màu xanh ở trên để làm bài và xem điểm tự động!</span>
                </div>
              )}
            </div>

            {/* Thanh chuyển tài liệu PDF (nếu bài có nhiều file PDF) */}
            {currentPdfs.length > 1 && (
              <div className="flex gap-2 p-2 bg-gray-100 border-b overflow-x-auto shrink-0">
                {currentPdfs.map((pdf: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setActivePdfUrl(pdf.url)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition shrink-0 flex items-center gap-1 ${
                      activePdfUrl === pdf.url 
                      ? 'bg-teal-600 text-white border-teal-600 shadow-sm' 
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-teal-50 hover:text-teal-700'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" /> {pdf.name}
                  </button>
                ))}
              </div>
            )}

            {/* Trình phát Video / Tài liệu PDF */}
            <div className="flex-1 bg-gray-900 relative min-h-[300px] sm:min-h-0">
              {activeLesson.video_url ? (
                <InteractiveVideoPlayer 
                   lesson={activeLesson} 
                   onComplete={() => handlePracticeSubmitted(100)} 
                />
              ) : activePdfUrl ? (
                <iframe src={`${activePdfUrl}#toolbar=0`} className="w-full h-full border-none bg-white" title="Tài liệu bài học" />
              ) : (
                <div className="w-full h-full min-h-[250px] flex flex-col items-center justify-center text-gray-400 p-6 text-center">
                  <BookOpen className="w-12 h-12 mb-3 text-gray-500 opacity-60" />
                  <p className="text-sm font-semibold">Bài học này chưa có Video bài giảng</p>
                  <p className="text-xs text-gray-500 mt-1">Học sinh có thể bấm nút màu xanh ở trên để làm bài kiểm tra trực tuyến!</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 font-bold text-base p-6 text-center">
            <BookOpen className="w-16 h-16 text-teal-400 mb-3 opacity-60" />
            <p>Vui lòng chọn một bài học từ đề cương để bắt đầu</p>
          </div>
        )}
      </main>
    </div>
  )
}
