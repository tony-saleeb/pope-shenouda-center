const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { timingSafeEqual } = require('crypto');

const BOT_TOKEN = process.env.WHATSAPP_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('WHATSAPP_BOT_TOKEN is required');
  process.exit(1);
}

function findChromeInCache(dir) {
  if (!fs.existsSync(dir)) return null;
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        const res = findChromeInCache(fullPath);
        if (res) return res;
      } else if (file.name.toLowerCase() === 'chrome.exe' || file.name.toLowerCase() === 'msedge.exe') {
        return fullPath;
      }
    }
  } catch {
    // Ignore access errors
  }
  return null;
}

function getExecutablePath() {
  const userHome = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(userHome, 'AppData', 'Local');

  const directPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(localAppData, 'Microsoft\\Edge\\Application\\msedge.exe'),
    process.env.CHROME_PATH,
  ].filter(Boolean);

  for (const p of directPaths) {
    if (fs.existsSync(p)) {
      console.log(`Using browser executable at: ${p}`);
      return p;
    }
  }

  // Check Puppeteer cache directory
  const puppeteerCache = path.join(userHome, '.cache', 'puppeteer');
  const cachedChrome = findChromeInCache(puppeteerCache);
  if (cachedChrome) {
    console.log(`Using cached Puppeteer Chrome at: ${cachedChrome}`);
    return cachedChrome;
  }

  return undefined;
}

const app = express();
app.use(express.json());

function requireBotAuth(req, res, next) {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const expected = Buffer.from(BOT_TOKEN, 'utf8');
  const actual = Buffer.from(provided, 'utf8');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const executablePath = getExecutablePath();
if (!executablePath) {
  console.warn('⚠️ Warning: No Chrome or Edge executable found automatically. Puppeteer will attempt default launch.');
}

const puppeteerOptions = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
  ],
};

if (executablePath) {
  puppeteerOptions.executablePath = executablePath;
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.whatsapp-auth' }),
  puppeteer: puppeteerOptions,
});

let isReady = false;

client.on('qr', (qr) => {
  console.log('\n======================================================');
  console.log('📱 SCAN THIS QR CODE WITH YOUR WHATSAPP TO CONNECT:');
  console.log('======================================================\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  isReady = true;
  console.log('\n======================================================');
  console.log('🚀 WHATSAPP BOT IS READY AND CONNECTED!');
  console.log('======================================================\n');
});

client.on('auth_failure', (msg) => {
  console.error('WhatsApp Auth failure:', msg);
});

client.on('disconnected', (reason) => {
  isReady = false;
  console.log('WhatsApp Disconnected:', reason);
});

app.post('/send-ticket', requireBotAuth, async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp bot is not connected yet' });
  }

  const { phone, registrantId, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'Missing phone or message' });
  }

  // Format Egyptian / International phone number
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '20' + cleanPhone.substring(1);
  }
  if (!cleanPhone.startsWith('20') && cleanPhone.length === 10) {
    cleanPhone = '20' + cleanPhone;
  }

  const chatId = `${cleanPhone}@c.us`;

  try {
    await client.sendMessage(chatId, message);
    console.log(`✓ Sent ticket to ${cleanPhone}`);
    return res.json({ success: true, phone: cleanPhone });
  } catch (err) {
    console.error(`✗ Failed to send to ${cleanPhone}:`, err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

const PORT = process.env.PORT || 3001;
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';
app.listen(PORT, BIND_HOST, () => {
  console.log(`WhatsApp Bot Webhook Server running on http://${BIND_HOST}:${PORT}`);
});

client.initialize();
