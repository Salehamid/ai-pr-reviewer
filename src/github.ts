import { Octokit } from '@octokit/rest';

export type Repo = { owner: string; repo: string; pull_number: number };
export const MARKER = '<!-- workshop-ai-pr-reviewer -->';
const MAX_FILES = 25;
const MAX_PATCH_CHARS = 40_000;

export function parseRepo(): Repo {
  const raw = process.env.GITHUB_REPOSITORY ?? '';
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(raw);
  const number = Number(process.env.PR_NUMBER);
  if (!match || !Number.isSafeInteger(number) || number < 1) {
    throw new Error('Set GITHUB_REPOSITORY=owner/repo and PR_NUMBER=integer');
  }
  return { owner: match[1], repo: match[2], pull_number: number };
}

export function githubClient() {
  if (!process.env.GITHUB_TOKEN) throw new Error('Missing GITHUB_TOKEN');
  return new Octokit({ auth: process.env.GITHUB_TOKEN });
}

export async function getPRDiff(octokit: Octokit, ctx: Repo) {
  const pr = await octokit.pulls.get(ctx);
  if (pr.data.head.repo?.full_name !== pr.data.base.repo.full_name) {
    throw new Error('Workshop only supports same-repository PRs');
  }
  const files = await octokit.paginate(octokit.pulls.listFiles, { ...ctx, per_page: 100 });
  if (files.length > MAX_FILES) throw new Error(`PR too large: ${files.length} files (max ${MAX_FILES})`);
  const allowed = files.filter(f =>
    f.patch && /\.(ts|tsx|js|jsx|json|py|go)$/.test(f.filename) &&
    !/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.env(?:\..*)?|node_modules)(\/|$)/i.test(f.filename)
  );
  const content = allowed.map(f => `FILE: ${f.filename}\nSTATUS: ${f.status}\nPATCH:\n${f.patch}`).join('\n\n');
  if (content.length > MAX_PATCH_CHARS) throw new Error('PR patch exceeds safe workshop size');
  return { diff: content, files: allowed.map(f => f.filename), totalFiles: files.length };
}

export async function upsertComment(octokit: Octokit, ctx: Repo, body: string) {
  const comments = await octokit.paginate(octokit.issues.listComments, { ...ctx, issue_number: ctx.pull_number, per_page: 100 });
  const me = await octokit.users.getAuthenticated();
  const prior = comments.find(c => c.user?.login === me.data.login && c.body?.includes(MARKER));
  if (prior) {
    await octokit.issues.updateComment({ owner: ctx.owner, repo: ctx.repo, comment_id: prior.id, body });
  } else {
    await octokit.issues.createComment({ owner: ctx.owner, repo: ctx.repo, issue_number: ctx.pull_number, body });
  }
}
