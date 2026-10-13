# D107: A format change ships the in-place migration of the previous version

[← Decision Index](INDEX.md)

**Date**: 2026-10-11

**Status**: Active

**Research**: [VGS-1399](https://linear.app/vanillagreen/issue/VGS-1399), [VGS-1575](https://linear.app/vanillagreen/issue/VGS-1575) (px13 skipped package versions and kept notifications state version 1 while the current format was 4)

**Supersedes**: the cutover rule of `AGENTS.md` § Conventions, which no record held: a format change rewrote the owner's files once, as a step the master ran by hand.

**Decision**: A change to the format of a file VGS writes ships, in the same commit, the migration that rewrites the previous version in place. The file's owner runs it on the first read, judges the result with the one judge of the new version, and writes it once. No reader of the old form stays beside the migration: no fallback, shim, alias or second accept path. The migration covers the previous version alone. A file more than one version behind is set aside once under a dated name before a fresh current file replaces it. One notice names the data and settings that were reset. No old-form reader chain stays. A damaged, unreadable or future-version file is refused as before. No decision record may require an old form.

**Why**: Automatic migration reaches each install through its first read. The new version's judge keeps one definition of a valid file. A skipped package upgrade can leave a file further behind. Setting it aside ends the repeated refusal and retains its bytes without keeping readers for retired formats.

**Rejected**: A cutover script the master runs, because it depends on a person and leaves every other install refused. Reading both versions or keeping a chain of old-version readers, because retired formats remain permanent runtime contracts.

**Revisit when**: A format change cannot be computed from the previous file alone, or resetting skipped-version data becomes unacceptable to the owner.
