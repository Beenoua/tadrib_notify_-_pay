// --- تم التعديل: استخدام 'import' بدلاً من 'require' ---
import axios from 'axios';
import { Buffer } from 'buffer'; // إضافة Buffer

// 2. إعدادات الأمان (يتم قراءتها من متغيرات البيئة)
const YOUCAN_PRIVATE_KEY = process.env.YOUCAN_PRIVATE_KEY; 
const YOUCAN_PUBLIC_KEY = process.env.YOUCAN_PUBLIC_KEY; 
const YOUCAN_MODE = process.env.YOUCAN_MODE;

// إعدادات الدورات (يجب أن تكون الأسعار هنا في الخادم للأمان)
const courseData = {
    pmp: { originalPrice: 2800 },
    planning: { originalPrice: 2800 },
    qse: { originalPrice: 2450 },
    softskills: { originalPrice: 1700 }
};
const discountPercentage = 35; // نسبة الخصم

/**
 * هذه هي الدالة الرئيسية التي تستقبل طلبات إنشاء الدفع
 */
// --- تم التعديل: استخدام 'export default' بدلاً من 'module.exports' ---
export default async (req, res) => {
  
  // ===================================
  //           **إعدادات CORS**
  // ===================================
  const allowedOrigins = [
    'https://tadrib.ma', 
    'https://tadrib.jaouadouarh.com', 
    'http://localhost:3000', // للتجارب المحلية
    'http://127.0.0.1:5500', // للتجارب المحلية
    'http://127.0.0.1:5501' // إضافة منفذ آخر للتجارب
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  // ===================================

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // ! ===================================
    // !           **هذا هو الإصلاح**
    // ! Vercel يحلل JSON تلقائياً، لا نستخدم JSON.parse()
    // ! ===================================
    const data = req.body; 

    // 1. التحقق من الدورة وحساب السعر (في الخادم)
    const courseKey = data.courseKey; 
    if (!courseData[courseKey]) {
        throw new Error('Course not found');
    }
    const originalPrice = courseData[courseKey].originalPrice;
    const amount = Math.round((originalPrice * (1 - discountPercentage / 100)) / 50) * 50;

    // 2. تهيئة YouCanPay
    const keys = `${YOUCAN_PUBLIC_KEY}:${YOUCAN_PRIVATE_KEY}`;
    const base64Keys = Buffer.from(keys).toString('base64');
    
    // --- =================================== ---
    // ---           **هذا هو التصحيح** ---
    // --- =================================== ---
    // تحديد الرابط الأساسي بناءً على وضع التشغيل
    const isSandbox = YOUCAN_MODE === 'sandbox';
    const youcanApiBaseUrl = isSandbox ? 'https://youcanpay.com/sandbox/api' : 'https://youcanpay.com/api';
    // --- =================================== ---
    // ---         نهاية التصحيح              ---
    // --- =================================== ---

    // 3. إنشاء "Token" للدفع
    // --- تم تعديل الرابط هنا ---
    const tokenResponse = await axios.post(`${youcanApiBaseUrl}/tokenize`, {
        pri_key: YOUCAN_PRIVATE_KEY, // <-- **تمت إضافة المفتاح السري هنا**
        amount: amount * 100, 
        currency: "MAD",
        order_id: data.inquiryId, 
        customer: {
            name: data.clientName,
            email: data.clientEmail,
            phone: data.clientPhone
        },
        metadata: {
            course: data.selectedCourse,
            qualification: data.qualification,
            experience: data.experience,
            inquiryId: data.inquiryId
        },
        redirect_url: `http://127.0.0.1:5501/index-00.html/#payment-success`, 
        error_url: `http://127.0.0.1:5501/index-00.html/#payment-failed`      
    }, {
        headers: {
            // 'Authorization': `Basic ${base64Keys}`, // قد لا تكون مطلوبة إذا كان المفتاح في البودي
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });

    if (!tokenResponse.data || !tokenResponse.data.token) {
        // إظهار رسالة خطأ أكثر تفصيلاً إذا فشل إنشاء التوكن
        console.error('YouCanPay API Error:', tokenResponse.data);
        throw new Error(tokenResponse.data.message || 'Failed to create YouCanPay token');
    }

    const tokenId = tokenResponse.data.token.id;

    // 4. إرجاع "Token ID" إلى الواجهة الأمامية
    res.status(200).json({ result: 'success', tokenId: tokenId });

  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error('Payment Initialization Error:', errorData);
    res.status(500).json({ result: 'error', message: 'Internal Server Error', details: errorData });
  }
};

