import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, FileText, Trash2, RefreshCw, Eye, Edit2, Save, X, Settings, Download, BookOpen, Sparkles, Folder, FolderOpen, ChevronDown, ChevronRight, Filter } from 'lucide-react'
import { useExamStore } from '@/store/examStore'
import { parseWordToExam } from '@/services/mathWordParserService'
import { parseTexToExam } from '@/services/texParserService'
import { createDefaultPointsConfig } from '@/services/scoringService'
import { generateSimilarQuestions } from '@/services/geminiService'
import { fmt } from '@/lib/helpers'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import MathText from '@/components/MathText' 
import PointsConfigEditor from '@/components/PointsConfigEditor'
import toast from 'react-hot-toast'
import { EX_TEST_DETHI_TEMPLATE } from '@/constants'
import { compileFullTex } from '@/services/api'
import { uploadPdfToSupabase } from '@/services/supabaseService'

export default function ExamMgmt() {
  const navigate = useNavigate()
  const { exams, loading, loadExams, createExam, deleteExam, getExamData } = useExamStore()

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      navigate('/create-pdf-exam', { state: { file } })
    }
  }
  const [uploading, setUploading] = useState(false)
  
  // State cho xem trước
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)

  // State cho chỉnh sửa câu hỏi trực tiếp
  const [editingQuestionId, setEditingQuestionId] = useState<string | number | null>(null)
  const [editForm, setEditForm] = useState<any>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // State cho cấu hình điểm
  const [configExam, setConfigExam] = useState<any>(null)

  // State cho chỉnh sửa tên đề thi
  const [editingExamId, setEditingExamId] = useState<string | null>(null)
  const [editingExamTitle, setEditingExamTitle] = useState<string>('')
  const [savingRename, setSavingRename] = useState(false)

  // State cho downloading file LaTeX
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [generatingSimilarId, setGeneratingSimilarId] = useState<string | null>(null)

  // Bộ lọc Học kì (Học kì 1, Học kì 2, Tất cả)
  const [semesterFilter, setSemesterFilter] = useState<'all' | 'hk1' | 'hk2'>('all')
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    '6_hk1': true, '6_hk2': true, '6_other': true,
    '7_hk1': true, '7_hk2': true, '7_other': true,
    '8_hk1': true, '8_hk2': true, '8_other': true,
    '9_hk1': true, '9_hk2': true, '9_other': true,
    '10_hk1': true, '10_hk2': true, '10_other': true,
    '11_hk1': true, '11_hk2': true, '11_other': true,
    '12_hk1': true, '12_hk2': true, '12_other': true,
  })

  const toggleFolder = (key: string) => {
    setOpenFolders(prev => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key]
    }))
  }

  const getExamSemester = (title: string): 'hk1' | 'hk2' | 'other' => {
    const raw = (title || '').toLowerCase()
    const norm = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Kiểm tra Học kì 1: gk1, ck1, hk1, gki, cki, hki, ki 1, ky 1, giua ki 1, cuoi ki 1, chuong 1, 2, 3
    const isHk1 = 
      /\b(gk1|ck1|hk1|gki|cki|hki)\b/.test(norm) ||
      /\b(gk|ck|hk)\s*(1|i)\b/.test(norm) ||
      /\b(ki|ky)\s*(1|i)\b/.test(norm) ||
      /\b(giua|cuoi)\s*(ki|ky)\s*(1|i)\b/.test(norm) ||
      /\bhoc\s*(ki|ky)\s*(1|i)\b/.test(norm) ||
      /\bchuong\s*(1|2|3)\b/.test(norm) ||
      norm.includes('gk1') || norm.includes('ck1') || norm.includes('hk1') || norm.includes('ki 1') || norm.includes('ky 1')

    if (isHk1) return 'hk1'

    // Kiểm tra Học kì 2: gk2, ck2, hk2, gkii, ckii, hkii, ki 2, ky 2, giua ki 2, cuoi ki 2, chuong 4, 5, 6
    const isHk2 = 
      /\b(gk2|ck2|hk2|gkii|ckii|hkii)\b/.test(norm) ||
      /\b(gk|ck|hk)\s*(2|ii)\b/.test(norm) ||
      /\b(ki|ky)\s*(2|ii)\b/.test(norm) ||
      /\b(giua|cuoi)\s*(ki|ky)\s*(2|ii)\b/.test(norm) ||
      /\bhoc\s*(ki|ky)\s*(2|ii)\b/.test(norm) ||
      /\bchuong\s*(4|5|6)\b/.test(norm) ||
      norm.includes('gk2') || norm.includes('ck2') || norm.includes('hk2') || norm.includes('ki 2') || norm.includes('ky 2')

    if (isHk2) return 'hk2'

    return 'other'
  }

  const generateTexFromQuestions = (title: string, questions: any[]): string => {
    const part1 = (questions || []).filter(q => q.part === 1 || q.type === 'multiple_choice');
    const part2 = (questions || []).filter(q => q.part === 2 || q.type === 'true_false');
    const part3 = (questions || []).filter(q => q.part === 3 || q.type === 'short_answer');
    const other = (questions || []).filter(q => q.part !== 1 && q.part !== 2 && q.part !== 3 && q.type !== 'multiple_choice' && q.type !== 'true_false' && q.type !== 'short_answer');

    let body = '';

    const cleanText = (html: string) => {
      if (!html) return '';
      let tex = html;
      tex = tex.replace(/<strong>([\s\S]*?)<\/strong>/gi, '\\textbf{$1}');
      tex = tex.replace(/<b>([\s\S]*?)<\/b>/gi, '\\textbf{$1}');
      tex = tex.replace(/<em>([\s\S]*?)<\/em>/gi, '\\textit{$1}');
      tex = tex.replace(/<i>([\s\S]*?)<\/i>/gi, '\\textit{$1}');
      tex = tex.replace(/<u>([\s\S]*?)<\/u>/gi, '\\underline{$1}');
      tex = tex.replace(/<br\s*\/?>/gi, '\\\\\n');
      tex = tex.replace(/&nbsp;/gi, '~');
      tex = tex.replace(/<(?:\/?[a-zA-Z][a-zA-Z0-9]*)(?:\s+[^>]*?)?>/g, '');
      return tex.trim();
    };

    if (part1.length > 0) {
      body += `\\textbf{PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.} Học sinh trả lời từ câu 1 đến câu ${part1.length}. Mỗi câu hỏi học sinh chỉ chọn một phương án.\n\\hrule\n\\medskip\n`;
      part1.forEach((q) => {
        body += `\\begin{ex}\n${cleanText(q.text)}\n`;
        if (q.options && q.options.length > 0) {
          body += `\\choice\n`;
          const letters = ['A', 'B', 'C', 'D'];
          q.options.forEach((opt: any, oIdx: number) => {
            const isTrue = opt.isCorrect || opt.letter === q.correctAnswer || (q.correctAnswer === letters[oIdx]);
            body += `{\n  ${isTrue ? '\\True ' : ''}${cleanText(opt.text)}\n}\n`;
          });
        }
        if (q.solution) {
          body += `\\loigiai{${cleanText(q.solution)}}\n`;
        }
        body += `\\end{ex}\n\n`;
      });
    }

    if (part2.length > 0) {
      body += `\\textbf{PHẦN II. Câu trắc nghiệm đúng sai.} Học sinh trả lời từ câu 1 đến câu ${part2.length}. Trong mỗi ý a), b), c), d) ở mỗi câu, học sinh chọn đúng hoặc sai.\n\\hrule\n\\medskip\n`;
      part2.forEach((q) => {
        body += `\\begin{ex}\n${cleanText(q.text)}\n`;
        if (q.options && q.options.length > 0) {
          body += `\\choiceTF[t]\n`;
          q.options.forEach((opt: any) => {
            const isTrue = opt.isCorrect || (q.correctAnswer && q.correctAnswer.split(',').includes(opt.letter));
            body += `{\n  ${isTrue ? '\\True ' : ''}${cleanText(opt.text)}\n}\n`;
          });
        }
        if (q.solution) {
          body += `\\loigiai{${cleanText(q.solution)}}\n`;
        }
        body += `\\end{ex}\n\n`;
      });
    }

    if (part3.length > 0) {
      body += `\\textbf{PHẦN III. Câu trắc nghiệm trả lời ngắn.} Học sinh trả lời từ câu 1 đến câu ${part3.length}.\n\\hrule\n\\medskip\n`;
      part3.forEach((q) => {
        body += `\\begin{ex}\n${cleanText(q.text)}\n`;
        if (q.correctAnswer) {
          body += `\\shortans{${q.correctAnswer}}\n`;
        }
        if (q.solution) {
          body += `\\loigiai{${cleanText(q.solution)}}\n`;
        }
        body += `\\end{ex}\n\n`;
      });
    }

    if (other.length > 0) {
      body += `\\textbf{PHẦN IV. Tự luận.}\n\\hrule\n\\medskip\n`;
      other.forEach((q) => {
        body += `\\begin{ex}\n${cleanText(q.text)}\n`;
        if (q.solution) {
          body += `\\loigiai{${cleanText(q.solution)}}\n`;
        }
        body += `\\end{ex}\n\n`;
      });
    }

    const template = EX_TEST_DETHI_TEMPLATE;
    
    let customizedTemplate = template;
    if (title) {
      customizedTemplate = customizedTemplate.replace(
        /\\textit\{Môn: Toán 12 -- Thời gian: 45 phút\}/g,
        `\\textit{Môn: Toán -- Đề: ${title}}`
      );
    }

    const customParts = customizedTemplate.split('%=== THÊM CÂU HỎI TẠI ĐÂY ===');
    if (customParts.length >= 2) {
      return `${customParts[0]}\n\n${body}\n\n${customParts.slice(1).join('%=== THÊM CÂU HỎI TẠI ĐÂY ===')}`;
    }
    return `${customizedTemplate}\n\n${body}`;
  };

  const handleDownloadTex = async (id: string, title: string) => {
    setDownloadingId(id)
    const toastId = toast.loading('Đang tải dữ liệu để xuất file...')
    try {
      const data = await getExamData(id)
      
      let texContent = ''
      if (data.originalTex && data.originalTex.includes('\\begin{document}')) {
        texContent = data.originalTex
      } else {
        texContent = generateTexFromQuestions(title, data.questions || [])
      }

      // Thay thế tên tác giả và ẩn lời giải
      texContent = texContent
        .replace(/Nguyễn Hữu Phúc/g, 'Lớp học thầy Thọ')
        .replace(/Mr\.Phuc\s+Math/g, '')
        .replace(/\\usepackage\s*\[\s*loigiai\s*\]\s*\{\s*ex_test\s*\}/g, '\\usepackage[dethi]{ex_test}')
        .replace(/\\circEX/g, '\\circled')

      const blob = new Blob([texContent], { type: 'text/plain;charset=utf-8' })
      const filename = `${title.replace(/\s+/g, '_')}.tex`
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast.success('Tải file LaTeX thành công!', { id: toastId })
    } catch (e: any) {
      toast.error('Lỗi khi xuất file: ' + e.message, { id: toastId })
    } finally {
      setDownloadingId(null)
    }
  }

  // State cho xem PDF
  const [pdfUrlToView, setPdfUrlToView] = useState<string | null>(null)
  const [compilingId, setCompilingId] = useState<string | null>(null)

  const handleViewPdf = async (exam: any) => {
    // 1. Kiểm tra xem đề thi đã có sẵn file PDF chưa
    if (exam.pdfUrl) {
      setPdfUrlToView(exam.pdfUrl)
      return
    }
    if (exam.pdfDriveUrl) {
      setPdfUrlToView(exam.pdfDriveUrl)
      return
    }

    // 2. Nếu chưa có, hỏi xem thầy/cô có muốn biên dịch LaTeX sang PDF ngay lập tức không
    if (!confirm('Đề thi này chưa có bản xem trước PDF. Hệ thống cần biên dịch LaTeX sang PDF (mất khoảng 5-10s). Tiếp tục?')) {
      return
    }

    setCompilingId(exam.id)
    const toastId = toast.loading('Đang lấy dữ liệu đề thi...')
    try {
      const data = await getExamData(exam.id)
      
      let texContent = ''
      if (data.originalTex && data.originalTex.includes('\\begin{document}')) {
        texContent = data.originalTex
      } else {
        texContent = generateTexFromQuestions(exam.title, data.questions || [])
      }

      // Thay thế tên tác giả và ẩn lời giải
      texContent = texContent
        .replace(/Nguyễn Hữu Phúc/g, 'Lớp học thầy Thọ')
        .replace(/Mr\.Phuc\s+Math/g, '')
        .replace(/\\usepackage\s*\[\s*loigiai\s*\]\s*\{\s*ex_test\s*\}/g, '\\usepackage[dethi]{ex_test}')
        .replace(/\\circEX/g, '\\circled')

      toast.loading('Đang biên dịch LaTeX sang PDF...', { id: toastId })
      const compileRes = await compileFullTex({ tex: texContent })
      
      if (!compileRes.ok || !compileRes.base64) {
        throw new Error(compileRes.detail || 'Biên dịch LaTeX thất bại')
      }

      toast.loading('Đang tải file PDF lên hệ thống...', { id: toastId })
      const uploadRes = await uploadPdfToSupabase(compileRes.base64, `${exam.title}.pdf`)
      const fileUrl = uploadRes.fileUrl

      // Lưu link PDF mới vào dữ liệu đề thi trong DB
      const updatedData = {
        ...data,
        pdfUrl: fileUrl
      }
      
      await supabase
        .from('exams')
        .update({ data: updatedData })
        .eq('id', exam.id)

      toast.success('Biên dịch và lưu PDF thành công!', { id: toastId })
      setPdfUrlToView(fileUrl)
      await loadExams() // Refresh danh sách để cập nhật trạng thái pdfUrl
    } catch (e: any) {
      toast.error('Lỗi khi biên dịch PDF: ' + e.message, { id: toastId })
    } finally {
      setCompilingId(null)
    }
  }

  const handleGenerateSimilarExam = async (exam: any) => {
    if (!confirm(`Bạn có chắc muốn tạo đề thi mới TƯƠNG TỰ đề: "${exam.title}" không? (Hệ thống sẽ dùng AI thay đổi các số liệu toán nhưng giữ nguyên độ khó và cấu trúc đề).`)) {
      return
    }

    setGeneratingSimilarId(exam.id)
    const toastId = toast.loading('Đang lấy dữ liệu đề gốc...')
    try {
      const data = await getExamData(exam.id)
      
      toast.loading('AI đang thiết kế và tạo số liệu mới cho đề thi...', { id: toastId })
      const newQuestions = await generateSimilarQuestions(data.questions || [])
      
      const newAnswers: Record<string, any> = {}
      newQuestions.forEach((q: any) => {
        if (q.correctAnswer) {
          newAnswers[q.number] = q.correctAnswer
        }
      })

      // Đồng bộ lại các phần (sections)
      const qMap = new Map(newQuestions.map(q => [q.number, q]))
      const newSections = (data.sections || []).map((s: any) => ({
        ...s,
        questions: (s.questions || []).map((q: any) => qMap.get(q.number) || q)
      }))

      const newExamData = {
        ...data,
        questions: newQuestions,
        answers: newAnswers,
        sections: newSections,
      }

      // Xóa cache PDF và nguyên bản LaTeX cũ vì đây là số liệu mới
      delete newExamData.pdfUrl
      delete newExamData.pdfDriveUrl
      delete newExamData.pdfBase64
      delete newExamData.originalTex

      toast.loading('Đang lưu đề thi mới vào hệ thống...', { id: toastId })
      const newTitle = `${exam.title} - Tương tự`
      await createExam(newExamData, newTitle)

      toast.success(`Đã tạo thành công đề thi tương tự: "${newTitle}"!`, { id: toastId })
      await loadExams()
    } catch (err: any) {
      console.error(err)
      toast.error('Lỗi khi tạo đề tương tự: ' + err.message, { id: toastId })
    } finally {
      setGeneratingSimilarId(null)
    }
  }

  const handleRenameExam = async (id: string) => {
    if (!editingExamTitle.trim()) {
      toast.error('Tên đề thi không được để trống')
      return
    }
    setSavingRename(true)
    const toastId = toast.loading('Đang đổi tên đề thi...')
    try {
      const { error } = await supabase
        .from('exams')
        .update({ title: editingExamTitle.trim() })
        .eq('id', id)

      if (error) throw error

      toast.success('Đổi tên đề thi thành công!', { id: toastId })
      setEditingExamId(null)
      await loadExams()
    } catch (err: any) {
      toast.error('Lỗi khi đổi tên: ' + err.message, { id: toastId })
    } finally {
      setSavingRename(false)
    }
  }

  useEffect(() => {
    void loadExams()
  }, [loadExams])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const toastId = toast.loading('Đang phân tích file Word...')
    
    try {
      const examData = await parseWordToExam(file)
      
      // Tự động tạo cấu hình điểm mặc định
      examData.pointsConfig = createDefaultPointsConfig(examData.questions)

      toast.loading('Đang lưu lên Supabase...', { id: toastId })
      const title = file.name.replace(/\.docx$/i, '')
      await createExam(examData, title)

      toast.success('Tải đề thi thành công!', { id: toastId })
    } catch (error: any) {
      toast.error(`Lỗi: ${error.message || 'Không thể đọc file Word'}`, { id: toastId })
    } finally {
      setUploading(false)
      if (e.target) e.target.value = '' 
    }
  }

  const handleTexUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const toastId = toast.loading('Đang khởi động tiến trình đọc LaTeX...')
    
    try {
      const fileText = await file.text()
      const examData = await parseTexToExam(file, (msg) => {
        toast.loading(msg, { id: toastId })
      })
      
      // Tự động tạo cấu hình điểm mặc định
      examData.pointsConfig = createDefaultPointsConfig(examData.questions)
      examData.originalTex = fileText

      toast.loading('Đang lưu lên Supabase...', { id: toastId })
      const title = file.name.replace(/\.tex$/i, '')
      await createExam(examData, title)

      toast.success('Tải đề thi LaTeX thành công!', { id: toastId })
    } catch (error: any) {
      toast.error(`Lỗi: ${error.message || 'Không thể đọc file LaTeX'}`, { id: toastId })
    } finally {
      setUploading(false)
      if (e.target) e.target.value = '' 
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Bạn có chắc muốn xóa đề: ${title}?`)) return
    try {
      await deleteExam(id)
      toast.success('Đã xóa đề thi')
    } catch (e) {
      toast.error('Lỗi khi xóa')
    }
  }

  const handlePreview = async (id: string, title: string) => {
    setPreviewing(id)
    const toastId = toast.loading('Đang tải dữ liệu đề thi...')
    try {
      const data = await getExamData(id)
      setPreviewData({ id, title, ...data })
      toast.success('Tải thành công', { id: toastId })
    } catch (e) {
      toast.error('Lỗi tải đề thi', { id: toastId })
    } finally {
      setPreviewing(null)
    }
  }

  const handleOpenConfig = async (id: string, title: string) => {
    const toastId = toast.loading('Đang tải cấu hình...')
    try {
      const data = await getExamData(id)
      const config = data.pointsConfig || createDefaultPointsConfig(data.questions || [])
      setConfigExam({ id, title, data, config })
      toast.success('Đã tải', { id: toastId })
    } catch (e) {
      toast.error('Lỗi tải cấu hình', { id: toastId })
    }
  }

  const startEditing = (q: any) => {
    setEditingQuestionId(q.number)
    setEditForm(JSON.parse(JSON.stringify(q)))
  }

  const saveQuestionEdit = async () => {
    if (!editForm) return
    setSavingEdit(true)
    const toastId = toast.loading('Đang lưu thay đổi...')

    try {
      const updatedQuestions = previewData.questions.map((q: any) => {
        if (q.number === editForm.number) return editForm
        return q
      })

      const updatedAnswers = { ...(previewData.answers || {}) }
      if (editForm.correctAnswer) {
        updatedAnswers[editForm.number] = editForm.correctAnswer
      } else {
        delete updatedAnswers[editForm.number]
      }

      const newExamPayload = {
        ...previewData,
        questions: updatedQuestions,
        answers: updatedAnswers,
      }
      delete newExamPayload.pdfUrl
      delete newExamPayload.pdfDriveUrl
      delete newExamPayload.pdfBase64

      const { error } = await supabase
        .from('exams')
        .update({ data: newExamPayload })
        .eq('id', previewData.id)

      if (error) throw error

      setPreviewData((prev: any) => {
        const next = {
          ...prev,
          questions: updatedQuestions,
          answers: updatedAnswers
        }
        delete next.pdfUrl
        delete next.pdfDriveUrl
        delete next.pdfBase64
        return next
      })
      
      setEditingQuestionId(null)
      setEditForm(null)
      await loadExams() // Refresh list state to reflect PDF cache deletion
      toast.success('Đã cập nhật câu hỏi thành công!', { id: toastId })
    } catch (err: any) {
      toast.error('Lỗi khi lưu câu hỏi: ' + err.message, { id: toastId })
    } finally {
      setSavingEdit(false)
    }
  }

  const getExamGrade = (title: string) => {
    const raw = (title || '').toLowerCase()
    const norm = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // 1. Kiểm tra theo số từ 12 xuống 6
    for (const g of [12, 11, 10, 9, 8, 7, 6]) {
      const regex = new RegExp(`(^|\\b)(lop|khoi|toan)?\\s*${g}(\\b|$)`)
      if (regex.test(norm) || norm.startsWith(`${g} `) || norm === `${g}`) return g
    }
    // 2. Chữ viết: sáu, bảy, tám, chín, mười
    if (norm.includes('khoi muoi hai') || norm.includes('lop muoi hai')) return 12
    if (norm.includes('khoi muoi mot') || norm.includes('lop muoi mot')) return 11
    if (norm.includes('khoi muoi') || norm.includes('lop muoi')) return 10
    if (norm.includes('khoi chin') || norm.includes('lop chin')) return 9
    if (norm.includes('khoi tam') || norm.includes('lop tam')) return 8
    if (norm.includes('khoi bay') || norm.includes('lop bay')) return 7
    if (norm.includes('khoi sau') || norm.includes('lop sau')) return 6

    return null
  }

  const grades = [6, 7, 8, 9, 10, 11, 12]

  const examsByGrade = {
    6: exams.filter(e => getExamGrade(e.title) === 6),
    7: exams.filter(e => getExamGrade(e.title) === 7),
    8: exams.filter(e => getExamGrade(e.title) === 8),
    9: exams.filter(e => getExamGrade(e.title) === 9),
    10: exams.filter(e => getExamGrade(e.title) === 10),
    11: exams.filter(e => getExamGrade(e.title) === 11),
    12: exams.filter(e => getExamGrade(e.title) === 12),
    others: exams.filter(e => {
      const g = getExamGrade(e.title)
      return g === null
    })
  }

  // Question numbering resets per part

  return (
    <div className="space-y-6">
      <div className="page-header flex justify-between items-start">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <FileText className="w-7 h-7 text-teal-600" /> Ngân hàng đề thi
          </h1>
          <p className="text-gray-400 text-sm mt-1">Phân tích tự động và cấu hình điểm thi</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {/* Nút 1: Tải lên từ Word */}
          <label className={`btn-teal flex items-center gap-2 cursor-pointer shadow-sm hover:opacity-90 transition-all ${uploading ? 'opacity-70 pointer-events-none' : ''}`}>
            {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            {uploading ? 'Đang xử lý...' : 'Tải lên từ Word'}
            <input type="file" accept=".docx" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>

          {/* Nút 2: Tải lên từ LaTeX */}
          <label 
            className={`btn-teal flex items-center gap-2 cursor-pointer shadow-sm hover:opacity-90 transition-all ${uploading ? 'opacity-70 pointer-events-none' : ''}`}
            style={{ background: 'linear-gradient(135deg, #6d28d9, #7c3aed)' }}
          >
            {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            {uploading ? 'Đang xử lý...' : 'Tải lên từ LaTeX'}
            <input type="file" accept=".tex" className="hidden" onChange={handleTexUpload} disabled={uploading} />
          </label>

          {/* Nút 3: Tải lên từ PDF */}
          <label 
            className={`btn-teal flex items-center gap-2 cursor-pointer shadow-sm hover:opacity-90 transition-all ${uploading ? 'opacity-70 pointer-events-none' : ''}`}
            style={{ background: 'linear-gradient(135deg, #e11d48, #f43f5e)' }}
          >
            <FileText className="w-4 h-4" />
            <span>Tải lên từ PDF</span>
            <input type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Bộ lọc Học kì 1 / Học kì 2 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-gray-150 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5 pl-1">
            <Filter className="w-3.5 h-3.5 text-teal-600" /> Học kì:
          </span>
          <div className="inline-flex rounded-xl bg-gray-100 p-1 gap-1">
            <button
              onClick={() => setSemesterFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                semesterFilter === 'all' ? 'bg-white text-teal-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>Tất cả học kì</span>
            </button>
            <button
              onClick={() => setSemesterFilter('hk1')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                semesterFilter === 'hk1' ? 'bg-amber-500 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>📁 Học kì 1</span>
            </button>
            <button
              onClick={() => setSemesterFilter('hk2')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                semesterFilter === 'hk2' ? 'bg-blue-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>📁 Học kì 2</span>
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-400 font-medium italic hidden sm:block">
          Hệ thống tự động gom đề vào thư mục: <strong>Học kì 1</strong> (GK1, CK1, HK1) & <strong>Học kì 2</strong> (GK2, CK2, HK2)
        </div>
      </div>

      {/* 4 Cột Khối Lớp */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {grades.map(grade => {
          const list = examsByGrade[grade as 6 | 7 | 8 | 9 | 10 | 11 | 12]
          // Màu sắc tương ứng từng khối lớp
          const theme = {
            6: { border: 'border-blue-500', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
            7: { border: 'border-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
            8: { border: 'border-orange-500', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800' },
            9: { border: 'border-purple-500', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-800' },
            10: { border: 'border-indigo-500', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-800' },
            11: { border: 'border-pink-500', text: 'text-pink-700', badge: 'bg-pink-100 text-pink-800' },
            12: { border: 'border-rose-500', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-800' },
          }[grade as 6 | 7 | 8 | 9 | 10 | 11 | 12]

          const renderCard = (exam: any) => (
            <div 
              key={exam.id} 
              className="bg-white p-3 rounded-xl border border-gray-150 hover:border-teal-300 hover:shadow-md transition-all duration-200 group"
            >
              {editingExamId === exam.id ? (
                <div className="flex gap-1 items-center mb-1">
                  <input 
                    type="text" 
                    value={editingExamTitle} 
                    onChange={(e) => setEditingExamTitle(e.target.value)} 
                    className="w-full border border-teal-300 rounded px-2 py-1 text-xs font-bold text-teal-800 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-teal-50/50"
                    autoFocus
                    disabled={savingRename}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        await handleRenameExam(exam.id)
                      } else if (e.key === 'Escape') {
                        setEditingExamId(null)
                      }
                    }}
                  />
                  <button 
                    onClick={() => handleRenameExam(exam.id)}
                    disabled={savingRename}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded flex-shrink-0"
                    title="Lưu"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => setEditingExamId(null)}
                    disabled={savingRename}
                    className="p-1 text-gray-500 hover:bg-gray-50 rounded flex-shrink-0"
                    title="Hủy"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-1 group/title mb-1">
                  <h4 className="font-bold text-teal-800 text-sm leading-snug line-clamp-2" title={exam.title}>
                    {exam.title}
                  </h4>
                  <button 
                    onClick={() => { setEditingExamId(exam.id); setEditingExamTitle(exam.title); }}
                    className="p-0.5 text-gray-400 hover:text-teal-600 rounded opacity-0 group-hover/title:opacity-100 transition-opacity flex-shrink-0"
                    title="Đổi tên đề"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-[11px] text-gray-400 mb-2">
                {fmt(new Date(exam.created_at), 'dd/MM/yyyy HH:mm')}
              </p>
              
              <div className="flex justify-end gap-1.5 pt-1.5 border-t border-gray-50">
                <button 
                  onClick={() => handleViewPdf(exam)}
                  disabled={compilingId === exam.id}
                  className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors"
                  title="Đọc PDF"
                >
                  {compilingId === exam.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => handleDownloadTex(exam.id, exam.title)}
                  disabled={downloadingId === exam.id}
                  className="p-1 text-teal-600 hover:bg-teal-50 rounded transition-colors"
                  title="Tải file LaTeX (.tex)"
                >
                  {downloadingId === exam.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => handleGenerateSimilarExam(exam)}
                  disabled={generatingSimilarId === exam.id}
                  className="p-1 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                  title="Tạo đề tương tự (AI)"
                >
                  {generatingSimilarId === exam.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => handleOpenConfig(exam.id, exam.title)}
                  className="p-1 text-orange-500 hover:bg-orange-50 rounded transition-colors"
                  title="Cấu hình điểm"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handlePreview(exam.id, exam.title)}
                  disabled={previewing === exam.id}
                  className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                  title="Xem trước & Chỉnh sửa"
                >
                  {previewing === exam.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => handleDelete(exam.id, exam.title)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                  title="Xóa đề thi"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )

          // Nhóm các đề theo học kì
          const hk1List = list.filter(e => getExamSemester(e.title) === 'hk1')
          const hk2List = list.filter(e => getExamSemester(e.title) === 'hk2')
          const otherList = list.filter(e => getExamSemester(e.title) === 'other')

          const semesterSections = [
            { id: 'hk1', label: 'Học kì 1', list: hk1List, badge: 'bg-amber-100 text-amber-800 border-amber-200', iconColor: 'text-amber-500', headerBg: 'bg-amber-50/70 border-amber-200 hover:bg-amber-100/60' },
            { id: 'hk2', label: 'Học kì 2', list: hk2List, badge: 'bg-blue-100 text-blue-800 border-blue-200', iconColor: 'text-blue-500', headerBg: 'bg-blue-50/70 border-blue-200 hover:bg-blue-100/60' },
            ...(otherList.length > 0 ? [{ id: 'other', label: 'Khác / Chuyên đề', list: otherList, badge: 'bg-gray-100 text-gray-700 border-gray-200', iconColor: 'text-gray-500', headerBg: 'bg-gray-50 border-gray-200 hover:bg-gray-100' }] : [])
          ].filter(sec => semesterFilter === 'all' || semesterFilter === sec.id || (sec.id === 'other' && otherList.length > 0))

          return (
            <div key={grade} className={`flex flex-col rounded-2xl border-t-4 ${theme.border} bg-white shadow-sm overflow-hidden min-h-[400px]`}>
              {/* Header của cột */}
              <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-100 flex justify-between items-center">
                <h3 className={`font-bold text-base ${theme.text}`}>Khối {grade}</h3>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${theme.badge}`}>
                  {list.length} đề
                </span>
              </div>

              {/* Danh sách đề thi phân theo Thư mục Học kì */}
              <div className="p-3 flex-1 space-y-3 overflow-y-auto max-h-[600px] custom-scrollbar bg-slate-50/30">
                {loading && list.length === 0 && exams.length === 0 ? (
                  <div className="flex justify-center items-center h-32">
                    <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                ) : list.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs italic">
                    Chưa có đề thi
                  </div>
                ) : (
                  semesterSections.map(sec => {
                    const folderKey = `${grade}_${sec.id}`
                    const isOpen = openFolders[folderKey] ?? true

                    return (
                      <div key={sec.id} className="rounded-xl border border-gray-200 bg-white/80 overflow-hidden shadow-xs">
                        {/* Header Thư mục Học kì */}
                        <div
                          onClick={() => toggleFolder(folderKey)}
                          className={`flex items-center justify-between p-2.5 cursor-pointer select-none transition border-b ${sec.headerBg} ${isOpen ? 'border-gray-200' : 'border-transparent'}`}
                        >
                          <div className="flex items-center gap-2">
                            {isOpen ? (
                              <FolderOpen className={`w-4 h-4 ${sec.iconColor}`} />
                            ) : (
                              <Folder className={`w-4 h-4 ${sec.iconColor}`} />
                            )}
                            <span className="text-xs font-extrabold text-gray-800">{sec.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${sec.badge}`}>
                              {sec.list.length} đề
                            </span>
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                          </div>
                        </div>

                        {/* Danh sách đề bên trong Thư mục */}
                        {isOpen && (
                          <div className="p-2 space-y-2.5 bg-gray-50/40">
                            {sec.list.length === 0 ? (
                              <div className="text-center py-3 text-gray-400 text-[11px] italic">
                                Chưa có đề cho {sec.label}
                              </div>
                            ) : (
                              sec.list.map(exam => renderCard(exam))
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Đề thi khác (nếu có) */}
      {examsByGrade.others.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wider">Đề thi chưa phân loại</h3>
            <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {examsByGrade.others.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {examsByGrade.others.map(exam => (
              <div 
                key={exam.id} 
                className="bg-white p-3 rounded-xl border border-gray-150 hover:border-teal-350 hover:shadow-md transition-all duration-200 group"
              >
                {editingExamId === exam.id ? (
                  <div className="flex gap-1 items-center mb-1">
                    <input 
                      type="text" 
                      value={editingExamTitle} 
                      onChange={(e) => setEditingExamTitle(e.target.value)} 
                      className="w-full border border-teal-300 rounded px-2 py-1 text-xs font-bold text-teal-800 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-teal-50/50"
                      autoFocus
                      disabled={savingRename}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          await handleRenameExam(exam.id)
                        } else if (e.key === 'Escape') {
                          setEditingExamId(null)
                        }
                      }}
                    />
                    <button 
                      onClick={() => handleRenameExam(exam.id)}
                      disabled={savingRename}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded flex-shrink-0"
                      title="Lưu"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => setEditingExamId(null)}
                      disabled={savingRename}
                      className="p-1 text-gray-500 hover:bg-gray-50 rounded flex-shrink-0"
                      title="Hủy"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-1 group/title mb-1">
                    <h4 className="font-bold text-teal-800 text-sm leading-snug line-clamp-2" title={exam.title}>
                      {exam.title}
                    </h4>
                    <button 
                      onClick={() => { setEditingExamId(exam.id); setEditingExamTitle(exam.title); }}
                      className="p-0.5 text-gray-400 hover:text-teal-600 rounded opacity-0 group-hover/title:opacity-100 transition-opacity flex-shrink-0"
                      title="Đổi tên đề"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mb-2">
                  {fmt(new Date(exam.created_at), 'dd/MM/yyyy HH:mm')}
                </p>
                
                <div className="flex justify-end gap-1.5 pt-1.5 border-t border-gray-50">
                  <button 
                    onClick={() => handleViewPdf(exam)}
                    disabled={compilingId === exam.id}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors"
                    title="Đọc PDF"
                  >
                    {compilingId === exam.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={() => handleDownloadTex(exam.id, exam.title)}
                    disabled={downloadingId === exam.id}
                    className="p-1 text-teal-600 hover:bg-teal-50 rounded transition-colors"
                    title="Tải file LaTeX (.tex)"
                  >
                    {downloadingId === exam.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={() => handleGenerateSimilarExam(exam)}
                    disabled={generatingSimilarId === exam.id}
                    className="p-1 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                    title="Tạo đề tương tự (AI)"
                  >
                    {generatingSimilarId === exam.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={() => handleOpenConfig(exam.id, exam.title)}
                    className="p-1 text-orange-500 hover:bg-orange-50 rounded transition-colors"
                    title="Cấu hình điểm"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handlePreview(exam.id, exam.title)}
                    disabled={previewing === exam.id}
                    className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                    title="Xem trước & Chỉnh sửa"
                  >
                    {previewing === exam.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={() => handleDelete(exam.id, exam.title)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="Xóa đề thi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ✅ MODAL CẤU HÌNH ĐIỂM (Đã sửa size thành 3xl) */}
      <Modal open={!!configExam} onClose={() => setConfigExam(null)} title="" size="3xl" >
        {configExam && (
          <div className="-m-6">
            <PointsConfigEditor
              config={configExam.config}
              onChange={async (newConfig) => {
                const newData = { ...configExam.data, pointsConfig: newConfig };
                await supabase.from('exams').update({ data: newData }).eq('id', configExam.id);
                toast.success('Lưu cấu hình điểm thành công!');
                setConfigExam(null);
              }}
              onClose={() => setConfigExam(null)}
            />
          </div>
        )}
      </Modal>

      {/* ✅ MODAL XEM TRƯỚC VÀ CHỈNH SỬA ĐỀ THI */}
      <Modal open={!!previewData} onClose={() => { if(!savingEdit) setPreviewData(null); setEditingQuestionId(null); }} title={`Xem trước & Biên tập: ${previewData?.title}`} size="3xl">
        <div className="space-y-8 max-h-[75vh] overflow-y-auto pr-2 bg-gray-50 p-4 rounded-xl">
          
          {[1, 2, 3, 4].map(part => {
            const questionsInPart = previewData?.questions?.filter((q: any) => {
              const qPart = typeof q.part === 'string' ? parseInt(q.part.replace(/\D/g, '')) : q.part;
              return qPart === part;
            }) || [];

            if (questionsInPart.length === 0) return null;

            const partTitles: Record<number, { title: string, desc: string, color: string }> = {
              1: { title: 'PHẦN 1. TRẮC NGHIỆM NHIỀU LỰA CHỌN', desc: 'Mỗi câu chọn 1 đáp án đúng (A, B, C, D)', color: 'bg-blue-600' },
              2: { title: 'PHẦN 2. TRẮC NGHIỆM ĐÚNG/SAI', desc: 'Chọn Đúng hoặc Sai cho mỗi ý a, b, c, d', color: 'bg-emerald-600' },
              3: { title: 'PHẦN 3. TRẢ LỜI NGẮN', desc: 'Điền đáp án số vào ô trống', color: 'bg-orange-600' },
              4: { title: 'PHẦN 4. TỰ LUẬN', desc: 'Trình bày lời giải chi tiết', color: 'bg-violet-600' }
            };

            const info = partTitles[part];

            return (
              <div key={part} className="space-y-4">
                <div className={`p-4 rounded-xl shadow-md text-white ${info.color} bg-gradient-to-r from-black/10 to-transparent`}>
                  <h3 className="font-bold text-lg">{info.title}</h3>
                  <p className="text-sm opacity-90">{info.desc}</p>
                </div>

                {questionsInPart.map((q: any, qIdx: number) => {
                  const displayQNum = (q.number % 100) || (qIdx + 1);
                  const isEditingThis = editingQuestionId === q.number;

                  return (
                    <div key={q.number} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                      
                      {/* Tiêu đề & Nút thao tác câu hỏi */}
                      <div className="flex justify-between items-start mb-4 border-b border-gray-50 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="px-3.5 py-1.5 bg-teal-600 text-white font-extrabold text-sm rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                            Câu {displayQNum}
                          </div>
                          <span className="text-xs text-gray-400 font-mono">ID: {q.number}</span>
                        </div>
                        
                        {/* Nút sửa / lưu */}
                        {!isEditingThis ? (
                          <button 
                            onClick={() => startEditing(q)}
                            className="btn-outline py-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Sửa câu này
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button 
                              onClick={saveQuestionEdit}
                              disabled={savingEdit}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-3.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm"
                            >
                              <Save className="w-3.5 h-3.5" /> {savingEdit ? 'Đang lưu...' : 'Lưu'}
                            </button>
                            <button 
                              onClick={() => { setEditingQuestionId(null); setEditForm(null); }}
                              disabled={savingEdit}
                              className="bg-gray-200 hover:bg-gray-300 text-gray-700 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                            >
                              <X className="w-3.5 h-3.5" /> Hủy
                            </button>
                          </div>
                        )}
                      </div>

                      {/* CHẾ ĐỘ XEM THƯỜNG */}
                      {!isEditingThis ? (
                        <div className="space-y-4">
                          <div className="pl-12">
                            {(() => {
                              const cleanText = (q.text || '').trim().replace(/^(<strong>)?Câu\s*\d+\s*[.:]?(<\/strong>)?\s*/i, '');
                              return (
                                <MathText html={cleanText} block className="text-gray-800 font-medium text-base leading-relaxed" />
                              );
                            })()}
                            {q.images?.filter((img: any) => {
                              if (img.filename?.toLowerCase().endsWith('.wmf') || img.id?.toLowerCase().endsWith('.wmf') || img.contentType === 'image/x-wmf') return false;
                              if (q.text && (q.text.includes(img.filename) || (img.base64 && q.text.includes(img.base64.slice(0, 32))))) return false;
                              return true;
                            }).map((img: any, idx: number) => (
                              <img 
                                key={idx} 
                                src={img.base64 ? `data:${img.contentType || 'image/png'};base64,${img.base64}` : `data:image/png;base64,${img.data}`} 
                                className="max-h-64 mt-3 rounded-lg border border-gray-200 shadow-sm" 
                                alt={`Ảnh câu ${displayQNum}`} 
                              />
                            ))}
                          </div>

                          {/* Phương án Phần 1 (Trắc nghiệm thường) */}
                          {part === 1 && q.options && q.options.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-12">
                              {q.options.map((opt: any, idx: number) => {
                                const isCorrect = q.correctAnswer?.toUpperCase() === opt.letter.toUpperCase();
                                const displayLetter = String.fromCharCode(65 + idx);

                                return (
                                  <div key={opt.letter} className={`flex items-start gap-3 p-3 rounded-xl border-2 ${isCorrect ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-gray-50 border-gray-100'}`}>
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isCorrect ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                      {displayLetter}
                                    </span>
                                    <MathText html={opt.text} className={`text-sm pt-0.5 ${isCorrect ? 'text-blue-800 font-medium' : 'text-gray-700'}`} />
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* Phương án Phần 2 (Đúng / Sai) */}
                          {part === 2 && q.options && q.options.length > 0 && (
                            <div className="pl-12">
                              <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                                <div className="grid grid-cols-[1fr_80px_80px] bg-slate-100 border-b border-gray-200 text-xs font-bold text-gray-500 text-center uppercase tracking-wider">
                                  <div className="py-2.5 px-4 text-left">Mệnh đề</div>
                                  <div className="py-2.5 border-l border-gray-200 text-emerald-700 bg-emerald-50/50">Đúng</div>
                                  <div className="py-2.5 border-l border-gray-200 text-red-700 bg-red-50/50">Sai</div>
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {q.options.map((opt: any, idx: number) => {
                                    const isTrue = q.correctAnswer?.toLowerCase().includes(opt.letter.toLowerCase());
                                    const displayLetter = String.fromCharCode(97 + idx); // a, b, c, d
                                    
                                    return (
                                      <div key={opt.letter} className={`grid grid-cols-[1fr_80px_80px] text-sm items-stretch ${isTrue ? 'bg-emerald-50/30' : 'bg-red-50/30'}`}>
                                        <div className="p-3 flex gap-2.5 items-start">
                                          <span className={`font-bold mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white shadow-sm flex-shrink-0 ${isTrue ? 'bg-emerald-500' : 'bg-red-400'}`}>
                                            {displayLetter}
                                          </span>
                                          <MathText html={opt.text} className="text-gray-700 leading-relaxed pt-px" />
                                        </div>
                                        <div className={`border-l border-gray-200 flex items-center justify-center ${isTrue ? 'bg-emerald-500 text-white' : ''}`}>
                                          {isTrue ? <span className="font-bold text-sm">✓</span> : <span className="w-3 h-3 border border-gray-300 rounded-full bg-white"></span>}
                                        </div>
                                        <div className={`border-l border-gray-200 flex items-center justify-center ${!isTrue ? 'bg-red-500 text-white' : ''}`}>
                                          {!isTrue ? <span className="font-bold text-sm">✕</span> : <span className="w-3 h-3 border border-gray-300 rounded-full bg-white"></span>}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Phương án Phần 3 (Trả lời ngắn) */}
                          {part === 3 && q.correctAnswer && (
                            <div className="pl-12">
                              <div className="inline-block bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
                                <span className="text-orange-800 font-bold text-sm">Đáp án: </span>
                                <span className="text-orange-900 font-bold text-lg ml-1">{q.correctAnswer}</span>
                              </div>
                            </div>
                          )}

                          {/* Lời giải chi tiết */}
                          {q.solution && (
                            <div className="pl-12">
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                <span className="font-bold text-slate-700 text-sm block mb-2">💡 Lời giải chi tiết:</span>
                                <MathText html={q.solution} className="text-sm text-slate-700 leading-relaxed" block />
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        // CHẾ ĐỘ CHỈNH SỬA TRỰC TIẾP
                        <div className="space-y-4 pl-4 border-l-4 border-amber-400 bg-amber-50/30 p-4 rounded-r-xl">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Nội dung câu hỏi *</label>
                            <textarea 
                              value={editForm.text}
                              onChange={e => setEditForm({ ...editForm, text: e.target.value })}
                              className="input font-mono text-sm"
                              rows={3}
                            />
                          </div>

                          {/* Chỉnh sửa Phần 1 - Trắc nghiệm */}
                          {part === 1 && editForm.options && (
                            <div className="space-y-3">
                              <label className="block text-xs font-bold text-gray-500">Các phương án và đáp án đúng</label>
                              <div className="grid grid-cols-1 gap-2">
                                {editForm.options.map((opt: any, idx: number) => {
                                  const letter = opt.letter.toUpperCase();
                                  const isCorrect = editForm.correctAnswer?.toUpperCase() === letter;

                                  return (
                                    <div key={opt.letter} className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setEditForm({ ...editForm, correctAnswer: letter })}
                                        className={`w-8 h-8 rounded-full font-bold text-xs flex-shrink-0 transition-all ${isCorrect ? 'bg-blue-600 text-white border-2 border-blue-700' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'}`}
                                      >
                                        {letter}
                                      </button>
                                      <input 
                                        type="text" 
                                        value={opt.text}
                                        onChange={e => {
                                          const newOpts = [...editForm.options];
                                          newOpts[idx].text = e.target.value;
                                          setEditForm({ ...editForm, options: newOpts });
                                        }}
                                        className="input py-1 text-sm flex-1"
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Chỉnh sửa Phần 2 - Đúng / Sai */}
                          {part === 2 && editForm.options && (
                            <div className="space-y-3">
                              <label className="block text-xs font-bold text-gray-500">Các mệnh đề và trạng thái Đúng (T) / Sai (F)</label>
                              <div className="space-y-2">
                                {editForm.options.map((opt: any, idx: number) => {
                                  const letter = opt.letter.toLowerCase();
                                  const isTrue = editForm.correctAnswer?.toLowerCase().includes(letter);

                                  const handleToggleTF = () => {
                                    let currentAnsArr = editForm.correctAnswer ? editForm.correctAnswer.toLowerCase().split(',').filter(Boolean) : [];
                                    if (isTrue) {
                                      currentAnsArr = currentAnsArr.filter((item: string) => item !== letter);
                                    } else {
                                      currentAnsArr.push(letter);
                                    }
                                    setEditForm({ ...editForm, correctAnswer: currentAnsArr.sort().join(',') });
                                  };

                                  return (
                                    <div key={opt.letter} className="flex items-start gap-2">
                                      <button
                                        type="button"
                                        onClick={handleToggleTF}
                                        className={`py-1.5 px-3 rounded-lg text-xs font-bold flex-shrink-0 transition-all ${isTrue ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}
                                      >
                                        Mệnh đề {letter.toUpperCase()}: {isTrue ? 'ĐÚNG' : 'SAI'}
                                      </button>
                                      <input 
                                        type="text" 
                                        value={opt.text}
                                        onChange={e => {
                                          const newOpts = [...editForm.options];
                                          newOpts[idx].text = e.target.value;
                                          setEditForm({ ...editForm, options: newOpts });
                                        }}
                                        className="input py-1 text-sm flex-1"
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Chỉnh sửa Phần 3 */}
                          {part === 3 && (
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">Đáp án đúng (Kết quả ngắn) *</label>
                              <input 
                                type="text" 
                                value={editForm.correctAnswer || ''}
                                onChange={e => setEditForm({ ...editForm, correctAnswer: e.target.value })}
                                className="input py-1.5 font-bold text-orange-700"
                              />
                            </div>
                          )}

                          {/* Chỉnh sửa Lời giải */}
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Lời giải chi tiết</label>
                            <textarea 
                              value={editForm.solution || ''}
                              onChange={e => setEditForm({ ...editForm, solution: e.target.value })}
                              className="input font-mono text-xs"
                              rows={2}
                              placeholder="Nhập lời giải..."
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* ✅ MODAL XEM TRƯỚC PDF */}
      {pdfUrlToView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <span className="font-extrabold text-slate-800 flex items-center gap-2">
                <BookOpen size={18} className="text-teal-600 animate-pulse" />
                Xem trước tài liệu PDF
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => window.open(pdfUrlToView, '_blank')} 
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 text-xs flex items-center gap-1.5 transition-all"
                >
                  Mở tab mới
                </button>
                <button 
                  onClick={() => setPdfUrlToView(null)} 
                  className="p-2 rounded-xl hover:bg-slate-100 transition-all"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="h-[75vh]">
              <iframe src={pdfUrlToView} className="w-full h-full border-none" title="pdf-viewer" />
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-[11px] text-gray-400">
              Mẹo: Nếu trình duyệt không tự động tải PDF, bạn hãy bấm vào nút "Mở tab mới" để xem chi tiết.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
