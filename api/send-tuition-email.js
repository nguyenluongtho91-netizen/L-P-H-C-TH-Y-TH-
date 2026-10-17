/**
 * api/send-tuition-email.js
 * Gửi nhắc học phí qua Gmail (GAS) cho học sinh chưa đóng học phí theo khóa
 *
 * POST /api/send-tuition-email
 * Body: { classId, courseName, studentIds? }
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://kbowwwbmyrwmxmjnopsm.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_Q9nAR2kWvrOh7ySG7R4iDA_1QOKtB5T";

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Gọi GAS gửi email ────────────────────────────────────────────────────────
async function callGAS(payload) {
  const gasUrl = process.env.GAS_EMAIL_URL;
  if (!gasUrl) throw new Error("GAS_EMAIL_URL chưa được cấu hình trên Vercel");

  const res = await fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
    body: JSON.stringify({
      type:   "tuition",
      secret: process.env.GAS_WEBHOOK_SECRET || "",
      ...payload,
    }),
  });

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (!data.ok) throw new Error(data.error || "GAS trả về lỗi");
    return data;
  } catch {
    throw new Error(`GAS response không hợp lệ: ${text.slice(0, 100)}`);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { classId, courseName, studentIds } = req.body || {};
  if (!classId || !courseName) {
    return res.status(400).json({ error: "Thiếu classId hoặc courseName" });
  }

  try {
    // ── Lấy thông tin lớp ────────────────────────────────────────────────────
    const { data: cls } = await supabase
      .from("classes")
      .select("*")
      .eq("id", classId)
      .maybeSingle();

    const className = cls?.name || cls?.class_name || "Lớp học";

    // ── Lấy thông báo học phí chưa đóng của lớp ──────────────────────────────
    let notifs = [];
    try {
      let query = supabase
        .from("tuition_notifications")
        .select("id, amount, student_id, students(id, full_name, email, parent_name)")
        .eq("class_id", classId)
        .eq("course_name", courseName)
        .eq("is_paid", false);

      if (studentIds && studentIds.length) {
        query = query.in("student_id", studentIds);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        notifs = data;
      }
    } catch {}

    // Fallback: Lấy từ __TUITION_NOTIFICATIONS_STORE__ trong exams
    if (!notifs.length) {
      try {
        const { data: examData } = await supabase
          .from("exams")
          .select("data")
          .eq("title", "__TUITION_NOTIFICATIONS_STORE__")
          .maybeSingle();

        if (examData && examData.data && examData.data.items) {
          let storeItems = examData.data.items.filter(
            (i) => i.class_id === classId && !i.is_paid
          );
          if (studentIds && studentIds.length) {
            storeItems = storeItems.filter((i) => studentIds.includes(i.student_id));
          }

          const { data: allStudents } = await supabase
            .from("students")
            .select("id, full_name, email, parent_name");

          const sMap = new Map((allStudents || []).map((s) => [s.id, s]));
          notifs = storeItems.map((it) => ({
            id: it.id,
            amount: it.amount || 600000,
            student_id: it.student_id,
            students: sMap.get(it.student_id) || { full_name: "Học sinh", email: "" }
          }));
        }
      } catch {}
    }

    if (!process.env.GAS_EMAIL_URL) {
      return res.status(200).json({
        ok: true,
        summary: { sent: 0, skipped: notifs.length, errors: 0 },
        message: "Chưa cấu hình GAS_EMAIL_URL. Vui lòng sử dụng tính năng gửi Zalo 1-Click.",
        results: notifs.map(n => ({ studentName: n.students && n.students.full_name, skipped: "Chưa có GAS Email URL" }))
      });
    }

    const results = [];

    for (const notif of notifs) {
      const student = notif.students;
      if (!student || !student.email) {
        results.push({ studentName: student && student.full_name, skipped: "Không có email" });
        continue;
      }

      try {
        await callGAS({
          parentEmail:      student.email,
          studentName:      student.full_name,
          className:        className,
          month:            courseName,
          plannedSessions:  1,
          absences:         0,
          attendedSessions: 1,
          feePerSession:    notif.amount,
          totalFee:         notif.amount,
          paidAmount:       0,
          debt:             notif.amount,
          bankId:           process.env.BANK_ID          || "VCB",
          bankAccount:      process.env.BANK_ACCOUNT     || "1070493932",
          bankAccountName:  process.env.BANK_ACCOUNT_NAME || "HO KINH DOANH NGUYEN LUONG THO",
          centerName:       process.env.CENTER_NAME      || "Lớp học Thầy Thọ",
        });

        results.push({ studentName: student.full_name, email: student.email, sent: true, debt: notif.amount });
      } catch (emailErr) {
        results.push({ studentName: student.full_name, sent: false, error: emailErr.message });
      }
    }

    const sentCount    = results.filter(r => r.sent).length;
    const skippedCount = results.filter(r => r.skipped).length;
    const errorCount   = results.filter(r => r.sent === false).length;

    return res.status(200).json({
      ok: true,
      summary: { sent: sentCount, skipped: skippedCount, errors: errorCount },
      results,
    });

  } catch (err) {
    console.error("send-tuition-email error:", err);
    return res.status(200).json({ ok: false, error: err.message, summary: { sent: 0, skipped: 0, errors: 1 } });
  }
}
