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
  fuelType?: string;
  postcode?: string;
  engin_capacity?: string;
  vehicle_part?: string;
  part_supplied?: string;
  supply_only?: string;
  used_condition?: string;
  new_condition?: string;
  consider_all_condition?: string;
  vehicle_drive?: string;
  collection_required?: string;
  engine_code?: string;
  description?: string;
  source?: string;
  receivedAt?: string;
  raw?: string;
  additionalNote?: string;
};

function extractFromText(text: string): Partial<Lead> {
  if (!text) return {};
  const r: Partial<Lead> = {};

  const patterns = {
    name: /Name:\s*(.+)/i,
    email: /Email:\s*([\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,})/i,
    phone: /Phone:\s*([\d+\s().-]+)/i,
    make: /Make:\s*(.+)/i,
    model: /Model:\s*(.+)/i,
    vrm: /VRM:\s*(.+)/i,
    fuelType: /Fuel\s*Type:\s*(.+)/i,
    postcode: /Postcode\s*:\s*(.+)/i,
    engineSize: /Engine\s*Size:\s*(.+)/i,
    year: /Year:\s*(.+)/i,
    part: /Vehicle\s*Part:\s*(.+)/i,
    partSupplied: /Part\s*Supplied:\s*(on|yes)/i,
    supplyOnly: /Supply\s*Only:\s*(on|yes)/i,
    condition: /Condition:\s*(on|yes)/i,
    usedCondition: /Used\s*Condition:\s*(on|yes)/i,
    newCondition: /New\s*Condition:\s*(on|yes)/i,
    considerAll: /Consider\s*All\s*Conditions:\s*(on|yes)/i,
    vehicleDrive: /Vehicle\s*Drive:\s*(.+)/i,
    collectionRequired: /Collection\s*Required:\s*(on|yes)/i,
    engineCode: /Engine\s*Code:\s*(.+)/i,
    additionalNote: /Additional\s*Note:\s*([\s\S]*?)(?:-{5,}|$)/i,
  };

  for (const [key, regex] of Object.entries(patterns) as [
    keyof Lead,
    RegExp,
  ][]) {
    const match = text.match(regex);
    if (match) {
      r[key] = match[1].trim() as never;
    }
  }

  r.raw = text;
  return r;
}

async function saveLead(lead: Lead) {
  const query = `
    INSERT INTO leads (
      name, email, number, vehicle_brand, vehicle_model, vehicle_vrm,
      fuelType, postcode, engin_capacity, vehicle_part, part_supplied,
      supply_only, used_condition, new_condition, consider_all_condition,
      vehicle_drive, collection_required, engine_code, description,
      source, createdAt
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9,$10,$11,
      $12,$13,$14,$15,
      $16,$17,$18,$19,
      $20,now()
    )
    ON CONFLICT (email, number, createdAt) DO NOTHING
    RETURNING id;
  `;

  const values = [
    lead.name,
    lead.email,
    lead.number,
    lead.vehicle_brand,
    lead.vehicle_model,
    lead.vehicle_vrm,
    lead.fuelType,
    lead.postcode,
    lead.engin_capacity,
    lead.vehicle_part,
    lead.part_supplied,
    lead.supply_only,
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
  const conn = await Imap.connect(imapConfig);
  await conn.openBox('INBOX');

  const searchCriteria = ['UNSEEN'];
  const fetchOptions = { bodies: [''], markSeen: true };

  const messages = await conn.search(searchCriteria, fetchOptions);

  for (const item of messages) {
    const parts = (item as { parts: { which: string; body: string }[] }).parts;
    const all = parts.find((p) => p.which === '');
    const raw: string = all?.body ?? ''; // explicit string type
    const parsed: ParsedMail = await simpleParser(raw);

    const from = parsed.from?.text || '';
    const subject = parsed.subject || '';
    const body = parsed.text || parsed.html || '';

    let lead: Lead = {
      source: `email:${from} - ${subject}`,
      raw: body,
      receivedAt: parsed.date
        ? parsed.date.toISOString()
        : new Date().toISOString(),
    };

    const extracted = extractFromText(
      `${parsed.text || ''}\n${parsed.html || ''}`,
    );
    lead = {
      ...lead,
      name: extracted.name,
      email: extracted.email,
      number: extracted.number,
      vehicle_brand: extracted.vehicle_brand,
      vehicle_model: extracted.vehicle_model,
      vehicle_vrm: extracted.vehicle_vrm,
      fuelType: extracted.fuelType,
      postcode: extracted.postcode,
      engin_capacity: extracted.engin_capacity,
      vehicle_part: extracted.vehicle_part,
      part_supplied: extracted.part_supplied,
      supply_only: extracted.supply_only,
      used_condition: extracted.used_condition,
      new_condition: extracted.new_condition,
      consider_all_condition: extracted.consider_all_condition,
      vehicle_drive: extracted.vehicle_drive,
      collection_required: extracted.collection_required,
      engine_code: extracted.engine_code,
      description: extracted.additionalNote,
    };

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

      const lastMessages = messages.slice(-5); // last 5 emails

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
        console.log('Body preview:', parsed.text);
        console.log('---\n');
      }

      conn.end();
      console.log('Test complete.');
    } catch (err) {
      console.error('Error testing emails:', err);
      process.exit(1);
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
