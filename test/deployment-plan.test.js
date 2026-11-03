const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deploymentPlan } = require('../services/deployment-plan');
const { validateBrief } = require('../services/pipeline');
for (const [cloud, expected, wrong] of [['gcp','cloudbuild.yaml','buildspec.yml'],['aws','buildspec.yml','cloudbuild.yaml (Cloud Build pipeline)'],['azure','azure-pipelines.yml','buildspec.yml']]) {
  for (const stack of ['java','node','python']) test(`${cloud}/${stack} produces a guidance-only six-step approach`, () => {
    const p = deploymentPlan({stack,database:'postgres',brief:{cloud,region:'chosen-region',requirements:'Private access; staging first'}});
    assert.equal(p.steps.length,6);
    assert.equal(p.mode,'guidance');
    assert.match(p.status,/not been inspected/);
    assert.ok(p.steps[1].actions.some(a=>a.includes(expected)));
    assert.ok(!p.steps[1].actions.some(a=>a.startsWith(wrong)));
    assert.equal(p.requirements.region,'chosen-region');
    assert.match(p.steps[2].actions.join(' '),/PostgreSQL/);
    assert.match(p.steps[3].actions.join(' '),/never paste secret values/);
    assert.match(p.steps[5].actions.join(' '),/certificate/);
  });
}
test('incomplete legacy apps have no assumed cloud and stateless apps skip database provisioning',()=>{
  const plan=deploymentPlan({stack:'node',database:'none'});
  assert.equal(plan.cloud,null);
  assert.match(plan.steps[2].actions.join(' '),/stateless/);
});
test('cloud requirements are validated and retained without accepting URLs as domains',()=>{
  const b=validateBrief({cloud:'aws',region:'eu-west-1',domain:'app.example.com',requirements:'Private database'});
  assert.equal(b.cloud,'aws');assert.equal(b.requirements,'Private database');
  assert.throws(()=>validateBrief({cloud:'other'}),/Choose GCP/);
  assert.throws(()=>validateBrief({domain:'https://user:password@example.com'}),/domain name/);
});
