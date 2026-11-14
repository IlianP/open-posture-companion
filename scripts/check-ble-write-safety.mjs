#!/usr/bin/env node
/**
 * Firmware-safety tripwire (ADR-006).
 *
 * The Upright GO 1 accepts firmware writes without any integrity check and
 * has been bricked that way; the hardware is irreplaceable. The protocol
 * reference is explicit: never write to the aae0 service, never write to a
 * characteristic you cannot name.
 *
 * This check makes that rule mechanical for every change that reaches this
 * fork — own work and upstream updates alike. It fails when
 *
 *   1. src/ names a GATT UUID that is not on the reviewed list below, or
 *   2. a BLE write targets anything but the five characteristics whose
 *      writes are hardware-verified, or a write call site appears that this
 *      script has not seen before.
 *
 * A failure is not necessarily a bug: it means a human has to compare the
 * change against PROTOCOL.md in
 * https://github.com/niltonheck/upright-go-1-reverse-engineering and then
 * extend the lists here in the same pull request.
 *
 * Usage: node scripts/check-ble-write-safety.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const CHARACTERISTICS_FILE = 'src/device/characteristics.ts';

/** Every GATT UUID the app may name, as 16-bit short forms. */
const REVIEWED_UUIDS = new Set([
  // Services
  '180a', 'aaa0', 'aab0', 'aac0', 'aad0', 'aae0',
  // Read / notify only
  'aaa2', 'aab2', 'aab3', 'aac3', 'aac5', 'aac6', 'aac9', 'aaca', 'aad2',
  // Read only, although it sits in the suspected firmware service
  'aae1',
  // Written by the app — see WRITABLE below
  'aab1', 'aac7', 'aad3', 'aad4', 'aad6',
]);

/**
 * Never acceptable, whatever the lists above say: the remaining members of
 * the suspected firmware/OTA service and the one write-only characteristic
 * nobody has ever written to.
 */
const FORBIDDEN_UUIDS = new Set(['aae2', 'aae3', 'aae4', 'aae5', 'aaa4']);

/** Characteristics with hardware-verified writes, by name and UUID. */
const WRITABLE = new Map([
  ['calibrate', 'aab1'],
  ['pauseMode', 'aac7'],
  ['vibration', 'aad3'],
  ['ledRed', 'aad4'],
  ['ledGreen', 'aad6'],
]);

/**
 * Write calls whose target is a variable rather than a literal
 * `Characteristic.<name>`, per file. Both live in the device layer: the
 * single transport call inside UprightGoDevice.write(), and setLED(), which
 * picks between the two LED characteristics on the line above its call.
 */
const INDIRECT_WRITE_CALLS = new Map([['src/device/UprightGoDevice.ts', 2]]);

/** ble-plx write APIs plus the device layer's own write() helper. */
const WRITE_CALL =
  /(?<![\w$])(?:this\.write|(?:[\w$]+\.)*write(?:Characteristic|Descriptor|With)[\w$]*)\s*\(/g;

/**
 * Short UUIDs: anything handed to fullUUID(), plus bare string literals in
 * the device's vendor range (aaXX), where all of its services live.
 */
const SHORT_UUID = /fullUUID\(\s*['"`]([0-9a-f]{4})['"`]\s*\)|['"`](aa[0-9a-f]{2})['"`]/gi;
const LONG_UUID = /\b0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb\b/gi;
const FOREIGN_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const problems = [];

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Text between the parenthesis at `open` and its matching close. */
function callArguments(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') {
      depth += 1;
    } else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(open + 1, i);
      }
    }
  }
  return text.slice(open + 1);
}

function checkUuids(file, text) {
  const inDeviceLayer = file.startsWith('src/device/');
  const seen = [];
  for (const match of text.matchAll(SHORT_UUID)) {
    seen.push([(match[1] ?? match[2]).toLowerCase(), match.index]);
  }
  for (const match of text.matchAll(LONG_UUID)) {
    seen.push([match[1].toLowerCase(), match.index]);
  }
  for (const [uuid, index] of seen) {
    const where = `${file}:${lineOf(text, index)}`;
    if (FORBIDDEN_UUIDS.has(uuid)) {
      problems.push(`${where} names ${uuid}, which must never be touched.`);
    } else if (!REVIEWED_UUIDS.has(uuid)) {
      problems.push(`${where} names GATT UUID ${uuid}, which is not on the reviewed list.`);
    } else if (!inDeviceLayer) {
      problems.push(`${where} names GATT UUID ${uuid} outside src/device/ (ADR-002).`);
    }
  }
  for (const match of text.matchAll(FOREIGN_UUID)) {
    if (!LONG_UUID.test(match[0])) {
      problems.push(
        `${file}:${lineOf(text, match.index)} names the vendor UUID ${match[0]}, which is not on the reviewed list.`,
      );
    }
    LONG_UUID.lastIndex = 0;
  }
}

function checkWrites(file, text) {
  let indirect = 0;
  for (const match of text.matchAll(WRITE_CALL)) {
    // A method declaration ("async write(uuid: string, …) {") is not a call.
    const before = text.slice(0, match.index);
    if (/(?:async|private|public|protected|function)\s+$/.test(before)) {
      continue;
    }
    const where = `${file}:${lineOf(text, match.index)}`;
    const args = callArguments(text, match.index + match[0].length - 1);
    const targets = [...args.matchAll(/\bCharacteristic\.([\w$]+)/g)].map((m) => m[1]);
    if (targets.length === 0) {
      indirect += 1;
      continue;
    }
    for (const target of targets) {
      if (!WRITABLE.has(target)) {
        problems.push(`${where} writes to Characteristic.${target}, which is not a verified write target.`);
      }
    }
  }
  const expected = INDIRECT_WRITE_CALLS.get(file) ?? 0;
  if (indirect !== expected) {
    problems.push(
      `${file} has ${indirect} write call(s) with a variable target, expected ${expected}. ` +
        'Check where each target comes from.',
    );
  }
}

/** The writable names must still point at the UUIDs that were verified. */
function checkWritableMapping(text) {
  for (const [name, uuid] of WRITABLE) {
    const match = text.match(
      new RegExp(`\\b${name}:\\s*fullUUID\\(\\s*['"\`]([0-9a-f]{4})['"\`]\\s*\\)`, 'i'),
    );
    if (!match) {
      problems.push(`${CHARACTERISTICS_FILE} no longer defines Characteristic.${name}.`);
    } else if (match[1].toLowerCase() !== uuid) {
      problems.push(
        `${CHARACTERISTICS_FILE} maps Characteristic.${name} to ${match[1]}, expected ${uuid}.`,
      );
    }
  }
}

const files = sourceFiles(SRC);
for (const path of files) {
  const file = relative(ROOT, path).split(sep).join('/');
  const text = readFileSync(path, 'utf8');
  checkUuids(file, text);
  checkWrites(file, text);
  if (file === CHARACTERISTICS_FILE) {
    checkWritableMapping(text);
  }
}
if (!files.some((path) => path.endsWith(CHARACTERISTICS_FILE.split('/').join(sep)))) {
  problems.push(`${CHARACTERISTICS_FILE} is missing — the check cannot vouch for the write targets.`);
}

if (problems.length > 0) {
  console.error('BLE write-safety check FAILED:\n');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error(
    '\nWrites to the wrong characteristic can permanently brick the device.\n' +
      'Compare the change with PROTOCOL.md in\n' +
      'https://github.com/niltonheck/upright-go-1-reverse-engineering and only then\n' +
      'extend the lists in scripts/check-ble-write-safety.mjs.',
  );
  process.exit(1);
}

console.log(
  `BLE write-safety check passed: ${files.length} files, writes limited to ` +
    `${[...WRITABLE.values()].join(', ')}.`,
);
