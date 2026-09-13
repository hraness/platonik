// Compress each retained output independently, so admission need not inflate
// the entire qualification batch to verify one bounded receipt.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { sha, read } from '../bloom/common.mjs';
import { pathToFileURL } from 'node:url';
export function pack(directory) {
  const root=fs.realpathSync(directory), ledger=read(path.join(root,'ledger.json'));
  assert(ledger.finished?.qualified && !ledger.stopped && !ledger.pending_call && !ledger.accounting_incomplete);
  const files={};
  assert.equal(ledger.schema,'platonik-bloom-exchange-qualification-v1');
  const allowed=['ledger.json',...Object.keys(ledger.source.files).map(f=>`${ledger.source.directory}/${f}`),...ledger.calls.flatMap(c=>[c.stdout,c.stderr])];
  assert.equal(new Set(allowed).size,allowed.length);
  for(const name of allowed) {
    assert(!path.isAbsolute(name)&&path.normalize(name)===name&&!name.split(path.sep).includes('..'));
    const pieces=name.split(path.sep);let current=root;
    for(const [i,piece] of pieces.entries()) {
      current=path.join(current,piece);const stat=fs.lstatSync(current);
      assert(!stat.isSymbolicLink());assert(i===pieces.length-1?stat.isFile():stat.isDirectory());
    }
    const raw=fs.readFileSync(current);assert(raw.length<=32*1024*1024);
    files[name]={bytes:raw.length,sha256:sha(raw),gzip:gzipSync(raw,{level:9}).toString('base64')};
  }
  for(const [file,hash] of Object.entries(ledger.source.files))assert.equal(files[`${ledger.source.directory}/${file}`].sha256,hash);
  for(const call of ledger.calls){assert.equal(files[call.stdout].sha256,call.stdout_sha256);assert.equal(files[call.stderr].sha256,call.stderr_sha256);}
  const archive=gzipSync(JSON.stringify({schema:'platonik-bloom-exchange-archive-v2',files}),{level:9});
  assert(archive.length<=16*1024*1024);
  fs.writeFileSync('fixtures/evidence/exchange-qualification.json.gz',archive,{flag:'wx'});
  const summary={schema:ledger.schema,scope:ledger.plan.scope,protocol:ledger.plan,source_files:ledger.source.files,binary_sha256:ledger.source.binary_sha256,
    archive_sha256:sha(archive),packer_sha256:sha(fs.readFileSync('scripts/exchange/pack.mjs')),engine_executions:ledger.engine_executions,
    results:ledger.attempts.map(a=>({...a,grade:read(path.join(root,a.grade))}))};
  fs.writeFileSync('fixtures/evidence/exchange-qualification.json',JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({qualified:true,attempts:ledger.attempts.length,engines:ledger.engine_executions,archive_bytes:archive.length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)pack(process.argv[2]);
