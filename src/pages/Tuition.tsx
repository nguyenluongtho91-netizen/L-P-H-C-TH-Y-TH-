import { isZaloRobotOnline } from '@/services/zaloQueueService'
import { useEffect, useState, useMemo } from 'react'
import { Banknote, Plus, CheckCircle, XCircle, Mail, Send, Loader2, MessageCircle, AlertCircle, Trash2, Check, QrCode, Copy, ExternalLink, Building2 } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { fmtVNDShort, formatVietQRAddInfo } from '@/lib/helpers'
import Modal from '@/components/Modal'
import VietQRModal from '@/components/VietQRModal'
import { sendZaloPersonalMessage, sendZaloOAMessage, isZaloOAConfigured, checkZaloServiceHealth } from '@/services/zaloService'
import { Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import type { PaymentMethod } from '@/types'

interface TuitionNotificationRow {
  student: any
  notification: any | null
  status: 'unnotified' | 'unpaid' | 'paid'
}

export default function Tuition() {
  const {
    classes, students, enrollments, tuitionNotifications,
    loadClasses, loadStudents, loadEnrollments, loadPayments, loadTuitionNotifications,
    addPayment, upsertTuitionNotification, updateTuitionNotification,
    batchUpsertTuitionNotifications, deleteTuitionNotification
  } = useDataStore()

  const [selClass, setSelClass] = useState('')
  const [courseName, setCourseName] = useState('Khóa hè')
  const [courseAmount, setCourseAmount] = useState('600000')

  // Modals state
  const [payModal, setPayModal] = useState<TuitionNotificationRow | null>(null)
  const [qrModal, setQrModal]   = useState<TuitionNotificationRow | null>(null)
  const [payForm, setPayForm]   = useState({ amount: '', method: 'transfer' as PaymentMethod, note: '' })
  const [saving, setSaving]     = useState(false)
  const [sending, setSending]   = useState(false)
  const [sendResult, setSendResult] = useState<{sent:number;skipped:number;errors:number}|null>(null)
  const [zaloModal, setZaloModal]   = useState<{row:TuitionNotificationRow;msg:string;qrUrl:string;phone:string}|null>(null)
  const [batchZaloModal, setBatchZaloModal] = useState<{ list: TuitionNotificationRow[]; currentIndex: number } | null>(null)
  const [copiedZalo, setCopiedZalo] = useState<'text'|'img'|null>(null)
  const [copiedBatch, setCopiedBatch] = useState<'text'|'img'|null>(null)

  const [confirmModal, setConfirmModal] = useState<{studentName:string;amount:number;studentId:string;phone:string;email:string}|null>(null)
  const [sendingConfirm, setSendingConfirm] = useState(false)
  const [autoSendModal, setAutoSendModal] = useState(false)
  const [bankModalOpen, setBankModalOpen] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const [autoSending, setAutoSending] = useState(false)
  const [autoProgress, setAutoProgress] = useState<{ current: number; total: number; currentStudent: string; logs: string[] }>({ current: 0, total: 0, currentStudent: '', logs: [] })
  const [sendingStudentId, setSendingStudentId] = useState<string | null>(null)
  const [phoneEditModal, setPhoneEditModal] = useState<{ student: any; row: TuitionNotificationRow; phoneInput: string } | null>(null)
  const [robotOnline, setRobotOnline] = useState<boolean>(false)

  useEffect(() => {
    let isMounted = true
    const checkStatus = async () => {
      try {
        const online = await isZaloRobotOnline()
        if (isMounted) setRobotOnline(online)
      } catch {}
    }
    checkStatus()
    const interval = setInterval(checkStatus, 7000)
    return () => { isMounted = false; clearInterval(interval) }
  }, [])

  // ── Load foundational data on mount ──
  useEffect(() => {
    void Promise.all([loadClasses(), loadStudents(), loadEnrollments(), loadTuitionNotifications()])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load notifications + payments when class changes ──
  useEffect(() => {
    if (!selClass) {
      void loadTuitionNotifications()
      return
    }
    void loadTuitionNotifications(selClass)
    void loadPayments(selClass)

    // Auto-detect grade 6 classes to prefill 1.000.000đ, otherwise 600.000đ
    const cls = classes.find(c => c.id === selClass)
    if (cls) {
      const clsName = ((cls as any).class_name || cls.name || '').toLowerCase()
      const clsGrade = ((cls as any).grade || '').toLowerCase()
      if (clsName.includes('6') || clsGrade.includes('6')) {
        setCourseAmount('1000000')
      } else {
        setCourseAmount('600000')
      }
    }
  }, [selClass, classes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Group classes by grade
  const classesByGrade = useMemo(() => {
    const groups: Record<string, typeof classes> = {}
    
    const sorted = [...classes]
      .filter(c => c.status === 'active')
      .sort((a, b) => {
        const nameA = ((a as any).class_name || a.name || '')
        const nameB = ((b as any).class_name || b.name || '')
        
        const yearA = parseInt(nameA.match(/\d{4}/)?.[0] || '0', 10)
        const yearB = parseInt(nameB.match(/\d{4}/)?.[0] || '0', 10)
        
        if (yearA !== yearB) {
          return yearB - yearA // Descending year (2015 -> 2014)
        }
        
        return nameA.localeCompare(nameB)
      })

    sorted.forEach(c => {
      const gradeStr = (c as any).grade || 'Khác'
      const key = gradeStr.toLowerCase().startsWith('khối') ? gradeStr : `Khối ${gradeStr}`
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(c)
    })
    
    return Object.entries(groups).sort((a, b) => {
      const numA = parseInt(a[0].replace(/\D/g, ''), 10) || 0
      const numB = parseInt(b[0].replace(/\D/g, ''), 10) || 0
      return numB - numA // Sort grades descending (e.g. Khối 2015 -> Khối 2014; or Khối 9 -> Khối 8)
    })
  }, [classes])

  // Compute tuition notification row list for table
  const tuitionData = useMemo((): TuitionNotificationRow[] => {
    if (!selClass) return []
    const classEnrollments = enrollments.filter(e => e.class_id === selClass && e.status === 'active')
    
    const rows = classEnrollments.flatMap(e => {
      const student = students.find(s => s.id === e.student_id)
      if (!student) return []
      
      const notif = tuitionNotifications.find(n => n.class_id === selClass && n.student_id === e.student_id)
      
      let status: 'unnotified' | 'unpaid' | 'paid' = 'unnotified'
      if (notif) {
        status = notif.is_paid ? 'paid' : 'unpaid'
      }

      return [{
        student,
        notification: notif ?? null,
        status
      }]
    })

    // Sắp xếp: Đã đóng (paid) lên đầu -> Chưa đóng (unpaid) -> Chưa báo học phí (unnotified)
    // Cùng trạng thái thì sắp xếp theo tên học sinh (alphabetical)
    return rows.sort((a, b) => {
      if (a.status === 'paid' && b.status !== 'paid') return -1
      if (a.status !== 'paid' && b.status === 'paid') return 1
      
      if (a.status === 'unpaid' && b.status === 'unnotified') return -1
      if (a.status === 'unnotified' && b.status === 'unpaid') return 1
      
      const nameA = a.student.full_name || ''
      const nameB = b.student.full_name || ''
      return nameA.localeCompare(nameB, 'vi')
    })
  }, [selClass, enrollments, students, tuitionNotifications])

  // Statistics (School-wide or Class-wide)
  const stats = useMemo(() => {
    if (selClass) {
      const totalStudents = tuitionData.length
      const notifiedCount = tuitionData.filter(d => d.status !== 'unnotified').length
      const paidCount = tuitionData.filter(d => d.status === 'paid').length
      const unpaidCount = tuitionData.filter(d => d.status === 'unpaid').length
      
      const totalPaidAmount = tuitionData
        .filter(d => d.status === 'paid' && d.notification)
        .reduce((sum, d) => sum + Number(d.notification.amount), 0)
        
      const totalUnpaidAmount = tuitionData
        .filter(d => d.status === 'unpaid' && d.notification)
        .reduce((sum, d) => sum + Number(d.notification.amount), 0)

      return {
        totalStudents,
        notifiedCount,
        paidCount,
        unpaidCount,
        totalPaidAmount,
        totalUnpaidAmount
      }
    }

    // School-wide stats (when no class is selected)
    // Unique active students enrolled in active classes or overall active students
    const activeStudentIds = new Set(
      enrollments
        .filter(e => {
          const cls = classes.find(c => c.id === e.class_id)
          return e.status === 'active' && cls?.status === 'active'
        })
        .map(e => e.student_id)
    )
    const totalStudents = activeStudentIds.size > 0 
      ? activeStudentIds.size 
      : students.filter(s => s.status === 'active').length

    // Tuition notifications across the entire school
    const uniqueNotifiedStudentIds = new Set(tuitionNotifications.map(n => n.student_id))
    const notifiedCount = uniqueNotifiedStudentIds.size

    let totalPaidAmount = 0
    let totalUnpaidAmount = 0
    let paidCount = 0
    let unpaidCount = 0

    tuitionNotifications.forEach(n => {
      if (n.is_paid) {
        paidCount += 1
        totalPaidAmount += Number(n.amount || 0)
      } else {
        unpaidCount += 1
        totalUnpaidAmount += Number(n.amount || 0)
      }
    })

    return {
      totalStudents,
      notifiedCount,
      paidCount,
      unpaidCount,
      totalPaidAmount,
      totalUnpaidAmount
    }
  }, [selClass, tuitionData, enrollments, classes, students, tuitionNotifications])

  // ── Send notifications for the entire class ──
  const [sendingNotif, setSendingNotif] = useState(false)
  const sendClassNotifications = async () => {
    if (!selClass) {
      toast.error('Vui lòng chọn lớp học!')
      return
    }
    const amt = parseFloat(courseAmount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('Vui lòng nhập số tiền học phí hợp lệ!')
      return
    }
    if (!courseName.trim()) {
      toast.error('Vui lòng nhập tên khóa học!')
      return
    }

    setSendingNotif(true)
    try {
      const targetRows = tuitionData
      if (targetRows.length === 0) {
        toast.error('Không tìm thấy học sinh nào trong lớp này.')
        return
      }

      const notifs = targetRows.map(row => ({
        student_id: row.student.id,
        class_id: selClass,
        course_name: courseName.trim(),
        amount: amt,
        is_paid: row.notification?.is_paid ?? false
      }))

      await batchUpsertTuitionNotifications(notifs)
      toast.success(`📢 Đã phát hành báo học phí khóa "${courseName.trim()}" cho ${notifs.length} học sinh thành công!`)
      await loadTuitionNotifications(selClass)
    } catch (e: any) {
      toast.error('Lỗi khi gửi thông báo: ' + (e.message || String(e)))
    } finally {
      setSendingNotif(false)
    }
  }

  // Send single student notification
  const sendSingleNotification = async (studentId: string) => {
    if (!selClass) {
      toast.error('Vui lòng chọn lớp học!')
      return
    }
    const amt = parseFloat(courseAmount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('Vui lòng nhập số tiền học phí hợp lệ!')
      return
    }
    if (!courseName.trim()) {
      toast.error('Vui lòng nhập tên khóa học!')
      return
    }
    try {
      await upsertTuitionNotification({
        student_id: studentId,
        class_id: selClass,
        course_name: courseName.trim(),
        amount: amt,
        is_paid: false
      })
      toast.success('✅ Đã tạo thông báo học phí thành công!')
      await loadTuitionNotifications(selClass)
    } catch (e: any) {
      toast.error('Lỗi: ' + e.message)
    }
  }

  const handleSavePhoneAndSend = async () => {
    if (!phoneEditModal) return
    const digits = phoneEditModal.phoneInput.replace(/\D/g, '').replace(/^84/, '0')
    if (digits.length !== 10 || !digits.startsWith('0')) {
      toast.error('Số điện thoại phải đúng 10 chữ số (bắt đầu bằng 0, ví dụ: 0912345678)!')
      return
    }

    try {
      // Lưu số điện thoại vào Supabase cho học sinh
      await supabase.from('students').update({ zalo: digits, parent_phone: digits }).eq('id', phoneEditModal.student.id)
      // Cập nhật local state
      const s = students.find((st: any) => st.id === phoneEditModal.student.id)
      if (s) {
        (s as any).zalo = digits
        ;(s as any).parent_phone = digits
      }
      toast.success('Đã lưu số điện thoại Zalo thành công!')
      const targetRow = phoneEditModal.row
      setPhoneEditModal(null)
      // Thực hiện gửi ngay
      setTimeout(() => {
        sendZaloDirect1Click(targetRow, digits)
      }, 200)
    } catch (err: any) {
      toast.error('Lỗi khi lưu số điện thoại: ' + err.message)
    }
  }

  // ── 1-CLICK DIRECT ZALO SEND FOR SINGLE STUDENT ──
  const sendZaloDirect1Click = async (row: TuitionNotificationRow, overridePhone?: string) => {
    const student = students.find((s: any) => s.id === row.student.id)
    const rawPhone = overridePhone || (student as any)?.zalo || (student as any)?.parent_phone || ''
    const cleanPhone = rawPhone.replace(/\D/g, '').replace(/^84/, '0')

    if (!cleanPhone || cleanPhone.length !== 10) {
      setPhoneEditModal({
        student: student || row.student,
        row,
        phoneInput: cleanPhone || ''
      })
      return
    }

    const amountVal = courseAmount ? Number(courseAmount) : (Number(row.notification?.amount) || 600000)
    const activeCourseName = (courseName && courseName.trim()) || row.notification?.course_name || 'Học phí'

    if (selClass) {
      try {
        await upsertTuitionNotification({
          student_id: row.student.id,
          class_id: selClass,
          course_name: activeCourseName,
          amount: amountVal,
          is_paid: false
        })
        void loadTuitionNotifications(selClass)
      } catch (err) {}
    }

    const bankId      = import.meta.env.VITE_BANK_ID      || 'VCB'
    const bankAccount = import.meta.env.VITE_BANK_ACCOUNT || '1070493932'
    const bankName    = import.meta.env.VITE_BANK_NAME    || import.meta.env.VITE_BANK_ACCOUNT_NAME || 'HO KINH DOANH NGUYEN LUONG THO'

    const cls = classes.find(c => c.id === selClass)
    const clsName = (cls as any)?.class_name || cls?.name || 'Lớp học'
    const cleanClass = clsName.replace(/^[Ll][ớỚoO][pP]\s*/, '').trim() || clsName
    const addInfo = formatVietQRAddInfo(row.student.full_name, clsName, row.student.student_code)
    const qrUrl = bankId && bankAccount
      ? 'https://img.vietqr.io/image/' + bankId + '-' + bankAccount + '-compact.png'
        + '?amount=' + amountVal
        + '&addInfo=' + encodeURIComponent(addInfo)
        + '&accountName=' + encodeURIComponent(bankName)
      : ''

    const msg = `Chào Quý phụ huynh.\n`
              + `Thầy gửi thông tin học phí tháng ${activeCourseName}:\n\n`
              + `• Học sinh: ${row.student.full_name}\n`
              + `• Lớp: ${cleanClass}\n`
              + `• Số tiền cần nộp: ${amountVal.toLocaleString('vi-VN')} VNĐ\n`
              + `• Thời gian thu học phí: Từ 01 – 10 hàng tháng\n\n`
              + `• Hình thức nộp: Chuyển khoản\n`
              + `   - Ngân hàng: V.C.B (Ngoại thương)\n`
              + `   - STK: ${bankAccount}\n`
              + `   - Chủ TK (HKD): ${bankName}\n`
              + `   - Nội dung chuyển khoản: ${addInfo}\n\n`
              + `👉 Mã QR chuyển khoản nhanh (đã điền sẵn số tiền và tên học sinh bên dưới):`

    setSendingStudentId(row.student.id)
    const toastId = toast.loading(`🚀 Đang tự động gửi Zalo cho ${row.student.full_name}...`)

    try {
      const res = await sendZaloPersonalMessage(cleanPhone, msg, qrUrl, row.student.full_name)
      toast.dismiss(toastId)
      if (res.success) {
        toast.success(`🎉 ${res.message}`)
      } else if ((res as any).openedZalo) {
        toast(`💬 ${res.message}`, { icon: '📋', duration: 6000 })
      } else {
        toast.error(res.message)
      }
    } catch (err: any) {
      toast.dismiss(toastId)
      toast.error(`Lỗi: ${err.message}`)
    } finally {
      setSendingStudentId(null)
    }
  }

  // ── Send Zalo: open custom preview modal ──
  const sendZalo = async (row: TuitionNotificationRow) => {
    const student = students.find((s: any) => s.id === row.student.id)
    const phone = (student as any)?.zalo || (student as any)?.parent_phone || ''
    
    // Ưu tiên số tiền và tên khóa Thầy đang nhập trên giao diện
    const amountVal = courseAmount ? Number(courseAmount) : (Number(row.notification?.amount) || 600000)
    const activeCourseName = (courseName && courseName.trim()) || row.notification?.course_name || 'Tháng ' + (selectedMonth || '9/2026')

    // Tự động lưu/cập nhật thông báo học phí mới vào database
    if (selClass) {
      try {
        await upsertTuitionNotification({
          student_id: row.student.id,
          class_id: selClass,
          course_name: activeCourseName,
          amount: amountVal,
          is_paid: false
        })
        void loadTuitionNotifications(selClass)
      } catch (err) {}
    }

    const bankId      = import.meta.env.VITE_BANK_ID      || 'VCB'
    const bankAccount = import.meta.env.VITE_BANK_ACCOUNT || '1070493932'
    const bankName    = import.meta.env.VITE_BANK_NAME    || import.meta.env.VITE_BANK_ACCOUNT_NAME || 'HO KINH DOANH NGUYEN LUONG THO'

    const cls = classes.find(c => c.id === selClass)
    const clsName = (cls as any)?.class_name || cls?.name || 'Lớp 10'
    const cleanClass = clsName.replace(/^[Ll][ớỚoO][pP]\s*/, '').trim() || clsName
    const addInfo = formatVietQRAddInfo(row.student.full_name, clsName, row.student.student_code)
    const qrUrl = bankId && bankAccount
      ? 'https://img.vietqr.io/image/' + bankId + '-' + bankAccount + '-compact.png'
        + '?amount=' + amountVal
        + '&addInfo=' + encodeURIComponent(addInfo)
        + '&accountName=' + encodeURIComponent(bankName)
      : ''
    
    // MẪU CHUẨN THẦY ĐÃ DUYỆT: Không có link thô, dùng V.C.B, không lặp chữ Lớp
    const msg = `Chào Quý phụ huynh.\n`
              + `Thầy gửi thông tin học phí tháng ${activeCourseName}:\n\n`
              + `• Học sinh: ${row.student.full_name}\n`
              + `• Lớp: ${cleanClass}\n`
              + `• Số tiền cần nộp: ${amountVal.toLocaleString('vi-VN')} VNĐ\n`
              + `• Thời gian thu học phí: Từ 01 – 10 hàng tháng\n\n`
              + `• Hình thức nộp: Chuyển khoản\n`
              + `   - Ngân hàng: V.C.B (Ngoại thương)\n`
              + `   - STK: ${bankAccount}\n`
              + `   - Chủ TK (HKD): ${bankName}\n`
              + `   - Nội dung chuyển khoản: ${addInfo}\n\n`
              + `👉 Mã QR chuyển khoản nhanh (đã điền sẵn số tiền và tên học sinh bên dưới):`

    const cleanPhone = phone.replace(/\D/g, '').replace(/^84/, '0')
    const synthRow = { ...row, notification: { course_name: activeCourseName, amount: amountVal } as any }
    setZaloModal({ row: synthRow, msg, qrUrl, phone: cleanPhone })
    setCopiedZalo(null)
  }


  // ── 1-CLICK AUTO SEND TO ALL PARENTS ──
  const runAutoBulkSend = async () => {
    const unpaidList = tuitionData.filter(r => r.status === 'unpaid')
    if (unpaidList.length === 0) {
      toast.error('Không có học sinh nào chưa đóng học phí.')
      return
    }
    const cls = classes.find(c => c.id === selClass)
    const clsName = (cls as any)?.class_name || cls?.name || 'Lớp 10'
    const bankId      = import.meta.env.VITE_BANK_ID      || 'VCB'
    const bankAccount = import.meta.env.VITE_BANK_ACCOUNT || '1070493932'
    const bankName    = import.meta.env.VITE_BANK_NAME    || import.meta.env.VITE_BANK_ACCOUNT_NAME || 'HO KINH DOANH NGUYEN LUONG THO'

    setAutoSending(true)
    const logs: string[] = []
    setAutoProgress({ current: 0, total: unpaidList.length, currentStudent: 'Đang bắt đầu...', logs })

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < unpaidList.length; i++) {
      const row = unpaidList[i]
      const student = students.find((s: any) => s.id === row.student.id)
      const rawPhone = (student as any)?.zalo || (student as any)?.parent_phone || ''
      const digits = rawPhone.replace(/\D/g, '')
      const cleanPhone = digits.startsWith('84') ? '0' + digits.substring(2) : (digits.startsWith('0') ? digits : '0' + digits)
      const amt = Number(row.notification?.amount || courseAmount)

      const cleanClass = clsName.replace(/^[Ll][ớỚoO][pP]\s*/, '').trim() || clsName
      const activeCourseName = row.notification?.course_name || courseName || 'Học phí'
      const addInfo = formatVietQRAddInfo(row.student.full_name, clsName, row.student.student_code)
      const qrUrl = `https://img.vietqr.io/image/${bankId}-${bankAccount}-compact.png?amount=${amt}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(bankName)}`
      const msg = `Chào Quý phụ huynh.\n`
                + `Thầy gửi thông tin học phí tháng ${activeCourseName}:\n\n`
                + `• Học sinh: ${row.student.full_name}\n`
                + `• Lớp: ${cleanClass}\n`
                + `• Số tiền cần nộp: ${amt.toLocaleString('vi-VN')} VNĐ\n`
                + `• Thời gian thu học phí: Từ 01 – 10 hàng tháng\n\n`
                + `• Hình thức nộp: Chuyển khoản\n`
                + `   - Ngân hàng: V.C.B (Ngoại thương)\n`
                + `   - STK: ${bankAccount}\n`
                + `   - Chủ TK (HKD): ${bankName}\n`
                + `   - Nội dung chuyển khoản: ${addInfo}\n\n`
                + `👉 Mã QR chuyển khoản nhanh (đã điền sẵn số tiền và tên học sinh bên dưới):`

      logs.push(`⏳ [${i + 1}/${unpaidList.length}] Đang gửi cho ${row.student.full_name} (${cleanPhone || 'Không có SĐT'})...`)
      setAutoProgress({
        current: i + 1,
        total: unpaidList.length,
        currentStudent: row.student.full_name,
        logs: [...logs]
      })

      if (!cleanPhone || cleanPhone.length < 9) {
        failCount++
        logs.push(`⚠️ [${i + 1}/${unpaidList.length}] ${row.student.full_name}: Thiếu số điện thoại phụ huynh.`)
      } else {

        try {
          let res = await sendZaloPersonalMessage(cleanPhone, msg, qrUrl)
          if (!res.success && isZaloOAConfigured()) {
            res = await sendZaloOAMessage(cleanPhone, msg)
          }

          if (res.success) {
            successCount++
            logs.push(`✅ [${i + 1}/${unpaidList.length}] ${row.student.full_name}: Robot PC đã gửi thành công!`)
          } else if ((res as any).openedZalo) {
            logs.push(`📋 [${i + 1}/${unpaidList.length}] ${row.student.full_name}: Đã mở Zalo phụ huynh (bấm Ctrl+V gửi).`)
          } else {
            failCount++
            logs.push(`⚠️ [${i + 1}/${unpaidList.length}] ${row.student.full_name}: ${res.message || 'Chưa gửi được'}`)
          }
        } catch (err: any) {
          failCount++
          logs.push(`❌ [${i + 1}/${unpaidList.length}] ${row.student.full_name}: ${err.message}`)
        }
      }

      setAutoProgress({
        current: i + 1,
        total: unpaidList.length,
        currentStudent: row.student.full_name,
        logs: [...logs]
      })

      await new Promise(r => setTimeout(r, 1000))
    }

    setAutoSending(false)
    if (successCount > 0) {
      toast.success(`🎉 Đã gửi tự động thành công cho ${successCount} phụ huynh!`)
    }
  }

  const startBatchZalo = () => {
    let targetList = tuitionData.filter(r => r.status === 'unpaid')
    if (targetList.length === 0) {
      targetList = tuitionData
    }
    if (targetList.length === 0) {
      toast.error('Lớp học này hiện chưa có học sinh nào.')
      return
    }
    setBatchZaloModal({ list: targetList, currentIndex: 0 })
  }


  const copyZaloContent = async (type: 'text' | 'img') => {
    if (!zaloModal) return
    if (type === 'text') {
      try {
        await navigator.clipboard.writeText(zaloModal.msg)
        setCopiedZalo('text')
        setTimeout(() => setCopiedZalo(null), 2500)
      } catch { toast.error('Không copy được') }
    } else {
      try {
        const res  = await fetch(zaloModal.qrUrl)
        const blob = await res.blob()
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopiedZalo('img')
        setTimeout(() => setCopiedZalo(null), 2500)
      } catch {
        const a = document.createElement('a')
        a.href     = zaloModal.qrUrl
        a.download = 'QR_' + zaloModal.row.student.student_code + '.png'
        a.click()
        toast.success('Đã tải QR xuống, gửi vào Zalo nhé!')
      }
    }
  }

  // ── Send reminders via Gmail proxy ──
  const sendGmailReminder = async (row?: TuitionNotificationRow) => {
    if (!selClass) {
      toast.error('Vui lòng chọn lớp học!')
      return
    }
    const amt = parseFloat(courseAmount) || 600000
    const activeCourse = (courseName && courseName.trim()) || row?.notification?.course_name || 'Tháng 9'

    if (row && !row.notification) {
      try {
        await upsertTuitionNotification({
          student_id: row.student.id,
          class_id: selClass,
          course_name: activeCourse,
          amount: amt,
          is_paid: false
        })
        void loadTuitionNotifications(selClass)
      } catch {}
    }

    setSending(true)
    setSendResult(null)
    try {
      const studentIds = row ? [row.student.id] : undefined
      const res = await fetch('/api/send-tuition-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: selClass,
          courseName: activeCourse,
          studentIds
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setSendResult(data.summary)
      toast.success(`✅ Đã gửi ${data.summary.sent} email nhắc học phí`)
    } catch (e: any) {
      toast.error('Lỗi gửi email: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  // ── One-Click Quick Mark Paid (Tick button next to student icon) ──
  const quickCollectTuition = async (row: TuitionNotificationRow) => {
    if (!row.notification) return
    const confirmCollect = window.confirm(`Xác nhận đã thu học phí khóa "${row.notification.course_name}" của học sinh ${row.student.full_name}?`)
    if (!confirmCollect) return
    
    try {
      // 1. Record payment in the database (safely with fallback)
      try {
        await addPayment({
          student_id: row.student.id,
          class_id:   selClass,
          amount:     Number(row.notification.amount),
          method:     'transfer',
          note:       `Thu học phí khóa ${row.notification.course_name} (Thu nhanh)`,
        })
      } catch {}

      // 2. Mark notification as PAID
      await updateTuitionNotification(row.notification.id, { is_paid: true })

      // 3. Reload data
      await loadTuitionNotifications(selClass)
      await loadPayments(selClass)

      toast.success(`✅ Đã thu học phí khóa ${row.notification.course_name} từ ${row.student.full_name}`)
    } catch (error: any) {
      toast.error('Lỗi khi thu học phí: ' + error.message)
    }
  }

  // ── Optioned Payment (Manual popup) ──
  const openManualPay = (row: TuitionNotificationRow) => {
    setQrModal(null)
    setPayModal(row)
    setPayForm({
      amount: String(row.notification?.amount || courseAmount),
      method: 'transfer',
      note: `Thu học phí khóa ${row.notification?.course_name || courseName}`
    })
  }

  const savePay = async () => {
    const amt = parseFloat(payForm.amount)
    if (!payForm.amount || isNaN(amt) || amt <= 0) {
      toast.error('Nhập số tiền hợp lệ')
      return
    }
    if (!payModal || !payModal.notification) return
    setSaving(true)
    try {
      // 1. Add payment transaction record
      await addPayment({
        student_id: payModal.student.id,
        class_id:   selClass,
        amount:     amt,
        method:     payForm.method,
        note:       payForm.note || `Thu học phí khóa ${payModal.notification.course_name}`,
      })

      // 2. Mark notification as PAID
      await updateTuitionNotification(payModal.notification.id, { is_paid: true })

      // 3. Reload everything
      await loadTuitionNotifications(selClass)
      await loadPayments(selClass)

      toast.success(`✅ Đã ghi nhận ${fmtVNDShort(amt)} từ ${payModal.student.full_name}`)

      // 4. Offer to send confirmation message
      const studentObj = students.find(s => s.id === payModal.student.id)
      setConfirmModal({
        studentName: payModal.student.full_name,
        amount:      amt,
        studentId:   payModal.student.id,
        phone:       ((studentObj as any)?.zalo || (studentObj as any)?.parent_phone || '').replace(/\D/g,'').replace(/^84/,'0'),
        email:       (studentObj as any)?.email || '',
      })
      setPayModal(null)
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi lưu')
    } finally {
      setSaving(false)
    }
  }

  // ── Send Receipt Confirm via Gmail proxy ──
  const sendConfirmEmail = async () => {
    if (!confirmModal) return
    setSendingConfirm(true)
    try {
      const res = await fetch(import.meta.env.VITE_GAS_EMAIL_URL || '', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'follow',
        body: JSON.stringify({
          type:          'payment_confirm',
          secret:        import.meta.env.VITE_GAS_WEBHOOK_SECRET || '',
          parentEmail:   confirmModal.email,
          studentName:   confirmModal.studentName,
          amount:        confirmModal.amount,
          transactionId: 'THU-' + Date.now(),
          transferAt:    new Date().toISOString(),
          centerName:    import.meta.env.VITE_CENTER_NAME || 'EduCenter',
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'GAS lỗi')
      toast.success('✅ Đã gửi email xác nhận!')
      setConfirmModal(null)
    } catch (e: any) {
      toast.error('Lỗi gửi email: ' + e.message)
    } finally {
      setSendingConfirm(false)
    }
  }

  // ── Send Receipt Confirm via Zalo copy ──
  const sendConfirmZalo = async () => {
    if (!confirmModal) return
    const msg = `Chào phụ huynh.\n`
              + `Thầy đã nhận đủ học phí khóa ${courseName} của em ${confirmModal.studentName} (${fmtVNDShort(confirmModal.amount)} đ).\n`
              + `Thầy cảm ơn phụ huynh!`
    try {
      await navigator.clipboard.writeText(msg)
      toast.success('✅ Đã copy! Dán vào Zalo và gửi.')
    } catch { toast.error('Không copy được') }
    if (confirmModal.phone) window.open('https://zalo.me/' + confirmModal.phone, '_blank')
    else window.open('https://chat.zalo.me', '_blank')
    setConfirmModal(null)
  }

  // ── Delete notice (undo send) ──
  const deleteNotice = async (notifId: string) => {
    if (!window.confirm('Bạn có muốn xóa thông báo học phí này?')) return
    try {
      await deleteTuitionNotification(notifId)
      toast.success('Xóa thông báo học phí thành công!')
      void loadTuitionNotifications(selClass)
    } catch (e: any) {
      toast.error('Lỗi khi xóa: ' + e.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-wrap items-center justify-between gap-4">
        <h1 className="section-title flex items-center gap-2">
          <Banknote className="w-7 h-7 text-teal-600" /> Học phí khóa học
        </h1>

        <button
          onClick={() => setBankModalOpen(true)}
          className="px-4 py-2 rounded-2xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-900 text-xs font-black flex items-center gap-2 transition-all shadow-xs cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
        >
          <Building2 className="w-4 h-4 text-teal-700" />
          🏦 Kết Nối Ngân Hàng (Tự Động Gạch Nợ & Nhắn Zalo)
        </button>
      </div>

      {/* Summary Statistics Cards (School-wide or Selected Class) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: selClass ? 'Tổng học sinh lớp' : 'Tổng số học sinh', value: `${stats.totalStudents} HS`, color: 'bg-teal-50 text-teal-700 border border-teal-100' },
          { label: 'Đã báo học phí', value: `${stats.notifiedCount} HS`, color: 'bg-blue-50 text-blue-700 border border-blue-100' },
          { label: 'Tổng đã thu', value: fmtVNDShort(stats.totalPaidAmount), color: 'bg-green-50 text-green-700 border border-green-100' },
          { label: 'Tổng chưa thu', value: fmtVNDShort(stats.totalUnpaidAmount), color: 'bg-red-50 text-red-700 border border-red-100' },
        ].map(s => (
          <div key={s.label} className={`card p-5 rounded-2xl ${s.color} shadow-sm transition-all hover:shadow-md`}>
            <p className="text-xs font-bold opacity-75 uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-2xl font-black">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Class selection cards grouped by grade */}
      <div className="card p-6 border border-slate-100 shadow-sm rounded-3xl space-y-4">
        <div className="flex items-center justify-between border-b border-teal-50 pb-3">
          <div>
            <h2 className="font-extrabold text-teal-800 text-lg">Chọn Lớp học theo Khối</h2>
            <p className="text-xs text-gray-400 font-semibold mt-0.5">Vui lòng nhấp chọn lớp để xem và báo học phí</p>
          </div>
        </div>
        
        <div className="space-y-4 pt-1">
          {/* Quick "Toàn trường" option button */}
          <div className="pb-2 border-b border-slate-100">
            <button
              onClick={() => setSelClass('')}
              className={`px-5 py-2.5 rounded-xl font-extrabold text-sm transition-all duration-200 border cursor-pointer hover:scale-[1.02] active:scale-[0.98]
                ${!selClass 
                  ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-600/15 ring-2 ring-teal-600/20' 
                  : 'bg-teal-50/70 text-teal-800 border-teal-200 hover:border-teal-400 hover:bg-teal-100/50'
                }`}
            >
              🏫 TOÀN TRƯỜNG (TỔNG HỢP)
            </button>
          </div>

          {classesByGrade.length === 0 && (
            <div className="text-center py-6 text-gray-400 text-sm font-semibold italic">
              Không tìm thấy lớp học hoạt động nào.
            </div>
          )}
          {classesByGrade.map(([grade, list]) => (
            <div key={grade} className="space-y-2">
              <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider text-left">
                {grade}
              </div>
              <div className="flex flex-wrap gap-2.5">
                {list.map(c => {
                  const isSelected = selClass === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelClass(isSelected ? '' : c.id)}
                      className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 border cursor-pointer hover:scale-[1.02] active:scale-[0.98]
                        ${isSelected 
                          ? 'bg-teal-650 bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-600/15' 
                          : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300 hover:bg-teal-50/10'
                        }`}
                    >
                      {(c as any).class_name || c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selClass && (
        <>
          {/* Form Setup Tuition Notification */}
          <div className="card p-6 bg-gradient-to-br from-teal-50/50 to-white border border-teal-100 shadow-sm rounded-3xl">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="font-extrabold text-teal-800 flex items-center gap-2 text-base">
                📢 Thiết lập & Phát hành Báo học phí theo Khóa
              </h3>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all shadow-xs"
                style={{
                  backgroundColor: robotOnline ? '#ecfdf5' : '#fffbeb',
                  color: robotOnline ? '#065f46' : '#92400e',
                  borderColor: robotOnline ? '#a7f3d0' : '#fde68a'
                }}
              >
                <span className={`w-2 h-2 rounded-full ${robotOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {robotOnline ? '🟢 Robot Zalo PC: Sẵn sàng 1-Click' : '🟡 Robot Zalo: Hãy mở file trên Desktop'}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <div>
                <label className="label text-teal-700 font-semibold text-xs uppercase tracking-wide">Tên khóa học *</label>
                <input
                  type="text"
                  value={courseName}
                  onChange={e => setCourseName(e.target.value)}
                  placeholder="VD: Khóa hè 2026, Khóa hè"
                  className="input border-teal-200 focus:border-teal-500 bg-white font-bold"
                />
              </div>
              
              <div>
                <label className="label text-teal-700 font-semibold text-xs uppercase tracking-wide">Mức học phí tùy chọn (đ) *</label>
                <input
                  type="number"
                  value={courseAmount}
                  onChange={e => setCourseAmount(e.target.value)}
                  placeholder="Mức phí..."
                  className="input border-teal-200 focus:border-teal-550 focus:border-teal-500 bg-white font-mono font-bold"
                />
                <span className="text-[10px] text-gray-400 font-medium block mt-1">
                  * Khối 6 mặc định: 1.000.000đ | Các khối khác: 600.000đ (có thể chỉnh sửa tùy ý).
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-teal-100/70 pt-4">
              <div className="text-xs text-gray-400 font-medium max-w-md">
                Hệ thống sẽ hiển thị thông báo đóng học phí cho học sinh trên trang cổng thi (`/thi`). Dòng thông báo sẽ tự biến mất sau khi bạn tích "Đã thu".
              </div>
              
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                    onClick={sendClassNotifications}
                    disabled={sendingNotif}
                    className="btn-teal py-3 px-6 shadow-md shadow-teal-500/15 flex items-center gap-2 font-extrabold text-sm rounded-xl cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    {sendingNotif ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Đang phát hành...</>
                    ) : (
                      <><Send className="w-4 h-4" /> Báo học phí cả lớp ({tuitionData.length} HS)</>
                    )}
                  </button>
                  <button
                    onClick={async () => {
                      const amt = parseFloat(courseAmount)
                      if (isNaN(amt) || amt <= 0) {
                        toast.error('Vui lòng nhập số tiền học phí hợp lệ!')
                        return
                      }
                      if (!courseName.trim()) {
                        toast.error('Vui lòng nhập tên khóa học!')
                        return
                      }
                      if (tuitionData.some(r => r.status === 'unnotified')) {
                        await sendClassNotifications();
                      }

                      // Tự động mở bảng theo dõi và gửi Zalo đồng loạt 1-click
                      setAutoSendModal(true);
                      setTimeout(() => {
                        runAutoBulkSend();
                      }, 350);
                    }}
                    className="py-3 px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center gap-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                    title="Bấm 1 lần để phát hành và gửi Zalo cho cả lớp"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                    🚀 BÁO & GỬI ZALO CẢ LỚP ({tuitionData.length} HS)
                  </button>
              </div>
            </div>
          </div>

          {/* Student Tuition Notice List */}
          <div className="card overflow-hidden border border-slate-100 shadow-sm rounded-3xl">
            <div className="px-6 py-4 border-b border-teal-50 flex flex-wrap items-center justify-between gap-3 bg-white">
              <div>
                <h3 className="font-extrabold text-gray-800 text-lg">Danh sách Báo học phí của Lớp</h3>
                <p className="text-xs text-gray-400 font-semibold mt-0.5">Quản lý đóng học phí theo khóa hè</p>
              </div>
              
              {stats.unpaidCount > 0 && (
                <div className="flex items-center gap-3">
                  {sendResult && (
                    <span className="text-xs text-gray-550">
                      ✅ {sendResult.sent} gửi · ⏭ {sendResult.skipped} bỏ qua · ❌ {sendResult.errors} lỗi
                    </span>
                  )}
                  <button
                    onClick={() => setAutoSendModal(true)}
                    className="btn-teal text-xs py-2.5 px-4 flex items-center gap-2 font-black shadow-lg shadow-blue-600/20 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                    title="Bấm 1 lần gửi toàn bộ học sinh trong lớp"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                    ⚡ BẤM 1 LẦN: TỰ ĐỘNG GỬI TẤT CẢ ({stats.unpaidCount} HS)
                  </button>

                  <button
                    onClick={startBatchZalo}
                    className="btn-teal text-xs py-2 px-3.5 flex items-center gap-1.5 font-bold shadow-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl cursor-pointer"
                    title="Xem và gửi từng học sinh với mã QR to"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-blue-600" /> Trợ lý từng HS
                  </button>

                  <button
                    onClick={() => sendGmailReminder()}
                    disabled={sending}
                    className="btn-outline border-teal-200 text-teal-700 hover:bg-teal-50 text-xs py-2 px-4 flex items-center gap-1.5 font-bold"
                  >
                    {sending ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang gửi...</>
                    ) : (
                      <><Mail className="w-3.5 h-3.5" /> Gửi nhắc Gmail ({stats.unpaidCount} HS)</>
                    )}
                  </button>

                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-teal-50/50">
                    {[
                      'Học sinh', 'Khóa học', 'Mức học phí', 'Trạng thái', 'Thu học phí', 'Gửi thông báo', ''
                    ].map(h => (
                      <th
                        key={h}
                        className="px-5 py-3.5 text-left text-teal-800 font-extrabold text-xs uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tuitionData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-400 text-sm font-semibold italic">
                        Không có học sinh nào hoạt động trong lớp này.
                      </td>
                    </tr>
                  )}
                  {tuitionData.map(row => (
                    <tr
                      key={row.student.id}
                      className="border-b border-teal-50/40 hover:bg-slate-50 transition-colors"
                    >
                      {/* Học sinh */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-teal-100/50 text-teal-700 rounded-2xl flex items-center justify-center font-extrabold shadow-inner shrink-0">
                            {row.student.full_name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-extrabold text-gray-800">{row.student.full_name}</p>
                            <span className="text-xs bg-slate-100 text-slate-500 font-mono font-bold px-1.5 py-0.5 rounded border border-slate-200">
                              {row.student.student_code}
                            </span>
                            {(() => {
                              const st = students.find((s: any) => s.id === row.student.id) || row.student
                              const p = ((st as any)?.zalo || (st as any)?.parent_phone || '').replace(/\D/g, '')
                              return p ? (
                                <button
                                  onClick={() => setPhoneEditModal({ student: st, row, phoneInput: p })}
                                  className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 cursor-pointer hover:underline ${p.length === 10 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-red-50 text-red-700 border-red-300 animate-pulse'}`}
                                  title="Bấm để chỉnh sửa SĐT Zalo"
                                >
                                  📞 {p} {p.length !== 10 && '(thiếu số)'}
                                </button>
                              ) : (
                                <button
                                  onClick={() => setPhoneEditModal({ student: st, row, phoneInput: '' })}
                                  className="text-[11px] font-bold px-2 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100 flex items-center gap-1 cursor-pointer"
                                  title="Bấm để thêm SĐT Zalo"
                                >
                                  ⚠️ Thêm SĐT Zalo
                                </button>
                              )
                            })()}
                          </div>
                        </div>
                      </td>

                      {/* Khóa học */}
                      <td className="px-5 py-4 font-semibold text-gray-700">
                        {row.notification ? row.notification.course_name : '—'}
                      </td>

                      {/* Mức học phí */}
                      <td className="px-5 py-4 font-mono font-bold text-gray-800">
                        {row.notification ? fmtVNDShort(row.notification.amount) : '—'}
                      </td>

                      {/* Trạng thái */}
                      <td className="px-5 py-4">
                        {row.status === 'paid' ? (
                          <span className="badge-paid inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-2.5 py-1 rounded-full">
                            <CheckCircle className="w-3 h-3" /> Đã đóng
                          </span>
                        ) : row.status === 'unpaid' ? (
                          <span className="badge-debt inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold px-2.5 py-1 rounded-full">
                            <XCircle className="w-3 h-3 animate-pulse" /> Chưa đóng
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-400 border border-slate-250 border-slate-200 text-xs font-medium px-2.5 py-1 rounded-full">
                            <AlertCircle className="w-3 h-3" /> Chưa báo học phí
                          </span>
                        )}
                      </td>

                      {/* Thu học phí: Tick button next to student icon */}
                      <td className="px-5 py-4">
                        {row.status === 'unpaid' ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => quickCollectTuition(row)}
                              className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-emerald-500/20 transition-all hover:scale-105"
                              title="Tích đã thu tiền"
                            >
                              <Check className="w-5 h-5 font-black stroke-[3px]" />
                            </button>
                            
                            <button
                              onClick={() => setQrModal(row)}
                              className="p-2 text-teal-650 text-teal-600 hover:bg-teal-50 rounded-xl border border-teal-100 transition-colors"
                              title="Hiển thị mã QR / Thu tùy chọn"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                          </div>
                        ) : row.status === 'paid' ? (
                          <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg">✓ Hoàn tất</span>
                        ) : (
                          <button
                            onClick={() => sendSingleNotification(row.student.id)}
                            className="btn-teal text-xs py-1.5 px-3 flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" /> Báo học phí
                          </button>
                        )}
                      </td>

                      {/* Nhắc học phí */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => sendZaloDirect1Click(row)}
                            disabled={sendingStudentId === row.student.id}
                            className="px-3 py-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-60"
                            title="Bấm 1 nút là tự động gửi Zalo ngay lập tức"
                          >
                            {sendingStudentId === row.student.id ? (
                              <><Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" /> Đang gửi...</>
                            ) : (
                              <><Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" /> Gửi Zalo ngay</>
                            )}
                          </button>

                          <button
                            onClick={() => sendZalo(row)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Xem mẫu tin nhắn / Copy gửi thủ công"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          
                          <button
                            onClick={() => sendGmailReminder(row)}
                            disabled={sending}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Nhắc học phí qua Gmail"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                      {/* Xóa báo học phí */}
                      <td className="px-5 py-4 text-right">
                        {row.notification && (
                          <button
                            onClick={() => deleteNotice(row.notification.id)}
                            className="text-slate-405 text-slate-400 hover:text-red-500 p-2 rounded-xl transition-all"
                            title="Xóa thông báo học phí"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* QR VietQR Modal */}
      {qrModal && qrModal.notification && (
        <VietQRModal
          open={!!qrModal}
          onClose={() => setQrModal(null)}
          studentName={qrModal.student.full_name}
          studentCode={qrModal.student.student_code}
          amount={Number(qrModal.notification.amount)}
          month={qrModal.notification.course_name}
          onConfirmManual={() => openManualPay(qrModal)}
        />
      )}

      {/* Ghi nhận thanh toán Modal */}
      <Modal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        title="Ghi nhận thanh toán học phí"
        size="sm"
      >
        {payModal && payModal.notification && (
          <div className="space-y-4">
            <div className="bg-teal-50 rounded-xl p-4 border border-teal-100">
              <p className="font-bold text-teal-800">{payModal.student.full_name}</p>
              <p className="text-sm text-teal-600 mt-0.5">
                Mức học phí khóa: <strong>{fmtVNDShort(Number(payModal.notification.amount))}</strong>
              </p>
            </div>
            <div>
              <label className="label text-teal-700 font-bold">Số tiền (đ) *</label>
              <input
                type="number"
                value={payForm.amount}
                onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="label text-teal-700 font-bold">Hình thức</label>
              <select
                value={payForm.method}
                onChange={e => setPayForm(f => ({ ...f, method: e.target.value as PaymentMethod }))}
                className="input"
              >
                <option value="transfer">🏦 Chuyển khoản ngân hàng</option>
                <option value="cash">💵 Tiền mặt</option>
                <option value="seapay">📱 SeaPay</option>
              </select>
            </div>
            <div>
              <label className="label text-teal-700 font-bold">Ghi chú</label>
              <input
                value={payForm.note}
                onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
                className="input"
              />
            </div>
            <div className="flex gap-3 justify-end pt-3">
              <button onClick={() => setPayModal(null)} className="btn-outline border-slate-200">Hủy</button>
              <button
                onClick={() => { void savePay() }}
                disabled={saving}
                className="btn-teal px-5"
              >
                {saving ? 'Đang lưu...' : '✅ Xác nhận'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Xác nhận thanh toán & gửi thông báo nhận tiền */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-teal-105 border-teal-100 animate-scale-up">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-5 text-center text-white">
              <div className="text-4xl mb-1">🎉</div>
              <p className="font-extrabold text-lg">Đã thu học phí thành công!</p>
              <p className="text-emerald-100 text-sm mt-1">
                {confirmModal.studentName} · {fmtVNDShort(confirmModal.amount)}
              </p>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-500 text-center font-medium">
                Gửi biên lai xác nhận đến phụ huynh qua:
              </p>

              {/* Gmail */}
              <button
                onClick={sendConfirmEmail}
                disabled={sendingConfirm || !confirmModal.email}
                className="w-full py-3 flex items-center justify-between px-4 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition disabled:opacity-40"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">📧</span>
                  <div className="text-left">
                    <p className="font-bold text-gray-800 text-sm">Gửi Gmail</p>
                    <p className="text-xs text-gray-400">
                      {confirmModal.email || 'Chưa cấu hình email'}
                    </p>
                  </div>
                </div>
                {sendingConfirm
                  ? <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                  : <Mail className="w-4 h-4 text-red-500" />}
              </button>

              {/* Zalo */}
              <button
                onClick={sendConfirmZalo}
                disabled={sendingConfirm}
                className="w-full py-3 flex items-center justify-between px-4 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">💬</span>
                  <div className="text-left">
                    <p className="font-bold text-gray-800 text-sm">Nhắn Zalo</p>
                    <p className="text-xs text-gray-400">
                      {confirmModal.phone ? 'Copy nội dung + mở Zalo chat' : 'Mở Zalo Web'}
                    </p>
                  </div>
                </div>
                <MessageCircle className="w-4 h-4 text-blue-500" />
              </button>

              <button
                onClick={() => setConfirmModal(null)}
                className="w-full py-2.5 text-gray-400 hover:text-gray-600 text-sm font-semibold transition"
              >
                Bỏ qua, không gửi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zalo Share Modal */}
      {zaloModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-teal-150">
            <div className="bg-gradient-to-r from-blue-500 to-blue-400 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-white" />
                <span className="text-white font-extrabold">Thông báo học phí qua Zalo</span>
              </div>
              <button onClick={() => setZaloModal(null)} className="text-white/70 hover:text-white text-xl leading-none font-bold">✕</button>
            </div>

            <div className="p-4 space-y-3">
              <button
                onClick={async () => {
                  toast.loading('Đang tự động gửi tin nhắn và mã QR vào Zalo PC...');
                  const res = await sendZaloPersonalMessage(zaloModal.phone, zaloModal.msg, zaloModal.qrUrl);
                  toast.dismiss();
                  if (res.success) {
                    toast.success('🎉 Đã gửi tự động vào Zalo PC thành công!');
                    setZaloModal(null);
                  } else {
                    toast.error(res.message);
                  }
                }}
                className="w-full py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                ⚡ BẤM GỬI TỰ ĐỘNG NGAY QUA ZALO PC
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="shrink-0 mx-2 text-[10px] text-gray-400 font-bold uppercase">Hoặc gửi thủ công</span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>

              {/* Step 1: Copy Text message */}
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400">① Tin nhắn học phí</span>
                  <button onClick={() => copyZaloContent('text')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all
                      ${copiedZalo === 'text' ? 'bg-green-600 text-white' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
                    {copiedZalo === 'text' ? '✓ Đã copy' : 'Copy tin nhắn'}
                  </button>
                </div>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-sans font-medium">{zaloModal.msg}</pre>
              </div>

              {/* Step 2: Copy QR */}
              {zaloModal.qrUrl && (
                <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-blue-700">② Ảnh QR chuyển khoản</span>
                    <button onClick={() => copyZaloContent('img')}
                      className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all
                        ${copiedZalo === 'img' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
                      {copiedZalo === 'img' ? '✓ Đã copy' : 'Copy QR'}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <img src={zaloModal.qrUrl} alt="QR" className="w-20 h-20 rounded-xl border border-blue-200 shrink-0" />
                    <p className="text-xs text-blue-900/70 leading-relaxed font-medium">
                      Bấm <strong>Copy QR</strong> → vào Zalo → <strong>Ctrl+V</strong> để gửi ảnh.<br/>
                      Hoặc đính kèm ảnh QR đã tải xuống.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 3: Open Zalo chat */}
              <button
                onClick={() => window.open(zaloModal.phone ? 'https://zalo.me/' + zaloModal.phone : 'https://chat.zalo.me', '_blank')}
                className="w-full py-2.5 bg-blue-500 text-white rounded-xl font-bold text-sm hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-500/10">
                <MessageCircle className="w-4 h-4" />
                {zaloModal.phone ? '③ Mở Zalo phụ huynh' : '③ Mở Zalo Web'}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Bank Automation & Webhook Connection Modal */}
      {bankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-teal-100 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 px-6 py-4 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/15 rounded-xl backdrop-blur-xs">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-lg">Liên Kết Ngân Hàng Tự Động</h3>
                  <p className="text-xs text-teal-100">Tự động gạch nợ học phí & gửi tin nhắn xác nhận cho phụ huynh</p>
                </div>
              </div>
              <button
                onClick={() => setBankModalOpen(false)}
                className="text-white/80 hover:text-white text-2xl font-extrabold w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
              {/* How it works */}
              <div className="bg-emerald-50/80 p-4 rounded-2xl border border-emerald-200 text-emerald-950 space-y-2">
                <p className="font-extrabold text-xs uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600 stroke-[3px]" /> Quy trình hoạt động tự động 100%:
                </p>
                <div className="text-xs text-gray-700 space-y-1.5 pl-1 leading-relaxed">
                  <p>1. <strong>Phụ huynh quét mã QR</strong> bằng App ngân hàng: Màn hình điện thoại tự động hiện đúng số tiền (ví dụ: 640.000đ) và tên học sinh.</p>
                  <p>2. <strong>Tài khoản Vietcombank nhận tiền</strong>: Dịch vụ SePay / Casso ngay lập tức nhận biến động số dư và báo về web.</p>
                  <p>3. <strong>Hệ thống tự động đổi trạng thái</strong> học sinh thành <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">ĐÃ ĐÓNG</span> trên web.</p>
                  <p>4. <strong>Hệ thống tự động gửi tin nhắn cho phụ huynh</strong>: <br/>
                    <em className="text-emerald-900 font-semibold">"Dạ em chào anh/chị, Thầy Thọ đã nhận được học phí của cháu rồi mẹ nhé! Thầy cảm ơn gia đình nhiều ạ."</em>
                  </p>
                </div>
              </div>

              {/* Webhook URL Box */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <label className="text-xs font-black text-gray-700 uppercase tracking-wide flex items-center justify-between">
                  <span>Đường dẫn Webhook của Hệ thống:</span>
                  <span className="text-[10px] text-teal-700 font-bold bg-teal-100 px-2 py-0.5 rounded-full">Sẵn sàng nhận dữ liệu</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value="https://lop-hoc-thay-tho.vercel.app/api/payment-webhook"
                    className="input bg-white font-mono text-xs text-gray-700 font-bold border-slate-200 select-all"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText('https://lop-hoc-thay-tho.vercel.app/api/payment-webhook');
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(null), 2500);
                    }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer shadow-xs
                      ${copiedWebhook ? 'bg-emerald-600 text-white' : 'bg-teal-600 hover:bg-teal-700 text-white'}`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedWebhook ? '✓ Đã Copy' : 'Copy URL'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  * Dán đường dẫn này vào mục <strong>Webhooks</strong> trên SePay (sepay.vn) hoặc Casso (casso.vn).
                </p>
              </div>

              {/* 3 Steps Setup Guide */}
              <div className="space-y-2">
                <p className="font-black text-gray-800 text-xs uppercase tracking-wider">3 Bước kết nối với SePay (Miễn phí):</p>
                <div className="space-y-2 text-xs text-gray-700">
                  <div className="p-3 bg-white border border-gray-200 rounded-xl flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-black flex items-center justify-center shrink-0">1</span>
                    <div>
                      <p className="font-bold text-gray-800">Tạo tài khoản tại sepay.vn</p>
                      <p className="text-gray-500">Truy cập <a href="https://sepay.vn" target="_blank" rel="noreferrer" className="text-teal-600 underline font-bold">sepay.vn</a> và đăng ký tài khoản miễn phí.</p>
                    </div>
                  </div>
                  <div className="p-3 bg-white border border-gray-200 rounded-xl flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-black flex items-center justify-center shrink-0">2</span>
                    <div>
                      <p className="font-bold text-gray-800">Kết nối tài khoản Vietcombank của Thầy</p>
                      <p className="text-gray-500">Thêm STK: <strong className="font-mono text-gray-700">1070493932</strong> (HO KINH DOANH NGUYEN LUONG THO).</p>
                    </div>
                  </div>
                  <div className="p-3 bg-white border border-gray-200 rounded-xl flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-black flex items-center justify-center shrink-0">3</span>
                    <div>
                      <p className="font-bold text-gray-800">Dán Webhook URL</p>
                      <p className="text-gray-500">Vào mục <strong>Cấu hình Webhooks</strong> trên SePay và dán đường link webhook ở trên vào là hoàn tất!</p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setBankModalOpen(false)}
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-extrabold rounded-xl shadow-md transition-all cursor-pointer text-xs"
              >
                Đã Hiểu & Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1-Click Auto Bulk Send Modal */}
      {autoSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-blue-100 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-600 px-6 py-4 flex items-center justify-between text-white shrink-0">
              <div>
                <h3 className="font-black text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-300" /> Bấm 1 Lần: Gửi Học Phí & VietQR Cho Cả Lớp
                </h3>
                <p className="text-xs text-blue-100 font-medium">
                  Tự động gửi lời nhắn + Mã VietQR đúng số tiền và tên từng em
                </p>
              </div>
              <button
                onClick={() => { if (!autoSending) setAutoSendModal(false); }}
                disabled={autoSending}
                className="text-white/80 hover:text-white text-2xl font-extrabold w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Summary Card */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50/60 p-4 rounded-2xl border border-blue-100 space-y-2">
                <div className="flex items-center justify-between border-b border-blue-100/80 pb-2">
                  <span className="text-xs font-bold text-gray-500 uppercase">Lớp học:</span>
                  <span className="font-black text-blue-800 text-sm">
                    {classes.find(c => c.id === selClass)?.name || (classes.find(c => c.id === selClass) as any)?.class_name || 'Lớp đã chọn'}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-blue-100/80 pb-2">
                  <span className="text-xs font-bold text-gray-500 uppercase">Khóa học & Mức phí:</span>
                  <span className="font-black text-emerald-600 text-sm">
                    {courseName} ({fmtVNDShort(Number(courseAmount))})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase">Số phụ huynh cần gửi:</span>
                  <span className="font-black text-rose-600 text-sm">
                    {tuitionData.filter(r => r.status === 'unpaid').length} học sinh chưa nộp
                  </span>
                </div>
              </div>

              {/* Information Alert */}
              <div className="bg-teal-50 p-3.5 rounded-2xl border border-teal-200 text-xs text-teal-900 leading-relaxed space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-teal-950">
                  <Check className="w-4 h-4 text-teal-600 stroke-[3px]" />
                  Mỗi phụ huynh sẽ nhận được đúng mã VietQR của con:
                </p>
                <p className="text-gray-600 pl-5">
                  • <strong>Đúng số tiền:</strong> {fmtVNDShort(Number(courseAmount))}<br />
                  • <strong>Đúng tên học sinh:</strong> Khi phụ huynh quét mã bằng App ngân hàng, màn hình tự hiện tên con (ví dụ: <code className="bg-white px-1.5 py-0.5 rounded text-blue-700 font-mono font-bold">HP NGUYEN MINH ANH 10</code>)<br />
                  • <strong>Tự điền STK:</strong> 1070493932 (Vietcombank - HO KINH DOANH NGUYEN LUONG THO)
                </p>
              </div>

              {/* Progress & Live Log */}
              {autoSending && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-blue-800">
                    <span>Đang tiến hành gửi tự động...</span>
                    <span>{autoProgress.current} / {autoProgress.total} HS</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${autoProgress.total > 0 ? (autoProgress.current / autoProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {autoProgress.logs.length > 0 && (
                <div className="bg-slate-900 text-slate-100 p-3 rounded-2xl font-mono text-[11px] max-h-40 overflow-y-auto space-y-1 border border-slate-800 shadow-inner">
                  {autoProgress.logs.map((log, idx) => (
                    <div key={idx} className="leading-tight">{log}</div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <button
                  onClick={runAutoBulkSend}
                  disabled={autoSending || tuitionData.filter(r => r.status === 'unpaid').length === 0}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-blue-500/25 text-sm flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                >
                  {autoSending ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Đang tự động gửi qua Zalo...</>
                  ) : (
                    <><Sparkles className="w-5 h-5 text-amber-300" /> ▶ BẮT ĐẦU TỰ ĐỘNG GỬI (1-CLICK)</>
                  )}
                </button>

                <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-2">
                  <p className="font-bold">💡 Tùy chọn gửi dự phòng nếu Zalo chưa cấu hình API:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => { setAutoSendModal(false); startBatchZalo(); }}
                      className="flex-1 py-2 bg-white hover:bg-amber-100 text-amber-950 font-bold rounded-xl border border-amber-300 text-xs shadow-xs cursor-pointer"
                    >
                      🚀 Mở Trợ Lý Gửi Siêu Tốc (Web)
                    </button>
                    <a
                      href="/CHAY_BOT_ZALO_GUI_HOC_PHI.bat"
                      download="CHAY_BOT_ZALO_GUI_HOC_PHI.bat"
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-center text-xs shadow-xs"
                    >
                      🤖 Tải File Robot Zalo (.bat)
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Zalo Runner Modal */}
      {batchZaloModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-blue-100 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-600 px-6 py-4 flex items-center justify-between text-white shrink-0">
              <div>
                <h3 className="font-black text-lg flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-blue-200" /> Trợ lý Gửi Zalo Hàng Loạt
                </h3>
                <p className="text-xs text-blue-100 font-medium">
                  Đang gửi: Học sinh {batchZaloModal.currentIndex + 1} / {batchZaloModal.list.length} (Chưa đóng học phí)
                </p>
              </div>
              <button
                onClick={() => { setBatchZaloModal(null); setCopiedBatch(null); }}
                className="text-white/80 hover:text-white text-2xl font-extrabold w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content for Current Student */}
            {(() => {
              const currentRow = batchZaloModal.list[batchZaloModal.currentIndex]
              if (!currentRow) return null
              const studentObj = students.find((s: any) => s.id === currentRow.student.id)
              const rawPhone = (studentObj as any)?.zalo || (studentObj as any)?.parent_phone || ''
              const digits = rawPhone.replace(/\D/g, '')
              const cleanPhone = digits.startsWith('84') ? '0' + digits.substring(2) : (digits.startsWith('0') ? digits : '0' + digits)
              const phoneForLink = cleanPhone ? (cleanPhone.startsWith('84') ? '0' + cleanPhone.slice(2) : cleanPhone) : ''
              const amt = courseAmount ? Number(courseAmount) : (Number(currentRow.notification?.amount) || 600000)
              const activeCourseName = (courseName && courseName.trim()) || currentRow.notification?.course_name || 'Tháng ' + (selectedMonth || '9/2026')

              const bankId      = import.meta.env.VITE_BANK_ID      || 'VCB'
              const bankAccount = import.meta.env.VITE_BANK_ACCOUNT || '1070493932'
              const bankName    = import.meta.env.VITE_BANK_NAME    || import.meta.env.VITE_BANK_ACCOUNT_NAME || 'HO KINH DOANH NGUYEN LUONG THO'
              const cls = classes.find(c => c.id === selClass)
              const clsName = (cls as any)?.class_name || cls?.name || 'Lớp 10'
              const cleanClass = clsName.replace(/^[Ll][ớỚoO][pP]\s*/, '').trim() || clsName
              const addInfo = formatVietQRAddInfo(currentRow.student.full_name, clsName, currentRow.student.student_code)
              const qrUrl = `https://img.vietqr.io/image/${bankId}-${bankAccount}-compact.png?amount=${amt}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(bankName)}`

              const msg = `Chào Quý phụ huynh.\n`
                        + `Thầy gửi thông tin học phí tháng ${activeCourseName}:\n\n`
                        + `• Học sinh: ${currentRow.student.full_name}\n`
                        + `• Lớp: ${cleanClass}\n`
                        + `• Số tiền cần nộp: ${amt.toLocaleString('vi-VN')} VNĐ\n`
                        + `• Thời gian thu học phí: Từ 01 – 10 hàng tháng\n\n`
                        + `• Hình thức nộp: Chuyển khoản\n`
                        + `   - Ngân hàng: V.C.B (Ngoại thương)\n`
                        + `   - STK: ${bankAccount}\n`
                        + `   - Chủ TK (HKD): ${bankName}\n`
                        + `   - Nội dung chuyển khoản: ${addInfo}\n\n`
                        + `👉 Mã QR chuyển khoản nhanh (đã điền sẵn số tiền và tên học sinh bên dưới):`

              const copyTextOnly = async () => {
                try {
                  await navigator.clipboard.writeText(msg)
                  setCopiedBatch('text')
                  toast.success(`Đã copy tin nhắn kèm mã QR của ${currentRow.student.full_name}`)
                  setTimeout(() => setCopiedBatch(null), 2500)
                } catch {
                  toast.error('Lỗi khi sao chép')
                }
              }

              const copyQrImageOnly = async () => {
                try {
                  const res = await fetch(qrUrl)
                  const blob = await res.blob()
                  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                  setCopiedBatch('img')
                  toast.success(`✅ Đã copy ảnh QR của ${currentRow.student.full_name}! Vào Zalo ấn Ctrl+V để dán ảnh`)
                  setTimeout(() => setCopiedBatch(null), 3000)
                } catch {
                  const a = document.createElement('a')
                  a.href = qrUrl
                  a.download = `QR_${currentRow.student.student_code}_${amt}.png`
                  a.click()
                  toast.success('Đã tải ảnh mã QR xuống máy!')
                }
              }

              const openAndCopy = async () => {
                await copyTextOnly()
                const targetUrl = phoneForLink
                  ? `https://zalo.me/${phoneForLink}`
                  : 'https://chat.zalo.me'
                window.open(targetUrl, '_blank')
              }

              const markPaidAndNext = async () => {
                const confirmCollect = window.confirm(`Xác nhận đã thu học phí ${fmtVNDShort(amt)} của ${currentRow.student.full_name}?`)
                if (!confirmCollect) return
                try {
                  await addPayment({
                    student_id: currentRow.student.id,
                    class_id: selClass,
                    amount: amt,
                    method: 'transfer',
                    note: `Thu học phí khóa ${currentRow.notification.course_name} (Thu nhanh qua Zalo)`,
                  })
                  await updateTuitionNotification(currentRow.notification.id, { is_paid: true })
                  toast.success(`✅ Đã thu học phí từ ${currentRow.student.full_name}`)
                  void loadTuitionNotifications(selClass)
                  void loadPayments(selClass)

                  if (batchZaloModal.currentIndex < batchZaloModal.list.length - 1) {
                    setBatchZaloModal(b => b ? { ...b, currentIndex: b.currentIndex + 1 } : null)
                  } else {
                    setBatchZaloModal(null)
                    toast.success('🎉 Đã hoàn tất danh sách gửi Zalo!')
                  }
                } catch (e: any) {
                  toast.error('Lỗi: ' + e.message)
                }
              }

              return (
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${((batchZaloModal.currentIndex + 1) / batchZaloModal.list.length) * 100}%` }}
                    />
                  </div>

                  {/* Student & Tuition Info */}
                  <div className="bg-gradient-to-br from-blue-50/80 to-indigo-50/50 p-4 rounded-2xl border border-blue-100 shadow-xs flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black text-lg shadow-md shadow-blue-500/20">
                        {currentRow.student.full_name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-black text-gray-900 text-base">{currentRow.student.full_name}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-600">
                          <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-700">
                            {currentRow.student.student_code}
                          </span>
                          <span>SĐT: <strong className="text-gray-800">{rawPhone || 'Chưa có SĐT'}</strong></span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-extrabold text-blue-700 uppercase tracking-wider">Học phí cần nộp</p>
                      <p className="text-xl font-black text-emerald-600 font-mono">{fmtVNDShort(amt)}</p>
                    </div>
                  </div>

                  {/* VietQR Code Visual Display */}
                  <div className="bg-white rounded-2xl border-2 border-dashed border-teal-300 p-4 flex flex-col sm:flex-row items-center gap-4 bg-teal-50/20">
                    <div className="relative shrink-0 group">
                      <img
                        src={qrUrl}
                        alt="VietQR"
                        className="w-28 h-28 object-contain rounded-xl border border-teal-200 bg-white p-1 shadow-sm transition-transform group-hover:scale-105"
                      />
                      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-teal-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full whitespace-nowrap shadow-xs">
                        Napas 247
                      </span>
                    </div>
                    <div className="flex-1 text-center sm:text-left space-y-1">
                      <p className="text-xs font-black text-teal-900 flex items-center justify-center sm:justify-start gap-1">
                        <QrCode className="w-4 h-4 text-teal-600" /> Mã VietQR Chuẩn Đã Điền Số Tiền
                      </p>
                      <p className="text-[11px] text-gray-600 leading-relaxed">
                        STK: <strong className="font-mono text-gray-800">{bankAccount}</strong> (Vietcombank)<br />
                        Cú pháp: <strong className="font-mono text-blue-700">{addInfo}</strong><br />
                        Số tiền: <strong className="text-emerald-700">{amt.toLocaleString('vi-VN')} đ</strong>
                      </p>
                      <div className="pt-1 flex flex-wrap gap-2 justify-center sm:justify-start">
                        <button
                          onClick={copyQrImageOnly}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer
                            ${copiedBatch === 'img' ? 'bg-emerald-600 text-white' : 'bg-teal-600 hover:bg-teal-700 text-white'}`}
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copiedBatch === 'img' ? '✓ Đã Copy Ảnh QR' : 'Copy Ảnh QR (Ctrl+V)'}
                        </button>
                        <a
                          href={qrUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3 text-gray-500" /> Mở ảnh gốc
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Message Preview */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">
                        Nội dung tin nhắn gửi Zalo
                      </span>
                      <button
                        onClick={copyTextOnly}
                        className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer
                          ${copiedBatch === 'text' ? 'bg-emerald-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                      >
                        <Copy className="w-3 h-3" />
                        {copiedBatch === 'text' ? '✓ Đã Copy' : 'Copy tin nhắn'}
                      </button>
                    </div>
                    <pre className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans max-h-24 overflow-y-auto bg-white p-2.5 rounded-xl border border-slate-200/80">
                      {msg}
                    </pre>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2.5 pt-1">
                    <button
                      onClick={async () => {
                        toast.loading(`Đang tự động gửi Zalo cho ${currentRow.student.full_name}...`);
                        const res = await sendZaloPersonalMessage(phoneForLink, msg, qrUrl);
                        toast.dismiss();
                        if (res.success) {
                          toast.success(`🎉 Đã gửi tự động cho ${currentRow.student.full_name}!`);
                          if (batchZaloModal.currentIndex < batchZaloModal.list.length - 1) {
                            setBatchZaloModal(b => b ? { ...b, currentIndex: b.currentIndex + 1 } : null);
                          } else {
                            toast.success('🎉 Đã hoàn tất danh sách gửi Zalo!');
                            setBatchZaloModal(null);
                          }
                        } else {
                          toast.error(res.message);
                        }
                      }}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-2xl shadow-lg shadow-blue-500/25 text-sm flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
                    >
                      <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
                      ⚡ BẤM GỬI TỰ ĐỘNG NGAY QUA ZALO PC
                    </button>

                    <button
                      onClick={openAndCopy}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-2xl shadow-lg shadow-blue-500/25 text-sm flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
                    >
                      <MessageCircle className="w-5 h-5 text-blue-100" />
                      {phoneForLink
                        ? `🚀 Copy & Mở Zalo Cho ${currentRow.student.full_name}`
                        : `🚀 Mở Zalo Web & Copy Tin Nhắn`}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={markPaidAndNext}
                        className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                      >
                        <Check className="w-4 h-4 text-emerald-600 stroke-[3px]" />
                        Đã thu tiền & Sang học sinh tiếp theo
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100">
                      <button
                        disabled={batchZaloModal.currentIndex === 0}
                        onClick={() => { setBatchZaloModal(b => b ? { ...b, currentIndex: b.currentIndex - 1 } : null); setCopiedBatch(null); }}
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        ← Học sinh trước
                      </button>
                      <button
                        disabled={batchZaloModal.currentIndex >= batchZaloModal.list.length - 1}
                        onClick={() => { setBatchZaloModal(b => b ? { ...b, currentIndex: b.currentIndex + 1 } : null); setCopiedBatch(null); }}
                        className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold rounded-xl text-xs disabled:opacity-40 transition-colors shadow-xs cursor-pointer"
                      >
                        Học sinh tiếp theo →
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Modal Nhập/Chỉnh sửa số điện thoại Zalo */}
      {phoneEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-teal-100 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-blue-100 text-blue-700 rounded-xl text-lg">📱</span>
                <div>
                  <h3 className="font-extrabold text-gray-800 text-base">Số điện thoại Zalo Phụ huynh</h3>
                  <p className="text-xs text-gray-400 font-medium">Học sinh: <strong className="text-gray-700">{phoneEditModal.student.full_name}</strong></p>
                </div>
              </div>
              <button onClick={() => setPhoneEditModal(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 block">Số điện thoại (đủ 10 chữ số) *</label>
              <input
                type="tel"
                value={phoneEditModal.phoneInput}
                onChange={e => setPhoneEditModal({ ...phoneEditModal, phoneInput: e.target.value })}
                placeholder="VD: 0915991696..."
                className="input border-blue-200 focus:border-blue-600 font-mono text-base font-bold text-blue-900 w-full"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSavePhoneAndSend()
                }}
              />
              <p className="text-[11px] text-gray-400">
                * Số điện thoại sẽ được lưu vào hồ sơ học sinh và tự động dùng cho các lần gửi tiếp theo.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPhoneEditModal(null)}
                className="btn-outline border-slate-200 text-xs py-2.5 px-4 font-bold"
              >
                Hủy
              </button>
              <button
                onClick={handleSavePhoneAndSend}
                className="py-2.5 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-blue-500/25 flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95 transition-all"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                Lưu & Gửi Zalo ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
