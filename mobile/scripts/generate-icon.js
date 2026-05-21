/**
 * Haazir AI — Icon Generator
 * Run: node scripts/generate-icon.js
 * Creates icon.png and adaptive-icon.png in assets/
 */
const fs = require('fs');
const path = require('path');

// SVG: blue background + white handshake
const makeSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#1A6FFF" rx="${size * 0.18}"/>
  <!-- Handshake icon (scaled to fit) -->
  <g transform="translate(${size * 0.12}, ${size * 0.28}) scale(${size / 512})">
    <path fill="white" d="M256 48C141.1 48 48 141.1 48 256s93.1 208 208 208 208-93.1 208-208S370.9 48 256 48zm0 384c-97.2 0-176-78.8-176-176S158.8 80 256 80s176 78.8 176 176-78.8 176-176 176z"/>
    <!-- Simplified handshake shape -->
    <path fill="white" d="
      M340 180
      C330 170 310 168 295 175
      L255 195
      L215 175
      C200 168 180 170 170 180
      L140 210
      C130 220 130 235 140 245
      L170 275
      L175 270
      L215 310
      C225 320 240 322 252 316
      L258 316
      C270 322 285 320 295 310
      L335 270
      L340 275
      L370 245
      C380 235 380 220 370 210
      Z
    "/>
  </g>
</svg>`;

// Better handshake SVG
const handshakeSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#1A6FFF" rx="18"/>
  <!-- Two hands shaking - simplified geometric representation -->
  <!-- Left arm -->
  <rect x="5" y="42" width="32" height="10" rx="5" fill="white" transform="rotate(-15, 21, 47)"/>
  <!-- Left hand fingers -->
  <ellipse cx="34" cy="38" rx="7" ry="4" fill="white" transform="rotate(-20, 34, 38)"/>
  <ellipse cx="37" cy="43" rx="7" ry="4" fill="white" transform="rotate(-10, 37, 43)"/>
  <ellipse cx="37" cy="49" rx="7" ry="4" fill="white" transform="rotate(0, 37, 49)"/>
  <!-- Right arm -->
  <rect x="63" y="48" width="32" height="10" rx="5" fill="white" transform="rotate(15, 79, 53)"/>
  <!-- Right hand fingers -->
  <ellipse cx="66" cy="38" rx="7" ry="4" fill="white" transform="rotate(20, 66, 38)"/>
  <ellipse cx="63" cy="43" rx="7" ry="4" fill="white" transform="rotate(10, 63, 43)"/>
  <ellipse cx="63" cy="49" rx="7" ry="4" fill="white" transform="rotate(0, 63, 49)"/>
  <!-- Center clasped area -->
  <ellipse cx="50" cy="46" rx="10" ry="8" fill="white"/>
  <!-- Stars/sparkles -->
  <circle cx="25" cy="25" r="2.5" fill="white" opacity="0.7"/>
  <circle cx="75" cy="25" r="2.5" fill="white" opacity="0.7"/>
  <circle cx="50" cy="20" r="2" fill="white" opacity="0.6"/>
  <!-- "H" letter subtle -->
  <text x="50" y="80" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="16" font-weight="900" fill="white" opacity="0.9">HAAZIR</text>
</svg>`;

const assetsDir = path.join(__dirname, '..', 'assets');

// Write SVG files (can be used directly or converted)
fs.writeFileSync(path.join(assetsDir, 'icon.svg'), handshakeSvg(1024));
fs.writeFileSync(path.join(assetsDir, 'adaptive-icon.svg'), handshakeSvg(1024));

console.log('✅ SVG icons generated in assets/');
console.log('');
console.log('📋 NEXT STEP — Convert to PNG:');
console.log('   Option 1 (Easy): Go to https://svgtopng.com/');
console.log('     - Upload assets/icon.svg');
console.log('     - Set size: 1024x1024');
console.log('     - Download → save as assets/icon.png');
console.log('     - Repeat for adaptive-icon.svg → assets/adaptive-icon.png');
console.log('');
console.log('   Option 2: Install sharp and re-run:');
console.log('     npm install sharp --save-dev');
console.log('     node scripts/generate-icon.js');
