// @ts-nocheck
import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'

// Pages Quản lý (CRM)
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Classes from '@/pages/Classes'
import Students from '@/pages/Students'
import Attendance from '@/pages/Attendance'
import Tuition from '@/pages/Tuition'
import EmailCenter from '@/pages/EmailCenter'
import UserMgmt from '@/pages/UserMgmt'

// Pages Thi cử & Học tập (LMS)
import ExamMgmt from '@/pages/ExamMgmt'
import ExamRoomsMgmt from '@/pages/ExamRoomsMgmt'
import ExamResultsPage from '@/pages/ExamResultsPage'
import StudentPortal from '@/pages/StudentPortal'
import LiveClassroomPage from '@/pages/LiveClassroomPage'
import CasioCalculatorPage from '@/pages/CasioCalculatorPage'
import ExamRoomPage from '@/pages/ExamRoomPage'
import CreatePdfExamPage from '@/pages/CreatePdfExamPage'
import CreateTexExamPage from '@/pages/CreateTexExamPage'
import CreateWorksheetPage from '@/pages/CreateWorksheetPage'   // ← MỚI

// Pages Khóa học mới
import CourseMgmt from '@/pages/CourseMgmt'
import StudentCourseViewer from '@/pages/StudentCourseViewer'

// Pages Chấm thi AI
import PhieuGrader from '@/pages/PhieuGrader'

// Pages Công cụ bổ trợ
import OcrToolPage from '@/pages/OcrToolPage'
import LatexToolsPage from '@/pages/LatexToolsPage'
import WordToolsPage from '@/pages/WordToolsPage'
import NhanVoPage from '@/pages/NhanVoPage'

// Pages Thẻ học viên & Tiến trình
import StudentCards from '@/pages/StudentCards'
import StudentProgressPage from '@/pages/StudentProgressPage'
import ZaloCenter from '@/pages/ZaloCenter'

// --- PHỤ TRỢ: LOADER ---
function Spinner() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-4 border-teal-100 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-teal-600 rounded-full border-t-transparent animate-spin"></div>
      </div>
      <p className="text-teal-700 text-sm font-bold tracking-widest animate-pulse uppercase">Lớp Học Thầy Thọ</p>
    </div>
  )
}

// --- BẢO VỆ ĐƯỜNG DẪN (Auth Guard) ---
interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { user, loading, isAdmin } = useAuthStore()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin()) return <Navigate to="/" replace />

  return <>{children}</>
}

export default function App() {
  const { init, loading } = useAuthStore()

  useEffect(() => {
    void init()
  }, [init])

  if (loading) return <Spinner />

  return (
    <Routes>
      {/* 1. CỔNG CÔNG KHAI DÀNH CHO HỌC SINH VÀ ĐĂNG NHẬP */}
      <Route path="/login"    element={<Login />} />
      <Route path="/thi"      element={<StudentPortal />} />
      {/* PHÒNG HỌC LIVE CỐ ĐỊNH THEO SỐ ĐIỆN THOẠI THẦY THỌ */}
      <Route path="/casio"       element={<CasioCalculatorPage />} />
      <Route path="/may-tinh-casio" element={<CasioCalculatorPage />} />
      <Route path="/0345833133"   element={<LiveClassroomPage />} />
      <Route path="/0345.833.133" element={<LiveClassroomPage />} />
      <Route path="/live"         element={<LiveClassroomPage />} />
      <Route path="/live/:roomId" element={<LiveClassroomPage />} />
      <Route path="/progress" element={<StudentProgressPage />} />

      {/* 2. PHÒNG THI & XEM KHÓA HỌC (Giao diện tập trung) */}
      <Route path="/exam-room/:roomId"                    element={<ExamRoomPage />} />
      <Route path="/course-viewer/:courseId/:studentId"   element={<StudentCourseViewer />} />

      {/* 3. HỆ THỐNG QUẢN TRỊ (Phải đăng nhập) */}
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>

        {/* --- Nhóm Quản lý Đào tạo --- */}
        <Route index element={<Dashboard />} />
        <Route path="classes"    element={<Classes />} />
        <Route path="students"   element={<Students />} />
        <Route path="attendance" element={<Attendance />} />

        {/* --- Nhóm Học liệu & Thi cử --- */}
        <Route path="courses"              element={<CourseMgmt />} />
        <Route path="exams"                element={<ExamMgmt />} />
        <Route path="create-pdf-exam"      element={<CreatePdfExamPage />} />
        <Route path="create-tex-exam"      element={<CreateTexExamPage />} />
        <Route path="create-worksheet"     element={<CreateWorksheetPage />} />  {/* ← MỚI */}
        <Route path="exam-rooms"           element={<ExamRoomsMgmt />} />
        <Route path="exam-results/:roomId" element={<ExamResultsPage />} />
        <Route path="phieu-grader"         element={<PhieuGrader />} />

        {/* --- Nhóm Công cụ chuyên dụng --- */}
        <Route path="ocr"            element={<OcrToolPage />} />
        <Route path="latex-tools"    element={<LatexToolsPage />} />
        <Route path="word-tools"     element={<WordToolsPage />} />
        <Route path="casio"          element={<CasioCalculatorPage />} />
        <Route path="student-labels" element={<NhanVoPage />} />

        {/* --- Nhóm Hệ thống (Chỉ Admin) --- */}
        <Route path="zalo"          element={<ProtectedRoute adminOnly><ZaloCenter /></ProtectedRoute>} />
        <Route path="student-cards" element={<ProtectedRoute adminOnly><StudentCards /></ProtectedRoute>} />
        <Route path="tuition"       element={<ProtectedRoute adminOnly><Tuition /></ProtectedRoute>} />
        <Route path="email"         element={<ProtectedRoute adminOnly><EmailCenter /></ProtectedRoute>} />
        <Route path="users"         element={<ProtectedRoute adminOnly><UserMgmt /></ProtectedRoute>} />

      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
