#!/usr/bin/env node

/*
 * Email Sync
 * Copyright (C) 2025 Xytrix Solutions
 * Licensed under the GNU AGPLv3 or later.
 * See LICENSE for details.
 */

import { Command } from 'commander';
import { version } from '../package.json';
import Imap, { type ImapSimpleOptions } from 'imap-simple';
import { simpleParser, type ParsedMail } from 'mailparser';
import { Client as PgClient } from 'pg';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
dotenv.config();

const program = new Command();

program
  .name('email-sync')
  .description('A CLI tool for email synchronization')
  .version(version)
  .showHelpAfterError('(add --help for additional information)');

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env variable: ${key}`);
  return val;
}

const imapConfig: ImapSimpleOptions = {
  imap: {
    user: requireEnv('IMAP_USER'),
    password: requireEnv('IMAP_PASS'),
    host: requireEnv('IMAP_HOST'),
    port: Number(requireEnv('IMAP_PORT')),
    tls: (requireEnv('IMAP_TLS') ?? 'true') === 'true',
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 10000,
  },
};

// Internal parsed structure from HTML/text extractors
type Extracted = {
  name?: string | null;
  email?: string | null;
  number?: string | null;
  make?: string | null;
  model?: string | null;
  vrm?: string | null;
  fuelType?: string | null;
  postcode?: string | null;
  engineSize?: string | null;
  additionalNote?: string | null;
  part?: string | null;
  partSupplied?: string | null;
  supplyOnly?: string | null;
  usedCondition?: string | null;
  newCondition?: string | null;
  reconditionedCondition?: string | null;
  considerBoth?: string | null;
  considerAll?: string | null;
  vehicleDrive?: string | null;
  collectionRequired?: string | null;
  engineCode?: string | null;
  vehicleTitle?: string | null;
  vehicleSeries?: string | null;
  year?: string | null;
};

const pg = new PgClient({
  connectionString: requireEnv('DATABASE_URL'),
});

type Lead = {
  id?: number;
  name?: string;
  email?: string;
  number?: string;
  vehicle_brand?: string;
  vehicle_model?: string;
  vehicle_vrm?: string;
  vehicle_title?: string;
  vehicle_series?: string;
  vehicle_reg?: string;
  fuelType?: string;
  postcode?: string;
  engin_capacity?: string;
  vehicle_part?: string;
  part_supplied?: string;
  supply_only?: string;
  used_condition?: string;
  new_condition?: string;
  consider_all_condition?: string;
  reconditioned_condition?: string;
  consider_both?: string;
  vehicle_drive?: string;
  collection_required?: string;
  engine_code?: string;
  description?: string;
  source?: string;
  receivedAt?: string;
  raw?: string;
  additionalNote?: string;
};

const patterns: Record<string, RegExp> = {
  name: /^Name:\s*([\s\S]*?)(?:\r?\n|$)/im,
  email: /^Email:\s*([\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,})/im,
  number: /^Phone:\s*([\d+\s().-]+)/im,
  make: /^(?:Make|Engine Brand):\s*([\s\S]*?)(?:\r?\n|$)/im,
  model: /^(?:Model|Vehicle Series):\s*([\s\S]*?)(?:\r?\n|$)/im,
  vrm: /^(?:VRM|Vehicle VRM):\s*([\s\S]*?)(?:\r?\n|$)/im,
  year: /^(?:Vehicle Registration|Registration|Year):\s*((?:19|20)\d{2})/im,
  fuelType: /^Fuel(?:\s*Type)?:\s*([\s\S]*?)(?:\r?\n|$)/im,
  postcode: /^Postcode\s*:\s*([A-Za-z0-9\s-]+)/im,
  engineSize: /^Engine\s*(?:Size|Capacity):\s*([\d.]+(?:\s*L)?)/im,
  vehicleTitle: /^(?:Engine Title|Vehicle Title):\s*([\s\S]*?)(?:\r?\n|$)/im,
  additionalNote:
    /^(?:Additional Note|Extra Note|Description):\s*([\s\S]*?)(?=^\s*(?:Vehicle\s*Part|Part\s*Supplied|$))/im,
  part: /^Vehicle\s*Part:\s*([\s\S]*?)(?:\r?\n|$)/im,
  partSupplied: /^Part\s*Supplied:\s*(on|yes|no|off|true|false)/im,
  supplyOnly: /^Supply\s*Only:\s*(on|yes|no|off|true|false)/im,
  usedCondition: /^Used\s*Condition:\s*(on|yes|no|off|true|false)/im,
  newCondition: /^New\s*Condition:\s*(on|yes|no|off|true|false)/im,
  reconditionedCondition:
    /^Reconditioned\s*Condition:\s*(on|yes|no|off|true|false)/im,
  considerBoth:
    /^Consider\s*Both\s*(?:Conditions?)?:\s*(on|yes|no|off|true|false)/im,
  considerAll: /^Consider\s*All\s*Conditions:\s*(on|yes|no|off|true|false)/im,
  vehicleDrive: /^Vehicle\s*Drive:\s*([\s\S]*?)(?:\r?\n|$)/im,
  collectionRequired: /^Collection\s*Required:\s*(on|yes|no|off|true|false)/im,
  engineCode: /^Engine\s*Code:\s*([\s\S]*?)(?:\r?\n|$)/im,
};

// Helper function to map various label names to our field names
function mapField(
  result: Record<string, string | null>,
  label: string,
  value: string,
) {
  // Normalize label by removing extra spaces and converting to lowercase
  const normalizedLabel = label.toLowerCase().replace(/\s+/g, ' ').trim();

  switch (normalizedLabel) {
    case 'name':
    case 'customer name':
      result.name = value;
      break;
    case 'email':
    case 'email address':
      result.email = value;
      break;
    case 'phone':
    case 'telephone':
    case 'contact number':
      result.number = value;
      break;
    case 'make':
    case 'brand':
    case 'vehicle brand':
      result.make = value;
      break;
    case 'engine brand':
      result.make = value;
      break;
    case 'model':
    case 'vehicle model':
      result.model = value;
      break;
    case 'vrm':
    case 'vehicle vrm':
      result.vrm = value;
      break;
    case 'vehicle registration':
    case 'registration':
    case 'reg': {
      const v = value.trim();
      if (/^(?:19|20)\d{2}$/.test(v)) {
        // Looks like a year
        result.year = v;
      } else {
        result.vrm = value;
      }
      break;
    }
    case 'fuel type':
    case 'fuel':
      result.fuelType = value;
      break;
    case 'postcode':
    case 'post code':
    case 'zip code':
      result.postcode = value;
      break;
    case 'engine size':
    case 'engine capacity':
      result.engineSize = value;
      break;
    case 'year':
      result.year = value;
      break;
    case 'vehicle part':
    case 'part':
      result.part = value;
      break;
    case 'vehicle series':
      // map series to model if present
      result.vehicleSeries = value;
      // also set model if it's not already set
      if (!result.model) result.model = value;
      break;
    case 'engine title':
    case 'vehicle title':
      result.vehicleTitle = value;
      break;
    case 'part supplied':
      result.partSupplied = value;
      break;
    case 'supply only':
      result.supplyOnly = value;
      break;
    case 'used condition':
      result.usedCondition = value;
      break;
    case 'new condition':
      result.newCondition = value;
      break;
    case 'reconditioned condition':
      result.reconditionedCondition = value;
      break;
    case 'consider both':
    case 'consider both condition':
    case 'consider both conditions':
      result.considerBoth = value;
      break;
    case 'consider all conditions':
      result.considerAll = value;
      break;
    case 'vehicle drive':
    case 'drive':
      result.vehicleDrive = value;
      break;
    case 'collection required':
    case 'collection':
      result.collectionRequired = value;
      break;
    case 'engine code':
      result.engineCode = value;
      break;
    case 'additional note':
    case 'note':
    case 'description':
    case 'extra note':
      result.additionalNote = value;
      break;
  }
}

function extractFromText(text: string): Extracted {
  const out: Record<string, string | null> = {};

  // Try the original patterns first
  for (const [k, rx] of Object.entries(patterns)) {
    const m = text.match(rx);
    out[k] = m ? m[1].trim() : null;
  }

  // If no results, try alternative patterns
  if (Object.values(out).every((v) => v === null)) {
    // Look for label: value patterns
    const labelValueRegex = /([^:\n]+):\s*([^\n]+)/g;
    let match;
    while ((match = labelValueRegex.exec(text)) !== null) {
      const label = match[1].trim();
      const value = match[2].trim();
      mapField(out, label, value);
    }
  }

  return out as Extracted;
}

function extractFromHtml(html: string): Extracted {
  const $ = cheerio.load(html);
  const result: Record<string, string | null> = {};

  // Helper: map using label into a temp object, then copy into result only if not already set
  function applyIfEmpty(label: string, value: string) {
    if (!value) return;
    const tmp: Record<string, string | null> = {};
    mapField(tmp, label, value);
    for (const k of Object.keys(tmp)) {
      const v = (result as Record<string, string | undefined>)[k];
      if (v == null || v === '') {
        (result as Record<string, string | undefined>)[k] = tmp[k] ?? undefined;
      }
    }
  }

  // First try the original approach with .label class
  $('.label').each(function () {
    const label = $(this).text().replace(':', '').trim();
    // Look for the immediate next sibling that should contain the value
    // If it's empty or another label, skip this field entirely
    const nextEl = $(this).next();
    let value = '';

    if (nextEl.length) {
      const nextText = nextEl.text().trim();
      // Only use if it's not empty and doesn't look like another label
      if (nextText && !nextText.endsWith(':') && !nextEl.hasClass('label')) {
        value = nextText;
      }
    }

    // Only map when we actually found a sensible value
    if (!value) return;

    // Map to our field names without overwriting existing
    switch (label) {
      case 'Name':
        if (!result.name) result.name = value;
        break;
      case 'Email':
        if (!result.email) result.email = value;
        break;
      case 'Phone':
        if (!result.number) result.number = value;
        break;
      case 'Make':
        if (!result.make) result.make = value;
        break;
      case 'Model':
        if (!result.model) result.model = value;
        break;
      case 'Vehicle Series':
        if (!result.model) result.model = value;
        if (!result.vehicleSeries) result.vehicleSeries = value;
        break;
      case 'VRM':
        if (!result.vrm) result.vrm = value;
        break;
      case 'Fuel Type':
        if (!result.fuelType) result.fuelType = value;
        break;
      case 'Postcode':
        if (!result.postcode) result.postcode = value;
        break;
      case 'Engine Size':
        if (!result.engineSize) result.engineSize = value;
        break;
      case 'Engine Title':
      case 'Vehicle Title':
        if (!result.vehicleTitle) result.vehicleTitle = value;
        break;
      case 'Year':
        if (!result.year) result.year = value;
        break;
      case 'Vehicle Part':
        if (!result.part) result.part = value;
        break;
      case 'Part Supplied':
        if (!result.partSupplied) result.partSupplied = value;
        break;
      case 'Supply Only':
        if (!result.supplyOnly) result.supplyOnly = value;
        break;
      case 'Used Condition':
        if (!result.usedCondition) result.usedCondition = value;
        break;
      case 'New Condition':
        if (!result.newCondition) result.newCondition = value;
        break;
      case 'Consider All Conditions':
        if (!result.considerAll) result.considerAll = value;
        break;
      case 'Vehicle Drive':
        if (!result.vehicleDrive) result.vehicleDrive = value;
        break;
      case 'Collection Required':
        if (!result.collectionRequired) result.collectionRequired = value;
        break;
      case 'Engine Code':
        if (!result.engineCode) result.engineCode = value;
        break;
      case 'Additional Note':
        if (!result.additionalNote) result.additionalNote = value;
        break;
    }
  });

  // Additionally try alternative approaches to fill any missing fields
  // Approach 1: Look for <span> elements with text ending with ':'
  $('span').each(function () {
    const text = $(this).text().trim();
    if (text.endsWith(':')) {
      const label = text.slice(0, -1).trim();
      // Look for the immediate next sibling span that should contain the value
      const nextEl = $(this).next('span');
      let value = '';

      if (nextEl.length) {
        const nextText = nextEl.text().trim();
        // Only use if it's not empty and doesn't look like another label
        if (nextText && !nextText.endsWith(':')) {
          value = nextText;
        }
      }

      if (value) {
        applyIfEmpty(label, value);
      }
    }
  });

  // Approach 2: Look for <strong> or <b> elements with text ending with ':'
  $('strong, b').each(function () {
    const text = $(this).text().trim();
    if (text.endsWith(':')) {
      const label = text.slice(0, -1).trim();
      const value = $(this)
        .parent()
        .contents()
        .filter(function () {
          return this.type === 'text';
        })
        .text()
        .trim();
      applyIfEmpty(label, value);
    }
  });

  // Approach 3: Look for any element with text ending with ':' followed by text
  const htmlText = $.html();
  const labelValueRegex = /<[^>]*>([^:<]+):<\/[^>]*>\s*([^<]+)/g;
  let match;
  while ((match = labelValueRegex.exec(htmlText)) !== null) {
    const label = match[1].trim();
    const value = match[2].trim();
    // Ignore captures where the value looks like another label
    if (value && !value.endsWith(':')) {
      applyIfEmpty(label, value);
    }
  }

  return result as Extracted;
}

async function processEmail(item: {
  parts: { which: string; body: string }[];
}) {
  try {
    const parts = item.parts;
    const all = parts.find((p) => p.which === '');
    const raw: string = all?.body ?? '';
    const parsed: ParsedMail = await simpleParser(raw);

    const from = parsed.from?.text || '';
    const subject = parsed.subject || '';

    let lead: Lead = {
      source: `email:${from} - ${subject}`,
      raw: parsed.html || parsed.text || '',
      receivedAt: parsed.date
        ? parsed.date.toISOString()
        : new Date().toISOString(),
    };

    // Extract data from HTML
    const extracted = parsed.html
      ? extractFromHtml(parsed.html)
      : extractFromText(parsed.text || '');

    const mapped = mapToLead(extracted);
    lead = { ...lead, ...mapped };

    if (!lead.email && !lead.number) {
      console.warn('Skipped: no email/phone found', subject);
      return null;
    }

    const savedId = await saveLead(lead);
    console.log('Saved lead id:', savedId);
    return savedId;
  } catch (e) {
    console.error('Failed processing message:', e);
    return null;
  }
}

// explicit mapping from parser keys -> CRM column names
function mapToLead(parsed: Extracted): Partial<Lead> {
  const lead: Partial<Lead> = {
    name: parsed.name ?? undefined,
    email: parsed.email ?? undefined,
    number: parsed.number ?? undefined,
    vehicle_brand: parsed.make ?? undefined,
    vehicle_model: parsed.model ?? undefined,
    vehicle_vrm: parsed.vrm ?? undefined,
    vehicle_title: parsed.vehicleTitle ?? undefined,
    vehicle_series: parsed.vehicleSeries ?? undefined,
    vehicle_reg: parsed.year ?? undefined,
    fuelType: parsed.fuelType ?? undefined,
    postcode: parsed.postcode ?? undefined,
    engin_capacity: parsed.engineSize ?? undefined, // keep CRM naming
    vehicle_part: parsed.part ?? undefined,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    part_supplied: normalizeBool(parsed.partSupplied) as any,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    supply_only: normalizeBool(parsed.supplyOnly) as any,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    used_condition: normalizeBool(parsed.usedCondition) as any,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    new_condition: normalizeBool(parsed.newCondition) as any,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    reconditioned_condition: normalizeBool(
      parsed.reconditionedCondition,
    ) as any,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    consider_all_condition: normalizeBool(parsed.considerAll) as any,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    consider_both: normalizeBool(
      parsed.considerBoth ?? parsed.considerAll,
    ) as any,
    vehicle_drive: parsed.vehicleDrive ?? undefined,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    collection_required: normalizeBool(parsed.collectionRequired) as any,
    engine_code: parsed.engineCode ?? undefined,
    description: parsed.additionalNote ?? undefined,
  };
  return lead;
}

function normalizeBool(
  v: string | null | undefined,
): string | boolean | undefined {
  if (v == null) return undefined;
  return /^(on|yes|true)$/i.test(v);
}

async function saveLead(lead: Lead) {
  const query = `
    INSERT INTO leads (
      name, email, number, vehicle_brand, vehicle_model, vehicle_vrm,
      vehicle_title, vehicle_series, vehicle_reg,
      "fuelType", postcode, engin_capacity, vehicle_part, part_supplied,
      supply_only, consider_both, reconditioned_condition, used_condition, new_condition, consider_all_condition,
      vehicle_drive, collection_required, engine_code, description,
      source, "createdAt"
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9,
      $10,$11,$12,$13,$14,
      $15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,
      $25,now()
    )
    -- ON CONFLICT (email, number, createdAt) DO NOTHING
    RETURNING id;
  `;

  const values = [
    lead.name,
    lead.email,
    lead.number,
    lead.vehicle_brand,
    lead.vehicle_model,
    lead.vehicle_vrm,
    lead.vehicle_title,
    lead.vehicle_series,
    lead.vehicle_reg,
    lead.fuelType,
    lead.postcode,
    lead.engin_capacity,
    lead.vehicle_part,
    lead.part_supplied,
    lead.supply_only,
    lead.consider_both,
    lead.reconditioned_condition,
    lead.used_condition,
    lead.new_condition,
    lead.consider_all_condition,
    lead.vehicle_drive,
    lead.collection_required,
    lead.engine_code,
    lead.description,
    lead.source,
  ];

  try {
    const res = await pg.query(query, values);
    return res.rows[0]?.id;
  } catch (err) {
    console.error('Error saving lead:', err);
    throw err;
  }
}

async function syncEmails() {
  await pg.connect();
  console.log('Step 1');
  const conn = await Imap.connect(imapConfig);
  await conn.openBox('INBOX');
  console.log('Step 2');

  const searchCriteria = ['ALL'];
  const fetchOptions = { bodies: [''], markSeen: true };

  const messages = await conn.search(searchCriteria, fetchOptions);
  console.log('Step 3');

  for (const item of messages) {
    try {
      console.log('Item:', item);
      const parts = (item as { parts: { which: string; body: string }[] })
        .parts;
      const all = parts.find((p) => p.which === '');
      const raw: string = all?.body ?? ''; // explicit string type
      const parsed: ParsedMail = await simpleParser(raw);
      console.log('Parsed Text:\n', parsed.text ?? '');

      const from = parsed.from?.text || '';
      const subject = parsed.subject || '';

      let lead: Lead = {
        source: `email:${from} - ${subject}`,
        raw: parsed.html || parsed.text || '',
        receivedAt: parsed.date
          ? parsed.date.toISOString()
          : new Date().toISOString(),
      };
      console.log('Lead:', lead);

      // Use the new HTML parsing function if HTML is available
      let extracted;
      if (parsed.html) {
        console.log('Extracting from HTML...');
        console.log('HTML preview:', parsed.html.substring(0, 500));
        extracted = extractFromHtml(parsed.html);
      } else {
        console.log('HTML not available, extracting from text...');
        console.log('Text preview:', (parsed.text ?? '').substring(0, 500));
        extracted = extractFromText(parsed.text || '');
      }

      console.log('Extracted data:', extracted);

      const mapped = mapToLead(extracted);
      lead = { ...lead, ...mapped };

      console.log('Mapped lead:', lead);

      if (!lead.email && !lead.number) {
        console.warn('Skipped: no email/phone found', subject);
        continue;
      }

      const savedId = await saveLead(lead);
      console.log(
        'Saved lead id:',
        savedId,
        'from',
        from,
        subject,
        lead.email,
        lead.number,
      );
    } catch (e) {
      console.error('Failed processing message:', e);
    }
  }

  conn.end();
  await pg.end();
}

program
  .command('sync')
  .description('Sync emails')
  .action(async () => {
    console.log('Syncing emails...');
    try {
      await syncEmails();
      console.log('Email sync complete.');
    } catch (err) {
      console.error('Error syncing emails:', err);
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Test email reception without saving to DB')
  .action(async () => {
    console.log('Testing email reception...');
    try {
      const conn = await Imap.connect(imapConfig);
      await conn.openBox('INBOX');

      // Fetch last 5 emails (UNSEEN optional)
      const searchCriteria = ['ALL']; // or ['UNSEEN'] for only new emails
      const fetchOptions = { bodies: [''], markSeen: false };
      const messages = await conn.search(searchCriteria, fetchOptions);

      console.log(`Found ${messages.length} messages (showing last 5):\n`);

      // const lastMessages = messages.slice(-100); // last 100 emails
      const lastMessages = messages; // last 100 emails

      for (const item of lastMessages) {
        const all = (
          item as { parts: { which: string; body: string }[] }
        ).parts.find((p) => p.which === '');
        const raw = all?.body ?? '';
        const parsed = await simpleParser(raw);

        console.log('---');
        console.log('From:', parsed.from?.text);
        console.log('Subject:', parsed.subject);
        console.log('Date:', parsed.date);

        // Test both HTML and text extraction
        let extracted;
        if (parsed.html) {
          console.log('Extracting from HTML...');
          extracted = extractFromHtml(parsed.html);
        } else {
          console.log('HTML not available, extracting from text...');
          extracted = extractFromText(parsed.text || '');
        }

        console.log('Extracted data:', extracted);
        console.log('---\n');
      }

      conn.end();
      console.log('Test complete.');
    } catch (err) {
      console.error('Error testing emails:', err);
      process.exit(1);
    }
  });

program
  .command('debug')
  .description('Debug email structure')
  .action(async () => {
    console.log('Debugging email structure...');
    try {
      const conn = await Imap.connect(imapConfig);
      await conn.openBox('INBOX');

      const searchCriteria = ['ALL'];
      const fetchOptions = { bodies: [''], markSeen: false };
      const messages = await conn.search(searchCriteria, fetchOptions);

      // Just process the first email for debugging
      if (messages.length > 0) {
        const item = messages[0];
        const all = (
          item as { parts: { which: string; body: string }[] }
        ).parts.find((p) => p.which === '');
        const raw = all?.body ?? '';
        const parsed = await simpleParser(raw);

        console.log('--- EMAIL DEBUG ---');
        console.log('From:', parsed.from?.text);
        console.log('Subject:', parsed.subject);
        console.log('Date:', parsed.date);

        if (parsed.html) {
          console.log('\n--- HTML STRUCTURE ---');
          const $ = cheerio.load(parsed.html);

          // Log all elements with class 'label'
          console.log('Elements with class "label":');
          $('.label').each(function () {
            console.log(
              `Label: ${$(this).text()}, Next: ${$(this).next().text()}`,
            );
          });

          // Log all span elements
          console.log('\nSpan elements ending with ":":');
          $('span').each(function () {
            const text = $(this).text().trim();
            if (text.endsWith(':')) {
              console.log(`Span: ${text}, Next: ${$(this).next().text()}`);
            }
          });

          // Log all strong/b elements
          console.log('\nStrong/B elements ending with ":":');
          $('strong, b').each(function () {
            const text = $(this).text().trim();
            if (text.endsWith(':')) {
              console.log(
                `Strong/B: ${text}, Parent text: ${$(this).parent().text()}`,
              );
            }
          });

          // Log first 1000 characters of HTML
          console.log('\n--- HTML PREVIEW ---');
          console.log(parsed.html.substring(0, 1000));
        } else {
          console.log('\n--- TEXT PREVIEW ---');
          console.log(parsed.text?.substring(0, 1000));
        }
      }

      conn.end();
      console.log('Debug complete.');
    } catch (err) {
      console.error('Error debugging emails:', err);
      process.exit(1);
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
