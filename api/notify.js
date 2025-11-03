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
  // ... (نفس الترجمات، لا تغيير)
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
  
  // --- الحماية: قبول طلبات POST فقط ---
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  let bot;

  try {
    // تهيئة البوت
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
    
    // 1. استقبال البيانات الخام من YouCanPay Webhook
    const rawBody = req.body;

    // --- !! خطوة Debug: إرسال البيانات الخام إلى Telegram لرؤية هيكلها !! ---
    // هذا سيساعدنا إذا كانت لا تزال "undefined"
    try {
      await bot.sendMessage(TELEGRAM_CHAT_ID, `--- DEBUG: RAW WEBHOOK --- \n${JSON.stringify(rawBody, null, 2)}`);
    } catch (debugError) {
      console.error("Error sending debug message:", debugError);
    }
    // --- نهاية خطوة Debug ---


    // --- 2. [الحل] محاولة "فك المغلف" عن البيانات ---
    // يبحث الكود عن البيانات في 3 أماكن محتملة:
    // 1. req.body.payload (شائع في Webhooks)
    // 2. req.body.data (شائع أيضاً)
    // 3. req.body (إذا كانت البيانات في المستوى الأعلى)
    const payload = rawBody.payload || rawBody.data || rawBody;
    
    // --- 3. التحقق من البيانات الأساسية ---
    if (payload.status !== 'paid') {
      return res.status(200).json({ result: 'success', message: 'Ignoring non-paid status.' });
    }

    if (!payload.metadata || !payload.customer || !payload.id) {
      console.error('Invalid Webhook payload: Missing metadata, customer, or id', payload);
      return res.status(200).json({ result: 'error', message: 'Ignoring invalid payload.' });
    }

    // --- 4. "ترجمة" بيانات YouCanPay إلى الهيكل الذي نريده ---
    const data = {
      timestamp: payload.created_at || new Date().toLocaleString('fr-CA'),
      inquiryId: payload.order_id || payload.metadata.inquiryId,
      clientName: payload.customer.name,
      clientEmail: payload.customer.email,
      clientPhone: payload.customer.phone,
      selectedCourse: payload.metadata.course,
      qualification: payload.metadata.qualification,
      experience: payload.metadata.experience,
      paymentStatus: payload.status,
      transactionId: payload.id,
      currentLang: 'fr',
      utm_source: '',
      utm_medium: '',
      utm_campaign: '',
      utm_term: '',
      utm_content: ''
    };
    
    const lang = data.currentLang;
    const t = telegramTranslations[lang];

    // --- 5. المهمة الأولى: حفظ البيانات في Google Sheets ---
    await authGoogleSheets();
    
    let sheet = doc.sheetsByTitle["Leads"];
    if (!sheet) {
        sheet = await doc.addSheet({ title: "Leads" });
    }

    const headers = [
      "Timestamp", "Inquiry ID", "Full Name", "Email", "Phone Number",
      "Selected Course", "Qualification", "Experience",
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "Payment Status", "Transaction ID"
    ];

    await sheet.loadHeaderRow();

    if (sheet.headerValues.length === 0) {
        await sheet.setHeaderRow(headers);
    }
    
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

    // --- 6. المهمة الثانية: إرسال إشعار فوري عبر Telegram ---
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

    // --- 7. إرسال رد "نجاح" إلى YouCanPay ---
    res.status(200).json({ result: 'success', message: 'Webhook received and processed.' });

  } catch (error) {
    console.error('Error processing Webhook:', error);
    
    try {
      if (!bot) {
        bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
      }
      await bot.sendMessage(TELEGRAM_CHAT_ID, `❌ حدث خطأ في معالجة Webhook:\n${error.message}`);
    } catch (telegramError) {
      console.error('CRITICAL: Failed to send error to Telegram:', telegramError);
    }
    
    res.status(200).json({ result: 'error', message: 'Webhook received but failed to process internally.', details: error.toString() });
  }
};
