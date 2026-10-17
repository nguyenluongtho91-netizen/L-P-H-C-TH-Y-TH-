// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react'
import {
  QrCode, MessageCircle, Send, RefreshCw,
  Search, CheckCheck, Clock, DollarSign, Zap,
  Settings, Key, ExternalLink, ShieldCheck, AlertCircle, Copy
} from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { formatVietQRAddInfo } from '@/lib/helpers'
import {
  sendZaloOAMessage,
  sendZNSNotification,
  getZaloConfig,
  saveZaloConfig,
  testZaloOAConnection,
  isZaloOAConfigured,
  checkZaloServiceHealth,
  sendZaloPersonalMessage,
  startZaloPersonalLogin,
  checkZaloPersonalLoginState,
  ZaloConfig,
  ZaloServiceHealth
} from '@/services/zaloService'

export default function ZaloCenter() {
  const {
    classes, students, enrollments, tuitionNotifications,
    loadClasses, loadStudents, loadEnrollments, loadTuitionNotifications
  } = useDataStore()

  const [activeTab, setActiveTab] = useState<'chat' | 'tuition' | 'connection'>('chat')
  const [isBotConnected] = useState(true)
  const [qrCodeUrl, setQrCodeUrl] = useState('https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=ZALO_CONNECT_EDU_CENTER_SESSION')

  // State Cấu hình Zalo OA Modal & Zalo Service
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [sendChannel, setSendChannel] = useState<'personal' | 'oa'>('personal')
  const [zaloConfig, setZaloConfig] = useState<ZaloConfig>({
    appId: '',
    appSecret: '',
    oaId: '',
    refreshToken: '',
    accessToken: '',
    serviceUrl: '',
    serviceApiKey: ''
  })
  const [serviceHealth, setServiceHealth] = useState<ZaloServiceHealth | null>(null)
  const [isCheckingHealth, setIsCheckingHealth] = useState(false)
  const [personalQrImage, setPersonalQrImage] = useState<string | null>(null)
  const [personalLoginStatus, setPersonalLoginStatus] = useState<string>('idle')
  const [testResult, setTestResult] = useState<{ loading: boolean; success?: boolean; message?: string } | null>(null)

  // State bộ lọc học phí
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [selectedMonth, setSelectedMonth]     = useState('Tháng 8/2026')
  const [tuitionTemplate, setTuitionTemplate] = useState(
    `Chào Quý phụ huynh.\n`
    + `Thầy gửi thông tin học phí tháng {thang}:\n\n`
    + `• Học sinh: {ten_hoc_sinh}\n`
    + `• Lớp: {lop}\n`
    + `• Số tiền cần nộp: {so_tien} VNĐ\n\n`
    + `• Hình thức nộp: Chuyển khoản\n`
    + `   - Ngân hàng: V.C.B (Ngoại thương)\n`
    + `   - STK: 1070493932\n`
    + `   - Chủ TK (HKD): HO KINH DOANH NGUYEN LUONG THO\n`
    + `   - Cú pháp CK: HP {ma_hoc_sinh} KH\n\n`
    + `👉 Mã QR chuyển khoản nhanh (bên dưới):\n`
    + `{link_qr}`
  )
  const [isSendingBulk, setIsSendingBulk] = useState(false)
  const [sentItemIds, setSentItemIds]     = useState<string[]>([])

  // Helper format tin nhắn học phí kèm link QR VietQR
  const formatTuitionMessage = (item: any) => {
    return tuitionTemplate
      .replace(/{ten_hoc_sinh}/g, item.studentName)
      .replace(/{lop}/g, item.class)
      .replace(/{thang}/g, item.month)
      .replace(/{so_tien}/g, item.amount.toLocaleString())
      .replace(/{ma_hoc_sinh}/g, item.studentCode || 'HS')
      .replace(/{link_qr}/g, item.qrUrl || '')
  }

  // State quản lý chat
  const [inputText, setInputText]   = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeConvId, setActiveConvId] = useState<string | null>(null)

  // Load cấu hình Zalo khi render
  useEffect(() => {
    setZaloConfig(getZaloConfig())
  }, [])

  // Load dữ liệu thực từ Supabase khi mở trang
  useEffect(() => {
    void Promise.all([loadClasses(), loadStudents(), loadEnrollments()])
  }, [loadClasses, loadStudents, loadEnrollments])

  useEffect(() => {
    if (selectedClassId && selectedClassId !== 'all') {
      void loadTuitionNotifications(selectedClassId)
    }
  }, [selectedClassId, loadTuitionNotifications])

  // Mapping danh sách Học sinh thực tế từ DB thành danh sách thu học phí Zalo
  const realTuitionItems = useMemo(() => {
    if (!students || students.length === 0) return []

    return students.map(st => {
      const studentEnrollments = enrollments.filter(e => e.student_id === st.id)
      const studentClasses = studentEnrollments
        .map(e => classes.find(c => c.id === e.class_id))
        .filter(Boolean)
      
      const primaryClass = studentClasses[0]
      const className = primaryClass ? (primaryClass.class_name || primaryClass.name || 'Chưa xếp lớp') : 'Chưa xếp lớp'
      const classId   = primaryClass ? primaryClass.id : 'no_class'

      const notif = tuitionNotifications.find(n => n.student_id === st.id && (selectedClassId === 'all' || n.class_id === selectedClassId))
      const amount = notif ? Number(notif.amount) : (primaryClass?.tuition_fee || 600000)
      const studentCode = st.student_code || st.code || 'HS'
      const addInfo = formatVietQRAddInfo(st.full_name || st.name || '', className)
      const bankId = 'VCB'
      const bankAccount = '1070493932'
      const bankName = 'HO KINH DOANH NGUYEN LUONG THO'
      const qrUrl = `https://img.vietqr.io/image/${bankId}-${bankAccount}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(bankName)}`
      const isSent = sentItemIds.includes(st.id)

      return {
        id: st.id,
        studentName: st.full_name || st.name || 'Học sinh',
        studentCode: studentCode,
        class: className,
        classId: classId,
        phone: st.parent_phone || (st as any).zalo || st.phone || 'Chưa có SĐT',
        amount: amount,
        month: notif?.course_name || selectedMonth,
        status: isSent ? 'sent' : 'pending',
        qrUrl: qrUrl
      }
    })
  }, [students, enrollments, classes, tuitionNotifications, selectedClassId, sentItemIds, selectedMonth])

  // Lọc theo lớp được chọn
  const filteredTuitionItems = useMemo(() => {
    if (selectedClassId === 'all') return realTuitionItems
    return realTuitionItems.filter(item => item.classId === selectedClassId)
  }, [realTuitionItems, selectedClassId])

  // Mapping danh sách Chat từ danh sách học sinh thực tế
  const realConversations = useMemo(() => {
    return realTuitionItems.map((item, idx) => ({
      id: item.id,
      name: `Phụ huynh ${item.studentName}`,
      studentName: item.studentName,
      className: item.class,
      phone: item.phone,
      avatar: `https://images.unsplash.com/photo-${1535713875002 + idx * 100}?w=150`,
      status: idx % 2 === 0 ? 'online' : 'offline',
      unread: 0,
      lastMsgTime: 'Vừa xong',
      lastMsg: `Chào trung tâm, em hỏi học phí cháu ${item.studentName}`,
      messages: [
        { id: `m1_${item.id}`, sender: 'system', text: `Chào phụ huynh. Trung tâm gửi thông báo học phí của học sinh ${item.studentName} (${item.class}).`, time: '09:00' },
        { id: `m2_${item.id}`, sender: 'user', text: `Vâng, em đã nhận được thông tin. Cảm ơn trung tâm.`, time: '09:05' }
      ]
    }))
  }, [realTuitionItems])

  const activeConv = useMemo(() => {
    if (!realConversations || realConversations.length === 0) return null
    return realConversations.find(c => c.id === activeConvId) || realConversations[0]
  }, [realConversations, activeConvId])

  // State quản lý tin nhắn tự tạo
  const [customMessages, setCustomMessages] = useState<Record<string, any[]>>({})

  // Lưu cấu hình Zalo OA
  const handleSaveConfig = () => {
    saveZaloConfig(zaloConfig)
    alert('✅ Đã lưu Cấu hình Zalo OA thành công vào trình duyệt!')
  }

  // Kiểm tra kết nối Zalo OA
  const handleTestConnection = async () => {
    saveZaloConfig(zaloConfig)
    setTestResult({ loading: true })
    const res = await testZaloOAConnection()
    setTestResult({ loading: false, success: res.success, message: res.message })
  }

  // Mở Zalo Web (zalo.me) để gửi tin nhắn miễn phí nếu OA gặp lỗi
  const handleOpenZaloWeb = (phone: string, msgText: string) => {
    navigator.clipboard.writeText(msgText)
    let cleanPhone = phone.replace(/\D/g, '')
    if (cleanPhone.startsWith('84')) cleanPhone = '0' + cleanPhone.slice(2)
    window.open(`https://zalo.me/${cleanPhone}`, '_blank')
    alert(`📋 Đã sao chép nội dung tin nhắn vào Bộ nhớ tạm!\n👉 Đã mở trang Zalo SĐT ${cleanPhone}. Bạn chỉ cần dán (Ctrl+V) để gửi!`)
  }

  // Xử lý gửi tin nhắn trực tiếp qua Zalo OA Service / Zalo Personal Gateway
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputText.trim() || !activeConv) return

    const msgText = inputText.trim()
    const targetPhone = activeConv.phone
    const targetId = activeConv.id
    setInputText('')

    const newMsg = {
      id: 'm_' + Date.now(),
      sender: 'system',
      text: msgText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setCustomMessages(prev => ({
      ...prev,
      [targetId]: [...(prev[targetId] || []), newMsg]
    }))

    try {
      if (sendChannel === 'personal') {
        const res = await sendZaloPersonalMessage(targetPhone, msgText)
        if (!res.success) {
          alert(`⚠️ ${res.message}`)
        }
      } else {
        const res = await sendZaloOAMessage(targetPhone, msgText)
        if (!res.success) {
          alert(`⚠️ ${res.message}`)
        }
      }
    } catch (err: any) {
      console.log('Đã thêm tin nhắn vào hàng chờ gửi Zalo', err)
    }
  }

  // Gửi tin nhắn học phí cá nhân
  const handleSendTuitionIndividual = async (id: string) => {
    const item = filteredTuitionItems.find(i => i.id === id)
    if (!item) return

    const msg = formatTuitionMessage(item)

    try {
      if (sendChannel === 'personal') {
        const res = await sendZaloPersonalMessage(item.phone, msg)
        if (res.success) {
          setSentItemIds(prev => [...prev, id])
          alert(`✅ ${res.message || 'Đã đưa vào hàng chờ gửi Zalo cá nhân!'}`)
        } else {
          if (confirm(`⚠️ Không gửi được Zalo Service: ${res.message}\n\n👉 BẠN CÓ MUỐN MỞ CHAT ZALO.ME CỦA PHỤ HUYNH ĐỂ GỬI THỦ CÔNG KHÔNG?`)) {
            handleOpenZaloWeb(item.phone, msg)
            setSentItemIds(prev => [...prev, id])
          }
        }
      } else {
        const res = await sendZaloOAMessage(item.phone, msg)
        if (res.success) {
          setSentItemIds(prev => [...prev, id])
          alert(`✅ ${res.message || 'Đã gửi Zalo OA thành công!'}`)
        } else {
          if (confirm(`⚠️ Không gửi được Zalo OA: ${res.message}\n\n👉 BẠN CÓ MUỐN MỞ CHAT ZALO.ME CỦA PHỤ HUYNH ĐỂ GỬI BẰNG ZALO CÁ NHÂN KHÔNG?`)) {
            handleOpenZaloWeb(item.phone, msg)
            setSentItemIds(prev => [...prev, id])
          }
        }
      }
    } catch (err: any) {
      console.error('Lỗi gửi học phí Zalo', err)
      alert(`❌ Lỗi gửi Zalo: ${err?.message || 'Có lỗi xảy ra'}`)
    }
  }

  // Gửi học phí hàng loạt
  const handleSendBulkTuition = async () => {
    setIsSendingBulk(true)
    const pendingItems = filteredTuitionItems.filter(i => i.status === 'pending')

    let successCount = 0
    let failCount = 0
    let lastErrorMsg = ''

    for (const item of pendingItems) {
      const msg = formatTuitionMessage(item)

      try {
        const res = sendChannel === 'personal'
          ? await sendZaloPersonalMessage(item.phone, msg)
          : await sendZaloOAMessage(item.phone, msg)

        if (res.success) {
          setSentItemIds(prev => [...prev, item.id])
          successCount++
        } else {
          failCount++
          lastErrorMsg = res.message || ''
        }
      } catch (err) {
        failCount++
        console.error('Lỗi gửi học phí Zalo cho ' + item.studentName, err)
      }
    }
    setIsSendingBulk(false)

    if (successCount > 0) {
      alert(`🎉 Đã gửi thành công ${successCount} tin nhắn học phí qua Zalo OA!`)
    }
    if (failCount > 0) {
      alert(`⚠️ ${failCount} tin nhắn chưa gửi được qua Zalo OA (${lastErrorMsg || 'Cần kiểm tra Cấu hình Zalo OA'}). Hãy nhấp nút "⚙️ Cấu hình Zalo OA" để kiểm tra!`)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto font-sans">
      {/* HEADER BAR */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 backdrop-blur-md rounded-xl">
              <MessageCircle className="w-8 h-8 text-blue-200" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Zalo Connect & Broadcaster</h1>
              <p className="text-blue-100 text-sm mt-0.5">Kết nối Zalo cá nhân, Zalo OA và tự động gửi thông báo học phí</p>
            </div>
          </div>
        </div>

        {/* Action Buttons & Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsConfigOpen(true)}
            className="px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border border-white/20 transition-all shadow-sm"
          >
            <Settings className="w-4 h-4 text-amber-300" />
            <span>⚙️ Cấu hình Zalo OA</span>
          </button>

          <div className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 backdrop-blur-md ${
            isZaloOAConfigured() ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30' : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full ${isZaloOAConfigured() ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            {isZaloOAConfigured() ? 'Zalo OA Đã Cấu Hình' : 'Chưa Cấu Hình Token'}
          </div>

          <div className="bg-white/10 p-1 rounded-xl backdrop-blur-md border border-white/15 flex gap-1 text-sm font-medium">
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'chat' ? 'bg-white text-blue-800 shadow-md font-bold' : 'text-blue-100 hover:bg-white/10'
              }`}
            >
              <MessageCircle className="w-4 h-4" /> Trò chuyện
            </button>
            <button
              onClick={() => setActiveTab('tuition')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'tuition' ? 'bg-white text-blue-800 shadow-md font-bold' : 'text-blue-100 hover:bg-white/10'
              }`}
            >
              <DollarSign className="w-4 h-4" /> Gửi Học Phí
            </button>
            <button
              onClick={() => setActiveTab('connection')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'connection' ? 'bg-white text-blue-800 shadow-md font-bold' : 'text-blue-100 hover:bg-white/10'
              }`}
            >
              <QrCode className="w-4 h-4" /> Kết nối QR
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: TRÒ CHUYỆN 2 CHIỀU (CHAT INBOX) */}
      {activeTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden min-h-[680px]">
          {/* CỘT TRÁI: DANH SÁCH HỘI THOẠI */}
          <div className="lg:col-span-4 border-r border-slate-200 flex flex-col bg-slate-50/50">
            {/* Search Box */}
            <div className="p-4 border-b border-slate-200 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm theo tên phụ huynh/học sinh..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {realConversations
                .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.studentName.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(c => {
                  const isActive = c.id === (activeConvId || realConversations[0]?.id)
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        setActiveConvId(c.id)
                        c.unread = 0
                      }}
                      className={`p-4 flex items-start gap-3 cursor-pointer transition-all ${
                        isActive ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        <img src={c.avatar} alt={c.name} className="w-12 h-12 rounded-full object-cover border border-slate-200" />
                        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                          c.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300'
                        }`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <h4 className="font-bold text-slate-800 text-sm truncate">{c.name}</h4>
                          <span className="text-[11px] font-medium text-slate-400">{c.lastMsgTime}</span>
                        </div>
                        <p className="text-xs text-blue-600 font-medium mb-1">HS: {c.studentName} - {c.className}</p>
                        <p className="text-xs text-slate-500 truncate">{c.lastMsg}</p>
                      </div>

                      {c.unread > 0 && (
                        <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>

          {/* CỘT PHẢI: KHUNG CHAT CHI TIẾT */}
          <div className="lg:col-span-8 flex flex-col bg-white">
            {activeConv && (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <img src={activeConv.avatar} alt={activeConv.name} className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                    <div>
                      <h3 className="font-bold text-slate-800 text-base">{activeConv.name}</h3>
                      <p className="text-xs text-slate-500 font-mono">SĐT: {activeConv.phone} • Lớp: {activeConv.className}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenZaloWeb(activeConv.phone, '')}
                    className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Mở Zalo.me
                  </button>
                </div>

                {/* Message Log */}
                <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/30">
                  <div className="text-center my-2">
                    <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                      Hội thoại mã hóa qua Zalo OpenAPI / Bot
                    </span>
                  </div>

                  {([...(activeConv.messages || []), ...(customMessages[activeConv.id] || [])]).map(m => {
                    const isMe = m.sender === 'system'
                    return (
                      <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[75%] p-3.5 rounded-2xl shadow-sm text-sm ${
                          isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                        }`}>
                          <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium mt-1 px-1">{m.time}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Chat Input Bar */}
                <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-white flex items-center gap-3">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Nhập tin nhắn Zalo gửi phụ huynh... (Enter để gửi)"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center gap-2 text-sm shadow-md"
                  >
                    <span>Gửi</span>
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: GỬI HỌC PHÍ TỰ ĐỘNG (TUITION BROADCASTER) */}
      {activeTab === 'tuition' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Cấu hình mẫu tin nhắn học phí */}
          <div className="lg:col-span-5 bg-white p-6 rounded-2xl shadow-lg border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" /> Mẫu tin nhắn Zalo Học Phí
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nội dung mẫu (Template)</label>
              <textarea
                rows={6}
                value={tuitionTemplate}
                onChange={(e) => setTuitionTemplate(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 text-sm font-sans focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
              <p className="text-xs font-bold text-slate-700">Các biến thay thế tự động:</p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">{'{ten_hoc_sinh}'}</span>
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">{'{lop}'}</span>
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">{'{thang}'}</span>
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">{'{so_tien}'}</span>
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">{'{ma_hoc_sinh}'}</span>
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-bold">{'{link_qr}'}</span>
              </div>
            </div>

            <button
              onClick={handleSendBulkTuition}
              disabled={isSendingBulk}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-sm"
            >
              {isSendingBulk ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Đang tự động gửi qua Zalo...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Tự động gửi Zalo cho tất cả ({filteredTuitionItems.filter(i => i.status === 'pending').length} học sinh)
                </>
              )}
            </button>
          </div>

          {/* Danh sách học sinh & trạng thái gửi */}
          <div className="lg:col-span-7 bg-white p-6 rounded-2xl shadow-lg border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Danh sách thu học phí</h3>
                <p className="text-xs text-slate-500">Chọn lớp và kênh Zalo để gửi thông báo</p>
              </div>

              {/* Chọn Kênh gửi: Personal Zalo Service vs Zalo OA */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSendChannel('personal')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    sendChannel === 'personal' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ⚡ Zalo Service (Cá nhân)
                </button>
                <button
                  type="button"
                  onClick={() => setSendChannel('oa')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    sendChannel === 'oa' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📢 Zalo OA API
                </button>
              </div>

              {/* Bộ lọc Lớp học & Tháng */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 max-w-[220px]"
                >
                  <option value="all">-- Tất cả các lớp ({classes.length}) --</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.class_name || cls.name} ({cls.grade || 'Lớp'})
                    </option>
                  ))}
                </select>

                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="Tháng 8/2026">Tháng 8/2026</option>
                  <option value="Tháng 9/2026">Tháng 9/2026</option>
                  <option value="Tháng 10/2026">Tháng 10/2026</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase bg-slate-50">
                    <th className="p-3 rounded-l-lg">Học sinh / Lớp</th>
                    <th className="p-3">SĐT Zalo</th>
                    <th className="p-3">Học phí</th>
                    <th className="p-3">Trạng thái Zalo</th>
                    <th className="p-3 rounded-r-lg text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTuitionItems.map(item => {
                    const msgText = formatTuitionMessage(item)

                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <p className="font-bold text-slate-800">{item.studentName}</p>
                          <p className="text-xs text-blue-600">{item.class}</p>
                        </td>
                        <td className="p-3 font-mono text-slate-600">{item.phone}</td>
                        <td className="p-3 font-bold text-slate-800">{item.amount.toLocaleString()}đ</td>
                        <td className="p-3">
                          {item.status === 'sent' ? (
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full flex items-center gap-1 w-max">
                              <CheckCheck className="w-3.5 h-3.5" /> Đã gửi Zalo
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full flex items-center gap-1 w-max">
                              <Clock className="w-3.5 h-3.5" /> Chờ gửi
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleSendTuitionIndividual(item.id)}
                              disabled={item.status === 'sent'}
                              className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 font-bold rounded-lg text-xs flex items-center gap-1 transition-all shadow-xs"
                              title="Gửi tự động qua Zalo OA API"
                            >
                              <Send className="w-3 h-3" /> Gửi OA
                            </button>
                            <button
                              onClick={() => handleOpenZaloWeb(item.phone, msgText)}
                              className="px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold rounded-lg text-xs flex items-center gap-1 transition-all"
                              title="Mở Zalo.me và copy nội dung gửi thủ công"
                            >
                              <ExternalLink className="w-3 h-3 text-blue-600" /> Zalo Web
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: KẾT NỐI MÃ QR ZALO (QR LOGIN) */}
      {activeTab === 'connection' && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Cấu hình Zalo Personal Service (zalo-service) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base">Máy chủ Zalo Service Gateway (Personal Zalo)</h3>
                  <p className="text-xs text-slate-500">Địa chỉ Backend Node.js (`zalo-service`) triển khai trên Render / VPS</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  setIsCheckingHealth(true)
                  const res = await checkZaloServiceHealth()
                  setServiceHealth(res)
                  setIsCheckingHealth(false)
                }}
                disabled={isCheckingHealth}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin' : ''}`} /> Check Health
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">ZALO SERVICE URL</label>
                <input
                  type="text"
                  value={zaloConfig.serviceUrl || ''}
                  onChange={(e) => setZaloConfig({ ...zaloConfig, serviceUrl: e.target.value })}
                  placeholder="https://zalo-service-xyz.onrender.com"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">API KEY (X-API-KEY)</label>
                <input
                  type="password"
                  value={zaloConfig.serviceApiKey || ''}
                  onChange={(e) => setZaloConfig({ ...zaloConfig, serviceApiKey: e.target.value })}
                  placeholder="Khóa API_KEY bảo mật"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              {serviceHealth && (
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    serviceHealth.zalo === 'ready' ? 'bg-emerald-500' :
                    serviceHealth.zalo === 'connecting' ? 'bg-amber-500 animate-pulse' :
                    'bg-rose-500'
                  }`} />
                  <span className="text-slate-700">
                    Trạng thái Zalo Server: <b className="uppercase">{serviceHealth.zalo}</b>
                  </span>
                  {serviceHealth.lastError && (
                    <span className="text-rose-500 text-[11px]">({serviceHealth.lastError})</span>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  saveZaloConfig(zaloConfig)
                  alert('✅ Đã lưu Cấu hình Zalo Service URL & API Key!')
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all ml-auto"
              >
                Lưu cấu hình Server
              </button>
            </div>
          </div>

          {/* QR Code login card */}
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center space-y-6">
            <div>
              <h2 className="text-2xl font-black text-slate-800">Kết nối tài khoản Zalo cá nhân</h2>
              <p className="text-slate-500 text-sm mt-1">Dùng ứng dụng Zalo trên điện thoại quét mã QR bên dưới để kết nối tự động với Web App</p>
            </div>

            <div className="inline-block p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-inner relative">
              <img src={personalQrImage || qrCodeUrl} alt="Zalo QR Code" className="w-56 h-56 mx-auto rounded-lg shadow-sm" />
              <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-2xl backdrop-blur-xs opacity-0 hover:opacity-100 transition-opacity">
                <button 
                  onClick={async () => {
                    if (zaloConfig.serviceUrl) {
                      const res = await startZaloPersonalLogin()
                      if (res.ok && res.qrImage) {
                        setPersonalQrImage(res.qrImage)
                      }
                    } else {
                      setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=ZALO_CONNECT_SESSION_${Date.now()}`)
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Làm mới Mã QR
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100">
                <p className="font-bold text-blue-900 text-xs mb-1">Bước 1</p>
                <p className="text-xs text-slate-600">Mở ứng dụng Zalo trên điện thoại cá nhân / trung tâm.</p>
              </div>
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100">
                <p className="font-bold text-blue-900 text-xs mb-1">Bước 2</p>
                <p className="text-xs text-slate-600">Chọn biểu tượng Quét mã QR ở góc trên cùng Zalo.</p>
              </div>
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100">
                <p className="font-bold text-blue-900 text-xs mb-1">Bước 3</p>
                <p className="text-xs text-slate-600">Xác nhận đăng nhập trên Zalo để hoàn tất kết nối Bot.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CẤU HÌNH ZALO OA */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl space-y-6 relative border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <Key className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-800">Cấu hình Zalo Official Account (OA)</h2>
                  <p className="text-xs text-slate-500">Cập nhật Token & Khóa API trực tiếp để gửi tin nhắn trên Web Vercel</p>
                </div>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            {/* FORM INPUTS */}
            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Zalo App ID</label>
                <input
                  type="text"
                  value={zaloConfig.appId}
                  onChange={(e) => setZaloConfig({ ...zaloConfig, appId: e.target.value })}
                  placeholder="Ví dụ: 1290064728515467235"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Zalo App Secret Key</label>
                <input
                  type="password"
                  value={zaloConfig.appSecret}
                  onChange={(e) => setZaloConfig({ ...zaloConfig, appSecret: e.target.value })}
                  placeholder="Secret key từ developers.zalo.me"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Zalo OA ID</label>
                <input
                  type="text"
                  value={zaloConfig.oaId}
                  onChange={(e) => setZaloConfig({ ...zaloConfig, oaId: e.target.value })}
                  placeholder="Ví dụ: 2097717237177591403"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase">Zalo Refresh Token mới nhất</label>
                  <a
                    href="https://developers.zalo.me/tools/explorer"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-bold"
                  >
                    Lấy Token tại Zalo Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <textarea
                  rows={3}
                  value={zaloConfig.refreshToken}
                  onChange={(e) => setZaloConfig({ ...zaloConfig, refreshToken: e.target.value })}
                  placeholder="Dán mã Refresh Token mới lấy từ Zalo Developer Console..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  💡 Hướng dẫn: Truy cập <a href="https://developers.zalo.me/tools/explorer" target="_blank" rel="noreferrer" className="text-blue-600 font-bold underline">developers.zalo.me/tools/explorer</a> ➔ Chọn ứng dụng & OA ➔ Cấp quyền ➔ Copy <b>Refresh Token</b> dán vào đây.
                </p>
              </div>

              {/* Ket qua test */}
              {testResult && (
                <div className={`p-4 rounded-2xl border text-xs font-semibold ${
                  testResult.loading ? 'bg-blue-50 border-blue-200 text-blue-800' :
                  testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {testResult.loading ? (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Đang kiểm tra kết nối với Zalo OAuth...
                    </div>
                  ) : (
                    <div>{testResult.message}</div>
                  )}
                </div>
              )}
            </div>

            {/* BUTTONS */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testResult?.loading}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
              >
                <ShieldCheck className="w-4 h-4 text-blue-600" /> Kiểm Tra Kết Nối Token
              </button>

              <button
                type="button"
                onClick={() => {
                  handleSaveConfig()
                  setIsConfigOpen(false)
                }}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition-all text-center"
              >
                Lưu Cấu Hình
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
