#!/usr/bin/env node
// Cloud Sync runner end-to-end with stand-ins. Google-native documents are
// represented by the rclone stand-in returning Size -1 for paths named in
// the fixture export list, as rclone's Google Drive backend does for Docs,
// Sheets, Slides and Drawings.
"use strict";
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.join(__dirname, "..");
const RUNNER = path.join(repo, "shell/plugins/vgs.cloud-sync/bin/cloud-sync");
const scratchRoot = path.join(repo, "tmp");
fs.mkdirSync(scratchRoot, { recursive: true });
const scratch = fs.mkdtempSync(path.join(scratchRoot, "test-cloud-sync-runner-"));
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));

function which(command) {
  for (const dir of String(process.env.PATH || "").split(path.delimiter)) {
    const file = path.join(dir, command);
    try { if (fs.statSync(file).isFile()) return fs.realpathSync(file); } catch (_) {}
  }
  return null;
}
const FLOCK = which("flock");
if (FLOCK === null) { console.log("test-cloud-sync-runner: unavailable: flock=missing"); process.exit(77); }

function write(file, text, mode = 0o644) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, { mode }); }
function read(file) { return fs.readFileSync(file, "utf8"); }
function exists(file) { return fs.existsSync(file); }
function setTime(file, sec) { fs.utimesSync(file, sec, sec); }
function md5(file) { return crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex"); }
function listFiles(dir) {
  const out = [];
  const walk = rel => { if (!exists(path.join(dir, rel))) return; for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) { const child = rel ? rel + "/" + e.name : e.name; if (e.isDirectory()) walk(child); else if (e.isFile()) out.push(child); } };
  walk("");
  return out.sort();
}

let worlds = 0;
function world() {
  const root = path.join(scratch, "w" + (++worlds));
  const w = { root, home: path.join(root, "home"), run: path.join(root, "run"), bin: path.join(root, "bin"), stub: path.join(root, "stub"), drive: path.join(root, "drive") };
  w.state = path.join(w.home, ".local/state/vgshell/cloud-sync");
  w.config = path.join(w.home, ".config/vgshell/cloud-sync");
  w.mirror = path.join(w.home, "mirror/docs");
  for (const d of [w.home, w.run, w.bin, w.stub, w.drive, path.join(w.stub, "secrets")]) fs.mkdirSync(d, { recursive: true });
  fs.symlinkSync(FLOCK, path.join(w.bin, "flock"));
  fs.symlinkSync(process.execPath, path.join(w.bin, "node"));
  for (const [k, v] of Object.entries({ "client-id": "new-client", "client-secret": "new-secret", token: "new-token" })) write(path.join(w.stub, "secrets", k), v);
  w.env = { PATH: w.bin, HOME: w.home, XDG_RUNTIME_DIR: w.run, XDG_CONFIG_HOME: path.join(w.home, ".config"), XDG_STATE_HOME: path.join(w.home, ".local/state"), XDG_DATA_HOME: path.join(w.home, ".local/share") };
  write(path.join(w.bin, "secret-tool"), secretTool(w), 0o755);
  write(path.join(w.bin, "systemctl"), `#!/usr/bin/env node\nrequire('fs').appendFileSync(${JSON.stringify(path.join(w.stub, "systemctl.calls"))}, process.argv.slice(2).join(' ')+'\\n');\n`, 0o755);
  write(path.join(w.bin, "curl"), `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({user:{emailAddress:'person@example.com'}}));\n`, 0o755);
  write(path.join(w.bin, "rclone"), rcloneTool(w), 0o755);
  return w;
}
function secretTool(w) { return `#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const store=${JSON.stringify(path.join(w.stub,"secrets"))}; const calls=${JSON.stringify(path.join(w.stub,"secret.calls"))}; const a=process.argv.slice(2);
function account(rest){ return rest[0]==='service'&&rest[1]==='vgs-cloud-sync'&&rest[2]==='account'?rest[3]:null; }
if(a[0]==='search'){ const acc=account(a.slice(1)); if(!acc) process.exit(2); const files=fs.readdirSync(store).filter(n=>n===acc||n.startsWith(acc+'.user.')).sort(); for(const f of files.slice(0,1)){ process.stdout.write('[/1]\\nlabel = VGS Cloud Sync '+acc+'\\nsecret = '+fs.readFileSync(path.join(store,f),'utf8')+'\\n'); process.stderr.write('attribute.service = vgs-cloud-sync\\nattribute.account = '+acc+'\\n'+(f===acc?'':'attribute.user = '+f.slice(acc.length+6)+'\\n')); } process.exit(0); }
if(a[0]==='clear'){ const acc=account(a.slice(1)); if(!acc) process.exit(2); fs.appendFileSync(calls,a.join(' ')+'\\n'); const files=fs.readdirSync(store).filter(n=>n===acc||n.startsWith(acc+'.user.')); for(const f of files) fs.unlinkSync(path.join(store,f)); process.exit(files.length?0:1); }
if(a[0]==='store'){ const rest=a.slice(2); const acc=account(rest); if(!acc) process.exit(2); fs.appendFileSync(calls,a.join(' ')+'\\n'); let name=acc; const u=rest.indexOf('user'); if(u!==-1) name=acc+'.user.'+rest[u+1]; fs.writeFileSync(path.join(store,name), fs.readFileSync(0)); process.exit(0); }
process.exit(2);`; }
function rcloneTool(w) { return `#!/usr/bin/env node
const fs=require('fs'), path=require('path'), crypto=require('crypto'); const stub=${JSON.stringify(w.stub)}, drive=${JSON.stringify(w.drive)}; const raw=process.argv.slice(2); fs.appendFileSync(path.join(stub,'rclone.calls'), JSON.stringify({argv:raw, env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k.startsWith('RCLONE_')))} )+'\\n');
if(raw[2]==='authorize'){ process.stdout.write('Paste the following into your remote machine --->\\n{"access_token":"access","refresh_token":"refresh","token_type":"Bearer"}\\n<---End paste\\n'); process.exit(0); }
const args=raw.slice(2); const cmd=args[0]; function local(p){ if(p.startsWith('vgsdrive:')) return path.join(drive,p.slice('vgsdrive:'.length)); return p; } function md5(f){return crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')} function files(dir){ const out=[]; const walk=r=>{ if(!fs.existsSync(path.join(dir,r))) return; for(const e of fs.readdirSync(path.join(dir,r),{withFileTypes:true})){ const c=r?r+'/'+e.name:e.name; if(e.isDirectory()) walk(c); else if(e.isFile()) out.push(c); } }; walk(''); return out.sort(); }
function excluded(rel, filters){ return filters.some(f=>f===('/'+rel)); }
if(cmd==='lsjson'){ const root=local(args.find(x=>x.startsWith('vgsdrive:'))); const exports=new Set(fs.existsSync(path.join(stub,'exports'))?fs.readFileSync(path.join(stub,'exports'),'utf8').trim().split(/\\n+/).filter(Boolean):[]); const items=files(root).map(rel=>{ const st=fs.statSync(path.join(root,rel)); return {Path:rel, Size:exports.has(rel)?-1:st.size, ModTime:st.mtime.toISOString(), Hashes:{md5:md5(path.join(root,rel))}, ID:String(st.ino)}; }); process.stdout.write(JSON.stringify(items)); process.exit(0); }
if(cmd==='copy'){ if(args.includes('--dry-run')) process.exit(0); let backup=null, exclude=[], operands=[]; for(let i=1;i<args.length;i++){ const a=args[i]; if(a==='--backup-dir'){ backup=args[++i]; continue; } if(a==='--exclude-from'){ exclude=fs.readFileSync(args[++i],'utf8').trim().split(/\\n+/).filter(Boolean); continue; } if(a==='--drive-export-formats'||a==='--hash-type'||a==='--exclude'){ i++; continue; } if(a.startsWith('--')) continue; operands.push(a); } const src=local(operands[0]), dst=local(operands[1]); for(const rel of files(src)){ if(excluded(rel,exclude)) continue; const s=path.join(src,rel), d=path.join(dst,rel), ss=fs.statSync(s); if(fs.existsSync(d)){ const ds=fs.statSync(d); if(ss.mtimeMs<=ds.mtimeMs) continue; if(backup){ fs.mkdirSync(path.dirname(path.join(backup,rel)),{recursive:true}); fs.renameSync(d,path.join(backup,rel)); } } fs.mkdirSync(path.dirname(d),{recursive:true}); fs.copyFileSync(s,d); fs.utimesSync(d,ss.atime,ss.mtime); } process.exit(0); }
process.exit(9);`; }

function cli(w, args, runner = RUNNER) { const out = childProcess.spawnSync(process.execPath, [runner, ...args], { env: w.env, encoding: "utf8", timeout: 120000 }); assert.notEqual(out.status, null, out.error?.message); return out; }
function addPair(w, runner = RUNNER) { const out = cli(w, ["pair-add", "--definition", JSON.stringify({ id:"docs", label:"Documents", remote:"Docs", local:w.mirror })], runner); assert.equal(out.status, 0, out.stderr); }
function runOk(w, runner = RUNNER) { const out=cli(w,["run"],runner); assert.equal(out.stdout,"pair=docs result=idle\n",out.stderr); assert.equal(out.status,0,out.stderr); }
function status(w, runner = RUNNER) { const out=cli(w,["status"],runner); assert.equal(out.status,0,out.stderr); return JSON.parse(out.stdout); }
function driveFile(w, rel, text, sec) { const f=path.join(w.drive,"Docs",rel); write(f,text); if(sec) setTime(f,sec); }
function mirrorFile(w, rel, text, sec) { const f=path.join(w.mirror,rel); write(f,text); if(sec) setTime(f,sec); }
function calls(w){ return exists(path.join(w.stub,"rclone.calls")) ? read(path.join(w.stub,"rclone.calls")).trim().split("\n").filter(Boolean).map(JSON.parse) : []; }

function caseTwoWay(runner) { const w=world(); addPair(w,runner); driveFile(w,"drive.txt","drive\n",1700000000); runOk(w,runner); assert.equal(read(path.join(w.mirror,"drive.txt")),"drive\n"); mirrorFile(w,"local.txt","local\n",1700003600); runOk(w,runner); assert.equal(read(path.join(w.drive,"Docs/local.txt")),"local\n"); assert.ok(calls(w).every(c=>!c.argv.some(a=>/^(sync|bisync|move)$/.test(a)||a.startsWith('--delete')))); }
function caseRemovedLocally(runner) { const w=world(); addPair(w,runner); driveFile(w,"a.txt","a\n",1700000000); runOk(w,runner); fs.unlinkSync(path.join(w.mirror,"a.txt")); runOk(w,runner); assert.equal(read(path.join(w.drive,"Docs/a.txt")),"a\n"); assert.equal(read(path.join(w.mirror,"a.txt")),"a\n"); assert.deepEqual(status(w,runner).conflicts.map(c=>[c.kind,c.path]),[["removed-locally","a.txt"]]); }
function caseRemovedOnDrive(runner) { const w=world(); addPair(w,runner); driveFile(w,"a.txt","a\n",1700000000); runOk(w,runner); fs.unlinkSync(path.join(w.drive,"Docs/a.txt")); runOk(w,runner); assert.equal(read(path.join(w.mirror,"a.txt")),"a\n"); assert.equal(read(path.join(w.drive,"Docs/a.txt")),"a\n"); assert.deepEqual(status(w,runner).conflicts.map(c=>[c.kind,c.path]),[["removed-on-drive","a.txt"]]); }
function caseBothChanged(runner) { const w=world(); addPair(w,runner); driveFile(w,"a.txt","base\n",1700000000); runOk(w,runner); mirrorFile(w,"a.txt","local older\n",1700000500); driveFile(w,"a.txt","drive newer\n",1700001000); runOk(w,runner); let s=status(w,runner); assert.equal(read(path.join(w.mirror,"a.txt")),"drive newer\n"); assert.equal(s.conflicts[0].kind,"both-changed"); assert.equal(read(s.conflicts[0].storedPath),"local older\n"); driveFile(w,"b.txt","base\n",1700000000); runOk(w,runner); driveFile(w,"b.txt","drive older\n",1700000500); mirrorFile(w,"b.txt","local newer\n",1700001000); runOk(w,runner); s=status(w,runner); const b=s.conflicts.find(c=>c.path==='b.txt'); assert.equal(b.kind,"both-changed"); assert.equal(b.storedPath, undefined); assert.equal(read(path.join(w.drive,"Docs/b.txt")),"local newer\n"); }
function caseExport(runner) { const w=world(); addPair(w,runner); write(path.join(w.stub,"exports"),"native.docx\n"); driveFile(w,"native.docx","exported\n",1700000000); runOk(w,runner); mirrorFile(w,"native.docx","local must not upload\n",1700003600); runOk(w,runner); assert.equal(read(path.join(w.drive,"Docs/native.docx")),"exported\n"); const upload=calls(w).filter(c=>c.argv.includes('--exclude-from')).pop(); assert.ok(upload, "upload excludes exports"); }
function casePrune(runner) { const w=world(); addPair(w,runner); const old=path.join(w.state,"pairs/docs/conflicts/20000101T000000Z-1/x.txt"); const young=path.join(w.state,"pairs/docs/conflicts/29990101T000000Z-1/y.txt"); write(old,"old"); write(young,"young"); driveFile(w,"a.txt","a\n",1700000000); runOk(w,runner); assert.equal(exists(old),false); assert.equal(exists(young),true); }
function caseMigration(runner) { const w=world(); for(const name of ["client-id","client-secret","token"]) fs.rmSync(path.join(w.stub,"secrets",name),{force:true}); for(const [k,v] of Object.entries({"pull-client-id":"old-pull-client","pull-client-secret":"old-pull-secret","pull-token":"old-token","upload-client-id":"old-up-client","upload-client-secret":"old-up-secret","upload-token":"old-up-token"})) write(path.join(w.stub,"secrets",k),v); write(path.join(w.config,"pairs.json"),JSON.stringify({pairs:[{id:"docs",label:"Documents",direction:"pull",remote:"Docs",local:w.mirror}]},null,2)); write(path.join(w.state,"pairs/docs/state.json"),JSON.stringify({localEdits:[{path:"edited.txt",stored:"stamp/edited.txt",at:"2026-10-10T00:00:00Z"}]},null,2)); write(path.join(w.state,"pairs/docs/inventory.json"),JSON.stringify({entries:{"gone.txt":{size:1,mtimeMs:1,hash:null,id:null,state:"removed-on-drive",since:"2026-10-10T00:00:00Z"}}},null,2)); const out=cli(w,["run"],runner); assert.equal(out.stdout,"pair=docs result=authorization-required\n",out.stderr); assert.equal(read(path.join(w.stub,"secrets","client-id")),"old-pull-client"); assert.equal(read(path.join(w.stub,"secrets","client-secret")),"old-pull-secret"); assert.equal(exists(path.join(w.stub,"secrets","token")),false); for(const old of ["pull-client-id","pull-client-secret","pull-token","upload-client-id","upload-client-secret","upload-token"]) assert.equal(exists(path.join(w.stub,"secrets",old)),false,old); assert.deepEqual(JSON.parse(read(path.join(w.config,"pairs.json"))).pairs,[{id:"docs",label:"Documents",local:w.mirror,remote:"Docs"}]); const st=JSON.parse(read(path.join(w.state,"pairs/docs/state.json"))); assert.deepEqual(st.records.map(r=>[r.kind,r.path,r.stored||null]),[["both-changed","edited.txt","stamp/edited.txt"],["removed-on-drive","gone.txt",null]]); assert.equal(status(w,runner).lastError.account,"token"); }
function caseAuthorizeScope(runner) { const w=world(); fs.rmSync(path.join(w.stub,"secrets","token"),{force:true}); const out=cli(w,["authorize"],runner); assert.equal(out.stdout,"authorized=drive\n",out.stderr); const call=calls(w).find(c=>c.argv[2]==='authorize'); assert.equal(call.env.RCLONE_DRIVE_SCOPE,"drive"); assert.equal(read(path.join(w.stub,"secrets","token.user.person@example.com")).includes('refresh'),true); }
function caseNoForbidden(runner) { const w=world(); addPair(w,runner); driveFile(w,"a.txt","a\n",1700000000); runOk(w,runner); mirrorFile(w,"b.txt","b\n",1700003600); runOk(w,runner); for(const c of calls(w)) for(const a of c.argv) assert.ok(!/^(sync|bisync|move)$/.test(a) && !a.startsWith('--delete'), JSON.stringify(c.argv)); }

function mutant(label, from, to) { const source=read(RUNNER); const n=source.split(from).length-1; assert.equal(n,1,label+" pattern count "+n); const dir=fs.mkdtempSync(path.join(scratch,"mutant-")); const file=path.join(dir,"cloud-sync"); write(file,source.replace(from,to),0o755); return file; }
async function mustFail(label, from, to, fn) { let failed=false; try { fn(mutant(label,from,to)); } catch(e) { failed=true; } assert.equal(failed,true,"control passed: "+label); }
async function main(){ caseTwoWay(); caseRemovedLocally(); caseRemovedOnDrive(); caseBothChanged(); caseExport(); casePrune(); caseMigration(); caseAuthorizeScope(); caseNoForbidden();
 await mustFail("download copy", '["copy", "--update", remotePath(pair), pair.local,', '["copy", "--dry-run", remotePath(pair), pair.local,', caseTwoWay);
 await mustFail("upload copy", '["copy", "--update", pair.local, remotePath(pair)]', '["copy", "--dry-run", pair.local, remotePath(pair)]', caseTwoWay);
 await mustFail("removed locally", 'addRecord(records, { kind: "removed-locally", path: rel });', 'addRecord(records, { kind: "removed-on-drive", path: rel });', caseRemovedLocally);
 await mustFail("removed on Drive", 'kind: to === null ? "removed-on-drive" : "renamed", path: rel, to: to', 'kind: to === null ? "removed-locally" : "renamed", path: rel, to: to', caseRemovedOnDrive);
 await mustFail("both changed", 'addRecord(kept, { kind: "both-changed", path: rel, stored: stored });', 'addRecord(kept, { kind: "removed-on-drive", path: rel, stored: stored });', caseBothChanged);
 await mustFail("export exclude", 'writeExportExcludeFile(pair, exportPaths(listing, inventory));', 'writeExportExcludeFile(pair, []);', caseExport);
 await mustFail("prune age", 'const KEEP_MS = 30 * 24 * 60 * 60 * 1000;', 'const KEEP_MS = 30000 * 24 * 60 * 60 * 1000;', casePrune);
 await mustFail("credential migration", 'const OLD_ACCOUNTS = [].concat(...OLD_DIRECTIONS.map(direction => CREDENTIAL_PARTS.map(part => direction + "-" + part)));', 'const OLD_ACCOUNTS = [];', caseMigration);
 await mustFail("authorize scope", 'RCLONE_DRIVE_SCOPE: DRIVE_SCOPE', 'RCLONE_DRIVE_SCOPE: "drive.file"', caseAuthorizeScope);
 await mustFail("no delete commands", 'const uploadArgs = ["copy", "--update", pair.local, remotePath(pair)].concat(filterArgs());', 'const uploadArgs = ["sync", pair.local, remotePath(pair), "--delete-before"].concat(filterArgs());', caseNoForbidden);
 console.log("test-cloud-sync-runner: ok"); }
main().catch(e=>{ console.error(e); process.exit(1); });
