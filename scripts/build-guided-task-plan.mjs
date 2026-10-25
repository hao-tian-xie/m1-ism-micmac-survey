import { writeFile } from 'node:fs/promises';
import { studyConfig } from '../survey-config.mjs';
import { sourceAssignment } from '../expert-protocol.mjs';
import { ASSIGNMENT_FOCI, TASK_COUNTS } from '../guided-elicitation.mjs';
import { managementActivity } from '../management-activities.mjs';

const rows = [['plan_id', 'focus', 'task_count', 'batch', 'position', 'source_id', 'esrs_key', 'activity_zh', 'activity_en', 'survey_url']];
for (const focus of ASSIGNMENT_FOCI) for (const taskCount of TASK_COUNTS) for (let batch = 1; batch <= 10; batch++) {
  const plan = sourceAssignment(studyConfig.factors, batch, { focus, taskCount });
  for (const [index, id] of plan.sourceIds.entries()) {
    const factor = studyConfig.factors.find(factor => factor.id === id);
    rows.push([plan.planId, focus, taskCount, batch, index + 1, id, factor.esrs.key,
      managementActivity(factor, 'zh-CN').title, managementActivity(factor, 'en').title,
      `https://hao-tian-xie.github.io/m1-ism-micmac-survey/?batch=${batch}&focus=${focus}&tasks=${taskCount}`]);
  }
}
const quote = value => /[,"\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
await writeFile(new URL('../docs/vt3-task-plan.csv', import.meta.url), rows.map(row => row.map(quote).join(',')).join('\n') + '\n', 'utf8');
console.log(`Saved ${rows.length - 1} source assignments across 120 researcher-selectable plans.`);
