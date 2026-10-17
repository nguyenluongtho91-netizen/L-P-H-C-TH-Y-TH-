// @ts-nocheck
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  LogOut, 
  ChevronRight, 
  BookOpen, 
  UserCircle, 
  GraduationCap, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Lock, 
  FileText, 
  CheckCircle, 
  Clock,
  RefreshCw,
  Camera,
  Upload,
  Trash2,
  X,
  Loader2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { shuffleExamForStudent } from '@/services/mergeExamsService'
import { getStudentCredential, saveStudentCredential } from '@/services/studentCredentialsService'

const BANK_ID      = import.meta.env.VITE_BANK_ID      || 'VCB'
const BANK_ACCOUNT = import.meta.env.VITE_BANK_ACCOUNT || '1070493932'
const BANK_NAME    = import.meta.env.VITE_BANK_NAME    || import.meta.env.VITE_BANK_ACCOUNT_NAME || 'HO KINH DOANH NGUYEN LUONG THO'

export default function StudentPortal() {
  const navigate = useNavigate()
  const [student, setStudent] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Đăng nhập form
  const [studentCodeInput, setStudentCodeInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  // Danh sách bài thi và bài làm
  const [examsList, setExamsList] = useState<any[]>([])
  const [submissionsList, setSubmissionsList] = useState<any[]>([])
  const [tuitionNotifications, setTuitionNotifications] = useState<any[]>([])

  // Đổi mật khẩu
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOldPass, setShowOldPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Đổi ảnh đại diện
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false)
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)

  useEffect(() => {
    const sessionStr = localStorage.getItem('current_student')
    if (sessionStr) {
      const parsed = JSON.parse(sessionStr)
      setStudent(parsed)
      fetchStudentData(parsed.id)
    } else {
      setLoading(false)
    }
  }, [])

  // ── Tải danh sách bài thi và kết quả làm bài ─────────────────
  const fetchStudentData = async (studentId: string) => {
    setLoading(true)
    try {
      // 0. Cập nhật lại dữ liệu học sinh mới nhất từ DB
      const { data: latestStudent } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .maybeSingle()

      if (latestStudent) {
        const cred = await getStudentCredential(latestStudent.student_code)
        if (cred?.avatar_url) {
          latestStudent.avatar_url = cred.avatar_url
        }
        setStudent(latestStudent)
        localStorage.setItem('current_student', JSON.stringify(latestStudent))
      }

      // 1. Lấy danh sách lớp học sinh tham gia
      const { data: enrolls } = await supabase
        .from('enrollments')
        .select('class_id')
        .eq('student_id', studentId)
        .eq('status', 'active')

      const myClassIds = enrolls?.map(e => e.class_id) || []

      // 1.1. Lấy thông báo học phí chưa thanh toán
      const { data: tuitionNotifs, error: tuitionErr } = await supabase
        .from('tuition_notifications')
        .select('*')
        .eq('student_id', studentId)
        .eq('is_paid', false)

      if (tuitionErr) {
        console.error('Lỗi tải thông báo học phí:', tuitionErr)
      } else {
        setTuitionNotifications(tuitionNotifs || [])
      }

      // 2. Lấy tất cả phòng thi
      const { data: rooms, error: roomsErr } = await supabase
        .from('exam_rooms')
        .select(`
          *,
          exams ( title ),
          classes ( class_name )
        `)
        .order('created_at', { ascending: false })

      if (roomsErr) throw roomsErr

      // Lọc phòng thi học sinh được phép tham gia (phòng thi chung hoặc thuộc lớp của học sinh)
      const eligibleRooms = (rooms || []).filter((room: any) => {
        return !room.class_id || myClassIds.includes(room.class_id)
      })

      // 3. Lấy danh sách bài nộp của học sinh
      const { data: subs, error: subsErr } = await supabase
        .from('exam_submissions')
        .select('*')
        .eq('student_id', studentId)

      if (subsErr) throw subsErr

      // Đã loại bỏ logic tự động nộp bài (0 điểm) khi quay về portal để hỗ trợ làm tiếp
      setExamsList(eligibleRooms)
      setSubmissionsList(subs || [])
    } catch (error) {
      console.error('Lỗi tải dữ liệu:', error)
      toast.error('Không thể tải danh sách bài thi.')
    } finally {
      setLoading(false)
    }
  }

  // ── Xác minh học sinh (mã + mật khẩu bắt buộc) ─────────────
  const verifyStudent = async (code: string, password: string) => {
    if (!code.trim()) {
      toast.error('Vui lòng nhập Mã học sinh!')
      return null
    }
    if (!password.trim()) {
      toast.error('Vui lòng nhập Mật khẩu!')
      return null
    }

    const { data, error } = await supabase
      .from('students')
      .select('*')
      .ilike('student_code', code.trim())
      .maybeSingle()

    if (error || !data) {
      toast.error('Sai Mã học sinh! Vui lòng kiểm tra lại.')
      return null
    }

    if (data.status === 'inactive') {
      toast.error('Tài khoản học sinh này đã bị khóa hoặc nghỉ học.')
      return null
    }

    const cred = await getStudentCredential(code.trim())
    const expectedPassword = cred?.password || data.password
    if (cred?.avatar_url) {
      data.avatar_url = cred.avatar_url
    }

    if (expectedPassword) {
      if (expectedPassword !== password.trim()) {
        toast.error('Sai mật khẩu! Vui lòng kiểm tra lại.')
        return null
      }
    } else {
      // Lưu mật khẩu học sinh nhập làm mật khẩu mặc định
      await saveStudentCredential(data.student_code, password.trim())
    }

    localStorage.setItem('current_student', JSON.stringify(data))
    localStorage.setItem('studentName', data.full_name)
    localStorage.setItem('student_name', data.full_name)

    return data
  }

  // ── Đăng nhập học sinh ─────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoggingIn(true)
    try {
      const studentData = await verifyStudent(studentCodeInput, passwordInput)
      if (!studentData) return

      setStudent(studentData)
      toast.success(`Xin chào, ${studentData.full_name}! 👋`)
      await fetchStudentData(studentData.id)
    } catch (err) {
      toast.error('Lỗi kết nối máy chủ!')
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('current_student')
    localStorage.removeItem('studentName')
    localStorage.removeItem('student_name')
    setStudent(null)
    setStudentCodeInput('')
    setPasswordInput('')
    setExamsList([])
    setSubmissionsList([])
  }

  const resetChangePasswordForm = () => {
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShowOldPass(false)
    setShowNewPass(false)
    setShowConfirmPass(false)
  }

  const handleChangePassword = async () => {
    if (!oldPassword.trim()) {
      toast.error('Vui lòng nhập mật khẩu hiện tại!')
      return
    }
    if (!newPassword.trim()) {
      toast.error('Vui lòng nhập mật khẩu mới!')
      return
    }
    if (newPassword.trim() === oldPassword.trim()) {
      toast.error('Mật khẩu mới không được trùng với mật khẩu cũ!')
      return
    }
    if (newPassword.trim().length < 4) {
      toast.error('Mật khẩu mới phải từ 4 ký tự trở lên!')
      return
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      toast.error('Xác nhận mật khẩu mới không khớp!')
      return
    }

    if (student.password !== oldPassword.trim()) {
      toast.error('Mật khẩu hiện tại không chính xác!')
      return
    }

    setIsChangingPassword(true)
    try {
      await saveStudentCredential(student.student_code, newPassword.trim())

      // Cập nhật state cục bộ và localStorage
      const updatedStudent = { ...student, password: newPassword.trim() }
      setStudent(updatedStudent)
      localStorage.setItem('current_student', JSON.stringify(updatedStudent))

      toast.success('Đổi mật khẩu thành công! 🔑')
      setIsChangePasswordOpen(false)
      resetChangePasswordForm()
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Lỗi khi đổi mật khẩu.')
    } finally {
      setIsChangingPassword(false)
    }
  }

  // ── Xử lý chọn & lưu ảnh đại diện ─────────────────────────
  const handleSelectAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file hình ảnh (PNG, JPG, JPEG, WEBP,...)!')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dung lượng ảnh tối đa là 5MB!')
      return
    }
    setSelectedAvatarFile(file)
    const reader = new FileReader()
    reader.onload = () => {
      setAvatarPreviewUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSaveAvatar = async () => {
    if (!selectedAvatarFile || !student?.id) return
    setIsUploadingAvatar(true)
    try {
      const fileExt = selectedAvatarFile.name.split('.').pop() || 'png'
      const fileName = `student_${student.id}_${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('exams_pdf')
        .upload(filePath, selectedAvatarFile, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('exams_pdf')
        .getPublicUrl(filePath)

      await saveStudentCredential(student.student_code, undefined, undefined, publicUrl)

      const updatedStudent = { ...student, avatar_url: publicUrl }
      setStudent(updatedStudent)
      localStorage.setItem('current_student', JSON.stringify(updatedStudent))
      toast.success('Cập nhật ảnh đại diện thành công! ✨')
      setIsAvatarModalOpen(false)
      setSelectedAvatarFile(null)
      setAvatarPreviewUrl(null)
    } catch (err: any) {
      console.error('Lỗi upload avatar:', err)
      toast.error('Lỗi tải ảnh lên: ' + (err.message || 'Thử lại sau'))
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleRemoveAvatar = async () => {
    if (!student?.id) return
    if (!confirm('Bạn có chắc chắn muốn xóa ảnh đại diện hiện tại?')) return
    setIsUploadingAvatar(true)
    try {
      await saveStudentCredential(student.student_code, undefined, undefined, '')

      const updatedStudent = { ...student, avatar_url: null }
      setStudent(updatedStudent)
      localStorage.setItem('current_student', JSON.stringify(updatedStudent))
      toast.success('Đã xóa ảnh đại diện thành công!')
      setIsAvatarModalOpen(false)
      setSelectedAvatarFile(null)
      setAvatarPreviewUrl(null)
    } catch (err: any) {
      console.error('Lỗi xóa avatar:', err)
      toast.error('Lỗi xóa ảnh: ' + (err.message || 'Thử lại sau'))
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleRetakeExam = async (room: any, sub: any) => {
    if (!confirm('Bạn có muốn thi lại bài này? Kết quả cũ sẽ được lưu vào lịch sử.')) return

    const toastId = toast.loading('Đang khởi tạo lại bài thi...')
    try {
      const currentAttempt = sub.score_breakdown?.attempt_count || 1
      const currentHistory = sub.score_breakdown?.history || []

      const finishedAttemptData = {
        attempt: currentAttempt,
        score: sub.score,
        tab_switches: sub.tab_switches || 0,
        submitted_at: sub.submitted_at,
        duration: sub.duration || 0
      }

      const newHistory = [...currentHistory, finishedAttemptData]

      // Fetch exam data to shuffle if needed
      const { data: examData, error: examErr } = await supabase
        .from('exams')
        .select('data')
        .eq('id', room.exam_id)
        .single()

      if (examErr || !examData) throw new Error('Không tìm thấy đề thi')

      const hasRealQuestions = examData.data?.questions && examData.data.questions.length > 0 &&
        !examData.data.questions.every((q: any) => 
          /^(câu\s+\d+|câu\s+tự\s+luận\s+\d+):?$/i.test((q.text || '').trim())
        );
      const isPdf = !hasRealQuestions && (!!examData.data?.pdfUrl || !!examData.data?.pdfDriveUrl || !!examData.data?.pdfBase64);

      let nextExamData = examData.data
      if (!isPdf && room.settings?.shuffle) {
        nextExamData = shuffleExamForStudent(examData.data)
      }

      const { error: updateErr } = await supabase
        .from('exam_submissions')
        .update({
          status: 'in_progress',
          answers: {},
          score: null,
          score_breakdown: {
            shuffled_exam: nextExamData,
            attempt_count: currentAttempt + 1,
            history: newHistory
          },
          submitted_at: null,
          tab_switches: 0,
          tab_switch_warnings: [],
          duration: 0
        })
        .eq('id', sub.id)

      if (updateErr) throw updateErr

      toast.success('Khởi tạo thành công! Đang vào phòng thi...', { id: toastId })
      await fetchStudentData(student.id)
      navigate(`/exam-room/${room.id}`)
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Lỗi khi thiết lập thi lại.', { id: toastId })
    }
  }

  // ── Loading ──────────────────────────────────────────────────
  if (loading && student) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-teal-50">
        <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 font-bold text-teal-700">Đang tải danh sách bài thi...</p>
      </div>
    )
  }

  // ── GIAO DIỆN ĐĂNG NHẬP ─────────────────────────────────────
  if (!student) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #ccfbf1 0%, #5eead4 50%, #0d9488 100%)' }}
      >
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-teal-300/30 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-teal-600/20 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-md animate-fade-in">
          <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border-2 border-teal-200 overflow-hidden">
            {/* Header */}
            <div 
              className="px-8 pt-10 pb-8 text-center text-white"
              style={{ background: 'linear-gradient(135deg, #0d9488, #14b8a6, #5eead4)' }}
            >
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg backdrop-blur-sm">
                <GraduationCap className="w-9 h-9 text-white" />
              </div>
              <h1 className="font-extrabold text-2xl tracking-wide uppercase">LỚP HỌC THẦY THỌ</h1>
            </div>

            <form onSubmit={handleLogin} className="p-8 space-y-5">
              <h3 className="text-gray-800 font-extrabold text-xl mb-4 text-center">ĐĂNG NHẬP CỔNG THI</h3>

              {/* Mã học sinh */}
              <div>
                <label className="block text-xs font-bold text-teal-700 mb-1 uppercase tracking-wide">Mã học sinh *</label>
                <input
                  type="text"
                  value={studentCodeInput}
                  onChange={e => setStudentCodeInput(e.target.value.toUpperCase())}
                  placeholder="VD: HS001"
                  className="w-full px-4 py-3 rounded-xl border-2 border-teal-100 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 transition-all font-mono font-bold text-lg text-center uppercase tracking-widest bg-white"
                  required
                />
              </div>

              {/* Mật khẩu */}
              <div>
                <label className="block text-xs font-bold text-teal-700 mb-1 uppercase tracking-wide">Mật khẩu *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    placeholder="Nhập mật khẩu"
                    className="w-full px-4 py-3 pr-12 rounded-xl border-2 border-teal-100 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 transition-all font-bold text-lg text-center bg-white"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-400 hover:text-teal-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Cảnh báo giám sát */}
              <div className="bg-amber-50 text-amber-700 p-4 rounded-xl flex gap-2.5 text-xs font-medium border border-amber-100">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">Hệ thống có giám sát chuyển tab. Vui lòng tập trung làm bài thi.</p>
              </div>

              {/* Nút đăng nhập */}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="btn-teal w-full flex items-center justify-center gap-2 text-base py-3.5 shadow-lg shadow-teal-500/25"
              >
                {isLoggingIn ? (
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <span>VÀO HỆ THỐNG</span>
                )}
              </button>
            </form>
          </div>
          <p className="text-center text-white/60 text-xs mt-4">
            © 2025 LỚP HỌC THẦY THỌ – Powered by React + Supabase
          </p>
        </div>
      </div>
    )
  }

  // Phân loại danh sách bài thi
  const submittedRoomIds = submissionsList
    .filter(s => s.status === 'submitted' && s.score !== 0)
    .map(s => s.room_id)

  const inProgressSubMap = new Map()
  submissionsList
    .filter(s => s.status !== 'submitted')
    .forEach(s => inProgressSubMap.set(s.room_id, s))

  // Đã thi: có bài nộp status = 'submitted'
  const completedExams = examsList
    .filter(room => submittedRoomIds.includes(room.id))
    .map(room => {
      const sub = submissionsList.find(s => s.room_id === room.id && s.status === 'submitted')
      return { room, sub }
    })

  // Chưa thi: chưa có bài nộp status = 'submitted'
  const pendingExams = examsList.filter(room => !submittedRoomIds.includes(room.id))
  const activePendingCount = pendingExams.filter(room => room.status !== 'closed' && room.status !== 'waiting').length

  // --- PHÂN TÍCH TIẾN ĐỘ THEO BUỔI & BÀI ---
  const parsedExams = examsList.map(room => {
    const title = room.exams?.title || ''
    const matchBuoi = title.match(/(?:buổi|buoi|b)\s*(\d+)/i)
    const buoi = matchBuoi ? parseInt(matchBuoi[1]) : null

    const matchDe = title.match(/(?:đề|de|bài|bai|đề\s*số|de\s*so)\s*(\d+)/i)
    const bai = matchDe ? parseInt(matchDe[1]) : null

    return { room, buoi, bai, title }
  })

  // Tìm buổi học lớn nhất
  const buoiNumbers = parsedExams
    .map(e => e.buoi)
    .filter(b => typeof b === 'number' && b > 0)
  const maxBuoi = buoiNumbers.length > 0 ? Math.max(...buoiNumbers) : 4

  // Tạo cấu trúc cột: mỗi buổi có Đề 1 và Đề 2
  const tableCols = []
  for (let b = 1; b <= maxBuoi; b++) {
    tableCols.push({ buoi: b, bai: 1 })
    tableCols.push({ buoi: b, bai: 2 })
  }

  // Khớp dữ liệu phòng thi & bài nộp cho từng cột
  const gridData = tableCols.map(c => {
    const matched = parsedExams.find(e => e.buoi === c.buoi && e.bai === c.bai)
    let sub = null
    if (matched) {
      sub = submissionsList.find(s => s.room_id === matched.room.id)
    }
    return {
      buoi: c.buoi,
      bai: c.bai,
      exam: matched ? matched.room : null,
      sub
    }
  })

  const getAttempts = (item: any) => {
    if (!item.exam) return '-'
    if (!item.sub) return '0'
    return item.sub.score_breakdown?.attempt_count || 1
  }

  const getViolations = (item: any) => {
    if (!item.exam) return '-'
    if (!item.sub) return '0'
    const historySwitches = (item.sub.score_breakdown?.history || []).reduce((sum: number, att: any) => sum + (att.tab_switches || 0), 0)
    return (item.sub.tab_switches || 0) + historySwitches
  }

  const getScoreDisplay = (item: any) => {
    if (!item.exam) return '-'
    if (!item.sub) return 'Chưa thi'
    if (item.sub.status !== 'submitted') return 'Đang làm'
    return typeof item.sub.score === 'number' ? item.sub.score.toFixed(1) : 'Chưa chấm'
  }



  // ── DASHBOARD (đã đăng nhập) ─────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-teal-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 text-teal-700">
            <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center shadow-md">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-base leading-tight text-teal-800 uppercase tracking-wide">LỚP HỌC THẦY THỌ</h1>
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-500">Cổng Thi Học Sinh</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 bg-teal-50 px-3.5 py-1.5 rounded-full border border-teal-100">
              <div 
                onClick={() => {
                  setSelectedAvatarFile(null)
                  setAvatarPreviewUrl(null)
                  setIsAvatarModalOpen(true)
                }}
                className="relative group cursor-pointer flex-shrink-0"
                title="Bấm để đổi ảnh đại diện"
              >
                {student.avatar_url ? (
                  <img
                    src={student.avatar_url}
                    alt={student.full_name}
                    className="w-8 h-8 rounded-full object-cover border-2 border-teal-500 shadow-sm transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-sm transition-transform group-hover:scale-105">
                    {student.full_name?.charAt(0)?.toUpperCase() || <UserCircle className="w-5 h-5 text-white" />}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow border border-teal-200 group-hover:bg-teal-100 transition-colors">
                  <Camera className="w-3 h-3 text-teal-700" />
                </div>
              </div>
              <span className="text-sm font-bold text-teal-800">{student.full_name}</span>
              <span className="bg-teal-200 text-teal-800 text-[10px] font-bold px-1.5 py-0.5 rounded-md ml-1 font-mono">{student.student_code}</span>
            </div>
            <button
              onClick={() => {
                setSelectedAvatarFile(null)
                setAvatarPreviewUrl(null)
                setIsAvatarModalOpen(true)
              }}
              className="w-10 sm:w-auto h-10 px-0 sm:px-3.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-xl border border-teal-200 flex items-center justify-center gap-1.5 transition-all flex-shrink-0 shadow-sm"
              title="Đổi ảnh đại diện"
            >
              <Camera className="w-5 h-5 text-teal-600" />
              <span className="hidden sm:inline text-sm font-bold">Đổi ảnh</span>
            </button>
            <button
              onClick={() => setIsChangePasswordOpen(true)}
              className="w-10 sm:w-auto h-10 px-0 sm:px-4 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-xl border border-teal-200 flex items-center justify-center gap-1.5 transition-all flex-shrink-0 shadow-sm"
              title="Đổi mật khẩu"
            >
              <Lock className="w-5 h-5 text-teal-600" />
              <span className="hidden sm:inline text-sm font-bold">Đổi mật khẩu</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-10 sm:w-auto h-10 px-0 sm:px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl border border-rose-200 flex items-center justify-center gap-1.5 transition-all flex-shrink-0 shadow-sm"
              title="Đăng xuất"
            >
              <LogOut className="w-5 h-5 text-rose-600" />
              <span className="hidden sm:inline text-sm font-bold">Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 space-y-8 animate-fade-in">
        {/* Thông báo học phí */}
        {tuitionNotifications.length > 0 && tuitionNotifications.map((notif) => {
          let addInfo = `HP ${student.student_code}`
          if (/^\d{4}-\d{2}$/.test(notif.course_name)) {
            const [y, m] = notif.course_name.split('-')
            addInfo = `HP ${student.student_code} T${parseInt(m)}${y}`
          } else {
            const cleanCourse = notif.course_name
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[đĐ]/g, 'd')
              .toUpperCase()
              .replace(/[^A-Z0-9\s]/g, '')
              .trim()
            addInfo = `HP ${student.student_code} ${cleanCourse}`
          }
          addInfo = addInfo.substring(0, 25).trim()

          const qrUrl = BANK_ID && BANK_ACCOUNT
            ? `https://img.vietqr.io/image/${BANK_ID}-${BANK_ACCOUNT}-compact2.png?amount=${notif.amount}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(BANK_NAME)}`
            : ''

          return (
            <div key={notif.id} className="bg-teal-50 border border-teal-200 rounded-2xl p-5 flex flex-col md:flex-row gap-5 items-center justify-between shadow-md shadow-teal-100/50 transition-all hover:scale-[1.01]">
              <div className="flex gap-4 items-start flex-1 w-full">
                <div className="w-12 h-12 rounded-xl bg-teal-600 flex items-center justify-center text-white flex-shrink-0 animate-pulse mt-1">
                  <span className="text-2xl">💰</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-teal-800 font-extrabold text-lg uppercase tracking-wide flex items-center gap-2">
                    <span>📢 THÔNG BÁO ĐÓNG HỌC PHÍ</span>
                  </h3>
                  <p className="text-teal-900 font-medium text-base mt-1 leading-relaxed">
                    Học phí khóa <strong className="text-teal-700 font-black">{notif.course_name}</strong> của học sinh <strong className="text-teal-700 font-black">{student.full_name}</strong> là <strong className="text-rose-600 font-black text-lg">{Number(notif.amount).toLocaleString('vi-VN')}</strong> Đồng, phụ huynh vui lòng chuyển khoản vào stk: <strong className="text-teal-700 font-black tracking-wider">{BANK_ACCOUNT}</strong> {BANK_NAME}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(BANK_ACCOUNT)
                        toast.success("Đã copy số tài khoản! 📋")
                      }}
                      className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-750 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                    >
                      📋 Copy STK
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(Number(notif.amount).toString())
                        toast.success("Đã copy số tiền! 📋")
                      }}
                      className="px-3.5 py-1.5 bg-white border border-teal-200 text-teal-800 hover:bg-teal-50 rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                      💵 Copy số tiền
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(addInfo)
                        toast.success("Đã copy nội dung chuyển khoản! 📋")
                      }}
                      className="px-3.5 py-1.5 bg-white border border-teal-200 text-teal-750 hover:bg-teal-50 rounded-lg text-xs font-bold transition-all shadow-sm"
                      title={addInfo}
                    >
                      ✍️ Copy Nội dung: {addInfo}
                    </button>
                  </div>
                </div>
              </div>

              {qrUrl && (
                <div className="flex flex-col items-center bg-white p-2.5 rounded-xl border border-teal-200 shadow-sm flex-shrink-0 w-40">
                  <img
                    src={qrUrl}
                    alt="VietQR"
                    className="w-36 h-36 object-contain rounded-lg border border-gray-100"
                  />
                  <span className="text-[9px] text-teal-700 font-extrabold mt-1 uppercase tracking-wider">Quét VietQR để đóng</span>
                </div>
              )}
            </div>
          )
        })}

        {/* Cảnh báo bài tập chưa làm */}
        {activePendingCount > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-center gap-4 shadow-md shadow-rose-100/50 transition-all hover:scale-[1.01]">
            <div className="w-12 h-12 rounded-xl bg-rose-600 flex items-center justify-center text-white flex-shrink-0 animate-bounce">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-rose-800 font-extrabold text-lg uppercase tracking-wide flex items-center gap-2">
                <span>⚠️ CẢNH BÁO HOÀN THÀNH BÀI TẬP</span>
              </h3>
              <p className="text-rose-700 font-bold text-base mt-0.5">
                Em còn <span className="text-2xl font-black text-rose-600 mx-1">{activePendingCount}</span> bài tập chưa làm. Vui lòng hoàn thành hết bài tập về nhà!
              </p>
            </div>
          </div>
        )}

        {/* Cảnh báo chung */}
        <div className="bg-amber-50 text-amber-800 p-4 rounded-2xl flex gap-3 text-sm font-medium border border-amber-200/60 shadow-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
          <div>
            <span className="font-bold">Lưu ý quan trọng:</span> Hệ thống có tính năng giám sát chuyển tab/thoát màn hình khi đang làm bài. Các em hãy tập trung và không chuyển tab khi đang làm bài thi để tránh bị nhắc nhở hoặc khóa bài tự động.
          </div>
        </div>

        {/* BÁO CÁO TIẾN ĐỘ HỌC TẬP (TABLE + CHART) */}
        <section className="bg-white rounded-3xl p-6 border border-teal-100 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-teal-50 pb-4">
            <div>
              <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                📊 Báo Cáo Tiến Độ & Kết Quả Học Tập
              </h2>
              <p className="text-gray-400 text-xs font-semibold mt-0.5">
                Bảng theo dõi buổi học và biểu đồ kết quả điểm số, thời gian làm bài của học sinh.
              </p>
            </div>
            {/* Quick stats badges */}
            <div className="flex gap-2.5 flex-wrap">
              <div className="bg-teal-50 text-teal-700 px-3 py-1.5 rounded-xl border border-teal-100 text-xs font-bold flex items-center gap-1">
                Bài đã làm: <span className="font-extrabold text-sm">{completedExams.length}</span>
              </div>
              <div className="bg-orange-50 text-orange-700 px-3 py-1.5 rounded-xl border border-orange-100 text-xs font-bold flex items-center gap-1">
                Điểm TB: <span className="font-extrabold text-sm">
                  {completedExams.length > 0 
                    ? (completedExams.reduce((sum, item) => sum + (item.sub.score || 0), 0) / completedExams.length).toFixed(1)
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          {/* TABLE MATRIX */}
          <div>
            <h3 className="text-sm font-extrabold text-gray-700 mb-3 uppercase tracking-wider flex items-center gap-1.5">
              <span>📋 Bảng tổng hợp kết quả chi tiết</span>
            </h3>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-teal-600 text-white text-center font-bold text-sm">
                    <th className="p-3 border-r border-teal-750 bg-teal-700 text-center font-black rounded-tl-xl w-[120px]">Buổi học</th>
                    <th className="p-3 border-r border-teal-700 text-center font-black w-[100px]">Mã đề</th>
                    <th className="p-3 border-r border-teal-700 text-center font-black w-[120px]">Điểm số</th>
                    <th className="p-3 text-center font-black rounded-tr-xl">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxBuoi }, (_, i) => maxBuoi - i).map(b => {
                    const items = [
                      gridData.find(d => d.buoi === b && d.bai === 2),
                      gridData.find(d => d.buoi === b && d.bai === 1),
                    ].filter(Boolean)

                    return items.map((item, idx) => {
                      const displayScore = getScoreDisplay(item)
                      let scoreColor = 'text-gray-400'
                      if (item.sub && item.sub.status === 'submitted' && typeof item.sub.score === 'number') {
                        scoreColor = item.sub.score >= 8.0 
                          ? 'text-emerald-600 font-extrabold bg-emerald-50/10' 
                          : item.sub.score >= 5.0 
                            ? 'text-teal-600 font-bold bg-teal-50/5' 
                            : 'text-rose-600 font-extrabold bg-rose-50/10'
                      } else if (displayScore === 'Đang làm') {
                        scoreColor = 'text-amber-600 font-bold animate-pulse'
                      }

                      const isClosed = item.exam?.status === 'closed'
                      const isWaiting = item.exam?.status === 'waiting'

                      return (
                        <tr key={`${b}-${item.bai}`} className="hover:bg-slate-50 transition-colors border-b border-slate-200 text-center">
                          {/* Buổi học cell */}
                          {idx === 0 && (
                            <td 
                              rowSpan={items.length} 
                              className="p-3 border-r border-slate-200 text-center font-extrabold text-gray-800 bg-teal-50/20 text-sm"
                            >
                              Buổi {b}
                            </td>
                          )}

                          {/* Mã đề */}
                          <td className="p-3 border-r border-slate-200 text-center font-bold text-gray-600 text-sm">
                            Đề {item.bai}
                          </td>

                          {/* Điểm số */}
                          <td className={`p-3 border-r border-slate-200 text-center text-sm font-black ${scoreColor}`}>
                            {displayScore}
                          </td>

                          {/* Trạng thái / Hành động */}
                          <td className="p-3 text-center text-sm">
                            {!item.exam ? (
                              <span className="text-gray-400">-</span>
                            ) : isClosed ? (
                              <span className="text-gray-400 font-semibold">Đã đóng</span>
                            ) : isWaiting ? (
                              <span className="text-amber-500 font-semibold">Chờ mở</span>
                            ) : !item.sub ? (
                              <button
                                onClick={() => navigate(`/exam-room/${item.exam.id}`)}
                                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold rounded-lg shadow-sm transition-all"
                              >
                                Vào thi ⚡
                              </button>
                            ) : item.sub.status !== 'submitted' ? (
                              <button
                                onClick={() => navigate(`/exam-room/${item.exam.id}`)}
                                className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold rounded-lg shadow-sm transition-all animate-pulse"
                              >
                                Làm tiếp ⚡
                              </button>
                            ) : (
                              <div className="flex gap-2 justify-center items-center">
                                <button
                                  onClick={() => handleRetakeExam(item.exam, item.sub)}
                                  className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-extrabold rounded-lg transition-all flex items-center gap-1"
                                >
                                  <RefreshCw className="w-3 h-3" /> Thi lại
                                </button>
                                <button
                                  onClick={() => navigate(`/exam-room/${item.exam.id}`)}
                                  className="px-3 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-xs font-bold rounded-lg transition-all flex items-center gap-1"
                                >
                                  Kết quả 🔍
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  })}
                </tbody>
              </table>
            </div>
          </div>


        </section>

        {/* DANH SÁCH BÀI THI CHƯA THI */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b-2 border-teal-500 pb-2">
            <FileText className="w-6 h-6 text-teal-600" />
            <h2 className="text-xl font-extrabold text-gray-800">Bài Thi Chưa Làm ({pendingExams.length})</h2>
          </div>

          {pendingExams.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border-2 border-dashed border-gray-200 shadow-sm">
              <CheckCircle className="w-12 h-12 text-teal-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-700">Tuyệt vời! Đã hoàn thành tất cả bài thi</h3>
              <p className="text-gray-400 text-sm mt-1">Hiện tại không có bài thi nào đang chờ bạn làm.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {pendingExams.map(room => {
                const hasSub = inProgressSubMap.has(room.id)
                const isClosed = room.status === 'closed'
                const isWaiting = room.status === 'waiting'
                const isActive = room.status === 'active'

                let statusBadge = null
                if (isClosed) {
                  statusBadge = <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full border border-gray-200">Đã đóng</span>
                } else if (isWaiting) {
                  statusBadge = <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-200">Chưa mở</span>
                } else {
                  statusBadge = <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-200 animate-pulse">Đang mở</span>
                }

                return (
                  <div 
                    key={room.id} 
                    className="bg-white rounded-2xl p-5 border border-teal-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                          {room.classes?.class_name || 'Bài thi tự do'}
                        </span>
                        {statusBadge}
                      </div>
                      <h3 className="text-base font-extrabold text-gray-800 mb-2 line-clamp-2 leading-snug">
                        {room.exams?.title || `Phòng thi ${room.code}`}
                      </h3>
                      <div className="flex items-center gap-4 text-gray-500 text-xs font-semibold mb-4">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          Thời gian: {room.time_limit} phút
                        </span>
                        {hasSub && (
                          <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded border border-orange-100 text-[10px] uppercase font-black">
                            Đang làm dở
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-400 font-medium">Mã phòng: <span className="font-mono font-bold text-gray-600">{room.code}</span></span>
                      
                      {isClosed ? (
                        <button disabled className="px-4 py-2 bg-gray-100 text-gray-400 text-sm font-bold rounded-xl cursor-not-allowed border border-gray-200">
                          Hết thời gian
                        </button>
                      ) : isWaiting ? (
                        <button disabled className="px-4 py-2 bg-amber-50 text-amber-500 text-sm font-bold rounded-xl cursor-not-allowed border border-amber-100">
                          Chờ mở phòng
                        </button>
                      ) : (
                        <button 
                          onClick={() => navigate(`/exam-room/${room.id}`)}
                          className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-extrabold rounded-xl transition-all shadow-md shadow-teal-500/20 flex items-center gap-1"
                        >
                          {hasSub ? 'Tiếp tục ⚡' : 'Làm bài ⚡'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* DANH SÁCH BÀI THI ĐÃ THI */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b-2 border-teal-500 pb-2">
            <CheckCircle className="w-6 h-6 text-teal-600" />
            <h2 className="text-xl font-extrabold text-gray-800">Bài Thi Đã Hoàn Thành ({completedExams.length})</h2>
          </div>

          {completedExams.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-gray-200 shadow-sm text-gray-400 text-sm font-medium">
              Chưa có bài thi nào hoàn thành. Hãy làm bài để xem kết quả!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {completedExams.map(({ room, sub }) => {
                const formattedDate = sub.submitted_at 
                  ? format(new Date(sub.submitted_at), 'dd/MM/yyyy HH:mm') 
                  : 'N/A'

                return (
                  <div 
                    key={room.id} 
                    className="bg-white rounded-2xl p-5 border border-gray-150 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <span className="text-xs font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                          {room.classes?.class_name || 'Bài thi tự do'}
                        </span>
                        <span className="bg-teal-50 text-teal-700 text-xs font-extrabold px-2.5 py-1 rounded-full border border-teal-150">
                          Đã nộp bài
                        </span>
                      </div>
                      <h3 className="text-base font-extrabold text-gray-800 mb-2 line-clamp-2 leading-snug">
                        {room.exams?.title || `Phòng thi ${room.code}`}
                      </h3>
                      <p className="text-xs text-gray-400 font-semibold mb-4">
                        Nộp lúc: {formattedDate}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xs text-gray-500 font-medium">Điểm:</span>
                        <span className="text-xl font-black text-teal-600">
                          {typeof sub.score === 'number' ? sub.score.toFixed(1) : 'Chưa chấm'}
                        </span>
                        <span className="text-[10px] text-gray-400">/10</span>
                      </div>

                      <button 
                        onClick={() => navigate(`/exam-room/${room.id}`)}
                        className="px-4 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 text-sm font-extrabold rounded-xl transition-all flex items-center gap-1"
                      >
                        Xem kết quả 🔍
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {/* MODAL ĐỔI MẬT KHẨU */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-teal-150 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-teal-100 pb-3">
              <h3 className="text-lg font-black text-teal-800 flex items-center gap-2">
                <Lock className="w-5 h-5 text-teal-650" /> Đổi mật khẩu học sinh
              </h3>
              <button
                onClick={() => {
                  setIsChangePasswordOpen(false)
                  resetChangePasswordForm()
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              {/* Mật khẩu hiện tại */}
              <div>
                <label className="block text-xs font-bold text-teal-700 mb-1 uppercase tracking-wide">Mật khẩu hiện tại *</label>
                <div className="relative">
                  <input
                    type={showOldPass ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-teal-100 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all font-bold text-sm bg-white"
                    placeholder="Nhập mật khẩu hiện tại"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPass(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-400 hover:text-teal-600 transition-colors"
                  >
                    {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Mật khẩu mới */}
              <div>
                <label className="block text-xs font-bold text-teal-700 mb-1 uppercase tracking-wide">Mật khẩu mới *</label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-teal-100 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all font-bold text-sm bg-white"
                    placeholder="Nhập mật khẩu mới (tối thiểu 4 ký tự)"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-400 hover:text-teal-600 transition-colors"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Xác nhận mật khẩu mới */}
              <div>
                <label className="block text-xs font-bold text-teal-700 mb-1 uppercase tracking-wide">Xác nhận mật khẩu mới *</label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-teal-100 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all font-bold text-sm bg-white"
                    placeholder="Nhập lại mật khẩu mới"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-400 hover:text-teal-600 transition-colors"
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsChangePasswordOpen(false)
                  resetChangePasswordForm()
                }}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-slate-50 rounded-xl transition-all"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => { void handleChangePassword() }}
                disabled={isChangingPassword}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-black rounded-xl transition-all shadow-md shadow-teal-500/10 flex items-center gap-1.5"
              >
                {isChangingPassword ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Cập nhật'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ĐỔI ẢNH ĐẠI DIỆN HỌC SINH */}
      {isAvatarModalOpen && (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-teal-150 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-teal-100 pb-3">
              <h3 className="text-lg font-black text-teal-800 flex items-center gap-2">
                <Camera className="w-5 h-5 text-teal-600" /> Đổi ảnh đại diện học sinh
              </h3>
              <button
                onClick={() => {
                  setIsAvatarModalOpen(false)
                  setSelectedAvatarFile(null)
                  setAvatarPreviewUrl(null)
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex flex-col items-center space-y-4">
              {/* Preview Avatar */}
              <div className="relative group w-32 h-32">
                {avatarPreviewUrl ? (
                  <img
                    src={avatarPreviewUrl}
                    alt="Preview"
                    className="w-32 h-32 rounded-full object-cover border-4 border-teal-500 shadow-md"
                  />
                ) : student?.avatar_url ? (
                  <img
                    src={student.avatar_url}
                    alt={student.full_name}
                    className="w-32 h-32 rounded-full object-cover border-4 border-teal-500 shadow-md"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-600 border-4 border-teal-100 flex items-center justify-center text-white text-4xl font-black shadow-md">
                    {student?.full_name?.charAt(0)?.toUpperCase() || 'H'}
                  </div>
                )}
                
                <label 
                  htmlFor="student-avatar-input"
                  className="absolute inset-0 bg-black/40 hover:bg-black/50 text-white rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity duration-200"
                >
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-[10px] font-bold uppercase">Chọn ảnh</span>
                </label>
              </div>

              <input
                id="student-avatar-input"
                type="file"
                accept="image/*"
                onChange={handleSelectAvatarFile}
                className="hidden"
                disabled={isUploadingAvatar}
              />

              <div className="flex flex-wrap justify-center gap-2 w-full">
                <label
                  htmlFor="student-avatar-input"
                  className="px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-xl font-bold text-sm cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4 text-teal-600" />
                  {selectedAvatarFile ? 'Đổi ảnh khác' : 'Tải ảnh từ máy tính'}
                </label>

                {student?.avatar_url && !selectedAvatarFile && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={isUploadingAvatar}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-sm transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    Xóa ảnh
                  </button>
                )}
              </div>

              {selectedAvatarFile && (
                <p className="text-xs text-teal-600 font-medium truncate max-w-xs">
                  Đã chọn: {selectedAvatarFile.name}
                </p>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsAvatarModalOpen(false)
                  setSelectedAvatarFile(null)
                  setAvatarPreviewUrl(null)
                }}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-slate-50 rounded-xl transition-all"
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={handleSaveAvatar}
                disabled={!selectedAvatarFile || isUploadingAvatar}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black rounded-xl transition-all shadow-md shadow-teal-500/10 flex items-center gap-1.5"
              >
                {isUploadingAvatar ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang tải lên...</span>
                  </>
                ) : (
                  <span>Lưu ảnh</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
