import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expertCoverage } from '../expert-coverage.mjs';

const [input, output, requestedCount = '3'] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/report-expert-coverage.mjs input.json output.json [desired-judgments=3]');
if (resolve(input) === resolve(output)) throw new Error('Choose an output file separate from the source export.');
const document = JSON.parse((await readFile(input, 'utf8')).replace(/^\uFEFF/, ''));
const records = Array.isArray(document) ? document : Array.isArray(document.items) ? document.items : Array.isArray(document.submissions) ? document.submissions : [document];
const report = expertCoverage(records, Number(requestedCount));
await writeFile(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`${report.independentCodes} expert codes; ${report.followUp.length} directions for follow-up; ${report.otherVersionRecords} records from other collection versions.`);
