import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { githubClient, getPRDiff, MARKER, parseRepo, upsertComment } from './github.js';
import { reviewDiff, type Review } from './reviewer.js';

function formatReview(result: Review): string {
  const lines = [MARKER, '## 🤖 AI Pull Request Review', '',
    '> AI-generated review; please verify all findings. No code was executed.', '',
    result.summary, ''];
  if (!result.findings.length) lines.push('No actionable issues detected in the supplied patch. This is not a guarantee of correctness.');
  result.findings.forEach((f, i) => {
    lines.push(`### ${i + 1}. [${f.severity.toUpperCase()}] ${f.title.replaceAll('`', '')}`,
      `**File:** \`${f.file.replaceAll('`', '')}\``, '',
      f.explanation, '', `**Suggestion:** ${f.recommendation}`, '');
  });
  return lines.join('\n').slice(0, 50_000);
}

async function main() {
  const demo = process.argv.includes('--demo');
  let diff: string;
  let files: string[];
  if (demo) {
    diff = await readFile('demo/example.diff', 'utf8');
    files = ['src/checkout.ts'];
  } else {
    const ctx = parseRepo();
    const octokit = githubClient();
    const pull = await getPRDiff(octokit, ctx);
    if (!pull.files.length) {
      console.log('No supported text patches in this PR; nothing to review.');
      return;
    }
    diff = pull.diff;
    files = pull.files;
  }
  const result = await reviewDiff(diff, files);
  const comment = formatReview(result);
  console.log(comment);
  if (!demo && process.env.DRY_RUN !== 'true') {
    await upsertComment(githubClient(), parseRepo(), comment);
    console.log('\nPosted/updated pull request comment.');
  } else {
    console.log('\nPreview only (no comment posted).');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
