# D105: Jarvis's knowledge lives in one home folder that grants no authority

[← Decision Index](INDEX.md)

**Date**: 2026-10-09

**Status**: Active

**Research**: the Jarvis plan attached to [VGS-1194](https://linear.app/vanillagreen/issue/VGS-1194)

**Refines**: [D070](D070-jarvis-action-policy.md), which stays the only source of permission, and [D079](D079-brains-wire-and-harness-adapters.md), whose harness program keeps its private working folder

**Decision**: One folder the user picks holds what Jarvis knows: `AGENTS.md`, the base skill package, the user's skills under `skills/own/`, `memory/` and `state/`. The base package has one source per home: kendex's render at `.agents/skills/jarvis/` where the home holds it, else the copy of the package VGS ships under `skills/base/`; the open of a home that holds the render removes `skills/base/`, and a render that is partial, a link or holds a link refuses the home. Its text reaches every brain by one route, and the voice that only reads the brain's words aloud gets none. `Guidance.compose` adds `AGENTS.md` and an index of the skills to the shipped guidance, and each skill body is a `help` topic read through the router. A harness program never runs in the home, so it loads none of the home's settings, hooks or MCP servers, and each vendor's own memory is off at launch. Home text carries the release label `home`: it taints no turn and goes to the conversation's recipients without a grant. The gate protects the whole home folder through `Denied`: a model's file tool, shell command or harness approval reaches no path in it but `state/`. One route the gate owns adds to the folder outside `state/`: the `fleet.request` tool hands one request a turn to the Jarvis session's mailbox by running `scripts/lane-mail` of the orch skill of the `vanillagreencom/kendex` package, installed at `.agents/skills/orch/scripts/lane-mail`, the one program Jarvis starts from a home, because kendex owns that mailbox's rows, lock and reader and a second writer in VGS would drift from them.

**Why**: A wire brain has no working folder, so only the instruction route gives every brain the same knowledge. Two writers of the base package in one home would leave two versions, and the brain could read one that `kendex refresh` did not fetch. A program started in the home would load its hooks, extensions and MCP servers outside the gate, and each vendor loads a different part of a folder. A vendor's memory is a second store that one brain reads and Jarvis cannot audit. The label `file` on home text would taint every turn and raise every changing action to a confirmation; `home` is safe only while the text's writers are the user, VGS, and the Jarvis session acting on the owner's word as the owner's delegate, whose commits are the record; the protected folder keeps every model out of that set. The rule names no entry, so a file a model adds beside the layout, such as a harness program's own settings, is refused as `AGENTS.md` is.

**Rejected**: Each harness program with the home as its working folder, reading `AGENTS.md` and skills its own way. It reaches no wire brain, and the home's hooks and servers would act without the gate.

**Revisit when**: A vendor's program reads a folder's instructions without its settings, hooks and servers, home text gains a writer outside the user, VGS and the Jarvis session acting as the owner's delegate, or a brain needs home knowledge the instruction route cannot carry.
