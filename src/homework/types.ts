// src/homework/types.ts
// Hệ thống Giao & Nộp Bài Tập Về Nhà - Chuẩn Azota

import type { Question, ExamData } from '@/types';

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
  content_html?: string; // Nội dung soạn thảo đề bài
  class_ids: string[]; // Các lớp được giao bài
  class_names?: string[];
  created_at: string;
  deadline?: string; // ISO date-time string
  no_deadline?: boolean; // Không giới hạn thời gian nộp
  allow_late: boolean; // Cho phép nộp muộn (đánh dấu nhãn Nộp trễ)
  require_login: boolean; // Bắt buộc đăng nhập mã HS + mật khẩu
  require_password?: boolean; // Yêu cầu mật khẩu khi chọn tên trong danh sách lớp
  assignment_password?: string; // Mật khẩu chung của bài tập (nếu có)
  submission_types?: Array<'photo' | 'online' | 'file'>; // Các hình thức nộp bài cho phép
  view_score_rule: 'immediate' | 'graded_only' | 'hidden'; // Cấu hình xem điểm
  view_solution_rule: 'immediate' | 'after_deadline' | 'hidden'; // Cấu hình xem lời giải
  solution_text?: string;
  solution_attachments?: HomeworkAttachment[];
  attachments: HomeworkAttachment[];
  parsed_questions?: Question[]; // Câu hỏi tự động bóc tách từ file Word (.docx) / LaTeX (.tex) chuẩn Azota
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
  submission_mode?: 'photos_only' | 'online_form' | 'hybrid'; // Hình thức nộp: Chỉ chụp vở, làm trực tuyến, hoặc cả 2
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
  online_answers?: {
    part1?: Record<number, string>; // Trắc nghiệm A, B, C, D
    part2?: Record<number, Record<string, string>>; // Đúng / Sai a, b, c, d
    part3?: Record<number, string>; // Trả lời ngắn
    score_details?: {
      part1_correct?: number;
      part1_total?: number;
      part2_correct?: number;
      part2_total?: number;
      part3_correct?: number;
      part3_total?: number;
      auto_score?: number; // Điểm máy tự chấm
    };
  };
  student_note?: string;
  teacher_comment?: string;
  resubmit_reason?: string;
  score?: number | null; // Điểm tổng / 10.0
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
