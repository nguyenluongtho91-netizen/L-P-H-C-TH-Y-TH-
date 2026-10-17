import { isZaloRobotOnline, enqueueZaloMessage, waitForZaloJob } from './zaloQueueService'
/**
 * Zalo Official Account (OA) & ZNS Service
 * Quản lý gửi tin nhắn trực tiếp qua Zalo OA OpenAPI & Serverless API
 */

export interface ZaloConfig {
  appId: string;
  appSecret: string;
  oaId: string;
  refreshToken: string;
  accessToken?: string;
  // Personal Zalo Service config
  serviceUrl?: string;
  serviceApiKey?: string;
}

// 1. Lấy cấu hình Zalo từ LocalStorage (Ưu tiên) hoặc VITE Env (Mặc định)
export function getZaloConfig(): ZaloConfig {
  return {
    appId: localStorage.getItem('ZALO_APP_ID') || import.meta.env.VITE_ZALO_APP_ID || '',
    appSecret: localStorage.getItem('ZALO_APP_SECRET') || import.meta.env.VITE_ZALO_APP_SECRET || '',
    oaId: localStorage.getItem('ZALO_OA_ID') || import.meta.env.VITE_ZALO_OA_ID || '',
    refreshToken: localStorage.getItem('ZALO_LATEST_REFRESH_TOKEN') || localStorage.getItem('ZALO_REFRESH_TOKEN') || import.meta.env.VITE_ZALO_REFRESH_TOKEN || '',
    accessToken: localStorage.getItem('ZALO_CACHED_ACCESS_TOKEN') || '',
    serviceUrl: localStorage.getItem('ZALO_SERVICE_URL') || import.meta.env.VITE_ZALO_SERVICE_URL || '',
    serviceApiKey: localStorage.getItem('ZALO_SERVICE_API_KEY') || import.meta.env.VITE_ZALO_SERVICE_API_KEY || '',
  };
}

// 2. Lưu cấu hình Zalo vào LocalStorage để không bị mất khi dùng trên Vercel
export function saveZaloConfig(config: Partial<ZaloConfig>): void {
  const currentAppId = localStorage.getItem('ZALO_APP_ID');
  const currentAppSecret = localStorage.getItem('ZALO_APP_SECRET');
  const currentRefreshToken = localStorage.getItem('ZALO_LATEST_REFRESH_TOKEN');

  if (config.appId !== undefined) localStorage.setItem('ZALO_APP_ID', config.appId.trim());
  if (config.appSecret !== undefined) localStorage.setItem('ZALO_APP_SECRET', config.appSecret.trim());
  if (config.oaId !== undefined) localStorage.setItem('ZALO_OA_ID', config.oaId.trim());
  if (config.refreshToken !== undefined) localStorage.setItem('ZALO_LATEST_REFRESH_TOKEN', config.refreshToken.trim());
  if (config.accessToken !== undefined) localStorage.setItem('ZALO_CACHED_ACCESS_TOKEN', config.accessToken.trim());
  if (config.serviceUrl !== undefined) localStorage.setItem('ZALO_SERVICE_URL', config.serviceUrl.trim());
  if (config.serviceApiKey !== undefined) localStorage.setItem('ZALO_SERVICE_API_KEY', config.serviceApiKey.trim());

  // Xóa cached Access Token cũ nếu thay đổi thông tin xác thực
  if (
    (config.appId !== undefined && config.appId.trim() !== currentAppId) ||
    (config.appSecret !== undefined && config.appSecret.trim() !== currentAppSecret) ||
    (config.refreshToken !== undefined && config.refreshToken.trim() !== currentRefreshToken)
  ) {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
    localStorage.removeItem('ZALO_CACHED_ACCESS_TOKEN');
    localStorage.removeItem('ZALO_TOKEN_EXPIRES_AT');
  }
}

// 3. Kiểm tra xem Zalo OA đã được cấu hình chưa
export function isZaloOAConfigured(): boolean {
  const cfg = getZaloConfig();
  return Boolean(cfg.accessToken || (cfg.appId && cfg.appSecret && cfg.refreshToken));
}

// 4. Cache Access Token
let cachedAccessToken: string | null = localStorage.getItem('ZALO_CACHED_ACCESS_TOKEN');
let tokenExpiresAt: number = parseInt(localStorage.getItem('ZALO_TOKEN_EXPIRES_AT') || '0', 10);
let lastZaloErrorMessage: string = '';

/**
 * Lấy hoặc làm mới Access Token từ Refresh Token
 */
export async function getZaloAccessToken(forceRefresh = false): Promise<string | null> {
  const cfg = getZaloConfig();

  // 1. Dùng token trong cache nếu còn hạn và không ép buộc refresh
  if (!forceRefresh && cachedAccessToken && Date.now() < tokenExpiresAt) {
    console.log('⚡ Dùng lại Zalo Access Token hợp lệ từ Cache');
    return cachedAccessToken;
  }

  // 2. Nếu người dùng nhập trực tiếp Access Token trong Cấu hình
  if (cfg.accessToken && cfg.accessToken.length > 50) {
    cachedAccessToken = cfg.accessToken;
    tokenExpiresAt = Date.now() + 24 * 3600 * 1000;
    return cachedAccessToken;
  }

  if (!cfg.appId || !cfg.appSecret || !cfg.refreshToken) {
    lastZaloErrorMessage = 'Chưa điền đủ thông tin Cấu hình Zalo OA (App ID, Secret Key, Refresh Token)';
    console.warn('⚠️ ' + lastZaloErrorMessage);
    return null;
  }

  // 3. Gọi qua Serverless Endpoint `/api/zalo-send` hoặc trực tiếp Zalo OAuth Server
  try {
    const apiRes = await fetch('/api/zalo-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test',
        appId: cfg.appId,
        appSecret: cfg.appSecret,
        refreshToken: cfg.refreshToken
      })
    });

    const data = await apiRes.json().catch(() => ({}));
    if (apiRes.ok && data.accessToken) {
      const tokenStr = String(data.accessToken);
      cachedAccessToken = tokenStr;
      tokenExpiresAt = Date.now() + 24 * 3600 * 1000;
      localStorage.setItem('ZALO_CACHED_ACCESS_TOKEN', tokenStr);
      localStorage.setItem('ZALO_TOKEN_EXPIRES_AT', tokenExpiresAt.toString());
      if (data.newRefreshToken) {
        localStorage.setItem('ZALO_LATEST_REFRESH_TOKEN', String(data.newRefreshToken));
      }
      lastZaloErrorMessage = '';
      return cachedAccessToken;
    } else if (data && data.message) {
      lastZaloErrorMessage = data.message;
      console.error('❌ Serverless Zalo Error:', data);
      return null;
    }
  } catch (err: any) {
    console.warn('Gặp lỗi khi gọi /api/zalo-send endpoint, chuyển sang thử gọi trực tiếp OAuth:', err);
  }

  // 4. Fallback gọi trực tiếp OAuth từ Client nếu Serverless không khả dụng
  try {
    const response = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': cfg.appSecret,
      },
      body: new URLSearchParams({
        refresh_token: cfg.refreshToken,
        app_id: cfg.appId,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      cachedAccessToken = data.access_token as string;
      const expiresIn = (parseInt(data.expires_in, 10) || 90000) - 300;
      tokenExpiresAt = Date.now() + expiresIn * 1000;

      localStorage.setItem('ZALO_CACHED_ACCESS_TOKEN', cachedAccessToken);
      localStorage.setItem('ZALO_TOKEN_EXPIRES_AT', tokenExpiresAt.toString());

      if (data.refresh_token) {
        localStorage.setItem('ZALO_LATEST_REFRESH_TOKEN', data.refresh_token);
      }

      console.log('✅ Đã làm mới Zalo OA Access Token thành công!');
      lastZaloErrorMessage = '';
      return cachedAccessToken;
    } else {
      lastZaloErrorMessage = data.message || data.error_name || `Lỗi Zalo OAuth (Mã ${data.error || -1})`;
      console.error('❌ Lỗi từ Zalo OAuth Server:', JSON.stringify(data));
      localStorage.removeItem('ZALO_CACHED_ACCESS_TOKEN');
      localStorage.removeItem('ZALO_TOKEN_EXPIRES_AT');
      return null;
    }
  } catch (error: any) {
    lastZaloErrorMessage = error?.message || 'Lỗi kết nối tới Zalo OAuth API';
    console.error('❌ Lỗi kết nối Zalo OAuth API:', error);
    return null;
  }
}

/**
 * Kiểm tra kết nối Zalo OA và trả về trạng thái chi tiết
 */
export async function testZaloOAConnection(): Promise<{ success: boolean; message: string }> {
  const cfg = getZaloConfig();
  if (!cfg.appId || !cfg.appSecret || !cfg.refreshToken) {
    return {
      success: false,
      message: 'Chưa điền đủ thông tin Cấu hình Zalo OA (App ID, Secret Key, Refresh Token)!'
    };
  }

  const token = await getZaloAccessToken(true);
  if (token) {
    return {
      success: true,
      message: '✅ Kết nối Zalo OA thành công! Token đã sẵn sàng hoạt động.'
    };
  } else {
    return {
      success: false,
      message: `❌ ${lastZaloErrorMessage || 'Không lấy được Access Token! Refresh Token có thể đã hết hạn hoặc thông tin App ID / Secret Key không đúng.'}`
    };
  }
}

/**
 * Gửi tin nhắn chăm sóc khách hàng (CSKH) qua Zalo OA
 */
export async function sendZaloOAMessage(phoneOrUserId: string, message: string): Promise<{ success: boolean; message?: string }> {
  const cfg = getZaloConfig();

  // Chuẩn hóa số điện thoại dạng 84xxxxxxxxx
  let formattedPhone = phoneOrUserId.replace(/\D/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '84' + formattedPhone.slice(1);
  }

  // 1. Thử gửi qua Vercel Serverless Endpoint `/api/zalo-send`
  try {
    const serverlessRes = await fetch('/api/zalo-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: formattedPhone,
        message,
        appId: cfg.appId,
        appSecret: cfg.appSecret,
        refreshToken: cfg.refreshToken,
        accessToken: cfg.accessToken
      })
    });

    const data = await serverlessRes.json();

    if (serverlessRes.ok && data.success) {
      if (data.newRefreshToken) {
        localStorage.setItem('ZALO_LATEST_REFRESH_TOKEN', data.newRefreshToken);
      }
      return { success: true, message: data.message || 'Đã gửi thành công qua Zalo OA!' };
    } else if (data && (data.errorCode === 'TOKEN_EXPIRED' || data.errorCode === -14014)) {
      cachedAccessToken = null;
      tokenExpiresAt = 0;
      localStorage.removeItem('ZALO_CACHED_ACCESS_TOKEN');
      localStorage.removeItem('ZALO_TOKEN_EXPIRES_AT');
      return {
        success: false,
        message: 'Mã Zalo Refresh Token không hợp lệ hoặc đã bị vô hiệu hóa (-14014). Vui lòng lấy lại Refresh Token mới từ Zalo Explorer và dán lại.'
      };
    } else if (data && data.message) {
      // Nếu có thông tin lỗi cụ thể từ Zalo API
      if (data.errorCode === -224) {
        return {
          success: false,
          message: 'Zalo OA của bạn đang dùng Gói Dùng Thử/Miễn Phí nên Zalo chặn API nhắn tin trực tiếp. Bạn cần nâng cấp lên gói Zalo OA Basic/Standard (39k/tháng) hoặc sử dụng nút "Gửi qua Zalo Web".'
        };
      }
      return { success: false, message: data.message };
    }
  } catch (e) {
    console.warn('Serverless endpoint /api/zalo-send không khả dụng, chuyển qua gọi trực tiếp:', e);
  }

  // 2. Nếu Serverless không phản hồi, thử gọi trực tiếp Client OpenAPI
  const accessToken = await getZaloAccessToken();

  if (!accessToken) {
    // Fallback thử gọi qua local Zalo Bot Server nếu đang chạy node scripts/zalo-server.js
    try {
      const res = await fetch('http://localhost:3001/api/zalo/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, message })
      });
      if (res.ok) return { success: true, message: 'Gửi qua Zalo Bot Server Local thành công!' };
    } catch (e) {
      // Local bot server không bật
    }
    return {
      success: false,
      message: 'Chưa cấu hình Token Zalo OA chính thức hoặc mã Refresh Token đã hết hạn. Hãy nhấp nút "⚙️ Cấu hình Zalo OA" để nhập mã mới.'
    };
  }

  try {
    const isUserId = formattedPhone.length > 13;
    const recipientPayload = isUserId ? { user_id: formattedPhone } : { phone_number: formattedPhone };

    let response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': accessToken,
      },
      body: JSON.stringify({
        recipient: recipientPayload,
        message: { text: message },
      }),
    });

    let result = await response.json();

    if (result.error === -201 && !isUserId) {
      let rawPhone = phoneOrUserId.replace(/\D/g, '');
      if (rawPhone.startsWith('84')) rawPhone = '0' + rawPhone.slice(2);

      const altRes = await fetch('https://openapi.zalo.me/v3.0/oa/message/promotion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': accessToken,
        },
        body: JSON.stringify({
          recipient: { phone_number: rawPhone },
          message: { text: message },
        }),
      });
      result = await altRes.json();
    }

    if (result.error === 0) {
      return { success: true, message: 'Đã gửi thành công qua Zalo OA!' };
    } else if (result.error === -224) {
      return {
        success: false,
        message: 'Zalo OA đang ở Gói Miễn Phí. Zalo yêu cầu gói trả phí (Basic/Standard) để gửi API. Bạn có thể chọn mở Zalo Web để gửi thủ công miễn phí.'
      };
    } else {
      return { success: false, message: `${result.message || 'Lỗi gửi tin Zalo'} (Mã lỗi Zalo: ${result.error})` };
    }
  } catch (error: any) {
    return { success: false, message: error.message || 'Lỗi mạng khi kết nối Zalo OA' };
  }
}

/**
 * Gửi thông báo học phí bằng mẫu tin nhắn ZNS (Zalo Notification Service)
 */
export async function sendZNSNotification(
  phone: string,
  templateId: string,
  templateData: Record<string, any>
): Promise<{ success: boolean; message?: string }> {
  const accessToken = await getZaloAccessToken();
  if (!accessToken) {
    return { success: false, message: 'Chưa có Access Token Zalo OA. Hãy kiểm tra cấu hình trong nút "⚙️ Cấu hình Zalo OA".' };
  }

  let formattedPhone = phone.replace(/\D/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '84' + formattedPhone.slice(1);
  }

  try {
    const response = await fetch('https://business.openapi.zalo.me/message/template', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': accessToken,
      },
      body: JSON.stringify({
        phone: formattedPhone,
        template_id: templateId,
        template_data: templateData,
        tracking_id: `tuition_${Date.now()}`,
      }),
    });

    const result = await response.json();
    if (result.error === 0) {
      return { success: true, message: 'Đã gửi thông báo ZNS thành công!' };
    } else {
      return { success: false, message: `Lỗi ZNS: ${result.message} (Mã lỗi: ${result.error})` };
    }
  } catch (error: any) {
    return { success: false, message: error.message || 'Lỗi gửi tin nhắn ZNS' };
  }
}

/**
 * --- TÍCH HỢP ZALO PERSONAL SERVICE (zalo-service) ---
 */

export interface ZaloServiceHealth {
  ok: boolean;
  zalo: 'ready' | 'expired' | 'connecting' | string;
  ownId?: string;
  connectedAt?: string;
  lastError?: string;
  quotaLeft?: number;
  queueDepth?: number;
}

/**
  * Kiểm tra tình trạng kết nối của Zalo Personal Gateway (/health)
  */
export async function checkZaloServiceHealth(): Promise<ZaloServiceHealth> {
  // 1. Ưu tiên kiểm tra Robot Zalo PC qua Supabase Cloud Outbox (Không bị lỗi Mixed Content trên HTTPS)
  try {
    const isOnline = await isZaloRobotOnline();
    if (isOnline) {
      return { ok: true, zalo: 'ready' };
    }
  } catch {}

  // 2. Kiểm tra Local Zalo Bridge Robot trên máy tính Thầy Thọ (port 3001) nếu có
  try {
    const localRes = await fetch('http://127.0.0.1:3001/health', { method: 'GET' });
    if (localRes.ok) {
      const data = await localRes.json();
      if (data.ok) return { ok: true, zalo: 'ready' };
    }
  } catch {}

  const cfg = getZaloConfig();
  if (!cfg.serviceUrl) {
    return { ok: false, zalo: 'disconnected', lastError: 'Chưa khởi chạy Robot Zalo PC' };
  }

  const cleanUrl = cfg.serviceUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${cleanUrl}/health`, {
      method: 'GET',
      headers: cfg.serviceApiKey ? { 'x-api-key': cfg.serviceApiKey } : {},
    });
    if (!res.ok) {
      return { ok: false, zalo: 'error', lastError: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { ok: false, zalo: 'offline', lastError: err.message || 'Không thể kết nối máy chủ zalo-service' };
  }
}

/**
 * Gửi tin nhắn qua Zalo Personal Gateway (/send)
 */
export async function sendZaloPersonalMessage(
  phone: string,
  message: string,
  qrUrl?: string,
  studentName?: string
): Promise<{ success: boolean; message: string; jobId?: string }> {
  const cleanPhone = phone.replace(/\D/g, '').replace(/^84/, '0');

  // 1. Ưu tiên số 1: Gửi tự động qua Robot Zalo PC (Cloud Outbox Supabase - Bỏ qua Mixed Content)
  try {
    const isOnline = await isZaloRobotOnline();
    if (isOnline) {
      const jobId = await enqueueZaloMessage({
        phone: cleanPhone,
        student_name: studentName || cleanPhone,
        message,
        qr_url: qrUrl
      });
      const res = await waitForZaloJob(jobId, 15000);
      if (res.success) {
        return { success: true, message: 'Đã tự động gửi qua Robot Zalo PC thành công!', jobId };
      }
    }
  } catch (e) {
    console.warn('Robot Cloud Outbox error:', e);
  }

  // 2. Thử gửi qua local bridge nếu có
  try {
    const localRes = await fetch('http://127.0.0.1:3001/api/zalo/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone, message, qrUrl })
    });
    if (localRes.ok) {
      const data = await localRes.json();
      if (data.ok || data.success) {
        return { success: true, message: 'Đã tự động gửi qua Robot Zalo PC thành công!' };
      }
    }
  } catch (e) {}

  // 3. Fallback 1-Click: Copy vào Clipboard & Mở Zalo phụ huynh để Thầy chỉ cần bấm Ctrl+V gửi luôn
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(message);
    }
    if (cleanPhone) {
      window.open('https://zalo.me/' + cleanPhone, '_blank');
      return {
        success: true,
        message: 'Đã tự động copy nội dung và mở Zalo phụ huynh. Thầy chỉ cần bấm Ctrl+V để gửi!'
      };
    }
  } catch (err) {}

  const cfg = getZaloConfig();
  if (!cfg.serviceUrl) {
    return { success: false, message: 'Chưa bật Robot Zalo PC. Thầy hãy mở file "CHAY_ROBOT_ZALO_TU_DONG.bat" trên màn hình Desktop.' };
  }

  const cleanUrl = cfg.serviceUrl.replace(/\/$/, '');
  let formattedPhone = phone.replace(/\D/g, '');

  try {
    const res = await fetch(`${cleanUrl}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.serviceApiKey ? { 'x-api-key': cfg.serviceApiKey } : {}),
      },
      body: JSON.stringify({
        phone: formattedPhone,
        message,
      }),
    });

    const data = await res.json();
    if (res.ok && data.ok) {
      return { success: true, message: 'Đã đưa tin nhắn vào hàng chờ gửi Zalo cá nhân thành công!', jobId: data.jobId };
    } else {
      return { success: false, message: data.error || 'Lỗi khi gửi qua Zalo Service' };
    }
  } catch (err: any) {
    return { success: false, message: `Lỗi kết nối tới Zalo Service: ${err.message}` };
  }
}

/**
 * Bắt đầu lấy mã QR đăng nhập từ Zalo Personal Gateway (/login/start)
 */
export async function startZaloPersonalLogin(): Promise<{ ok: boolean; qrRaw?: string; qrImage?: string; error?: string }> {
  const cfg = getZaloConfig();
  if (!cfg.serviceUrl) {
    return { ok: false, error: 'Chưa điền URL Zalo Service' };
  }

  const cleanUrl = cfg.serviceUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${cleanUrl}/login/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.serviceApiKey ? { 'x-api-key': cfg.serviceApiKey } : {}),
      },
    });

    const data = await res.json();
    return data;
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Kiểm tra trạng thái mã QR đăng nhập (/login/state)
 */
export async function checkZaloPersonalLoginState(): Promise<{ status: string; sessionBase64?: string; error?: string }> {
  const cfg = getZaloConfig();
  if (!cfg.serviceUrl) return { status: 'idle' };

  const cleanUrl = cfg.serviceUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${cleanUrl}/login/state`, {
      method: 'GET',
      headers: cfg.serviceApiKey ? { 'x-api-key': cfg.serviceApiKey } : {},
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { status: 'error', error: err.message };
  }
}

