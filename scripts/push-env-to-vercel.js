#!/usr/bin/env node
/**
 * Push all .env variables to Vercel production environment cleanly trimmed.
 * Usage: node scripts/push-env-to-vercel.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env');
const content = fs.readFileSync(envFile, 'utf-8');

const envVars = {};
let currentKey = null;
let currentValue = '';
let inMultiLine = false;

for (const line of content.split('\n')) {
  const trimmed = line.trim();

  // Skip comments and empty lines
  if (!inMultiLine && (trimmed.startsWith('#') || trimmed === '')) continue;

  if (!inMultiLine) {
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    currentKey = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();

    // Check if value starts with a quote and doesn't end with one (multi-line)
    if (val.startsWith('"') && !val.endsWith('"')) {
      inMultiLine = true;
      currentValue = val;
      continue;
    }

    // Remove surrounding quotes if present
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }

    envVars[currentKey] = val.trim();
  } else {
    currentValue += '\n' + line;
    if (line.trimEnd().endsWith('"')) {
      inMultiLine = false;
      let val = currentValue;
      if (val.startsWith('"')) val = val.slice(1);
      if (val.endsWith('"')) val = val.slice(0, -1);
      envVars[currentKey] = val.trim();
      currentKey = null;
      currentValue = '';
    }
  }
}

console.log(`Found ${Object.keys(envVars).length} environment variables to push:\n`);

for (const [key, value] of Object.entries(envVars)) {
  const displayValue = value.length > 60 ? value.substring(0, 60) + '...' : value;
  console.log(`  ${key} = ${displayValue}`);
}

console.log('\nPushing to Vercel production...\n');

let successCount = 0;
let errorCount = 0;

for (const [key, value] of Object.entries(envVars)) {
  const cleanVal = value.trim();
  try {
    // Remove existing env var first
    try {
      execSync(`npx vercel env rm ${key} production --yes`, {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe',
      });
    } catch {
      // Ignore
    }

    // Add env var using input stream with zero newlines
    execSync(`npx vercel env add ${key} production`, {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      input: cleanVal,
    });

    console.log(`  ✓ ${key}`);
    successCount++;
  } catch (err) {
    console.error(`  ✗ ${key}: ${err.message}`);
    errorCount++;
  }
}

console.log(`\nDone! ${successCount} pushed, ${errorCount} errors.`);
