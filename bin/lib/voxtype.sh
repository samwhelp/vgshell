#!/usr/bin/env bash
# voxtype's JSON config and compiled-engine readings, shared by dictation
# setup and the system-step probe. Invalid readings fail the caller.
vgs_voxtype_value() { # KEY
  local json
  json="$(voxtype config get "$1" --json)" || return
  python3 -c 'import json,sys
v=json.load(sys.stdin)
if isinstance(v,dict): v=v["value"]
if not isinstance(v,str) or not v: raise ValueError("config value is not a string")
print(v)' <<<"$json"
}
vgs_voxtype_compiled() { # ENGINE
  local json
  json="$(voxtype info engines --json)" || return
  python3 -c 'import json,sys
rows=json.load(sys.stdin)
if not isinstance(rows,list): raise ValueError("engines is not a list")
print("yes" if any(isinstance(r,dict) and r.get("name")==sys.argv[1] and r.get("compiled") is True for r in rows) else "no")' "$1" <<<"$json"
}
