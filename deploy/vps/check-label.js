// Publication lock, step 1 of the deploy gate: does the commit come from a merged pull request with the label "publicar"?
// Exit code: 0 = authorized; 2 = not authorized (the deploy ends in success without publishing); 1 = could not check (the job fails, nothing is published).
// Usage: node deploy/vps/check-label.js <sha>   (GH_TOKEN and GITHUB_REPOSITORY come from the Actions environment)
const { publishDecisionFor, validArgs } = require('./check-ci');
if (require.main === module) {
  (async () => {
    const sha = process.argv[2];
    const repo = process.env.GITHUB_REPOSITORY || 'cabraldev09/Chat-Acad-mico';
    validArgs(sha, repo);
    const decision = await publishDecisionFor(sha, repo);
    console.log(decision.reason);
    process.exitCode = decision.ok ? 0 : 2;
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
