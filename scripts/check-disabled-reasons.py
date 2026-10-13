#!/usr/bin/env python3
"""List the plugin sites that can disable a qs.Ui control without saying why.

docs/architecture/design-system.md § Components: a control disables
through `disabledReason`, which it shows on hover and keyboard focus while
it stays a Tab stop. `enabled: false` alone disables it with no reason and
takes it out of the Tab order. This check reports and never fails: each
plugin's sites are their own work item (owner direction, VGS-1642).

A site is a block under ROOT/plugins/ whose type names a qs.Ui component
that takes a reason and that binds the component's enable property to
anything but the literal `true`, with no binding of the paired reason
property in the same block. The components and their pairs are read from
the module's own files: a component the module exports whose root object
declares `property string <prefix>disabledReason`, the first letter of
`disabledReason` upper case after a prefix, pairs it with
`<prefix>enabled` the same way, so Switch pairs `disabledReason` with
`enabled` and Pane `switchDisabledReason` with `switchEnabled`. A
component whose root type is one of those takes its pairs, as IconButton
takes Button's. A type names a qs.Ui component unqualified, or qualified
with the alias its file's `import qs.Ui as <alias>` binds; `T.Button`
names a Qt Quick Templates type. A set without a REQUIRED member means the
reader broke, and the run ends unreadable rather than list too few sites.

Not judged: an enable property a script assigns (`switch.enabled = x`),
and a plugin's own component built on a qs.Ui control.

Usage: check-disabled-reasons.py [ROOT]
ROOT is the repository's shell/ by default; ROOT/Ui/qmldir names the
components. Each site is one line, `<file>:<line> <component> <property>`,
the line the block's type opens on, then
`check-disabled-reasons: sites=<n> files=<n> components=<n>`. Exit 0 after
a full read, whatever it lists; 2 when a file cannot be read, printed as
`check-disabled-reasons: unreadable: <path>: <strerror>`.
"""
import os
import re
import sys

# A check writes nothing into the tree it reads, so the shared module leaves
# no bytecode cache beside it.
sys.dont_write_bytecode = True
from qml_controls import blocks
from qml_source import Unreadable, blank_comments, source_texts

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
# The members the reader must find, each with the enable property it pairs.
REQUIRED = {"Switch": "enabled", "Pane": "switchEnabled"}
UI_ALIAS = re.compile(r"^\s*import\s+qs\.Ui(?:\s+[\d.]+)?\s+as\s+(\w+)\s*$", re.M)
REASON = re.compile(r"(?:^|[;\n])\s*property\s+string\s+(?:(\w*?)(D)|(d))isabledReason\s*(?::|;|\n|$)")


def ui_name(type_name, alias):
    """The qs.Ui component `type_name` names in a file, or ""."""
    if type_name is None:
        return ""
    if "." not in type_name:
        return type_name
    qualifier, _, name = type_name.partition(".")
    return name if qualifier == alias else ""


def parsed(path):
    """The blocks of a QML file and the alias it binds to qs.Ui, or None."""
    try:
        with open(path, "r", encoding="utf-8-sig") as handle:
            text = handle.read()
    except OSError as exc:
        raise Unreadable(path, exc.strerror or str(exc)) from exc
    alias = UI_ALIAS.search(blank_comments(text))
    return blocks(blank_comments(text, literals=False)), alias.group(1) if alias else None


def binding(name):
    return re.compile(r"(?:^|[;\n])\s*" + re.escape(name) + r"\s*:\s*([^;\n]*)")


def exports(ui):
    path = os.path.join(ui, "qmldir")
    try:
        with open(path, "r", encoding="utf-8") as handle:
            lines = handle.read().splitlines()
    except OSError as exc:
        raise Unreadable(path, exc.strerror or str(exc)) from exc
    for line in lines:
        parts = line.split()
        if len(parts) == 3 and parts[1][0].isdigit() and parts[2].endswith(".qml"):
            yield parts[0], os.path.join(ui, parts[2])


def root_block(path):
    found, alias = parsed(path)
    root = next((block for block in found if block.type is not None), None)
    return root, alias


def pairs_of(block):
    """The (enable, reason) property pairs a root block declares."""
    out = []
    for m in REASON.finditer(block.own_text()):
        if m.group(3) is not None:
            out.append(("enabled", "disabledReason"))
        elif m.group(1):
            out.append((m.group(1) + "Enabled", m.group(1) + "DisabledReason"))
    return out


def components(ui):
    roots = {name: root_block(path) for name, path in exports(ui)}
    found = {name: pairs_of(block) for name, (block, _alias) in roots.items() if block is not None and pairs_of(block)}
    grew = True
    while grew:
        grew = False
        for name, (block, alias) in roots.items():
            parent = ui_name(block.type, alias) if block is not None else ""
            if name not in found and parent in found:
                found[name] = found[parent]
                grew = True
    for name, enable in REQUIRED.items():
        if enable not in (pair[0] for pair in found.get(name, [])):
            raise Unreadable(os.path.join(ui, "qmldir"), f"reader-broken missing={name}.{enable} found={sorted(found)}")
    return found


def sites(plugins, found):
    out = []
    files = 0
    for path, text in source_texts(plugins):
        if not path.endswith(".qml"):
            continue
        files += 1
        alias = UI_ALIAS.search(blank_comments(text))
        for block in blocks(blank_comments(text, literals=False)):
            name = ui_name(block.type, alias.group(1) if alias else None)
            if name not in found:
                continue
            own = block.own_text()
            for enable, reason in found[name]:
                bound = binding(enable).search(own)
                if bound is None or bound.group(1).strip() == "true":
                    continue
                if binding(reason).search(own) is None:
                    out.append(f"{path}:{block.line} {name} {enable}")
    return out, files


def main(argv):
    root = os.path.abspath(argv[1] if len(argv) > 1 else os.path.join(REPO, "shell"))
    try:
        found = components(os.path.join(root, "Ui"))
        listed, files = sites(os.path.join(root, "plugins"), found)
    except Unreadable as exc:
        print(f"check-disabled-reasons: unreadable: {exc.path}: {exc.strerror}")
        return 2
    for line in listed:
        print(line)
    print(f"check-disabled-reasons: sites={len(listed)} files={files} components={len(found)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
