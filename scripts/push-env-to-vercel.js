#!/usr/bin/env node
/**
 * Push all .env variables to Vercel production environment.
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
    
    currentKey = trimmed.substring(0, eqIdx);
    let val = trimmed.substring(eqIdx + 1);
    
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
    
    envVars[currentKey] = val;
  } else {
    currentValue += '\n' + line;
    if (line.trimEnd().endsWith('"')) {
      inMultiLine = false;
      // Remove surrounding quotes
      let val = currentValue;
      if (val.startsWith('"')) val = val.slice(1);
      if (val.endsWith('"')) val = val.slice(0, -1);
      envVars[currentKey] = val;
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
  try {
    // Remove existing env var first (ignore errors if it doesn't exist)
    try {
      execSync(`npx vercel env rm ${key} production --yes 2>nul`, { 
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe',
      });
    } catch {
      // Ignore - variable may not exist yet
    }
    
    // Add the env var using echo pipe
    execSync(`echo ${JSON.stringify(value)} | npx vercel env add ${key} production`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      input: value,
    });
    
    console.log(`  ✓ ${key}`);
    successCount++;
  } catch (err) {
    console.error(`  ✗ ${key}: ${err.message}`);
    errorCount++;
  }
}

console.log(`\nDone! ${successCount} pushed, ${errorCount} errors.`);
