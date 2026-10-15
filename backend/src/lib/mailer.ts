import dns from 'node:dns';
import nodemailer from 'nodemailer';

const smtpHost = process.env['SMTP_HOST'];
let cachedMailer: ReturnType<typeof nodemailer.createTransport> | null = null;

const getMailer = async () => {
  if (!smtpHost) return null;
  if (cachedMailer) return cachedMailer;
  // Resuelve por IPv4 a mano: Nodemailer elige al azar entre A/AAAA y Railway no tiene salida IPv6.
  const { address } = await dns.promises.lookup(smtpHost, { family: 4 });
  const smtpPort = Number(process.env['SMTP_PORT'] ?? 587);
  // El puerto 465 exige TLS implícito desde el saludo inicial; si no coincide con "secure" el handshake se cuelga.
  const secure = smtpPort === 465 ? true : process.env['SMTP_SECURE'] === 'true';
  cachedMailer = nodemailer.createTransport({
    host: address,
    port: smtpPort,
    secure,
    auth: { user: process.env['SMTP_USER'], pass: process.env['SMTP_PASS'] },
    tls: { servername: smtpHost },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
  return cachedMailer;
};

const mailFrom = process.env['MAIL_FROM'] ?? process.env['SMTP_USER'];

const parseFromHeader = (from: string) => {
  const match = from.match(/^(.*)<(.+)>$/);
  return match ? { name: match[1]!.trim().replace(/^"|"$/g, ''), email: match[2]!.trim() } : { email: from.trim() };
};

const sendViaBrevo = async (apiKey: string, email: string, subject: string, text: string) => {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: parseFromHeader(mailFrom ?? ''), to: [{ email }], subject, textContent: text }),
  });
  if (!response.ok) throw new Error(`Brevo respondió ${response.status}: ${await response.text()}`);
};

export const sendCode = async (email: string, subject: string, code: string, action: string) => {
  const text = `ROS-TOB\n\nTu código para ${action} es: ${code}\n\nVence en 10 minutos.`;
  const brevoKey = process.env['BREVO_API_KEY'];
  // Railway bloquea las conexiones SMTP salientes; Brevo entrega por HTTPS, que sí funciona ahí.
  if (brevoKey) { await sendViaBrevo(brevoKey, email, subject, text); return; }
  const mailer = await getMailer();
  if (!mailer || !mailFrom) throw new Error('El servicio de correo no está configurado.');
  await mailer.sendMail({ from: mailFrom, to: email, subject, text });
};
