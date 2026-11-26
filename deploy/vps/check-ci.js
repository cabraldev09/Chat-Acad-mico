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
module.exports = { approved, isCurrentMainSha, mergedPullFor, sameTree };
if (require.main === module || process.argv[1] === "-") {
  (async () => {
    const sha = process.argv[2] || process.argv[1];
    if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Revisão de publicação inválida.');
    const repo = process.env.GITHUB_REPOSITORY || 'cabraldev09/Chat-Acad-mico';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repositório inválido.');
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Chat-Academico-Deploy' };
    if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
    const mainResult = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/main`, { headers, signal: AbortSignal.timeout(15000) });
    if (!mainResult.ok) throw new Error(`Não foi possível confirmar a revisão atual da main (HTTP ${mainResult.status}).`);
    const mainBody = await mainResult.json();
    if (!isCurrentMainSha(sha, mainBody.object && mainBody.object.sha)) throw new Error('Publicação adiada: a revisão não é a ponta atual da main.');
    const result = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs?per_page=100`, { headers, signal: AbortSignal.timeout(15000) });
    if (!result.ok) throw new Error(`Não foi possível consultar as verificações (HTTP ${result.status}).`);
    const body = await result.json();
    if (approved(body.check_runs || [])) { console.log(`Verificações aprovadas para ${sha.slice(0, 7)}.`); return; }
    // not approved on main yet: the green of the pull request counts when the merged code is identical to the tested one
    const get = async path => {
      const answer = await fetch(`https://api.github.com/repos/${repo}/${path}`, { headers, signal: AbortSignal.timeout(15000) });
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
