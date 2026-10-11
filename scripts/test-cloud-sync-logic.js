#!/usr/bin/env node
// Cloud Sync logic tests for the two-way status contract. Controls edit a
// copy of CloudSyncLogic.js and require this suite to fail on the copy.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("../bin/lib/qml-library.js");
const file = path.join(__dirname, "..", "shell/plugins/vgs.cloud-sync/CloudSyncLogic.js");
const repo = path.join(__dirname, "..");
const scratchRoot = path.join(repo, "tmp");
fs.mkdirSync(scratchRoot, { recursive: true });
const scratch = fs.mkdtempSync(path.join(scratchRoot, "test-cloud-sync-logic-"));
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));
const NOW = Date.parse("2026-10-11T12:00:00Z");
const iso = ms => new Date(ms).toISOString();
const pair = { id:"docs", label:"Documents", remote:"Docs", state:"idle", lastSuccess:iso(NOW-1000), staleAfter:iso(NOW+1000), lastError:null, changes:{added:1,updated:1} };
const conflicts = [
  { kind:"both-changed", pair:"docs", pairLabel:"Documents", path:"a.txt", localPath:"/home/me/gdrive/a.txt", storedPath:"/home/me/state/conflicts/s/a.txt", since:iso(NOW-1000) },
  { kind:"both-changed", pair:"docs", pairLabel:"Documents", path:"b.txt", localPath:"/home/me/gdrive/b.txt", since:iso(NOW-1000) },
  { kind:"removed-locally", pair:"docs", pairLabel:"Documents", path:"c.txt", localPath:"/home/me/gdrive/c.txt", since:iso(NOW-1000) },
  { kind:"removed-on-drive", pair:"docs", pairLabel:"Documents", path:"d.txt", localPath:"/home/me/gdrive/d.txt", since:iso(NOW-1000) },
  { kind:"renamed", pair:"docs", pairLabel:"Documents", path:"e.txt", to:"f.txt", localPath:"/home/me/gdrive/e.txt", since:iso(NOW-1000) }
];
function record(over={}) { return Object.assign({ state:"idle", paused:false, units:"installed", lastSuccess:iso(NOW-1000), staleAfter:iso(NOW+1000), lastError:null, pairs:[pair], conflicts:[], attention:null, writtenAt:iso(NOW) }, over); }
function probe(over={}) { return { credentials:["pull-client-id","pull-client-secret","pull-token","upload-client-id","upload-client-secret","upload-token"].map(account => Object.assign({account, presence:"present", needed:true}, account.endsWith("-token")?{user:"person@example.com"}:{}, over[account]||{})) }; }
function same(a,b,m){ if (m === undefined) assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))); else assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m); }
function verify(L) {
  assert.equal(L.parseStatus(JSON.stringify(record())).ok, true);
  same(L.parseStatus(JSON.stringify(record({ pairs:[Object.assign({}, pair, { direction:"pull" })] }))), {ok:false,error:"status=pairs"}, "status rejects direction");
  assert.equal(L.parseStatus(JSON.stringify(record({ conflicts }))).ok, true, "new conflict kinds pass");
  same(L.parseStatus(JSON.stringify(record({ conflicts:[Object.assign({}, conflicts[0], { storedPath:"relative" })] }))), {ok:false,error:"status=conflicts"}, "stored path must be absolute");
  same(L.parseProbe(JSON.stringify(probe())).presence["pull-token"].user, "person@example.com");
  same(L.parseProbe(JSON.stringify({credentials: probe({"pull-client-id":{user:"person@example.com"}}).credentials})), {ok:false,error:"probe=user account=pull-client-id"});
  same(Object.keys(L.statusValues(record(), L.parseProbe(JSON.stringify(probe())).presence, "", NOW)).sort(), ["cloud","download","downloadKeys","lastSync","pairs","schedule","sync","upload","uploadKeys"]);
  const values = L.statusValues(record({conflicts}), L.parseProbe(JSON.stringify(probe())).presence, "", NOW);
  same(values.downloadKeys.map(k=>[k.secret,k.value]), [["pull-client-id","present"],["pull-client-secret","present"]]);
  same(values.download, {tone:"ok", text:"Signed in", hint:"Signed in as person@example.com.", action:"signOut"});
  same(L.statusValues(null, L.parseProbe(JSON.stringify(probe({"pull-token":{presence:"absent"}}))).presence, "", NOW).download, {tone:"warning", text:"Not signed in", action:"signIn"});
  same(L.statusValues(record({pairs:[Object.assign({}, pair, {state:"authorization-required", lastError:{kind:"authorization-refused"}})]}), L.parseProbe(JSON.stringify(probe())).presence, "", NOW).download, {tone:"danger", text:"Sign-in refused", action:"reconnect", hint:"Google Drive did not accept the sign-in."});
  same(values.pairs.lines, ["Documents: Docs"]);
  same(L.pairRow(values.cloud.pairs[0], NOW), {id:"docs", label:"Documents", secondary:"Docs", icon:"folder-sync", text:"Up to date", tone:"success"});
  assert.equal(L.headline(values.cloud, NOW).text, "5 files to review");
  same(L.conflictGroups(values.cloud.conflicts)[0].rows.map(r=>[r.label,r.secondary,r.dirs]), [
    ["a.txt", "Changed here and on Google Drive. The older copy is kept for 30 days.", ["/home/me/gdrive","/home/me/state/conflicts/s"]],
    ["b.txt", "Changed here and on Google Drive. The older copy is kept for 30 days.", ["/home/me/gdrive"]],
    ["c.txt", "Removed here. Cloud Sync copied it back from Google Drive.", ["/home/me/gdrive"]],
    ["d.txt", "Removed from Google Drive. The copy here stays.", ["/home/me/gdrive"]],
    ["e.txt", "Renamed on Google Drive to f.txt", ["/home/me/gdrive"]]
  ]);
  assert.equal(L.errorText({kind:"credential-absent", account:"pull-token"}, true), "Google Drive is not signed in for Download. Select Sign in below.");
  same(L.notification(record({state:"authorization-required", lastError:{kind:"credential-absent", account:"pull-token"}, attention:{reasons:["authorization-required"],key:"k",notified:false}})), {title:"Cloud Sync needs a sign-in", message:"Google Drive is not signed in for Download. Select Sign in on the Cloud Sync page in Settings.", tone:"danger"});
}
verify(load(file));
const source = fs.readFileSync(file, "utf8");
const controls = [
  ["status rejects direction", 'return isObject(p) && !hasOwn(p, "direction") && isText(p.id) && isText(p.label) && isText(p.remote)', "return isObject(p) && isText(p.id) && isText(p.label)"],
  ["new conflicts", 'var CONFLICT_KINDS = ["local-edit", "both-changed", "removed-locally", "removed-on-drive", "renamed"];', 'var CONFLICT_KINDS = ["removed-on-drive", "renamed"];'],
  ["stored folder", 'if ((conflict.kind === "local-edit" || conflict.kind === "both-changed") && conflict.storedPath !== undefined) dirs.push(dirname(conflict.storedPath));', ""],
  ["token user only", '!/-token$/.test(c.account) || !isAddress(c.user)', 'false'],
  ["pair remote", 'var secondary = pair.remote || "Two-way";', 'var secondary = "Download";']
];
for (const [label, needle, replacement] of controls) {
  const count = source.split(needle).length - 1;
  assert.equal(count, 1, label + " pattern count " + count);
  const mutant = path.join(fs.mkdtempSync(path.join(scratch, "control-")), "CloudSyncLogic.js");
  fs.writeFileSync(mutant, source.replace(needle, replacement));
  let failed = false;
  try { verify(load(mutant)); } catch (_) { failed = true; }
  assert.equal(failed, true, "control passed: " + label);
}
console.log("test-cloud-sync-logic: ok");
