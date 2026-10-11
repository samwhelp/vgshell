# D106: Dictation is a core-lent capability over a voxtype daemon the core owns

[← Decision Index](INDEX.md)

**Date**: 2026-10-11

**Status**: Active

**Research**: the reading attached to [VGS-1200](https://linear.app/vanillagreen/issue/VGS-1200)

**Refines**: [D012](D012-core-owns-lent-objects.md)

**Decision**: A program two plugins drive is lent by a core capability that owns its process. The core lends `dictation`, which is not exclusive: it hands voxtype one recording at a time and names the holder to every other. The first holder starts one `voxtype daemon` as the shell's child with SIGKILL as its parent-death signal, and the last release ends it. Beside a daemon it did not start the core reads `elsewhere` and starts none.

**Why**: voxtype 1.1.0 keeps one output override for the whole daemon, so a second caller's `record start --file` takes the first caller's text. A recording whose caller died ends at voxtype's cap, which drops the file override and types the text into the focused window. A daemon that dies with the shell leaves no recording to reach the cap, and a daemon that runs only while a plugin holds the capability holds no model while none does. `scripts/test-dictation-model.js` and `scripts/smoke/rows/dictation.sh` hold both.

**Rejected**: Keeping voxtype's user unit and lending only the requests. The unit holds its model with every holder off, and a recording outlives the shell that asked for it.

**Revisit when**: voxtype scopes an output override to one recording, takes audio from another process, or cancels a recording whose caller is gone.
