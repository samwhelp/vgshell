# The one reader of a smoke row's input line and the one list of the core
# rows, sourced by scripts/validate, which selects rows by them, and by
# scripts/qml-smoke.sh --rows, which adds the core rows and the rows a row
# reads. The line's form is in scripts/AGENTS.md.

# The rows every run that does not run every row runs: the bar and the
# session the others build on, the consent row that answers the dialog the
# first shell raises, the start order and auth-sentinel, whose reading
# covers every row the run held. scripts/check-smoke-readers.py reads the
# line.
smoke_core=(bar hyprland-consent session start-order auth-sentinel)

# smoke_inputs_read FILE: read FILE's one `# inputs: GLOB [GLOB...]` line,
# in its leading comment block (the lines from its first that start with
# #), into smoke_globs, with the line itself in smoke_inputs_line, and
# return 0. Otherwise leave smoke_globs empty, set smoke_inputs_fault to
# unreadable, missing, lines=<count> or empty, and return 1.
smoke_inputs_read() { # FILE
  local count=0
  smoke_globs=()
  smoke_inputs_fault=""
  if ! smoke_inputs_line="$(awk '!/^#/ { exit } /^# inputs:/ { print }' "$1")"; then
    smoke_inputs_fault=unreadable; return 1
  fi
  [[ -z $smoke_inputs_line ]] || count="$(wc -l <<<"$smoke_inputs_line")"
  if [[ $count -eq 0 ]]; then smoke_inputs_fault=missing; return 1; fi
  if [[ $count -gt 1 ]]; then smoke_inputs_fault="lines=$count"; return 1; fi
  read -r -a smoke_globs <<<"${smoke_inputs_line#\# inputs:}"
  if [[ ${#smoke_globs[@]} -eq 0 ]]; then smoke_inputs_fault=empty; return 1; fi
}

# smoke_inputs_rows ROW: the row files the globs last read name, as row
# names in smoke_inputs_named: each glob that is one file under
# scripts/smoke/rows/ other than ROW's own. ROW reads that row's functions
# or state and fails without it. A glob with a wildcard names no one row.
smoke_inputs_rows() { # ROW
  local glob name
  smoke_inputs_named=()
  for glob in "${smoke_globs[@]}"; do
    name="${glob#scripts/smoke/rows/}"; name="${name%.sh}"
    if [[ $glob == "scripts/smoke/rows/$name.sh" && $name =~ ^[a-z0-9-]+$ && $name != "$1" ]]; then
      smoke_inputs_named+=("$name")
    fi
  done
}
