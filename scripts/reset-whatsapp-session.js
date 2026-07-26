const fs = require('fs');
const path = require('path');

const authPath = path.join(__dirname, '..', '.whatsapp-auth');
const cachePath = path.join(__dirname, '..', '.wwebjs_cache');

console.log('🔄 Disconnecting WhatsApp session...');

if (fs.existsSync(authPath)) {
  try {
    fs.rmSync(authPath, { recursive: true, force: true });
    console.log('✓ Old WhatsApp session cleared.');
  } catch (err) {
    console.error('Note: Could not delete .whatsapp-auth immediately (file may be in use). Please close any running bot terminal first.');
  }
}

if (fs.existsSync(cachePath)) {
  try {
    fs.rmSync(cachePath, { recursive: true, force: true });
    console.log('✓ Old Web cache cleared.');
  } catch (err) {
    // Ignore cache lock
  }
}

console.log('\n✅ Successfully disconnected!');
console.log('👉 Now run `npm run whatsapp-bot` to scan the QR code with your NEW phone number.\n');
