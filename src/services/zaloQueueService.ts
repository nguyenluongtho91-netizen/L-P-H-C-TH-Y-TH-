import { supabase } from '@/lib/supabase'

export interface ZaloQueueItem {
  id: string
  phone: string
  student_id?: string
  student_name: string
  class_id?: string
  class_name?: string
  message: string
  qr_url?: string
  amount?: number
  course_name?: string
  status: 'pending' | 'processing' | 'sent' | 'failed'
  error?: string
  created_at: string
  sent_at?: string
}

export interface ZaloOutboxData {
  items: ZaloQueueItem[]
  heartbeat?: {
    last_seen: number
    status: string
    device?: string
  }
}

const OUTBOX_TITLE = '__ZALO_OUTBOX__'

/**
 * Lấy dữ liệu Outbox và trạng thái Robot PC từ Supabase
 */
export async function getZaloOutbox(): Promise<ZaloOutboxData> {
  try {
    const { data, error } = await supabase
      .from('exams')
      .select('data')
      .eq('title', OUTBOX_TITLE)
      .maybeSingle()

    if (error || !data?.data) {
      return { items: [] }
    }
    return {
      items: Array.isArray(data.data.items) ? data.data.items : [],
      heartbeat: data.data.heartbeat
    }
  } catch (err) {
    console.warn('Lỗi getZaloOutbox:', err)
    return { items: [] }
  }
}

/**
 * Kiểm tra Robot Zalo trên PC Thầy Thọ có đang chạy không
 * (Robot gửi heartbeat mỗi 5-10 giây, nếu dưới 45s là đang Online)
 */
export async function isZaloRobotOnline(): Promise<boolean> {
  const outbox = await getZaloOutbox()
  if (!outbox.heartbeat?.last_seen) return false
  const now = Date.now()
  return (now - outbox.heartbeat.last_seen) < 45000
}

/**
 * Lưu dữ liệu hàng chờ Zalo vào Supabase
 */
async function saveZaloOutbox(items: ZaloQueueItem[], heartbeat?: any): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from('exams')
      .select('id, data')
      .eq('title', OUTBOX_TITLE)
      .maybeSingle()

    const payloadData: ZaloOutboxData = {
      items,
      heartbeat: heartbeat !== undefined ? heartbeat : existing?.data?.heartbeat
    }

    if (existing?.id) {
      const { error } = await supabase
        .from('exams')
        .update({ data: payloadData })
        .eq('id', existing.id)
      return !error
    } else {
      const { error } = await supabase
        .from('exams')
        .insert([{ title: OUTBOX_TITLE, data: payloadData }])
      return !error
    }
  } catch (err) {
    console.error('Lỗi saveZaloOutbox:', err)
    return false
  }
}

/**
 * Thêm 1 tin nhắn vào hàng chờ gửi tự động
 */
export async function enqueueZaloMessage(item: Omit<ZaloQueueItem, 'id' | 'status' | 'created_at'>): Promise<string> {
  const outbox = await getZaloOutbox()
  const id = 'zjob_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
  const newItem: ZaloQueueItem = {
    ...item,
    id,
    status: 'pending',
    created_at: new Date().toISOString()
  }

  // Giữ tối đa 50 tin nhắn gần nhất
  const currentItems = outbox.items.slice(-49)
  currentItems.push(newItem)

  await saveZaloOutbox(currentItems, outbox.heartbeat)
  return id
}

/**
 * Thêm hàng loạt tin nhắn cả lớp vào hàng chờ gửi tự động
 */
export async function enqueueBatchZaloMessages(
  items: Array<Omit<ZaloQueueItem, 'id' | 'status' | 'created_at'>>
): Promise<string[]> {
  const outbox = await getZaloOutbox()
  const now = Date.now()
  const newItems: ZaloQueueItem[] = items.map((it, idx) => ({
    ...it,
    id: zjob___,
    status: 'pending',
    created_at: new Date().toISOString()
  }))

  const merged = [...outbox.items.slice(-40), ...newItems]
  await saveZaloOutbox(merged, outbox.heartbeat)
  return newItems.map(i => i.id)
}

/**
 * Chờ Robot PC xử lý xong tin nhắn (polling mỗi 1s, tối đa timeoutMs)
 */
export async function waitForZaloJob(
  jobId: string,
  timeoutMs = 12000,
  onProgress?: (status: string) => void
): Promise<{ success: boolean; error?: string }> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 1000))
    const outbox = await getZaloOutbox()
    const job = outbox.items.find(i => i.id === jobId)
    if (!job) continue

    if (onProgress) {
      onProgress(job.status)
    }

    if (job.status === 'sent') {
      return { success: true }
    }
    if (job.status === 'failed') {
      return { success: false, error: job.error || 'Robot gửi thất bại' }
    }
  }
  return { success: false, error: 'Hết thời gian chờ Robot PC xử lý' }
}
