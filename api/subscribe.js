import axios from 'axios';

// جلب الرابط السري لـ Brevo من متغيرات البيئة
const BREVO_FORM_ACTION_URL = process.env.BREVO_FORM_ACTION_URL;
const BREVO_FORM_EMAIL_FIELD_NAME = 'EMAIL';
const BREVO_LOCALE_FIELD_NAME = 'locale';
const HONEYPOT_FIELD_NAME = 'email_address_check';

export default async (req, res) => {
    // قبول طلبات POST فقط
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { email, lang } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Brevo تتوقع بيانات "form-encoded"
        const body = new URLSearchParams();
        body.append(BREVO_FORM_EMAIL_FIELD_NAME, email);
        body.append(BREVO_LOCALE_FIELD_NAME, lang || 'fr');
        body.append(HONEYPOT_FIELD_NAME, ''); // ملء فخ البوتات بقيمة فارغة

        // الخادم يتصل بـ Brevo
        // لا نحتاج "mode: no-cors" هنا لأن هذا اتصال من خادم لخادم
        await axios.post(BREVO_FORM_ACTION_URL, body, {
             headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
             }
        });

        // إرسال رد نجاح إلى المتصفح
        res.status(200).json({ result: 'success' });

    } catch (error) {
        console.error('Brevo Subscription Error:', error.message);
        // إرسال رد خطأ إلى المتصفح
        res.status(500).json({ result: 'error', message: 'Internal server error' });
    }
};