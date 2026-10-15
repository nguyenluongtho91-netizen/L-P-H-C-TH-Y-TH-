import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useExamStore } from '@/store/examStore'
import PDFExamCreator from '@/components/PDFExamCreator'
import toast from 'react-hot-toast'

export default function CreatePdfExamPage() {
  const authStore = useAuthStore() as any
  const user = authStore.user
  const navigate = useNavigate()
  const location = useLocation() as any
  const initialPdfFile = location.state?.file || location.state?.pdfFile
  const { createExam } = useExamStore()

  const handleSave = async (exam: any) => {
    try {
      await createExam(exam, exam.title)
      toast.success('Tạo đề thi PDF thành công! 🎉')
      navigate('/exams')
    } catch (error) {
      console.error(error)
      toast.error('Có lỗi khi lưu đề thi')
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-2">
      <h1 className="text-2xl font-extrabold text-teal-800 mb-6 px-4">Tạo Đề Thi từ PDF</h1>
      <PDFExamCreator
        teacherId={user?.id || ''}
        teacherName={user?.name || user?.full_name || 'Giáo viên'}
        initialPdfFile={initialPdfFile}
        onSave={handleSave}
        onCancel={() => navigate('/exams')}
      />
    </div>
  )
}
