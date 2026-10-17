/**
 * api/payment-webhook.js
 * Supports: SePay (sepay.vn) + Casso (casso.vn) + SeaPay
 * Tự động gạch nợ học phí ngân hàng + Tự động gửi tin nhắn xác nhận cho phụ huynh
 */

import { createClient } from "@supabase/supabase-js";

// Khởi tạo Supabase client có fallback an toàn
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://kbowwwbmyrwmxmjnopsm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Q9nAR2kWvrOh7ySG7R4iDA_1QOKtB5T';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function normalizePayload(body) {
  if (body.transferAmount !== undefined) {
    return {
      source: 'sepay',
      transaction_id: body.referenceCode || body.id?.toString(),
      amount: body.transferAmount,
      description: body.content || body.description || '',
      transfer_at: body.transactionDate ? new Date(body.transactionDate).toISOString() : new Date().toISOString(),
      is_incoming: !body.transferType || body.transferType === 'in',
    };
  }
  if (body.tid !== undefined) {
    return {
      source: 'casso',
      transaction_id: body.tid?.toString() || body.id?.toString(),
      amount: body.amount,
      description: body.description || '',
      transfer_at: body.when ? new Date(body.when).toISOString() : new Date().toISOString(),
      is_incoming: body.amount > 0,
    };
  }
  return {
    source: 'seapay',
    transaction_id: body.transaction_id,
    amount: Math.abs(body.amount || 0),
    description: body.description || body.reference || '',
    transfer_at: body.transfer_at || new Date().toISOString(),
    is_incoming: true,
  };
}

function parseTransferContent(description) {
  const text = (description || '').toUpperCase();

  // 1. Format: "HP HS001 ...", "HP K9001 ...", "HP HS015 MINH ANH 10"
  const hpCodeMatch = text.match(/HP\s+([A-Z0-9]+)/);
  if (hpCodeMatch) {
    const raw = hpCodeMatch[1];
    // Check if format has month e.g. T052026 or T5/2026
    const monthMatch = text.match(/T(\d{2})(\d{4})/) || text.match(/T(\d{1,2})\/(\d{4})/);
    let month = null;
    if (monthMatch) {
      const m = monthMatch[1].padStart(2, '0');
      const y = monthMatch[2];
      month = `${y}-${m}`;
    }
    return { studentCode: raw, month };
  }

  // 2. Format tìm mã học sinh dạng HS001, K9001...
  const code = text.match(/\b([A-Z]{1,3}\d{2,})\b/);
  if (code) return { studentCode: code[1], month: null };

  return { studentCode: null, month: null };
}

async function findActiveClassId(studentId) {
  const { data } = await supabase.from('enrollments').select('class_id')
    .eq('student_id', studentId).eq('status', 'active').limit(1).maybeSingle();
  return data?.class_id || null;
}

async function sendConfirmEmail(student, amount, transactionId, month) {
  const gasUrl = process.env.GAS_EMAIL_URL;
  if (!gasUrl || !student?.email) return false;
  try {
    const res = await fetch(gasUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'follow',
      body: JSON.stringify({
        type: 'payment_confirm', secret: process.env.GAS_WEBHOOK_SECRET || '',
        parentEmail: student.email, studentName: student.full_name,
        amount, transactionId, month: month || '',
        centerName: process.env.CENTER_NAME || 'EduCenter Thầy Thọ',
      }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch (e) { console.error('GAS email error:', e.message); return false; }
}

async function sendZaloConfirmation(student, amount) {
  const phone = student?.parent_phone || student?.zalo || student?.phone;
  if (!phone) return { sent: false, reason: 'no_phone' };

  const formattedAmt = new Intl.NumberFormat('vi-VN').format(amount);
  const msg = `Chào phụ huynh.
Thầy đã nhận đủ học phí của em ${student.full_name} (${formattedAmt} đ).
Thầy cảm ơn phụ huynh!`;

  let sent = false;

  // Thử gửi qua Zalo Personal Gateway (nếu có cấu hình)
  const serviceUrl = process.env.ZALO_SERVICE_URL;
  if (serviceUrl) {
    try {
      const cleanUrl = serviceUrl.replace(/\/$/, '');
      const res = await fetch(`${cleanUrl}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.ZALO_SERVICE_API_KEY ? { 'x-api-key': process.env.ZALO_SERVICE_API_KEY } : {}),
        },
        body: JSON.stringify({ phone: phone.replace(/\D/g, ''), message: msg }),
      });
      if (res.ok) sent = true;
    } catch (e) {
      console.log('Zalo personal service send error:', e.message);
    }
  }

  // Thử gửi qua Zalo OA (nếu có Access Token)
  const oaToken = process.env.ZALO_ACCESS_TOKEN;
  if (!sent && oaToken) {
    try {
      let formattedPhone = phone.replace(/\D/g, '');
      if (formattedPhone.startsWith('0')) formattedPhone = '84' + formattedPhone.slice(1);
      const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': oaToken,
        },
        body: JSON.stringify({
          recipient: { phone_number: formattedPhone },
          message: { text: msg },
        }),
      });
      const data = await res.json();
      if (data.error === 0) sent = true;
    } catch (e) {
      console.log('Zalo OA send error:', e.message);
    }
  }

  return { sent, message: msg };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  console.log('Payment Webhook received:', JSON.stringify(req.body).slice(0, 300));

  const payload = normalizePayload(req.body);

  if (!payload.is_incoming) return res.status(200).json({ ok: true, skipped: 'outgoing' });
  if (!payload.transaction_id || !payload.amount) {
    return res.status(400).json({ error: 'Missing fields', received: req.body });
  }

  // Kiểm tra chống trùng lặp giao dịch
  const { data: existing } = await supabase.from('payments').select('id')
    .eq('note', `[${payload.source}] ${payload.description}`.slice(0, 200))
    .eq('amount', payload.amount).maybeSingle();
  if (existing) return res.status(200).json({ ok: true, duplicate: true, payment_id: existing.id });

  try {
    const { studentCode, month } = parseTransferContent(payload.description);
    let student = null, classId = null;

    // 1. Tìm học sinh theo mã (student_code)
    if (studentCode) {
      const { data } = await supabase.from('students')
        .select('id, full_name, email, parent_phone, zalo, phone, student_code')
        .ilike('student_code', studentCode)
        .maybeSingle();
      if (data) {
        student = data;
        classId = await findActiveClassId(data.id);
      }
    }

    // 2. Nếu chưa tìm thấy theo mã, tìm kiếm theo tên học sinh không dấu trong nội dung chuyển tiền
    if (!student) {
      const { data: allStudents } = await supabase.from('students')
        .select('id, full_name, email, parent_phone, zalo, phone, student_code')
        .eq('status', 'active');
      
      if (allStudents && allStudents.length > 0) {
        const cleanDesc = (payload.description || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[đĐ]/g, 'd')
          .toUpperCase();

        for (const st of allStudents) {
          const cleanName = (st.full_name || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .toUpperCase()
            .trim();
          
          const parts = cleanName.split(/\s+/).filter(Boolean);
          const shortName = parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : cleanName;

          if (cleanName.length >= 4 && cleanDesc.includes(cleanName)) {
            student = st;
            classId = await findActiveClassId(st.id);
            break;
          } else if (shortName.length >= 6 && cleanDesc.includes(shortName)) {
            student = st;
            classId = await findActiveClassId(st.id);
            break;
          }
        }
      }
    }

    // 3. Ghi nhận giao dịch vào bảng payments
    const { data: payment, error: payErr } = await supabase.from('payments').insert({
      student_id: student?.id || null,
      class_id: classId || null,
      amount: payload.amount,
      method: 'transfer',
      date: payload.transfer_at.slice(0, 10),
      note: `[${payload.source}] ${payload.description}`.slice(0, 200),
    }).select().single();

    if (payErr) throw payErr;

    // 4. TỰ ĐỘNG GẠCH NỢ: Cập nhật tuition_notifications thành ĐÃ ĐÓNG (is_paid = true)
    let updatedNotifCount = 0;
    if (student) {
      try {
        const { data: notifData } = await supabase
          .from('tuition_notifications')
          .update({ is_paid: true, updated_at: new Date().toISOString() })
          .eq('student_id', student.id)
          .eq('is_paid', false)
          .select('id');
        updatedNotifCount = notifData?.length || 0;
      } catch {}

      // Cập nhật thêm trong cloud store exams (__TUITION_NOTIFICATIONS_STORE__)
      try {
        const { data: storeRow } = await supabase
          .from('exams')
          .select('data')
          .eq('title', '__TUITION_NOTIFICATIONS_STORE__')
          .maybeSingle();
        if (storeRow?.data?.items && Array.isArray(storeRow.data.items)) {
          let changed = false;
          const updatedItems = storeRow.data.items.map(item => {
            if (item.student_id === student.id && !item.is_paid) {
              changed = true;
              return { ...item, is_paid: true, updated_at: new Date().toISOString() };
            }
            return item;
          });
          if (changed) {
            await supabase
              .from('exams')
              .upsert({ title: '__TUITION_NOTIFICATIONS_STORE__', data: { items: updatedItems } }, { onConflict: 'title' });
            updatedNotifCount = Math.max(updatedNotifCount, 1);
          }
        }
      } catch {}
    }

    // 5. TỰ ĐỘNG GỬI TIN NHẮN CHO PHỤ HUYNH: "Thầy đã nhận học phí cháu rồi mẹ nhé"
    let zaloInfo = { sent: false };
    if (student) {
      zaloInfo = await sendZaloConfirmation(student, payload.amount);
    }

    // Gửi email xác nhận kèm theo (nếu có email)
    const emailSent = await sendConfirmEmail(student, payload.amount, payload.transaction_id, month);

    return res.status(200).json({
      ok: true,
      source: payload.source,
      payment_id: payment.id,
      student_code: student?.student_code || studentCode,
      student_name: student?.full_name || null,
      marked_paid: updatedNotifCount > 0,
      zalo_sent: zaloInfo.sent,
      email_sent: emailSent,
      confirmation_text: zaloInfo.message || null
    });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
