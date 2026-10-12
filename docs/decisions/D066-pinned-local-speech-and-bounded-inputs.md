# D066: Local speech uses pinned exports and CPU streaming captions

[← Decision Index](INDEX.md)

**Date**: 2026-09-30
**Status**: Active
**Research**: [VGS-651](https://linear.app/vanillagreen/issue/VGS-651) and the measurements attached to it

**Decision**: `artifacts.json` pins every speech export. It pins no final recognizer: the utterance's words are the core's dictation recording's. Nemotron's cached streaming export runs captions on CPU in every tier, and Piper LJSpeech and the Apache wake archive are the selected voice and wake models.

**Why**: Measured on host cachy on 2026-09-30 by `shell/plugins/vgs.jarvis/measure-local`, Parakeet's full-buffer re-decode of 30 s and 60 s took 0.953 s and 2.367 s on CPU against a 200 ms caption interval. The rejected voices and wake models carry research-only or non-commercial terms.

**Rejected**: Parakeet full-buffer captions.

**Revisit when**: An export, runtime, licence, selected voice or input contract changes, or another machine needs different providers.
