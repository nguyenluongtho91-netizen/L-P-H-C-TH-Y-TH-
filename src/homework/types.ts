// src/homework/types.ts
// Hệ thống Giao & Nộp Bài Tập Về Nhà - Chuẩn Azota

export interface HomeworkAttachment {
  id: string;
  name: string;
  size?: number;
  type: 'pdf' | 'docx' | 'image' | 'video' | 'link';
  url: string; // Base64 data URL, Storage URL, hoặc web link
}

export interface HomeworkAssignment {
  id: string;
  code: string; // Mã bài ngắn gọn 5-6 ký tự (VD: HW782)
  title: string;
  description?: string;
  class_ids: string[]; // Các lớp được giao bài
  class_names?: string[];
  created_at: string;
  deadline: string; // ISO date-time string
  allow_late: boolean; // Cho phép nộp muộn (đánh dấu nhãn Nộp trễ)
  require_login: boolean; // false = Học sinh chỉ cần chọn tên trong danh sách lớp (tính năng vàng Azota)
  view_score_rule: 'immediate' | 'graded_only' | 'hidden'; // Cấu hình xem điểm
  view_solution_rule: 'immediate' | 'after_deadline' | 'hidden'; // Cấu hình xem lời giải
  solution_text?: string;
  solution_attachments?: HomeworkAttachment[];
  attachments: HomeworkAttachment[];
  status: 'active' | 'closed' | 'draft';
  total_students?: number;
  submitted_count?: number;
  graded_count?: number;
}

export interface HomeworkSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  student_name: string;
  student_code?: string;
  class_id: string;
  class_name?: string;
  parent_phone?: string;
  zalo?: string;
  submitted_at: string;
  is_late: boolean;
  status: 'submitted' | 'graded' | 'resubmit_requested';
  images: Array<{
    id: string;
    url: string;
    annotated_url?: string;
  }>;
  files?: Array<{
    name: string;
    url: string;
    type: string;
  }>;
  student_note?: string;
  teacher_comment?: string;
  resubmit_reason?: string;
  score?: number | null; // Điểm / 10.0
  score_breakdown?: {
    trac_nghiem?: number;
    dung_sai?: number;
    tra_loi_ngan?: number;
    tu_luan?: number;
  };
  graded_at?: string;
  graded_by?: string;
}

export interface MissingStudentInfo {
  student_id: string;
  full_name: string;
  student_code?: string;
  class_name?: string;
  parent_phone?: string;
  zalo?: string;
}
