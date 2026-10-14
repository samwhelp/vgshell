# D107: A format change ships its in-place migration

[← Decision Index](INDEX.md)

**Date**: 2026-10-11

**Status**: Active

**Research**: [VGS-1399](https://linear.app/vanillagreen/issue/VGS-1399), [VGS-1575](https://linear.app/vanillagreen/issue/VGS-1575), [VGS-1683](https://linear.app/vanillagreen/issue/VGS-1683): Jarvis decision (2026-10-14, delegated authority), convert-all for save files VGS writes.

**Supersedes**: the cutover rule of `AGENTS.md` § Conventions, which no record held: a format change rewrote the owner's files once, as a step the master ran by hand.

**Decision**: A format change ships its in-place migration in the same commit. A save file VGS writes keeps every converter step. Its owner runs the steps in order from the saved version on first read, judges the final result with the one judge of the current format, and writes it once. An update keeps the saved data and settings without a reset or set-aside notice. Other formats keep the previous-version-only migration rule. No reader of an old form stays beside the converters: no fallback, shim, alias or second accept path. A damaged, unreadable or future-version file is refused as before. No decision record may require an old form.

**Why**: Automatic migration reaches each install through its first read. A skipped update can leave a save file several versions behind. Keeping each converter prevents that update from discarding saved data and settings. The current judge keeps one definition of a valid file.

**Rejected**: A cutover script the master runs, because it depends on a person and leaves other installs refused. Resetting an older save file, with or without a notice, because it loses saved data and settings. Reading old forms beside the converters, because that keeps a second accept path.

**Revisit when**: A format change cannot be computed from the previous file and the owner's current read context.
