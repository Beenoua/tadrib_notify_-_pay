import TelegramBot from 'node-telegram-bot-api';
import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

// 2. إعدادات الأمان (يتم قراءتها من متغيرات البيئة)
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// 3. تهيئة الخدمات
let doc;

// --- ترجمات التيليغرام ---
const telegramTranslations = {
  ar: {
    title: "✅ **حجز مدفوع جديد (Tadrib.ma)** 💳",
    course: "**الدورة:**",
    qualification: "**المؤهل:**",
    experience: "**الخبرة:**",
    name: "**الاسم:**",
    phone: "**الهاتف:**",
    email: "**الإيميل:**",
    time: "**الوقت:**",
    status: "**الحالة:**",
    tx_id: "**رقم المعاملة:**"
  },
  fr: {
    title: "✅ **Nouvelle Réservation Payée (Tadrib.ma)** 💳",
    course: "**Formation:**",
    qualification: "**Qualification:**",
    experience: "**Expérience:**",
    name: "**Nom:**",
    phone: "**Téléphone:**",
    email: "**E-mail:**",
    time: "**Heure:**",
    status: "**Statut:**",
    tx_id: "**ID Transaction:**"
  },
  en: {
    title: "✅ **New Paid Booking (Tadrib.ma)** 💳",
    course: "**Course:**",
    qualification: "**Qualification:**",
    experience: "**Experience:**",
    name: "**Name:**",
    phone: "**Phone:**",
    email: "**Email:**",
    time: "**Time:**",
    status: "**Status:**",
    tx_id: "**Transaction ID:**"
  }
};

/**
 * دالة المصادقة مع Google Sheets
 */
async function authGoogleSheets() {
  const serviceAccountAuth = new JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'), // Ensure key is treated correctly
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });

  doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, serviceAccountAuth);
  await doc.loadInfo(); // تحميل معلومات الملف
}

/**
 * هذه هي الدالة الرئيسية التي تستقبل الطلبات (Webhooks)
 */
export default async (req, res) => {
  
  // --- إعدادات CORS (جيدة للطلبات من المتصفح، لكن الـ Webhook لا يحتاجها) ---
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- الحماية: قبول طلبات POST فقط ---
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  let bot;

  try {
    // تهيئة البوت
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
    
    // 1. استقبال البيانات من YouCanPay Webhook
    const payload = req.body;

    // --- 2. التحقق من البيانات الأساسية ---
    // إذا لم تكن عملية دفع ناجحة، تجاهلها وأرسل رداً ناجحاً (200)
    if (payload.status !== 'paid') {
      return res.status(200).json({ result: 'success', message: 'Ignoring non-paid status.' });
    }

    // إذا كانت البيانات الأساسية مفقودة
    if (!payload.metadata || !payload.customer || !payload.id) {
      console.error('Invalid Webhook payload: Missing metadata, customer, or id', payload);
      // أرسل 200 حتى لا يعيد YouCanPay إرسال الـ Webhook الخاطئ
      return res.status(200).json({ result: 'error', message: 'Ignoring invalid payload.' });
    }

    // --- 3. [الحل] "ترجمة" بيانات YouCanPay إلى الهيكل الذي نريده ---
    const data = {
      timestamp: payload.created_at || new Date().toLocaleString('fr-CA'),
      inquiryId: payload.order_id || payload.metadata.inquiryId, // order_id هو الأفضل
      clientName: payload.customer.name,
      clientEmail: payload.customer.email,
      clientPhone: payload.customer.phone,
      selectedCourse: payload.metadata.course,
      qualification: payload.metadata.qualification,
      experience: payload.metadata.experience,
      paymentStatus: payload.status,
      transactionId: payload.id, // هذا هو رقم المعاملة
      currentLang: 'fr', // الافتراضي للإشعارات
      // بيانات UTM غير مدعومة في YouCanPay metadata، لذا ستكون فارغة
      utm_source: '',
      utm_medium: '',
      utm_campaign: '',
      utm_term: '',
      utm_content: ''
    };
    // --- نهاية الحل ---
    
    const lang = data.currentLang;
    const t = telegramTranslations[lang];

    // --- 4. المهمة الأولى: حفظ البيانات في Google Sheets ---
    await authGoogleSheets();
    
    let sheet = doc.sheetsByTitle["Leads"];
    if (!sheet) {
        sheet = await doc.addSheet({ title: "Leads" });
    }

    // هذه هي العناوين التي تتطابق مع كود Google Apps Script الذي أرسلته
    const headers = [
      "Timestamp", "Inquiry ID", "Full Name", "Email", "Phone Number",
      "Selected Course", "Qualification", "Experience",
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "Payment Status", "Transaction ID" // أضفنا الحقول الجديدة
    ];

    await sheet.loadHeaderRow();

    if (sheet.headerValues.length === 0) {
        await sheet.setHeaderRow(headers);
    }
    
    // استخدام كائن "data" المترجم
    await sheet.addRow({
      "Timestamp": data.timestamp,
      "Inquiry ID": data.inquiryId,
      "Full Name": data.clientName,
      "Email": data.clientEmail,
      "Phone Number": data.clientPhone,
      "Selected Course": data.selectedCourse,
      "Qualification": data.qualification,
      "Experience": data.experience,
      "utm_source": data.utm_source,
      "utm_medium": data.utm_medium,
      "utm_campaign": data.utm_campaign,
      "utm_term": data.utm_term,
      "utm_content": data.utm_content,
      "Payment Status": data.paymentStatus,
      "Transaction ID": data.transactionId
    });

    // --- 5. المهمة الثانية: إرسال إشعار فوري عبر Telegram ---
    const message = `
      ${t.title}
      -----------------------------------
      ${t.course} ${data.selectedCourse}
      ${t.qualification} ${data.qualification}
      ${t.experience} ${data.experience}
      -----------------------------------
      ${t.name} ${data.clientName}
      ${t.phone} ${data.clientPhone}
      ${t.email} ${data.clientEmail}
      -----------------------------------
      ${t.status} ${data.paymentStatus}
      ${t.tx_id} ${data.transactionId}
      ${t.time} ${data.timestamp}
    `;
    
    await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });

    // --- 6. إرسال رد "نجاح" إلى YouCanPay ---
    // هذا مهم جداً ليتحول الحقل "STATUT" في سجل الـ Webhook إلى "Succès"
    res.status(200).json({ result: 'success', message: 'Webhook received and processed.' });

  } catch (error) {
    // إذا حدث خطأ (مثل خطأ في متغيرات البيئة)، قم بتسجيله
    console.error('Error processing Webhook:', error);
    
    try {
      if (!bot) {
        bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
      }
      // إرسال إشعار خطأ إلى Telegram
      await bot.sendMessage(TELEGRAM_CHAT_ID, `❌ حدث خطأ في معالجة Webhook:\n${error.message}`);
    } catch (telegramError) {
      console.error('CRITICAL: Failed to send error to Telegram:', telegramError);
    }
    
    // إرسال رد خطأ (سيجعل YouCanPay يعيد المحاولة)
    res.status(500).json({ result: 'error', message: 'Internal Server Error', details: error.toString() });
  }
};
