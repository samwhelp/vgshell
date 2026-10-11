# D107: A format change ships the in-place migration of the previous version

[← Decision Index](INDEX.md)

**Date**: 2026-10-11

**Status**: Active

**Research**: [VGS-1399](https://linear.app/vanillagreen/issue/VGS-1399)

**Supersedes**: the cutover rule of `AGENTS.md` § Conventions, which no record held: a format change rewrote the owner's files once, as a step the master ran by hand.

**Decision**: A change to the format of a file VGS writes ships, in the same commit, the migration that rewrites the previous version in place. The file's owner runs it on the first read, judges the result with the one judge of the new version, and writes it once. No reader of the old form stays beside the migration: no fallback, shim, alias or second accept path. The migration covers the previous version alone, and a file of any other version is refused as before. No decision record may require an old form.

**Why**: A hand-run step reaches only the machines someone runs it on. The notifications' version 3 state file landed with its cutover unrun on the owner's machine, and the panel read his 100 saved notifications as damaged. A migration inside the owner reaches every install by the one path every install takes, the read, and passing its result through the new version's judge keeps one definition of a valid file.

**Rejected**: A cutover script the master runs, because it depends on a person and leaves every other install refused. Reading both versions, because two accept paths drift apart and the old form never leaves.

**Revisit when**: A format change cannot be computed from the previous file alone, or an install is found more than one format version behind.
