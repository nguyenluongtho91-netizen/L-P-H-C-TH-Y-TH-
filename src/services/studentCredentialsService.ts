// src/services/studentCredentialsService.ts
// Quản lý mật khẩu, ghi chú và avatar học sinh độc lập, đồng bộ đám mây Supabase (exams store)

import { supabase } from '@/lib/supabase';

const LOCAL_KEY = 'thay_tho_student_credentials_v1';
const STORE_TITLE = '__STUDENT_CREDENTIALS_STORE__';

export interface StudentCredential {
  password?: string;
  note?: string;
  avatar_url?: string;
  updated_at?: string;
}

let memoryCache: Record<string, StudentCredential> = {};

// Khởi tạo memoryCache từ LocalStorage ngay khi load file
try {
  const raw = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_KEY) : null;
  if (raw) {
    memoryCache = JSON.parse(raw);
  }
} catch {}

// 1. Tải toàn bộ mật khẩu và ghi chú từ LocalStorage + Supabase Cloud Store
export async function getAllStudentCredentials(): Promise<Record<string, StudentCredential>> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_KEY) : null;
    if (raw) {
      memoryCache = { ...JSON.parse(raw), ...memoryCache };
    }
  } catch {}

  try {
    const { data, error } = await supabase
      .from('exams')
      .select('data')
      .eq('title', STORE_TITLE)
      .maybeSingle();

    if (!error && data?.data?.credentials) {
      memoryCache = { ...memoryCache, ...data.data.credentials };
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(memoryCache));
      }
    }
  } catch (err) {
    console.warn('Lỗi đồng bộ credentials từ cloud:', err);
  }

  return memoryCache;
}

// 2. Lấy thông tin đồng bộ (từ memory cache)
export function getStudentCredentialSync(studentCodeOrPhone: string): StudentCredential | null {
  if (!studentCodeOrPhone) return null;
  const cleanKey = studentCodeOrPhone.trim().toUpperCase();
  return memoryCache[cleanKey] || null;
}

// 3. Lấy thông tin bất đồng bộ (có fetch cloud nếu chưa có)
export async function getStudentCredential(studentCodeOrPhone: string): Promise<StudentCredential | null> {
  if (!studentCodeOrPhone) return null;
  const cleanKey = studentCodeOrPhone.trim().toUpperCase();

  if (memoryCache[cleanKey]) {
    return memoryCache[cleanKey];
  }

  const all = await getAllStudentCredentials();
  return all[cleanKey] || null;
}

// 4. Lưu thông tin (mật khẩu, ghi chú, avatar) của 1 học sinh
export async function saveStudentCredential(
  studentCode: string,
  password?: string,
  note?: string,
  avatar_url?: string
): Promise<void> {
  if (!studentCode) return;
  const cleanKey = studentCode.trim().toUpperCase();

  const current = memoryCache[cleanKey] || {};
  const updated: StudentCredential = {
    ...current,
    password: password !== undefined ? password : current.password,
    note: note !== undefined ? note : current.note,
    avatar_url: avatar_url !== undefined ? avatar_url : current.avatar_url,
    updated_at: new Date().toISOString(),
  };

  memoryCache[cleanKey] = updated;
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(memoryCache));
  }

  try {
    await supabase.from('exams').upsert({
      title: STORE_TITLE,
      data: {
        version: 1,
        updated_at: new Date().toISOString(),
        credentials: memoryCache,
      },
    }, { onConflict: 'title' });
  } catch (err) {
    console.error('Lỗi lưu student credential lên cloud:', err);
  }
}

// 5. Lưu hàng loạt (khi import Excel)
export async function saveBatchStudentCredentials(
  list: Array<{ student_code: string; password?: string; note?: string }>
): Promise<void> {
  if (!list || list.length === 0) return;

  list.forEach(item => {
    if (item.student_code) {
      const cleanKey = item.student_code.trim().toUpperCase();
      memoryCache[cleanKey] = {
        ...(memoryCache[cleanKey] || {}),
        password: item.password || memoryCache[cleanKey]?.password || '123456',
        note: item.note || memoryCache[cleanKey]?.note || '',
        updated_at: new Date().toISOString(),
      };
    }
  });

  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(memoryCache));
  }

  try {
    await supabase.from('exams').upsert({
      title: STORE_TITLE,
      data: {
        version: 1,
        updated_at: new Date().toISOString(),
        credentials: memoryCache,
      },
    }, { onConflict: 'title' });
  } catch (err) {
    console.error('Lỗi lưu batch credentials:', err);
  }
}

// 6. Gắn thông tin mở rộng vào danh sách học sinh
export function enrichStudentsWithCredentials(students: any[]): any[] {
  if (!students || !Array.isArray(students)) return students;
  return students.map(st => {
    const code = (st.student_code || '').trim().toUpperCase();
    const cred = memoryCache[code];
    return {
      ...st,
      password: cred?.password || st.password || null,
      note: cred?.note || st.note || null,
      avatar_url: cred?.avatar_url || st.avatar_url || null,
    };
  });
}
