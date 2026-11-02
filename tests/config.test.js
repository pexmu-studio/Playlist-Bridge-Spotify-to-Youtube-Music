import{test}from'node:test';import assert from'node:assert/strict';import worker from'../worker/index.js';
test('publishes only the public OAuth identifier, never arbitrary environment variables',async()=>{
  const response=await worker.fetch(new Request('https://example.test/api/config'),{GOOGLE_CLIENT_ID:'000000000000-example.apps.googleusercontent.com',PRIVATE_VALUE:'not-a-real-secret'});
  assert.deepEqual(await response.json(),{googleClientId:'000000000000-example.apps.googleusercontent.com'});assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('unconfigured or malformed OAuth identifiers stay empty',async()=>{for(const env of[{}, {GOOGLE_CLIENT_ID:'not-valid'}]){const response=await worker.fetch(new Request('https://example.test/api/config'),env);assert.deepEqual(await response.json(),{googleClientId:''});}});
test('configuration endpoint rejects writes',async()=>{assert.equal((await worker.fetch(new Request('https://example.test/api/config',{method:'POST'}),{})).status,405);});
