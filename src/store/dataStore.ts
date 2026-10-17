export { supabase } from '@/lib/supabase'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { toTitleCase } from '@/lib/helpers'
import type {
  Class, Student, Enrollment, AttendanceRecord,
  Payment, EmailLog, Profile, AttendanceStatus,
  PaymentMethod, EmailType, TuitionNotification,
} from '@/types'

interface DataState {
  classes:     Class[]
  students:    Student[]
  enrollments: Enrollment[]
  attendance:  AttendanceRecord[]
  payments:    Payment[]
  emailLogs:   EmailLog[]
  profiles:    Profile[]
  tuitionNotifications: TuitionNotification[]

  // Classes
  loadClasses:  () => Promise<void>
  addClass:     (cls: Omit<Class, 'id' | 'created_at'>) => Promise<Class>
  updateClass:  (id: string, updates: Partial<Class>) => Promise<Class>

  // Students
  loadStudents:  () => Promise<void>
  addStudent:    (student: Omit<Student, 'id' | 'created_at'>) => Promise<Student>
  updateStudent: (id: string, updates: Partial<Student>) => Promise<Student>

  // Enrollments
  loadEnrollments: () => Promise<void>
  enroll:   (studentId: string, classId: string) => Promise<Enrollment>
  unenroll: (studentId: string, classId: string) => Promise<void>

  // Attendance
  loadAttendance:   (classId?: string, dateFrom?: string, dateTo?: string) => Promise<void>
  upsertAttendance: (rows: Array<{
    class_id: string; student_id: string; date: string
    present: boolean; late?: boolean; status: AttendanceStatus; note?: string | null
  }>) => Promise<AttendanceRecord[]>

  // Payments
  loadPayments: (classId?: string) => Promise<void>
  addPayment:   (payment: {
    student_id?: string | null; class_id?: string | null
    amount: number; method: PaymentMethod; note?: string | null; paid_at?: string
  }) => Promise<Payment>

  // Profiles
  loadProfiles:   () => Promise<void>
  updateProfile:  (id: string, updates: Partial<Profile>) => Promise<Profile>

  // Email Logs
  loadEmailLogs: () => Promise<void>
  addEmailLog:   (log: {
    student_id?: string | null; type: EmailType
    recipient: string; subject: string; status: 'sent' | 'failed'; error?: string | null
  }) => Promise<EmailLog | null>

  // Teacher assignments
  assignTeacher:        (teacherId: string, classId: string) => Promise<void>
  getClassesForTeacher:(teacherId: string) => Promise<string[]>

  // Tuition Notifications
  loadTuitionNotifications: (classId?: string) => Promise<void>
  upsertTuitionNotification: (notif: {
    student_id: string; class_id: string; course_name: string; amount: number; is_paid?: boolean
  }) => Promise<TuitionNotification>
  batchUpsertTuitionNotifications: (notifs: Array<{
    student_id: string; class_id: string; course_name: string; amount: number; is_paid?: boolean
  }>) => Promise<TuitionNotification[]>
  updateTuitionNotification: (id: string, updates: Partial<TuitionNotification>) => Promise<TuitionNotification>
  deleteTuitionNotification: (id: string) => Promise<void>
}

// Helper for reliable cloud JSON persistence in Supabase exams table
async function saveStoreToExams(title: string, items: any[]) {
  try {
    const { data: existing } = await supabase.from('exams').select('id').eq('title', title).maybeSingle()
    if (existing?.id) {
      await supabase.from('exams').update({ data: { items } }).eq('id', existing.id)
    } else {
      await supabase.from('exams').insert([{ title, data: { items } }])
    }
  } catch (err) {
    console.warn('saveStoreToExams error for ' + title, err)
  }
}

export const useDataStore = create<DataState>((set, _get) => ({
  classes:     [],
  students:    [],
  enrollments: [],
  attendance:  [],
  payments:    [],
  emailLogs:   [],
  profiles:    [],
  tuitionNotifications: [],

  // ── Classes ───────────────────────────────────────────────────────────────
  loadClasses: async () => {
    const { data } = await supabase.from('classes').select('*').order('created_at', { ascending: false })
    set({ classes: (data ?? []) as Class[] })
  },

  addClass: async (cls) => {
    const { data, error } = await supabase.from('classes').insert([cls]).select().single()
    if (error) throw error
    const row = data as Class
    set(s => ({ classes: [row, ...s.classes] }))
    return row
  },

  updateClass: async (id, updates) => {
    const { data, error } = await supabase.from('classes').update(updates).eq('id', id).select().single()
    if (error) throw error
    const row = data as Class
    set(s => ({ classes: s.classes.map(c => c.id === id ? row : c) }))
    return row
  },

  // ── Students ──────────────────────────────────────────────────────────────
  loadStudents: async () => {
    const { data } = await supabase.from('students').select('*').order('full_name')
    set({ students: (data ?? []) as Student[] })
  },

  addStudent: async (student) => {
    const studentWithFormattedName = {
      ...student,
      full_name: toTitleCase(student.full_name)
    }
    const { data, error } = await supabase.from('students').insert([studentWithFormattedName]).select().single()
    if (error) throw error
    const row = data as Student
    set(s => ({ students: [row, ...s.students] }))
    return row
  },

  updateStudent: async (id, updates) => {
    const formattedUpdates = { ...updates }
    if (formattedUpdates.full_name !== undefined) {
      formattedUpdates.full_name = toTitleCase(formattedUpdates.full_name)
    }
    const { data, error } = await supabase.from('students').update(formattedUpdates).eq('id', id).select().single()
    if (error) throw error
    const row = data as Student
    set(s => ({ students: s.students.map(st => st.id === id ? row : st) }))
    return row
  },

  // ── Enrollments ───────────────────────────────────────────────────────────
  loadEnrollments: async () => {
    const { data } = await supabase.from('enrollments').select('*')
    set({ enrollments: (data ?? []) as Enrollment[] })
  },

  enroll: async (studentId, classId) => {
    // 1. Kiểm tra sự tồn tại của bản ghi cũ để tránh lỗi unique constraint của database
    const { data: existing } = await supabase.from('enrollments')
      .select('id, status')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .maybeSingle()

    let row;

    if (existing) {
      // 2. Nếu đã tồn tại bản ghi, chuyển trạng thái active và cập nhật ngày ghi danh mới nhất
      const { data, error } = await supabase.from('enrollments')
        .update({ status: 'active', enroll_date: new Date().toISOString().split('T')[0] })
        .eq('id', existing.id)
        .select().single()
      if (error) throw error
      row = data as Enrollment
    } else {
      // 3. Nếu chưa từng tồn tại, tiến hành thêm mới hoàn toàn
      const { data, error } = await supabase.from('enrollments')
        .insert([{ student_id: studentId, class_id: classId, status: 'active' }])
        .select().single()
      if (error) throw error
      row = data as Enrollment
    }

    // 4. Đồng bộ hóa mảng enrollments ngay trên bộ nhớ cục bộ giao diện (Zustand State)
    set(s => {
      const existsInState = s.enrollments.find(e => e.student_id === studentId && e.class_id === classId)
      return { 
        enrollments: existsInState 
          ? s.enrollments.map(e => e.id === row.id ? row : e) 
          : [row, ...s.enrollments] 
      }
    })
    
    return row
  },

  unenroll: async (studentId, classId) => {
    const { error } = await supabase.from('enrollments')
      .update({ status: 'inactive' })
      .eq('student_id', studentId).eq('class_id', classId)
    if (error) throw error
    set(s => ({
      enrollments: s.enrollments.map(e =>
        e.student_id === studentId && e.class_id === classId ? { ...e, status: 'inactive' as const } : e
      ),
    }))
  },

  // ── Attendance ────────────────────────────────────────────────────────────
  loadAttendance: async (classId, dateFrom, dateTo) => {
    let q = supabase.from('attendance').select('*')
    if (classId)  q = q.eq('class_id', classId)
    if (dateFrom) q = q.gte('date', dateFrom)
    if (dateTo)   q = q.lte('date', dateTo)
    const { data } = await q.order('date', { ascending: false })
    set({ attendance: (data ?? []) as AttendanceRecord[] })
  },

  upsertAttendance: async (rows) => {
    const { data, error } = await supabase.from('attendance')
      .upsert(rows, { onConflict: 'date,class_id,student_id' })
      .select()
    if (error) throw error
    const updated_rows = data as AttendanceRecord[]
    set(s => {
      const updated = [...s.attendance]
      for (const row of updated_rows) {
        const idx = updated.findIndex(a =>
          a.date === row.date && a.class_id === row.class_id && a.student_id === row.student_id
        )
        if (idx >= 0) updated[idx] = row
        else updated.unshift(row)
      }
      return { attendance: updated }
    })
    return updated_rows
  },

  // ── Payments ──────────────────────────────────────────────────────────────
  loadPayments: async (classId) => {
    try {
      let q = supabase.from('payments').select('*')
      if (classId) q = q.eq('class_id', classId)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      set({ payments: (data ?? []) as Payment[] })
      return
    } catch {
      let cloudItems: Payment[] = []
      let localItems: Payment[] = []
      try {
        const { data } = await supabase.from('exams').select('data').eq('title', '__PAYMENTS_STORE__').maybeSingle()
        if (data?.data?.items && Array.isArray(data.data.items)) {
          cloudItems = data.data.items as Payment[]
        }
      } catch {}
      try {
        const local = localStorage.getItem('__PAYMENTS_STORE__')
        if (local) localItems = JSON.parse(local) as Payment[]
      } catch {}
      const map = new Map<string, Payment>()
      for (const p of cloudItems) map.set(p.id, p)
      for (const p of localItems) if (!map.has(p.id)) map.set(p.id, p)
      const all = Array.from(map.values())
      try { localStorage.setItem('__PAYMENTS_STORE__', JSON.stringify(all)) } catch {}
      const filtered = classId ? all.filter(p => p.class_id === classId) : all
      set({ payments: filtered })
    }
  },

  addPayment: async (payment) => {
    try {
      const { data, error } = await supabase.from('payments').insert([payment]).select().single()
      if (error) throw error
      const row = data as Payment
      set(s => ({ payments: [row, ...s.payments] }))
      return row
    } catch {
      let items: Payment[] = []
      try {
        const { data } = await supabase.from('exams').select('data').eq('title', '__PAYMENTS_STORE__').maybeSingle()
        if (data?.data?.items && Array.isArray(data.data.items)) items = data.data.items
      } catch {}
      if (items.length === 0) {
        try {
          const local = localStorage.getItem('__PAYMENTS_STORE__')
          if (local) items = JSON.parse(local)
        } catch {}
      }
      const now = new Date().toISOString()
      const row: Payment = {
        id: 'pay_' + Math.random().toString(36).slice(2, 11),
        student_id: payment.student_id,
        class_id: payment.class_id,
        amount: payment.amount,
        method: payment.method,
        date: (payment as any).date || now.slice(0, 10),
        note: payment.note,
        created_at: now
      }
      items = [row, ...items]
      try { localStorage.setItem('__PAYMENTS_STORE__', JSON.stringify(items)) } catch {}
      await saveStoreToExams('__PAYMENTS_STORE__', items)
      set(s => ({ payments: [row, ...s.payments] }))
      return row
    }
  },

  // ── Profiles ──────────────────────────────────────────────────────────────
  loadProfiles: async () => {
    const { data } = await supabase.from('profiles').select('*').order('name')
    set({ profiles: (data ?? []) as Profile[] })
  },

  updateProfile: async (id, updates) => {
    const { data, error } = await supabase.from('profiles').update(updates).eq('id', id).select().single()
    if (error) throw error
    const row = data as Profile
    set(s => ({ profiles: s.profiles.map(p => p.id === id ? row : p) }))
    return row
  },

  // ── Email Logs ────────────────────────────────────────────────────────────
  loadEmailLogs: async () => {
    const { data } = await supabase.from('email_logs').select('*').order('created_at', { ascending: false }).limit(100)
    set({ emailLogs: (data ?? []) as EmailLog[] })
  },

  addEmailLog: async (log) => {
    const { data } = await supabase.from('email_logs').insert([log]).select().single()
    if (data) set(s => ({ emailLogs: [data as EmailLog, ...s.emailLogs] }))
    return data as EmailLog | null
  },

  // ── Teacher assignments ───────────────────────────────────────────────────
  assignTeacher: async (teacherId, classId) => {
    const { error } = await supabase.from('teacher_classes')
      .upsert([{ teacher_id: teacherId, class_id: classId, status: 'active' }],
              { onConflict: 'teacher_id,class_id' })
    if (error) throw error
  },

  getClassesForTeacher: async (teacherId) => {
    const { data } = await supabase
      .from('teacher_classes')
      .select('class_id')
      .eq('teacher_id', teacherId)
      .eq('status', 'active')
    return ((data ?? []) as Array<{ class_id: string }>).map(r => r.class_id)
  },

  // ── Tuition Notifications ──────────────────────────────────────────────────
  loadTuitionNotifications: async (classId) => {
    try {
      let q = supabase.from('tuition_notifications').select('*')
      if (classId) q = q.eq('class_id', classId)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      set({ tuitionNotifications: (data ?? []) as TuitionNotification[] })
      return
    } catch {
      let cloudItems: TuitionNotification[] = []
      let localItems: TuitionNotification[] = []
      try {
        const { data } = await supabase.from('exams').select('data').eq('title', '__TUITION_NOTIFICATIONS_STORE__').maybeSingle()
        if (data?.data?.items && Array.isArray(data.data.items)) {
          cloudItems = data.data.items as TuitionNotification[]
        }
      } catch {}
      try {
        const local = localStorage.getItem('__TUITION_NOTIFICATIONS_STORE__')
        if (local) localItems = JSON.parse(local) as TuitionNotification[]
      } catch {}
      const map = new Map<string, TuitionNotification>()
      for (const item of cloudItems) {
        const key = item.id || (item.student_id + "_" + item.class_id + "_" + item.course_name)
        map.set(key, item)
      }
      for (const item of localItems) {
        const key = item.id || (item.student_id + "_" + item.class_id + "_" + item.course_name)
        if (!map.has(key)) map.set(key, item)
      }
      const all = Array.from(map.values())
      try { localStorage.setItem('__TUITION_NOTIFICATIONS_STORE__', JSON.stringify(all)) } catch {}
      const filtered = classId ? all.filter(i => i.class_id === classId) : all
      set({ tuitionNotifications: filtered })
    }
  },

  upsertTuitionNotification: async (notif) => {
    try {
      const { data, error } = await supabase.from('tuition_notifications')
        .upsert([notif], { onConflict: 'student_id,class_id,course_name' })
        .select().single()
      if (error) throw error
      const row = data as TuitionNotification
      set(s => {
        const exists = s.tuitionNotifications.find(n => n.id === row.id)
        return {
          tuitionNotifications: exists
            ? s.tuitionNotifications.map(n => n.id === row.id ? row : n)
            : [row, ...s.tuitionNotifications]
        }
      })
      return row
    } catch {
      let items: TuitionNotification[] = []
      try {
        const { data } = await supabase.from('exams').select('data').eq('title', '__TUITION_NOTIFICATIONS_STORE__').maybeSingle()
        if (data?.data?.items && Array.isArray(data.data.items)) items = data.data.items
      } catch {}
      if (items.length === 0) {
        try {
          const local = localStorage.getItem('__TUITION_NOTIFICATIONS_STORE__')
          if (local) items = JSON.parse(local)
        } catch {}
      }

      const existingIdx = items.findIndex(
        i => i.student_id === notif.student_id && i.class_id === notif.class_id && i.course_name === notif.course_name
      )
      const now = new Date().toISOString()
      const row: TuitionNotification = {
        id: existingIdx >= 0 ? items[existingIdx].id : 'notif_' + Math.random().toString(36).slice(2, 11),
        student_id: notif.student_id,
        class_id: notif.class_id,
        course_name: notif.course_name,
        amount: notif.amount,
        is_paid: notif.is_paid ?? false,
        created_at: existingIdx >= 0 ? items[existingIdx].created_at : now
      }

      if (existingIdx >= 0) {
        items[existingIdx] = row
      } else {
        items = [row, ...items]
      }

      try { localStorage.setItem('__TUITION_NOTIFICATIONS_STORE__', JSON.stringify(items)) } catch {}
      await saveStoreToExams('__TUITION_NOTIFICATIONS_STORE__', items)

      set(s => {
        const exists = s.tuitionNotifications.find(n => n.id === row.id)
        return {
          tuitionNotifications: exists
            ? s.tuitionNotifications.map(n => n.id === row.id ? row : n)
            : [row, ...s.tuitionNotifications]
        }
      })
      return row
    }
  },

  batchUpsertTuitionNotifications: async (notifs) => {
    if (notifs.length === 0) return []
    let items: TuitionNotification[] = []
    try {
      const { data } = await supabase.from('exams').select('data').eq('title', '__TUITION_NOTIFICATIONS_STORE__').maybeSingle()
      if (data?.data?.items && Array.isArray(data.data.items)) items = data.data.items
    } catch {}
    if (items.length === 0) {
      try {
        const local = localStorage.getItem('__TUITION_NOTIFICATIONS_STORE__')
        if (local) items = JSON.parse(local)
      } catch {}
    }

    const now = new Date().toISOString()
    const updatedRows: TuitionNotification[] = []

    for (const notif of notifs) {
      const existingIdx = items.findIndex(
        i => i.student_id === notif.student_id && i.class_id === notif.class_id && i.course_name === notif.course_name
      )
      const row: TuitionNotification = {
        id: existingIdx >= 0 ? items[existingIdx].id : 'notif_' + Math.random().toString(36).slice(2, 11),
        student_id: notif.student_id,
        class_id: notif.class_id,
        course_name: notif.course_name,
        amount: notif.amount,
        is_paid: notif.is_paid ?? false,
        created_at: existingIdx >= 0 ? items[existingIdx].created_at : now
      }
      if (existingIdx >= 0) {
        items[existingIdx] = row
      } else {
        items = [row, ...items]
      }
      updatedRows.push(row)
    }

    try { localStorage.setItem('__TUITION_NOTIFICATIONS_STORE__', JSON.stringify(items)) } catch {}
    await saveStoreToExams('__TUITION_NOTIFICATIONS_STORE__', items)

    set(s => {
      let current = [...s.tuitionNotifications]
      for (const row of updatedRows) {
        const idx = current.findIndex(n => n.id === row.id)
        if (idx >= 0) current[idx] = row
        else current = [row, ...current]
      }
      return { tuitionNotifications: current }
    })
    return updatedRows
  },

  updateTuitionNotification: async (id, updates) => {
    try {
      const { data, error } = await supabase.from('tuition_notifications')
        .update(updates).eq('id', id).select().single()
      if (error) throw error
      const row = data as TuitionNotification
      set(s => ({
        tuitionNotifications: s.tuitionNotifications.map(n => n.id === id ? row : n)
      }))
      return row
    } catch {
      let items: TuitionNotification[] = []
      try {
        const { data } = await supabase.from('exams').select('data').eq('title', '__TUITION_NOTIFICATIONS_STORE__').maybeSingle()
        if (data?.data?.items && Array.isArray(data.data.items)) items = data.data.items
      } catch {}
      if (items.length === 0) {
        try {
          const local = localStorage.getItem('__TUITION_NOTIFICATIONS_STORE__')
          if (local) items = JSON.parse(local)
        } catch {}
      }
      const idx = items.findIndex(i => i.id === id)
      if (idx >= 0) {
        const row = { ...items[idx], ...updates }
        items[idx] = row
        try { localStorage.setItem('__TUITION_NOTIFICATIONS_STORE__', JSON.stringify(items)) } catch {}
        await saveStoreToExams('__TUITION_NOTIFICATIONS_STORE__', items)
        set(s => ({
          tuitionNotifications: s.tuitionNotifications.map(n => n.id === id ? row : n)
        }))
        return row
      }
      throw new Error('Khong tim thay ban ghi hoc phi')
    }
  },

  deleteTuitionNotification: async (id) => {
    try {
      await supabase.from('tuition_notifications').delete().eq('id', id)
    } catch {}
    let items: TuitionNotification[] = []
    try {
      const { data } = await supabase.from('exams').select('data').eq('title', '__TUITION_NOTIFICATIONS_STORE__').maybeSingle()
      if (data?.data?.items && Array.isArray(data.data.items)) items = data.data.items
    } catch {}
    if (items.length === 0) {
      try {
        const local = localStorage.getItem('__TUITION_NOTIFICATIONS_STORE__')
        if (local) items = JSON.parse(local)
      } catch {}
    }
    const filtered = items.filter(i => i.id !== id)
    try { localStorage.setItem('__TUITION_NOTIFICATIONS_STORE__', JSON.stringify(filtered)) } catch {}
    await saveStoreToExams('__TUITION_NOTIFICATIONS_STORE__', filtered)
    set(s => ({
      tuitionNotifications: s.tuitionNotifications.filter(n => n.id !== id)
    }))
  }
}))
