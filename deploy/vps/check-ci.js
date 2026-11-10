// Deployment gate: require the exact revision's unit/build and integration jobs.
const approved = runs => ['verificar', 'integracao'].every(name => {
  const latest = runs.filter(run => run.name === name).sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];
  return !!latest && latest.status === 'completed' && latest.conclusion === 'success';
});
module.exports = { approved };
if (require.main === module) {
  (async () => {
    const sha = process.argv[2];
    if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Revisão de publicação inválida.');
    const repo = process.env.GITHUB_REPOSITORY || 'cabraldev09/Chat-Acad-mico';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repositório inválido.');
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Chat-Academico-Deploy' };
    if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
    const result = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs?per_page=100`, { headers, signal: AbortSignal.timeout(15000) });
    if (!result.ok) throw new Error(`Não foi possível consultar as verificações (HTTP ${result.status}).`);
    const body = await result.json();
    if (!approved(body.check_runs || [])) throw new Error('Publicação adiada: os testes da revisão ainda não foram aprovados.');
    console.log(`Verificações aprovadas para ${sha.slice(0, 7)}.`);
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
