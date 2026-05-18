const fs = require('fs');
const os = require('os');
const path = require('path');

function readEnvApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.trim();
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const text = fs.readFileSync(envPath, 'utf8');
    const m = text.match(/EXPO_PUBLIC_API_URL=(.+)/);
    if (m) return m[1].trim();
  } catch {
    /* no .env */
  }
  return null;
}

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const net of ifaces || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

const ip = getLanIp();
const port = process.env.RCT_METRO_PORT || '8081';

console.log('');
console.log('=== Haazir AI — connect phone to Metro ===');
console.log('');
console.log('IMPORTANT: Do NOT use the phone Camera / back camera app.');
console.log('Use Expo Go → "Scan QR code" inside the Expo Go app.');
console.log('');
console.log('Expo Go must be SDK 55 (Play Store is still SDK 54):');
console.log('  https://expo.dev/go?sdkVersion=55&platform=android&device=true');
console.log('');
if (ip) {
  console.log(`Manual URL (Expo Go → Enter URL):  exp://${ip}:${port}`);
  console.log(`Browser test on phone:             http://${ip}:${port}`);
} else {
  console.log('Could not detect LAN IP. Run: ipconfig  and use your Wi-Fi IPv4.');
}
console.log('');
console.log('Start dev server:  npm run start:lan');
console.log('If Wi-Fi fails:    npm run start:tunnel');
console.log('USB Android:       npm run start:usb   (phone via USB, adb reverse)');
console.log('');
const api = readEnvApiUrl() || '(set EXPO_PUBLIC_API_URL in mobile/.env)';
const backendCmd =
  'python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080  (from HaazirAI repo root)';
console.log('Backend API (.env):', api);
console.log('Backend must run:  ', backendCmd);
console.log('Phone test:         open', String(api).replace(/\/$/, '') + '/health');
console.log('');
