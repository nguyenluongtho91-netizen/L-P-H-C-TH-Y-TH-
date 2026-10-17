// @ts-nocheck
import { useEffect, useState, useRef } from 'react'
import { Plus, Pencil, Users, Search, Eye, EyeOff, Upload, Download, X, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Trash2, Phone, Ghost, Info } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import type { Student } from '@/types'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { toTitleCase } from '@/lib/helpers'
import { saveStudentCredential, saveBatchStudentCredentials, getAllStudentCredentials, enrichStudentsWithCredentials, getStudentCredentialSync } from '@/services/studentCredentialsService'


// ─── Helper: Detect học sinh ẩn danh (thi tự do không có lớp) ─────────────
// Học sinh ẩn danh thường được tạo tự động bởi hệ thống thi, không có password
// hoặc student_code bắt đầu bằng "GUEST_" / "ANON_"
function isAnonymous(s: any): boolean {
  const code = (s.student_code ?? '').toUpperCase()
  return (
    code.startsWith('GUEST_') ||
    code.startsWith('ANON_') ||
    code.startsWith('TMP_') ||
    (!s.password && !s.parent_phone && !s.school && !s.parent_name &&
     !s.date_of_birth && !s.grade && !s.address)
  )
}

// ─── Sub-component: ContactPopover ────────────────────────────────────────
// Gộp SĐT + Zalo + Email vào 1 ô, hover để xem chi tiết
function ContactCell({ student }: { student: any }) {
  const [open, setOpen] = useState(false)
  const hasContact = student.parent_phone || student.zalo || student.email || student.parent_email

  if (!hasContact) return <span className="text-gray-300 text-xs">—</span>

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-teal-600 hover:text-teal-800 text-xs font-semibold bg-teal-50 border border-teal-100 px-2 py-1 rounded-lg transition-colors whitespace-nowrap"
      >
        <Phone className="w-3 h-3" />
        {student.parent_phone ?? student.zalo ?? 'Xem'}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[200px] space-y-1.5 text-xs">
          {student.parent_name && (
            <p className="font-bold text-gray-700 border-b border-gray-100 pb-1.5 mb-1.5">{student.parent_name}</p>
          )}
          {student.parent_phone && (
            <p className="flex items-center gap-2 text-gray-600">
              <span className="text-gray-400 w-10">SĐT</span>
              <a href={`tel:${student.parent_phone}`} className="text-teal-600 font-semibold hover:underline">{student.parent_phone}</a>
            </p>
          )}
          {student.zalo && (
            <p className="flex items-center gap-2 text-gray-600">
              <span className="text-gray-400 w-10">Zalo</span>
              <span className="font-semibold text-blue-600">{student.zalo}</span>
            </p>
          )}
          {(student.email || student.parent_email) && (
            <p className="flex items-center gap-2 text-gray-600">
              <span className="text-gray-400 w-10">Email</span>
              <span className="text-gray-700 truncate max-w-[130px]">{student.email ?? student.parent_email}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Types ─────────────────────────────────────────────────────────────────
type FormData = Omit<Student, 'id' | 'created_at'> & {
  password: string | null
  date_of_birth: string | null
}

type ImportRow = {
  student_code: string
  full_name: string
  date_of_birth?: string | null
  parent_name?: string | null
  parent_phone?: string | null
  zalo?: string | null
  parent_email?: string | null
  school?: string | null
  grade?: string | null
  address?: string | null
  note?: string | null
  password?: string | null
  // validation state
  _valid: boolean
  _errors: string[]
  _index: number
}

// ─── Constants ─────────────────────────────────────────────────────────────
const EMPTY: FormData = {
  student_code: '', full_name: '', date_of_birth: null,
  parent_name: null, parent_phone: null, parent_email: null,
  zalo: null, school: null, grade: null, address: null,
  note: null, status: 'active', password: null,
}

// Cột Excel mẫu – dùng để xuất template
const EXCEL_TEMPLATE_HEADERS = [
  'student_code',   // Mã học sinh *
  'full_name',      // Họ tên *
  'date_of_birth',  // Ngày sinh (DD/MM/YYYY)
  'password',       // Mật khẩu *
  'school',         // Trường học
  'grade',          // Khối lớp
  'parent_name',    // Tên phụ huynh
  'parent_phone',   // SĐT phụ huynh
  'zalo',           // Zalo
  'parent_email',   // Email phụ huynh
  'address',        // Địa chỉ
  'note',           // Ghi chú
]

// ─── Helper: parse date từ Excel ──────────────────────────────────────────
function parseExcelDate(raw: any): string | null {
  if (!raw) return null
  // Excel serial number
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
    return null
  }
  const str = String(raw).trim()
  // DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2,'0')}-${dmyMatch[1].padStart(2,'0')}`
  // YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (ymdMatch) return str
  return null
}

// ─── Helper: format date hiển thị ─────────────────────────────────────────
function fmtDOB(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ─── Helper: validate một row ─────────────────────────────────────────────
function validateRow(row: any, idx: number, existingCodes: Set<string>): ImportRow {
  const errors: string[] = []
  const code = String(row.student_code || '').trim()
  const name = toTitleCase(String(row.full_name || '').trim())
  const pwd  = String(row.password || '').trim()

  if (!code) errors.push('Thiếu mã học sinh')
  if (!name) errors.push('Thiếu họ tên')
  if (!pwd)  errors.push('Thiếu mật khẩu')
  if (existingCodes.has(code)) errors.push(`Mã "${code}" đã tồn tại trong hệ thống`)

  const dob = parseExcelDate(row.date_of_birth)

  return {
    student_code:  code,
    full_name:     name,
    date_of_birth: dob,
    parent_name:   String(row.parent_name  || '').trim() || null,
    parent_phone:  String(row.parent_phone || '').trim() || null,
    zalo:          String(row.zalo         || '').trim() || null,
    parent_email:  String(row.parent_email || '').trim() || null,
    school:        String(row.school       || '').trim() || null,
    grade:         String(row.grade        || '').trim() || null,
    address:       String(row.address      || '').trim() || null,
    note:          String(row.note         || '').trim() || null,
    password:      pwd || null,
    _valid:  errors.length === 0,
    _errors: errors,
    _index:  idx,
  }
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENT: ImportModal
// ══════════════════════════════════════════════════════════════════════════
function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows]       = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [step, setStep]       = useState<'upload' | 'preview' | 'done'>('upload')
  const [doneCount, setDoneCount] = useState(0)
  const [showErrors, setShowErrors] = useState(false)

  // Reset khi đóng modal
  useEffect(() => {
    if (!open) { setRows([]); setStep('upload'); setDoneCount(0) }
  }, [open])

  // ── Xuất file template ─────────────────────────────────────────────────
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const headerRow = [
      'Mã HS *', 'Họ và tên *', 'Ngày sinh (DD/MM/YYYY)',
      'Mật khẩu *', 'Trường học', 'Khối lớp',
      'Tên phụ huynh', 'SĐT phụ huynh', 'Zalo',
      'Email phụ huynh', 'Địa chỉ', 'Ghi chú'
    ]
    const sampleRow = [
      'HS001', 'Nguyễn Văn A', '15/08/2008',
      'matkhau123', 'THPT Nguyễn Huệ', 'Khối 10',
      'Nguyễn Văn B', '0901234567', '0901234567',
      'phu.huynh@gmail.com', '123 Đường ABC', ''
    ]
    const ws = XLSX.utils.aoa_to_sheet([headerRow, sampleRow])
    // Style cột
    ws['!cols'] = EXCEL_TEMPLATE_HEADERS.map(() => ({ wch: 20 }))
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSachHocSinh')
    XLSX.writeFile(wb, 'mau_import_hoc_sinh.xlsx')
    toast.success('Đã tải file mẫu!')
  }

  // ── Đọc file Excel ─────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    if (!file) return
    try {
      // Lấy danh sách mã HS đã tồn tại
      const { data: existing } = await supabase.from('students').select('student_code')
      const existingCodes = new Set((existing || []).map((r: any) => r.student_code))

      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array', cellDates: false })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      // Dùng header row đầu tiên (raw header của file)
      const rawData: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (rawData.length === 0) { toast.error('File không có dữ liệu!'); return }

      // Map header tiếng Việt → field name
      const headerMap: Record<string, string> = {
        'mã hs *': 'student_code', 'mã hs': 'student_code', 'student_code': 'student_code',
        'họ và tên *': 'full_name', 'họ tên': 'full_name', 'full_name': 'full_name',
        'ngày sinh (dd/mm/yyyy)': 'date_of_birth', 'ngày sinh': 'date_of_birth', 'date_of_birth': 'date_of_birth',
        'mật khẩu *': 'password', 'mật khẩu': 'password', 'password': 'password',
        'trường học': 'school', 'school': 'school',
        'khối lớp': 'grade', 'grade': 'grade',
        'tên phụ huynh': 'parent_name', 'parent_name': 'parent_name',
        'sđt phụ huynh': 'parent_phone', 'parent_phone': 'parent_phone',
        'zalo': 'zalo',
        'email phụ huynh': 'parent_email', 'parent_email': 'parent_email',
        'địa chỉ': 'address', 'address': 'address',
        'ghi chú': 'note', 'note': 'note',
      }

      const normalized = rawData.map(row => {
        const out: any = {}
        for (const [k, v] of Object.entries(row)) {
          const mapped = headerMap[k.toLowerCase().trim()]
          if (mapped) out[mapped] = v
          else out[k] = v // giữ nguyên nếu không map được
        }
        return out
      })

      const parsed = normalized.map((r, i) => validateRow(r, i + 2, existingCodes))
      setRows(parsed)
      setStep('preview')
    } catch (e: any) {
      toast.error('Không đọc được file: ' + e.message)
    }
  }

  // ── Import vào DB ──────────────────────────────────────────────────────
  const doImport = async () => {
    const valid = rows.filter(r => r._valid)
    if (valid.length === 0) { toast.error('Không có dòng hợp lệ để import!'); return }

    setImporting(true)
    try {
      const payload = valid.map(r => ({
        student_code:  r.student_code,
        full_name:     r.full_name,
        date_of_birth: r.date_of_birth,
        parent_name:   r.parent_name,
        parent_phone:  r.parent_phone,
        zalo:          r.zalo,
        email:         r.parent_email,
        school:        r.school,
        grade:         r.grade,
        address:       r.address,
        status:        'active',
      }))

      const { error } = await supabase.from('students').insert(payload)
      if (!error) {
        await saveBatchStudentCredentials(valid.map(r => ({
          student_code: r.student_code,
          password: r.password,
          note: r.note,
        })))
      }
      if (error) throw error

      setDoneCount(valid.length)
      setStep('done')
      onDone()
      toast.success(`Đã import ${valid.length} học sinh thành công!`)
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi import')
    } finally {
      setImporting(false)
    }
  }

  const validCount   = rows.filter(r => r._valid).length
  const invalidCount = rows.filter(r => !r._valid).length

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-400 flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800 text-lg">Import danh sách học sinh</h2>
              <p className="text-xs text-gray-400">Từ file Excel (.xlsx / .xls)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Download template */}
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-teal-800 space-y-1">
                  <p className="font-semibold">Trước khi import, hãy tải file mẫu!</p>
                  <p className="text-teal-600">File mẫu có đúng cấu trúc cột, tránh lỗi khi import.</p>
                  <button onClick={downloadTemplate}
                    className="mt-2 inline-flex items-center gap-1.5 text-teal-700 font-bold underline underline-offset-2 hover:text-teal-900">
                    <Download className="w-4 h-4" /> Tải file mẫu (Excel)
                  </button>
                </div>
              </div>

              {/* Drop zone */}
              <div
                className="border-2 border-dashed border-teal-200 rounded-2xl p-10 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/50 transition-all group"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              >
                <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-teal-200 transition-colors">
                  <Upload className="w-8 h-8 text-teal-500" />
                </div>
                <p className="font-bold text-gray-700 mb-1">Kéo thả file vào đây</p>
                <p className="text-sm text-gray-400">hoặc click để chọn file Excel (.xlsx, .xls)</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </div>
            </div>
          )}

          {/* STEP 2: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-200">
                  <p className="text-2xl font-extrabold text-gray-700">{rows.length}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Tổng dòng</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-200">
                  <p className="text-2xl font-extrabold text-emerald-600">{validCount}</p>
                  <p className="text-xs text-emerald-500 mt-0.5">Hợp lệ · sẽ import</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center border border-red-200">
                  <p className="text-2xl font-extrabold text-red-500">{invalidCount}</p>
                  <p className="text-xs text-red-400 mt-0.5">Lỗi · bỏ qua</p>
                </div>
              </div>

              {/* Error rows toggle */}
              {invalidCount > 0 && (
                <div className="border border-red-200 rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 bg-red-50 text-red-700 font-semibold text-sm"
                    onClick={() => setShowErrors(v => !v)}
                  >
                    <span className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> {invalidCount} dòng có lỗi (sẽ bị bỏ qua)
                    </span>
                    {showErrors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showErrors && (
                    <div className="divide-y divide-red-100 max-h-40 overflow-y-auto">
                      {rows.filter(r => !r._valid).map(r => (
                        <div key={r._index} className="px-4 py-2.5 bg-white text-sm">
                          <span className="font-bold text-gray-700">Dòng {r._index}: </span>
                          <span className="text-gray-500">{r.full_name || '(trống)'}</span>
                          <span className="text-red-500 ml-2">— {r._errors.join(', ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Preview table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100 text-gray-600">
                        <th className="px-3 py-2 text-left font-bold">#</th>
                        <th className="px-3 py-2 text-left font-bold">Mã HS</th>
                        <th className="px-3 py-2 text-left font-bold">Họ tên</th>
                        <th className="px-3 py-2 text-left font-bold">Ngày sinh</th>
                        <th className="px-3 py-2 text-left font-bold">Trường</th>
                        <th className="px-3 py-2 text-left font-bold">SĐT PH</th>
                        <th className="px-3 py-2 text-left font-bold">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r._index}
                          className={`border-t ${r._valid ? 'bg-white hover:bg-gray-50' : 'bg-red-50'}`}>
                          <td className="px-3 py-2 text-gray-400">{r._index}</td>
                          <td className="px-3 py-2 font-mono font-bold text-teal-700">{r.student_code || '—'}</td>
                          <td className="px-3 py-2 font-semibold text-gray-800">{r.full_name || '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{fmtDOB(r.date_of_birth)}</td>
                          <td className="px-3 py-2 text-gray-500">{r.school || '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{r.parent_phone || '—'}</td>
                          <td className="px-3 py-2">
                            {r._valid
                              ? <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> OK</span>
                              : <span className="inline-flex items-center gap-1 text-red-500 font-semibold"><AlertCircle className="w-3.5 h-3.5" /> Lỗi</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Done */}
          {step === 'done' && (
            <div className="text-center py-10 space-y-4">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-gray-800">Import thành công!</p>
                <p className="text-gray-400 mt-1">Đã thêm <strong className="text-emerald-600">{doneCount}</strong> học sinh vào hệ thống.</p>
                <p className="text-sm text-gray-400 mt-2">Tiếp theo: vào mục <strong>Lớp học → Sĩ số</strong> để xếp lớp cho các em.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <div>
            {step === 'preview' && (
              <button onClick={() => setRows([])} className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1">
                ← Chọn file khác
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-outline px-5">
              {step === 'done' ? 'Đóng' : 'Hủy'}
            </button>
            {step === 'preview' && (
              <button
                onClick={doImport}
                disabled={importing || validCount === 0}
                className="btn-teal px-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing
                  ? <span className="flex items-center gap-2"><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Đang import...</span>
                  : `Import ${validCount} học sinh`
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: Students
// ══════════════════════════════════════════════════════════════════════════
type TabKey = 'all' | 'active' | 'inactive' | 'anonymous'

export default function Students() {
  const { students: rawStudents, classes, enrollments, loadStudents, loadClasses, loadEnrollments, enroll } = useDataStore()
  const [credentialsVersion, setCredentialsVersion] = useState(0)

  useEffect(() => {
    getAllStudentCredentials().then(() => setCredentialsVersion(v => v + 1))
  }, [])

  const students = enrichStudentsWithCredentials(rawStudents)
  const { user, isAdmin } = useAuthStore() as any

  const [modal, setModal]               = useState<'form' | 'import' | null>(null)
  const [editing, setEditing]           = useState<Student | null>(null)
  const [form, setForm]                 = useState<FormData>(EMPTY)
  const [formClassId, setFormClassId]   = useState<string>('')
  const [search, setSearch]             = useState('')
  const [tab, setTab]                   = useState<TabKey>('active')
  const [saving, setSaving]             = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [activeGrade, setActiveGrade] = useState<number | 'others' | 'all'>(() => {
    const saved = sessionStorage.getItem('students_active_grade')
    if (saved) {
      return saved === 'all' ? 'all' : saved === 'others' ? 'others' : Number(saved)
    }
    return 'all'
  })

  // Lưu activeGrade vào sessionStorage khi thay đổi
  useEffect(() => {
    sessionStorage.setItem('students_active_grade', activeGrade.toString())
  }, [activeGrade])


  const [selectedClassId, setSelectedClassId] = useState<string | 'unassigned' | null>(null)
  const [hasInitGrade, setHasInitGrade] = useState(false)

  const displayGrades = [6, 7, 8, 9, 10, 11, 12]

  const getClassGrade = (cls: any) => {
    const gradeStr = (cls.grade || '').toLowerCase().trim()
    if (gradeStr.includes('12') || gradeStr === '12') return 12
    if (gradeStr.includes('11') || gradeStr === '11') return 11
    if (gradeStr.includes('10') || gradeStr === '10') return 10
    if (gradeStr.includes('6') || gradeStr === '6') return 6
    if (gradeStr.includes('7') || gradeStr === '7') return 7
    if (gradeStr.includes('8') || gradeStr === '8') return 8
    if (gradeStr.includes('9') || gradeStr === '9') return 9

    const className = ((cls.class_name || cls.name || '') as string).toLowerCase()
    if (className.includes('lớp 12') || className.includes('khối 12') || className.includes('toán 12') || /\b12\b/.test(className)) return 12
    if (className.includes('lớp 11') || className.includes('khối 11') || className.includes('toán 11') || /\b11\b/.test(className)) return 11
    if (className.includes('lớp 10') || className.includes('khối 10') || className.includes('toán 10') || /\b10\b/.test(className)) return 10
    if (className.includes('lớp 6') || className.includes('khối 6') || className.includes('toán 6') || /\b6\b/.test(className)) return 6
    if (className.includes('lớp 7') || className.includes('khối 7') || className.includes('toán 7') || /\b7\b/.test(className)) return 7
    if (className.includes('lớp 8') || className.includes('khối 8') || className.includes('toán 8') || /\b8\b/.test(className)) return 8
    if (className.includes('lớp 9') || className.includes('khối 9') || className.includes('toán 9') || /\b9\b/.test(className)) return 9

    return null
  }

  const getStudentGrade = (s: any) => {
    const studentEnrollments = enrollments.filter(e => e.student_id === s.id && e.status === 'active')
    if (studentEnrollments.length > 0) {
      const cls = classes.find(c => c.id === studentEnrollments[0].class_id)
      if (cls) {
        const g = getClassGrade(cls)
        if (g) return g
      }
    }

    const gradeStr = (s.grade || '').toLowerCase().trim()
    if (gradeStr.includes('12') || gradeStr === '12') return 12
    if (gradeStr.includes('11') || gradeStr === '11') return 11
    if (gradeStr.includes('10') || gradeStr === '10') return 10
    if (gradeStr.includes('6') || gradeStr === '6') return 6
    if (gradeStr.includes('7') || gradeStr === '7') return 7
    if (gradeStr.includes('8') || gradeStr === '8') return 8
    if (gradeStr.includes('9') || gradeStr === '9') return 9

    const schoolOrGrade = ((s.school || '') as string).toLowerCase()
    if (schoolOrGrade.includes('lớp 12') || schoolOrGrade.includes('khối 12') || schoolOrGrade.includes('toán 12') || /\b12\b/.test(schoolOrGrade)) return 12
    if (schoolOrGrade.includes('lớp 11') || schoolOrGrade.includes('khối 11') || schoolOrGrade.includes('toán 11') || /\b11\b/.test(schoolOrGrade)) return 11
    if (schoolOrGrade.includes('lớp 10') || schoolOrGrade.includes('khối 10') || schoolOrGrade.includes('toán 10') || /\b10\b/.test(schoolOrGrade)) return 10
    if (schoolOrGrade.includes('lớp 6') || schoolOrGrade.includes('khối 6') || schoolOrGrade.includes('toán 6') || /\b6\b/.test(schoolOrGrade)) return 6
    if (schoolOrGrade.includes('lớp 7') || schoolOrGrade.includes('khối 7') || schoolOrGrade.includes('toán 7') || /\b7\b/.test(schoolOrGrade)) return 7
    if (schoolOrGrade.includes('lớp 8') || schoolOrGrade.includes('khối 8') || schoolOrGrade.includes('toán 8') || /\b8\b/.test(schoolOrGrade)) return 8
    if (schoolOrGrade.includes('lớp 9') || schoolOrGrade.includes('khối 9') || schoolOrGrade.includes('toán 9') || /\b9\b/.test(schoolOrGrade)) return 9

    return null
  }

  const getClassName = (cls: any) => cls?.class_name || cls?.name || 'Chưa rõ'

  useEffect(() => {
    void Promise.all([loadStudents(), loadClasses(), loadEnrollments()])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedClassId(null)
  }, [activeGrade])

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setFormClassId(''); setShowPassword(false); setModal('form') }
  const openEdit = (s: Student) => {
    setEditing(s)
    const cred = getStudentCredentialSync(s.student_code)
    setForm({
      ...s,
      password: (s as any).password ?? cred?.password ?? '',
      note: (s as any).note ?? cred?.note ?? '',
      date_of_birth: (s as any).date_of_birth ?? null
    })
    setShowPassword(false)
    setModal('form')
  }

  // ── Xóa học sinh ──────────────────────────────────────────────────────
  const handleDelete = async (s: Student) => {
    const msg = `Xóa học sinh "${s.full_name}" (${s.student_code})?\n\nToàn bộ dữ liệu điểm danh, bài thi và học phí của học sinh này sẽ bị xóa theo. Không thể hoàn tác!`
    if (!window.confirm(msg)) return
    const tid = toast.loading('Đang xóa...')
    try {
      const { error } = await supabase.from('students').delete().eq('id', s.id)
      if (error) throw error
      toast.success('Đã xóa học sinh', { id: tid })
      loadStudents()
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi xóa', { id: tid })
    }
  }

  const save = async () => {
    if (!form.full_name)    { toast.error('Nhập tên học sinh'); return }
    if (!form.student_code) { toast.error('Nhập mã học sinh'); return }
    if (!editing && (!form.password || !form.password.trim())) {
      toast.error('Vui lòng đặt mật khẩu cho học sinh'); return
    }

    setSaving(true)
    try {
      const payload: any = {
        student_code:  form.student_code.trim(),
        full_name:     toTitleCase(form.full_name),
        date_of_birth: form.date_of_birth || null,
        parent_name:   form.parent_name,
        parent_phone:  form.parent_phone,
        zalo:          form.zalo,
        email:         form.parent_email,
        school:        form.school,
        grade:         form.grade,
        address:       form.address,
        status:        form.status,
      }

      if (editing) {
        const { error } = await supabase.from('students').update(payload).eq('id', editing.id)
        if (error) throw error
        await saveStudentCredential(form.student_code.trim(), form.password?.trim(), form.note?.trim())
        setCredentialsVersion(v => v + 1)
        toast.success('Đã cập nhật học sinh')
      } else {
        const { data, error } = await supabase.from('students').insert(payload).select().single()
        if (error) throw error
        await saveStudentCredential(form.student_code.trim(), form.password?.trim(), form.note?.trim())
        setCredentialsVersion(v => v + 1)
        
        if (formClassId) {
          try {
            await enroll(data.id, formClassId)
            toast.success('Đã thêm và xếp lớp cho học sinh mới thành công!')
          } catch (enrollErr) {
            console.error('Lỗi khi xếp lớp:', enrollErr)
            toast.error('Học sinh đã được tạo nhưng xếp lớp thất bại.')
          }
        } else {
          toast.success(
            isAdmin() ? 'Đã thêm học sinh mới' : 'Đã thêm! Hãy qua phần Lớp học để xếp lớp cho học sinh nhé.',
            { duration: 4000 }
          )
        }
      }
      setModal(null)
      loadStudents()
      setFormClassId('')
    } catch (e: any) {
      toast.error(e.message || 'Lỗi không xác định')
    } finally {
      setSaving(false)
    }
  }

  const inp = (field: keyof FormData) => ({
    value:    (form[field] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value || null })),
    className: 'input',
  })

  // ── Lọc học sinh theo quyền ────────────────────────────────────────────
  const myClassIds   = isAdmin() ? [] : classes.filter((c: any) => c.teacher_id === user?.id).map((c: any) => c.id)
  const myStudentIds = isAdmin() ? [] : enrollments.filter((e: any) => myClassIds.includes(e.class_id) && e.status === 'active').map((e: any) => e.student_id)
  const myStudents   = isAdmin() ? students : students.filter(s => myStudentIds.includes(s.id))

  const hasOtherStudents = myStudents.some(s => {
    const g = getStudentGrade(s)
    return g === null || !displayGrades.includes(g)
  })

  // Tự động chọn Khối đầu tiên có học sinh
  useEffect(() => {
    if (myStudents.length > 0 && !hasInitGrade) {
      const gradesWithStudents = displayGrades.filter(g => myStudents.some(s => getStudentGrade(s) === g))
      
      const saved = sessionStorage.getItem('students_active_grade')
      if (saved) {
        const savedVal = saved === 'all' ? 'all' : saved === 'others' ? 'others' : Number(saved)
        const isValid = savedVal === 'all'
          || (savedVal === 'others' && hasOtherStudents)
          || (typeof savedVal === 'number' && gradesWithStudents.includes(savedVal))
        if (isValid) {
          setActiveGrade(savedVal)
          setHasInitGrade(true)
          return
        }
      }

      setActiveGrade('all')
      setHasInitGrade(true)
    }
  }, [myStudents, hasInitGrade, hasOtherStudents])

  const activeGradeStudents = myStudents.filter(s => {
    const g = getStudentGrade(s)
    if (activeGrade === 'all') {
      return true
    }
    if (activeGrade === 'others') {
      return g === null || !displayGrades.includes(g)
    }
    return g === activeGrade
  })

  const classesInActiveGrade = classes.filter(c => {
    const grade = getClassGrade(c)
    if (activeGrade === 'all') {
      return c.status === 'active'
    }
    const belongsToGrade = activeGrade === 'others'
      ? (grade === null || !displayGrades.includes(grade))
      : grade === activeGrade
    return belongsToGrade && c.status === 'active'
  })
  classesInActiveGrade.sort((a, b) => getClassName(a).localeCompare(getClassName(b)))

  const unassignedStudentsCount = activeGradeStudents.filter(s => 
    !enrollments.some(e => e.student_id === s.id && e.status === 'active')
  ).length

  const studentsInClass = activeGradeStudents.filter(s => {
    if (selectedClassId === null) {
      return true
    }
    if (selectedClassId === 'unassigned') {
      const hasActiveEnrollment = enrollments.some(e => e.student_id === s.id && e.status === 'active')
      return !hasActiveEnrollment
    }
    return enrollments.some(e => e.student_id === s.id && e.class_id === selectedClassId && e.status === 'active')
  })

  // ── Tab counts ─────────────────────────────────────────────────────────
  const counts = {
    all:       studentsInClass.length,
    active:    studentsInClass.filter(s => s.status === 'active' && !isAnonymous(s)).length,
    inactive:  studentsInClass.filter(s => s.status !== 'active' && !isAnonymous(s)).length,
    anonymous: studentsInClass.filter(s => isAnonymous(s)).length,
  }

  // ── Filter theo tab + search ───────────────────────────────────────────
  const tabFiltered = studentsInClass.filter(s => {
    if (tab === 'active')    return s.status === 'active' && !isAnonymous(s)
    if (tab === 'inactive')  return s.status !== 'active' && !isAnonymous(s)
    if (tab === 'anonymous') return isAnonymous(s)
    return true // 'all'
  })

  const filtered = tabFiltered.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.student_code.toLowerCase().includes(search.toLowerCase()) ||
    (s.parent_phone ?? '').includes(search) ||
    (s.school ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const getClassNames = (studentId: string) =>
    enrollments
      .filter(e => e.student_id === studentId && e.status === 'active')
      .map(e => classes.find(c => c.id === e.class_id)?.name || (classes.find(c => c.id === e.class_id) as any)?.class_name)
      .filter((n): n is string => !!n)
      .join(', ')

  // ── Tab config ─────────────────────────────────────────────────────────
  const TABS: { key: TabKey; label: string; color: string }[] = [
    { key: 'active',    label: 'Đang học',   color: 'text-teal-700 bg-teal-50 border-teal-300' },
    { key: 'inactive',  label: 'Nghỉ học',   color: 'text-gray-500 bg-gray-50 border-gray-300' },
    { key: 'anonymous', label: 'Ẩn danh 👻', color: 'text-purple-600 bg-purple-50 border-purple-300' },
    { key: 'all',       label: 'Tất cả',     color: 'text-gray-600 bg-white border-gray-300' },
  ]

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Users className="w-7 h-7 text-teal-600" /> Học sinh {isAdmin() ? '(Toàn trường)' : 'của tôi'}
          </h1>
          <p className="text-gray-400 text-sm">
            {counts.active} đang học · {counts.inactive} nghỉ · {counts.anonymous > 0 ? `${counts.anonymous} ẩn danh` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setModal('import')} className="btn-outline flex items-center gap-2 border-teal-200 text-teal-700 hover:bg-teal-50">
            <Upload className="w-4 h-4" /> Import Excel
          </button>
          <button onClick={openAdd} className="btn-teal flex items-center gap-2">
            <Plus className="w-4 h-4" /> Thêm học sinh
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT SIDEBAR: GRADE BUTTONS (25% area) */}
        <div className="w-full lg:w-1/4 flex flex-row lg:flex-col gap-2.5 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 shrink-0">
          {/* TOÀN TRƯỜNG BUTTON */}
          <button
            onClick={() => setActiveGrade('all')}
            className={`flex items-center justify-between px-5 py-4 rounded-2xl border-2 text-left transition-all duration-200 shrink-0 lg:w-full ${
              activeGrade === 'all'
                ? 'bg-teal-600 border-teal-600 text-white shadow-md shadow-teal-500/20 lg:translate-x-1'
                : 'bg-white border-gray-100 text-gray-750 hover:border-teal-200 hover:bg-teal-50/20'
            }`}
          >
            <span className="font-bold text-sm lg:text-base flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${activeGrade === 'all' ? 'bg-white' : 'bg-teal-500'}`}></span>
              Toàn trường
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${
              activeGrade === 'all'
                ? 'bg-teal-700/50 border-teal-500 text-white'
                : 'bg-gray-50 border-gray-200 text-gray-500'
            }`}>
              {myStudents.length} HS
            </span>
          </button>

          {[...displayGrades, ...(hasOtherStudents ? ['others'] : [])].map((col) => {
            const isOther = col === 'others'
            const gradeStudents = myStudents.filter(s => isOther ? (getStudentGrade(s) === null || !displayGrades.includes(getStudentGrade(s)!)) : getStudentGrade(s) === col)
            const title = isOther ? 'Khác' : `Khối ${col}`
            const isActive = activeGrade === col

            return (
              <button
                key={col}
                onClick={() => setActiveGrade(col as any)}
                className={`flex items-center justify-between px-5 py-4 rounded-2xl border-2 text-left transition-all duration-200 shrink-0 lg:w-full ${
                  isActive 
                    ? 'bg-teal-600 border-teal-600 text-white shadow-md shadow-teal-500/20 lg:translate-x-1'
                    : 'bg-white border-gray-100 text-gray-750 hover:border-teal-200 hover:bg-teal-50/20'
                }`}
              >
                <span className="font-bold text-sm lg:text-base flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-white' : isOther ? 'bg-amber-400' : 'bg-teal-500'}`}></span>
                  {title}
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${
                  isActive 
                    ? 'bg-teal-700/50 border-teal-500 text-white' 
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}>
                  {gradeStudents.length} HS
                </span>
              </button>
            )
          })}
        </div>

        {/* RIGHT PANEL: CLASS FILTER AND TABLE (75% area) */}
        <div className="flex-1 space-y-5 bg-slate-50/40 rounded-3xl border border-slate-200/50 p-6 min-h-[500px]">
          {activeGradeStudents.length === 0 ? (
            <div className="flex flex-col justify-center items-center py-24 text-gray-400 bg-white rounded-3xl border border-slate-200/60 p-6 min-h-[400px]">
              <Users className="w-12 h-12 opacity-25 mb-3 text-teal-600" />
              <p className="text-base font-bold text-gray-700">Chưa có học sinh nào</p>
              <p className="text-sm italic text-gray-400 mt-1">
                {activeGrade === 'all' 
                  ? 'Hệ thống hiện tại chưa có học sinh nào.' 
                  : activeGrade === 'others' 
                    ? 'Khối Khác hiện tại chưa có học sinh nào.' 
                    : `Khối ${activeGrade} hiện tại chưa có học sinh nào.`}
              </p>
            </div>
          ) : (
            <>
              {/* CLASS FILTER BUTTONS */}
              {(classesInActiveGrade.length > 0 || unassignedStudentsCount > 0) && (
                <div className="flex flex-wrap gap-2 pb-4 border-b border-slate-100">
                  {/* TẤT CẢ LỚP BUTTON */}
                  <button
                    onClick={() => setSelectedClassId(null)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border duration-200 flex items-center gap-1.5 ${
                      selectedClassId === null
                        ? 'bg-teal-600 border-teal-600 text-white shadow-md shadow-teal-500/10'
                        : 'bg-white border-slate-200 text-gray-600 hover:border-teal-300 hover:bg-teal-50/20'
                    }`}
                  >
                    Tất cả lớp
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                        selectedClassId === null
                          ? 'bg-teal-700/50 text-teal-50'
                          : 'bg-slate-100 text-slate-500 border border-slate-200/50'
                      }`}
                    >
                      {activeGradeStudents.length}
                    </span>
                  </button>

                  {classesInActiveGrade.map((cls) => {
                    const count = activeGradeStudents.filter(s => 
                      enrollments.some(e => e.student_id === s.id && e.class_id === cls.id && e.status === 'active')
                    ).length
                    const isActive = selectedClassId === cls.id
                    return (
                      <button
                        key={cls.id}
                        onClick={() => setSelectedClassId(cls.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border duration-200 flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-teal-600 border-teal-600 text-white shadow-md shadow-teal-500/10'
                            : 'bg-white border-slate-200 text-gray-600 hover:border-teal-300 hover:bg-teal-50/20'
                        }`}
                      >
                        {getClassName(cls)}
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                            isActive
                              ? 'bg-teal-700/50 text-teal-50'
                              : 'bg-slate-100 text-slate-500 border border-slate-200/50'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    )
                  })}

                  {unassignedStudentsCount > 0 && (
                    <button
                      onClick={() => setSelectedClassId('unassigned')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border duration-200 flex items-center gap-1.5 ${
                        selectedClassId === 'unassigned'
                          ? 'bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-500/10'
                          : 'bg-white border-slate-200 text-amber-600 hover:border-amber-300 hover:bg-amber-50/20'
                      }`}
                    >
                      Chưa xếp lớp 👻
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                          selectedClassId === 'unassigned'
                            ? 'bg-amber-700/50 text-amber-50'
                            : 'bg-amber-50 text-amber-600 border border-amber-100'
                        }`}
                      >
                        {unassignedStudentsCount}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* ── Search + Tabs ────────────────────────────────────────────── */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                {/* Search */}
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3.5 top-3 w-4 h-4 text-teal-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Tìm tên, mã, SĐT, trường..." className="input pl-10 bg-white" />
                </div>

                {/* Tabs */}
                <div className="flex gap-1.5 bg-gray-100 rounded-xl p-1 flex-wrap">
                  {TABS.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap border ${
                        tab === t.key
                          ? t.color + ' shadow-sm'
                          : 'text-gray-400 bg-transparent border-transparent hover:bg-white hover:text-gray-600'
                      }`}
                    >
                      {t.label}
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-white/60' : 'bg-gray-200'}`}>
                        {counts[t.key]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Anonymous warning ────────────────────────────────────────── */}
              {tab === 'anonymous' && counts.anonymous > 0 && (
                <div className="flex items-start gap-3 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-700">
                  <Ghost className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Học sinh ẩn danh từ thi tự do</p>
                    <p className="text-purple-500 text-xs mt-0.5">Đây là các tài khoản được tạo tự động khi học sinh thi không đăng nhập. Bạn có thể xóa các tài khoản rác này.</p>
                  </div>
                </div>
              )}

              {/* ── Table ───────────────────────────────────────────────────── */}
              <div className="card overflow-hidden border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}>
                        {['Mã HS','Họ tên','Ngày sinh','Liên hệ PH','Trường · Khối','Lớp đang học','Mật khẩu','TT',''].map(h => (
                          <th key={h} className="px-3 py-3 text-left text-white font-bold text-xs whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={9} className="text-center py-16 text-gray-400">
                            <div className="flex flex-col items-center gap-2">
                              <Users className="w-10 h-10 text-gray-200" />
                              <p>Không có học sinh nào</p>
                            </div>
                          </td>
                        </tr>
                      )}
                      {filtered.map((s, i) => {
                        const anon = isAnonymous(s as any)
                        return (
                          <tr key={s.id} className={`border-b border-teal-50 hover:bg-teal-50/40 transition-colors ${
                            anon ? 'opacity-70 bg-purple-50/30' : i % 2 === 0 ? 'bg-white' : 'bg-teal-50/20'
                          }`}>
                            {/* Mã HS */}
                            <td className="px-3 py-3">
                              <span className={`font-mono font-bold text-xs ${anon ? 'text-purple-500' : 'text-teal-700'}`}>
                                {s.student_code}
                              </span>
                              {anon && <Ghost className="w-3 h-3 inline ml-1 text-purple-400" />}
                            </td>

                            {/* Họ tên */}
                            <td className="px-3 py-3 font-bold text-gray-800 whitespace-nowrap">{s.full_name}</td>

                            {/* Ngày sinh */}
                            <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
                              {fmtDOB((s as any).date_of_birth)}
                            </td>

                            {/* Liên hệ PH */}
                            <td className="px-3 py-3">
                              <ContactCell student={s} />
                            </td>

                            {/* Trường · Khối */}
                            <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                              {[(s as any).school, (s as any).grade].filter(Boolean).join(' · ') || '—'}
                            </td>

                            {/* Lớp đang học */}
                            <td className="px-3 py-3 text-xs text-teal-700 font-semibold max-w-[140px]">
                              <span className="line-clamp-2">{getClassNames(s.id) || '—'}</span>
                            </td>

                            {/* Mật khẩu */}
                            <td className="px-3 py-3">
                              {(s as any).password
                                ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">✓</span>
                                : <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">✗</span>
                              }
                            </td>

                            {/* Trạng thái */}
                            <td className="px-3 py-3">
                              <span className={s.status === 'active' ? 'badge-active' : 'badge-inactive'}>
                                {s.status === 'active' ? 'Học' : 'Nghỉ'}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1">
                                <button onClick={() => openEdit(s)}
                                  className="p-1.5 text-teal-600 hover:bg-teal-100 rounded-lg transition-all"
                                  title="Sửa thông tin">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDelete(s)}
                                  className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all"
                                  title="Xóa học sinh">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer count */}
                {filtered.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-teal-50 bg-gray-50/50 text-xs text-gray-400 text-right">
                    Hiển thị {filtered.length} / {tabFiltered.length} học sinh
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Modal thêm/sửa ──────────────────────────────────────────── */}
      <Modal open={modal === 'form'} onClose={() => setModal(null)}
        title={editing ? `Sửa: ${editing.full_name}` : 'Thêm học sinh mới'} size="2xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">

          <div>
            <label className="label">Mã học sinh *</label>
            <input {...inp('student_code')} placeholder="VD: HS001" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Họ và tên *</label>
            <input {...inp('full_name')} placeholder="Nguyễn Văn A" />
          </div>
          <div>
            <label className="label">Trạng thái</label>
            <select
              value={form.status ?? 'active'}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
              className="input"
            >
              <option value="active">Đang học</option>
              <option value="inactive">Nghỉ học</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="label">
              Ngày sinh <span className="text-gray-400 font-normal text-xs">(dùng để thông báo sinh nhật)</span>
            </label>
            <input type="date" value={form.date_of_birth ?? ''}
              onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value || null }))}
              className="input" />
          </div>

          <div className="md:col-span-2">
            <label className="label">
              Mật khẩu đăng nhập{editing ? '' : ' *'}{' '}
              <span className="text-gray-400 font-normal text-xs">
                {editing ? '(để trống nếu không đổi)' : '(học sinh dùng để vào phòng thi)'}
              </span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password ?? ''}
                onChange={e => setForm(f => ({ ...f, password: e.target.value || null }))}
                placeholder={editing ? 'Để trống nếu không thay đổi...' : 'Nhập mật khẩu...'}
                className="input pr-12"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-teal-600"
                tabIndex={-1}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="label">Trường học</label>
            <input {...inp('school')} placeholder="VD: THPT Nguyễn Huệ" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Khối lớp</label>
            <input {...inp('grade')} placeholder="VD: Lớp 10" />
          </div>

          <div className="md:col-span-2">
            <label className="label">Tên phụ huynh</label>
            <input {...inp('parent_name')} placeholder="Nguyễn Văn B" />
          </div>
          <div>
            <label className="label">SĐT phụ huynh</label>
            <input {...inp('parent_phone')} type="tel" placeholder="09xx..." />
          </div>
          <div>
            <label className="label">Zalo</label>
            <input {...inp('zalo')} placeholder="SĐT Zalo..." />
          </div>

          <div className="md:col-span-2">
            <label className="label">Email liên hệ</label>
            <input {...inp('parent_email')} type="email" placeholder="example@gmail.com" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Địa chỉ</label>
            <input {...inp('address')} placeholder="Địa chỉ nhà..." />
          </div>

          <div className="md:col-span-4">
            <label className="label">Ghi chú thêm</label>
            <input {...inp('note')} placeholder="Ghi chú về học lực, tính cách..." className="input" />
          </div>

          {!editing && (
            <div className="md:col-span-4 bg-teal-50/50 p-4 rounded-xl border border-teal-100 flex flex-col md:flex-row gap-4 items-center justify-between mt-2">
              <div className="flex-1">
                <label className="label text-teal-900 font-bold block mb-1">Xếp vào lớp học ngay</label>
                <span className="text-xs text-gray-400">Chọn một lớp trong danh sách để xếp lớp trực tiếp cho học sinh mới này</span>
              </div>
              <select
                value={formClassId}
                onChange={e => setFormClassId(e.target.value)}
                className="input md:max-w-xs font-bold text-teal-800"
              >
                <option value="">-- Chưa xếp lớp --</option>
                {classes
                  .filter(c => c.status === 'active')
                  .sort((a, b) => (a.class_name || a.name || '').localeCompare(b.class_name || b.name || ''))
                  .map(c => (
                    <option key={c.id} value={c.id}>{c.class_name || c.name}</option>
                  ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5 justify-end border-t border-gray-100 pt-4">
          <button onClick={() => setModal(null)} className="btn-outline px-6">Hủy</button>
          <button onClick={() => { void save() }} disabled={saving} className="btn-teal px-8">
            {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm học sinh'}
          </button>
        </div>
      </Modal>

      {/* ── Modal Import Excel ───────────────────────────────────────── */}
      <ImportModal
        open={modal === 'import'}
        onClose={() => setModal(null)}
        onDone={() => { loadStudents(); setModal(null) }}
      />
    </div>
  )
}
