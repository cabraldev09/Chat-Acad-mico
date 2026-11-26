// Deployment gate: require the exact revision's unit/build and integration jobs.
const approved = runs => ['verificar', 'api-ponta-a-ponta (canais e conversas)', 'api-ponta-a-ponta (responsabilidade pela conversa)', 'api-ponta-a-ponta (estatísticas e gestão comercial)', 'telas'].every(name => {
  const latest = runs.filter(run => run.name === name).sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];
  return !!latest && latest.status === 'completed' && latest.conclusion === 'success';
});
const isCurrentMainSha = (sha, mainSha) => /^[a-f0-9]{40}$/.test(mainSha || '') && sha === mainSha;
// A squash merge whose code is exactly what the pull request tested needs no second round of the same tests: the
// merged pull request must come from this repository, target main, be this very commit and have the same tree.
const mergedPullFor = (pulls, sha, repo) => (pulls || []).find(pull =>
  !!pull && !!pull.merged_at && pull.merge_commit_sha === sha && !!pull.base && pull.base.ref === 'main' &&
  !!pull.head && /^[a-f0-9]{40}$/.test(pull.head.sha || '') && !!pull.head.repo && pull.head.repo.full_name === repo) || null;
const sameTree = (a, b) => /^[a-f0-9]{40}$/.test(a || '') && a === b;
// Publication lock: only a commit that came from a merged pull request carrying the label below goes to production.
// The label is applied by the coordination after the audit (docs/VPS-HOSTINGER.md). Merging without it leaves the code on main, unpublished.
const PUBLISH_LABEL = 'publicar';
const mergedFor = (pulls, sha) => (pulls || []).filter(pull => !!pull && !!pull.merged_at && pull.merge_commit_sha === sha && !!pull.base && pull.base.ref === 'main');
const publishDecision = (pulls, sha) => {
  const merged = mergedFor(pulls, sha);
  const pull = merged.find(item => Array.isArray(item.labels) && item.labels.some(label => !!label && label.name === PUBLISH_LABEL));
  if (pull) return { ok: true, number: pull.number, pull, reason: `PR #${pull.number} com o rótulo ${PUBLISH_LABEL}.` };
  const why = merged.length ? `o PR #${merged[0].number} não tem o rótulo ${PUBLISH_LABEL}` : 'este commit não veio de um PR mesclado na main';
  return { ok: false, why, reason: `Publicação aguardando o rótulo ${PUBLISH_LABEL}, aplicado pela coordenação (${why}).` };
};
// The label counts only when it was applied AFTER the last commit of the pull request (the audit saw that code): a commit pushed after the
// label leaves the label outdated and the coordination applies it again. events = /issues/{n}/events; headDate = committer date of the PR's last commit.
const labelFreshness = (events, headDate) => {
  const at = (Array.isArray(events) ? events : [])
    .filter(e => !!e && e.event === 'labeled' && !!e.label && e.label.name === PUBLISH_LABEL)
    .map(e => Date.parse(e.created_at)).filter(Number.isFinite);
  if (!at.length) return { ok: false, why: 'sem registro de quando o rótulo foi aplicado' };
  const head = Date.parse(headDate);
  if (!Number.isFinite(head)) return { ok: false, why: 'data do último commit do PR desconhecida' };
  return Math.max(...at) >= head ? { ok: true } : { ok: false, why: 'o rótulo foi aplicado antes do último commit do PR (aplique de novo depois da última conferência)' };
};
const API = () => process.env.GITHUB_API_URL || 'https://api.github.com';
const apiHeaders = () => {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Chat-Academico-Deploy' };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  return headers;
};
const SHORT_SHA = /^[a-f0-9]{7,40}$/;
const MAX_RANGE_COMMITS = 100;
// fails closed: whatever cannot be read throws, and nothing is published (the caller decides what that means)
const getJson = async (fetchImpl, repo, path, what) => {
  const result = await fetchImpl(`${API()}/repos/${repo}/${path}`, { headers: apiHeaders(), signal: AbortSignal.timeout(15000) });
  if (!result.ok) throw new Error(`Não foi possível consultar ${what} (HTTP ${result.status}).`);
  return result.json();
};
// The version in production: GIT_SHA inside the server's API container (update.sh runs this file there), PUBLISHED_SHA when given, or, on
// GitHub, the last run of "Atualizar a VPS" whose step "Atualiza a VPS" really ran and succeeded (a run that only waited does not count).
const publishedBase = async (repo, fetchImpl, env) => {
  for (const name of ['PUBLISHED_SHA', 'GIT_SHA']) if (SHORT_SHA.test(env[name] || '')) return env[name];
  const runs = await getJson(fetchImpl, repo, 'actions/workflows/deploy-vps.yml/runs?status=success&per_page=30', 'as publicações anteriores');
  for (const run of (runs && runs.workflow_runs) || []) {
    const jobs = await getJson(fetchImpl, repo, `actions/runs/${run.id}/jobs?per_page=30`, 'as etapas de uma publicação anterior');
    const deployed = ((jobs && jobs.jobs) || []).some(job => (job.steps || []).some(step => step.name === 'Atualiza a VPS' && step.conclusion === 'success'));
    if (deployed && SHORT_SHA.test(run.head_sha || '')) return run.head_sha;
  }
  throw new Error('Não foi possível achar a última versão publicada (nenhuma publicação anterior concluída nas últimas 30 execuções).');
};
// Is this commit authorized? It must be the merge commit of a PR with the label, applied after the PR's last commit.
const authorizedCommit = async (sha, repo, fetchImpl, memo) => {
  const pulls = await getJson(fetchImpl, repo, `commits/${sha}/pulls?per_page=100`, 'os PRs do commit');
  const decision = publishDecision(pulls, sha);
  if (!decision.ok) return { ok: false, why: decision.why, reason: decision.reason, text: `commit ${sha.slice(0, 7)}: ${decision.why}` };
  const number = decision.number;
  if (!memo.has(number)) {
    const [events, head] = await Promise.all([
      getJson(fetchImpl, repo, `issues/${number}/events?per_page=100`, `os eventos do PR #${number}`),
      getJson(fetchImpl, repo, `commits/${decision.pull.head.sha}`, `o último commit do PR #${number}`)
    ]);
    memo.set(number, labelFreshness(events, head && head.commit && head.commit.committer && head.commit.committer.date));
  }
  const fresh = memo.get(number);
  if (!fresh.ok) {
    const why = `PR #${number}: ${fresh.why}`;
    return { ok: false, why, reason: `Publicação aguardando o rótulo ${PUBLISH_LABEL}, aplicado pela coordenação (${why}).`, text: `commit ${sha.slice(0, 7)}: ${why}` };
  }
  return { ok: true, number, reason: decision.reason };
};
// 1) the commit to publish is authorized; 2) so is EVERY commit of main since the version in production (publishing takes the whole main).
const publishDecisionFor = async (sha, repo, fetchImpl = fetch, env = process.env) => {
  const memo = new Map();
  const tip = await authorizedCommit(sha, repo, fetchImpl, memo);
  if (!tip.ok) return tip;
  const base = await publishedBase(repo, fetchImpl, env);
  if (sha.startsWith(base) || base.startsWith(sha)) return tip;
  const commits = [];
  let status = '';
  for (let page = 1; page <= 3; page += 1) {
    const cmp = await getJson(fetchImpl, repo, `compare/${base}...${sha}?per_page=100&page=${page}`, 'as mudanças desde a última publicação');
    status = cmp.status;
    if (cmp.total_commits > MAX_RANGE_COMMITS) throw new Error(`Há ${cmp.total_commits} commits desde a última publicação (${base.slice(0, 7)}): publique por partes.`);
    commits.push(...(cmp.commits || []));
    if (commits.length >= (cmp.total_commits || 0)) break;
  }
  if (status === 'identical' || status === 'behind') return tip;
  if (status !== 'ahead') throw new Error(`A versão publicada (${base.slice(0, 7)}) não é ancestral da main (${status || 'desconhecido'}): confira antes de publicar.`);
  const problems = [];
  for (const commit of commits) {
    if (commit.sha === sha) continue;
    // eslint-disable-next-line no-await-in-loop
    const result = await authorizedCommit(commit.sha, repo, fetchImpl, memo);
    if (!result.ok) problems.push(result.text);
  }
  if (problems.length) {
    const shown = problems.slice(0, 10).join('; ');
    return { ok: false, why: shown, reason: `Publicação aguardando o rótulo ${PUBLISH_LABEL}: ${problems.length} commit(s) da main desde a última versão publicada (${base.slice(0, 7)}) sem autorização (${shown}${problems.length > 10 ? '; ...' : ''}). Publicar leva a main inteira.` };
  }
  return { ok: true, number: tip.number, reason: `${tip.reason} Os ${commits.length - 1} commits anteriores desde ${base.slice(0, 7)} também estão autorizados.` };
};
const validArgs = (sha, repo) => {
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Revisão de publicação inválida.');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repositório inválido.');
};
module.exports = { approved, isCurrentMainSha, mergedPullFor, sameTree, PUBLISH_LABEL, publishDecision, publishDecisionFor, labelFreshness, publishedBase, validArgs };
if (require.main === module || process.argv[1] === "-") {
  (async () => {
    const sha = process.argv[2] || process.argv[1];
    if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Revisão de publicação inválida.');
    const repo = process.env.GITHUB_REPOSITORY || 'cabraldev09/Chat-Acad-mico';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repositório inválido.');
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Chat-Academico-Deploy' };
    if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
    const mainResult = await fetch(`${API()}/repos/${repo}/git/ref/heads/main`, { headers, signal: AbortSignal.timeout(15000) });
    if (!mainResult.ok) throw new Error(`Não foi possível confirmar a revisão atual da main (HTTP ${mainResult.status}).`);
    const mainBody = await mainResult.json();
    if (!isCurrentMainSha(sha, mainBody.object && mainBody.object.sha)) throw new Error('Publicação adiada: a revisão não é a ponta atual da main.');
    // second lock, for any caller of this file (the server's update.sh runs it too): without the label, nothing is published
    const decision = await publishDecisionFor(sha, repo);
    if (!decision.ok) throw new Error(decision.reason);
    const result = await fetch(`${API()}/repos/${repo}/commits/${sha}/check-runs?per_page=100`, { headers, signal: AbortSignal.timeout(15000) });
    if (!result.ok) throw new Error(`Não foi possível consultar as verificações (HTTP ${result.status}).`);
    const body = await result.json();
    if (approved(body.check_runs || [])) { console.log(`Verificações aprovadas para ${sha.slice(0, 7)}.`); return; }
    // not approved on main yet: the green of the pull request counts when the merged code is identical to the tested one
    const get = async path => {
      const answer = await fetch(`${API()}/repos/${repo}/${path}`, { headers, signal: AbortSignal.timeout(15000) });
      return answer.ok ? answer.json() : null;
    };
    const pull = mergedPullFor(await get(`commits/${sha}/pulls?per_page=100`), sha, repo);
    if (pull) {
      const [merged, tested, checks] = await Promise.all([get(`git/commits/${sha}`), get(`git/commits/${pull.head.sha}`), get(`commits/${pull.head.sha}/check-runs?per_page=100`)]);
      if (merged && tested && sameTree(merged.tree && merged.tree.sha, tested.tree && tested.tree.sha) && approved((checks && checks.check_runs) || [])) {
        console.log(`Verificações aprovadas no PR #${pull.number} para o mesmo código de ${sha.slice(0, 7)}.`);
        return;
      }
    }
    throw new Error('Publicação adiada: os testes da revisão ainda não foram aprovados.');
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
