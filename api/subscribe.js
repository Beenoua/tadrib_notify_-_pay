import axios from 'axios';

// جلب الرابط السري لـ Brevo من متغيرات البيئة
const BREVO_FORM_ACTION_URL = process.env.BREVO_FORM_ACTION_URL;
const BREVO_FORM_EMAIL_FIELD_NAME = 'EMAIL';
const BREVO_LOCALE_FIELD_NAME = 'locale';
const HONEYPOT_FIELD_NAME = 'email_address_check';

export default async (req, res) => {
    // --- [!!] بداية الإضافة: إضافة هيدرز CORS [!!] ---
    const allowedOrigins = [
      'https://tadrib.ma', 
      'https://tadrib.jaouadouarh.com', 
      'https://tadrib-pay.jaouadouarh.com', 
      'http://localhost:3000',
      'http://127.0.0.1:5500',
      'http://127.0.0.1:5501',
      'http://localhost:5500',
      'http://localhost:5501' // [!!] إضافة احترازية
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
    if (req.method === 'OPTIONS') {
        // [!!] إضافة سطر Log هنا
        console.log('CORS preflight (OPTIONS) request successful from:', origin);
        return res.status(200).end();
    }
    // --- [!!] نهاية الإضافة [!!] ---

    if (req.method !== 'POST') {
        // [!!] إضافة سطر Log هنا
        console.log(`Blocked non-POST request. Method: ${req.method}`);
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // [!!] إضافة سطر Log هنا
    console.log('POST request received. Processing subscription...');

    try {
        const { email, lang } = req.body;

        if (!email) {
            console.warn('Subscription attempt failed: No email provided.');
            return res.status(400).json({ message: 'Email is required' });
        }

        // Brevo تتوقع بيانات "form-encoded"
        const body = new URLSearchParams();
        body.append(BREVO_FORM_EMAIL_FIELD_NAME, email);
        body.append(BREVO_LOCALE_FIELD_NAME, lang || 'fr');
        body.append(HONEYPOT_FIELD_NAME, ''); 

        // [!!] إضافة سطر Log هنا
        console.log('Sending data to Brevo...');
        await axios.post(BREVO_FORM_ACTION_URL, body, {
             headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
             }
        });

        // [!!] إضافة سطر Log هنا
        console.log('Successfully subscribed email:', email);
        res.status(200).json({ result: 'success' });

    } catch (error) {
        // [!!] إضافة سطر Log هنا
        console.error('Brevo Subscription Error:', error.message);
        res.status(500).json({ result: 'error', message: error.message || 'Internal server error' });
    }
};
