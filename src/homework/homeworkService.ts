// src/homework/homeworkService.ts
// Service quản lý Giao bài tập, Nộp bài, Chia sẻ Zalo & Xuất Excel chuẩn Azota

import { supabase } from '@/lib/supabase';
import { HomeworkAssignment, HomeworkSubmission, MissingStudentInfo } from './types';
import * as XLSX from 'xlsx';

const LOCAL_STORAGE_KEY_ASSIGNMENTS = 'thay_tho_azota_assignments_v1';
const LOCAL_STORAGE_PREFIX_SUBMISSIONS = 'thay_tho_azota_submissions_';

// ─── 1. QUẢN LÝ BÀI TẬP (ASSIGNMENTS) ──────────────────────────────────────────

export async function getAssignments(): Promise<HomeworkAssignment[]> {
  let list: HomeworkAssignment[] = [];

  // 1. Thử tải từ LocalStorage trước để giao diện mượt mà tức thì
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_ASSIGNMENTS);
    if (raw) {
      list = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Lỗi đọc assignments từ localStorage:', e);
  }

  // 2. Đồng bộ từ Supabase exams table
  try {
    const { data, error } = await supabase
      .from('exams')
      .select('id, title, data, created_at')
      .ilike('title', '__AZOTA_HW__%')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const cloudList: HomeworkAssignment[] = data
        .map(row => {
          if (row.data && typeof row.data === 'object') {
            return {
              ...row.data,
              id: row.id,
              created_at: row.created_at || row.data.created_at || new Date().toISOString(),
            };
          }
          return null;
        })
        .filter(Boolean) as HomeworkAssignment[];

      if (cloudList.length > 0) {
        list = cloudList;
        localStorage.setItem(LOCAL_STORAGE_KEY_ASSIGNMENTS, JSON.stringify(list));
      }
    }
  } catch (err) {
    console.warn('Không thể đồng bộ assignments từ Supabase (dùng cache local):', err);
  }

  return list;
}

export async function getAssignmentById(id: string): Promise<HomeworkAssignment | null> {
  const all = await getAssignments();
  const found = all.find(a => a.id === id || a.code === id);
  if (found) return found;

  // Thử query trực tiếp Supabase nếu chưa có trong list
  try {
    const { data } = await supabase
      .from('exams')
      .select('id, data, created_at')
      .eq('id', id)
      .maybeSingle();

    if (data?.data) {
      return {
        ...data.data,
        id: data.id,
        created_at: data.created_at || data.data.created_at,
      };
    }
  } catch {}

  return null;
}

export async function saveAssignment(assignment: HomeworkAssignment): Promise<HomeworkAssignment> {
  const all = await getAssignments();
  const existingIdx = all.findIndex(a => a.id === assignment.id);
  
  let updatedList: HomeworkAssignment[];
  if (existingIdx >= 0) {
    updatedList = [...all];
    updatedList[existingIdx] = assignment;
  } else {
    updatedList = [assignment, ...all];
  }

  // 1. Lưu LocalStorage ngay lập tức
  localStorage.setItem(LOCAL_STORAGE_KEY_ASSIGNMENTS, JSON.stringify(updatedList));

  // 2. Lưu vào Supabase exams table
  try {
    const titleKey = `__AZOTA_HW__${assignment.id}`;
    await supabase.from('exams').upsert({
      id: assignment.id,
      title: titleKey,
      data: assignment,
      created_at: assignment.created_at,
    });
  } catch (err) {
    console.error('Lỗi lưu bài tập lên Supabase:', err);
  }

  return assignment;
}

export async function deleteAssignment(id: string): Promise<boolean> {
  const all = await getAssignments();
  const filtered = all.filter(a => a.id !== id);
  localStorage.setItem(LOCAL_STORAGE_KEY_ASSIGNMENTS, JSON.stringify(filtered));

  try {
    await supabase.from('exams').delete().eq('id', id);
    await supabase.from('exams').delete().eq('title', `__AZOTA_HW_SUBMISSIONS__${id}`);
  } catch (err) {
    console.warn('Lỗi xóa bài tập trên Supabase:', err);
  }

  return true;
}

// ─── 2. QUẢN LÝ BÀI NỘP HỌC SINH (SUBMISSIONS) ─────────────────────────────────

export async function getSubmissions(assignmentId: string): Promise<HomeworkSubmission[]> {
  let list: HomeworkSubmission[] = [];

  // Đọc từ LocalStorage
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PREFIX_SUBMISSIONS + assignmentId);
    if (raw) list = JSON.parse(raw);
  } catch {}

  // Đọc từ Supabase
  try {
    const { data } = await supabase
      .from('exams')
      .select('data')
      .eq('title', `__AZOTA_HW_SUBMISSIONS__${assignmentId}`)
      .maybeSingle();

    if (data?.data && Array.isArray(data.data.submissions)) {
      list = data.data.submissions;
      localStorage.setItem(LOCAL_STORAGE_PREFIX_SUBMISSIONS + assignmentId, JSON.stringify(list));
    }
  } catch (err) {
    console.warn('Lỗi đọc submissions từ Supabase:', err);
  }

  return list;
}

export async function saveSubmission(submission: HomeworkSubmission): Promise<HomeworkSubmission> {
  const subs = await getSubmissions(submission.assignment_id);
  const idx = subs.findIndex(s => s.id === submission.id || (s.student_id === submission.student_id && s.assignment_id === submission.assignment_id));
  
  let updated: HomeworkSubmission[];
  if (idx >= 0) {
    updated = [...subs];
    updated[idx] = submission;
  } else {
    updated = [submission, ...subs];
  }

  // Lưu local
  localStorage.setItem(LOCAL_STORAGE_PREFIX_SUBMISSIONS + submission.assignment_id, JSON.stringify(updated));

  // Lưu Supabase
  try {
    await supabase.from('exams').upsert({
      title: `__AZOTA_HW_SUBMISSIONS__${submission.assignment_id}`,
      data: {
        assignment_id: submission.assignment_id,
        updated_at: new Date().toISOString(),
        submissions: updated,
      },
    }, { onConflict: 'title' });
  } catch (err) {
    console.error('Lỗi lưu submission lên Supabase:', err);
  }

  return submission;
}

// ─── 3. TIỆN ÍCH ZALO CHUẨN AZOTA & THẦY THỌ ──────────────────────────────────

export function formatDateTimeVN(isoString?: string): string {
  if (!isoString) return 'Chưa định thời hạn';
  try {
    const d = new Date(isoString);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${mins} ngày ${day}/${month}/${year}`;
  } catch {
    return isoString;
  }
}

export function generateZaloShareMessage(assignment: HomeworkAssignment, classNamesStr: string, hostUrl?: string): string {
  const origin = hostUrl || window.location.origin;
  const link = `${origin}/nop-bai/${assignment.id}`;
  const deadlineStr = formatDateTimeVN(assignment.deadline);

  return `📢 [LỚP HỌC THẦY THỌ] THÔNG BÁO BÀI TẬP VỀ NHÀ
━━━━━━━━━━━━━━━━━━━━━━
📝 Bài tập: ${assignment.title}
👥 Lớp áp dụng: ${classNamesStr || 'Theo danh sách lớp'}
⏰ Hạn nộp bài: ${deadlineStr}
${assignment.attachments?.length ? `📎 Đính kèm: ${assignment.attachments.length} tài liệu / ảnh đề bài` : ''}

👉 LINK NỘP BÀI TRỰC TIẾP (Không cần mật khẩu):
${link}

💡 HƯỚNG DẪN HỌC SINH:
1. Bấm vào link trên từ điện thoại hoặc máy tính.
2. Chọn đúng tên mình trong danh sách lớp.
3. Chụp ảnh rõ nét các trang vở bài làm và bấm "Nộp bài".

⚠️ Phụ huynh nhắc các em hoàn thành trước hạn để thầy kịp chấm nhé!`;
}

export function generateZaloReminderMessage(assignment: HomeworkAssignment, missingList: MissingStudentInfo[], hostUrl?: string): string {
  const origin = hostUrl || window.location.origin;
  const link = `${origin}/nop-bai/${assignment.id}`;
  const deadlineStr = formatDateTimeVN(assignment.deadline);

  const namesList = missingList
    .slice(0, 30)
    .map((s, i) => `  ${i + 1}. ${s.full_name}${s.class_name ? ` (${s.class_name})` : ''}`)
    .join('\n');

  const moreCount = missingList.length > 30 ? `\n  ...và ${missingList.length - 30} bạn khác` : '';

  return `⚠️ [LỚP HỌC THẦY THỌ] NHẮC NHỞ NỘP BÀI TẬP VỀ NHÀ
━━━━━━━━━━━━━━━━━━━━━━
📝 Bài tập: ${assignment.title}
⏰ Hạn nộp: ${deadlineStr}

Danh sách học sinh CHƯA NỘP BÀI (${missingList.length} em):
${namesList}${moreCount}

👉 Link nộp bài nhanh cho các em:
${link}

Kính nhờ Quý phụ huynh nhắc con chụp ảnh bài làm và gửi thầy ngay để thầy tổng hợp điểm. Thầy cảm ơn Quý phụ huynh!`;
}

export function generatePersonalReminderMessage(assignment: HomeworkAssignment, studentName: string, hostUrl?: string): string {
  const origin = hostUrl || window.location.origin;
  const link = `${origin}/nop-bai/${assignment.id}`;
  const deadlineStr = formatDateTimeVN(assignment.deadline);

  return `Chào phụ huynh em ${studentName}.
Thầy Thọ gửi lời nhắc: Hiện tại em ${studentName} chưa nộp bài tập "${assignment.title}".
Hạn nộp bài là: ${deadlineStr}.
Phụ huynh nhắc con chụp ảnh vở bài làm và nộp cho thầy theo đường link này nhé:
${link}
Thầy cảm ơn phụ huynh!`;
}

// ─── 4. XUẤT BẢNG ĐIỂM RA EXCEL (XLSX) ─────────────────────────────────────────

export function exportHomeworkToExcel(
  assignment: HomeworkAssignment,
  submissions: HomeworkSubmission[],
  allStudents: Array<{ id: string; full_name: string; student_code?: string; class_name?: string }>
) {
  const subMap = new Map<string, HomeworkSubmission>();
  submissions.forEach(s => subMap.set(s.student_id, s));

  const rows = allStudents.map((st, index) => {
    const sub = subMap.get(st.id);
    let statusText = 'Chưa nộp';
    if (sub) {
      if (sub.status === 'graded') statusText = 'Đã chấm';
      else if (sub.is_late) statusText = 'Nộp muộn';
      else statusText = 'Đã nộp';
    }

    return {
      'STT': index + 1,
      'Mã HS': st.student_code || '—',
      'Họ và tên': st.full_name,
      'Lớp': st.class_name || '—',
      'Trạng thái': statusText,
      'Thời gian nộp': sub?.submitted_at ? formatDateTimeVN(sub.submitted_at) : '—',
      'Số trang ảnh': sub?.images?.length || 0,
      'Điểm tổng': sub?.score !== null && sub?.score !== undefined ? sub.score : '—',
      'TN Khách quan': sub?.score_breakdown?.trac_nghiem ?? '—',
      'Đúng / Sai': sub?.score_breakdown?.dung_sai ?? '—',
      'Trả lời ngắn': sub?.score_breakdown?.tra_loi_ngan ?? '—',
      'Tự luận': sub?.score_breakdown?.tu_luan ?? '—',
      'Lời phê của Thầy': sub?.teacher_comment || '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bang_Diem_Bai_Tap');

  const safeTitle = (assignment.title || 'Bai_Tap').replace(/[^a-zA-Z0-9_À-ɏẠ-ỹ]/g, '_');
  XLSX.writeFile(wb, `Bang_Diem_${safeTitle}_${assignment.code || 'HW'}.xlsx`);
}
