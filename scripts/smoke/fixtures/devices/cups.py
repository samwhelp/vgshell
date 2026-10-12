#!/usr/bin/env python3
"""The sandbox's CUPS: one world file, the lpstat and ipptool stand-ins that
read it, and a cups-pk-helper stand-in on the sandbox system bus that
changes it and sends CUPS's D-Bus notifications.

Usage: cups.py helper STATE                 serve org.opensuse.CupsPkHelper.Mechanism
       cups.py signal STATE MEMBER PRINTER  send one org.cups.cupsd.Notifier signal
       cups.py uninstalled SOURCE DEST      copy vgs.printers from SOURCE to DEST
                                            as a computer without CUPS sees it

`uninstalled` writes a copy whose `lpstat` is `vgs-smoke-lpstat`, a
command no PATH holds, in its manifest's requirements and in the CUPS
commands its service and pane read, so a scan reads printing not
installed while the sandbox's lpstat stand-in stays where it is; the
host's lpstat is never reached. It prints `copy=written`.

stand-in.py runs lpstat(STATE, ARGV) and ipptool(STATE, ARGV) for the
stand-ins of those names, after it recorded the call. No part of this file
reaches the host's CUPS, its socket, its helper or polkit: the bus is the
one DBUS_SYSTEM_BUS_ADDRESS names, the sandbox's, and every answer comes
from STATE/cups.json.

The world, STATE/cups.json; an absent file is a running scheduler with no
printer, no device and no subscription:
  {"down": false,             the scheduler is not running
   "printers": [{"name", "uri", "state": "idle"|"printing"|"stopped",
                 "message", "jobs", "accepting"}],
   "default": "",             the default destination's name
   "devices": [{"class", "info", "make", "uri"}],  what DevicesGet finds
   "refuse": false,           every helper method answers NotPrivileged,
                              as polkit does for a refused or dismissed
                              prompt, and changes nothing
   "quiet": false,            the helper changes the world and sends no
                              signal
   "subscriptions": {"next": 1, "live": [], "cancelled": [],
                     "owners": {"<id>": "<user>"}}}

lpstat prints, for -r, -d, -p, -o and -v in the order given, the lines
lpstat.c writes in the C locale; with "down" the later options print
`lpstat: Scheduler is not running.` on stderr and exit 1. ipptool takes
the plugin's ipp/default.test, subscribe.test, renew.test and cancel.test
by name, with their -d variables, and prints the CUPS test report (-t)
lines ipptool.c writes: the world's default, a subscription's id from
"next", a renewal of a live id, and a cancel that moves a live id to
"cancelled"; any other id fails. A subscription's owner is the caller when
its test file sends requesting-user-name $user, else "anonymous", as
cupsd records it, and a renewal or cancel passes only for its owner over
the domain socket, where cupsd authenticates the peer by PeerCred: the
stock policy's `Require user @OWNER @SYSTEM`. With "down" it fails as a
refused connection.

The helper records each call as one JSON line, {"method", "args"}, in
STATE/calls/cups-pk-helper.calls, and prints `helper=ready` once it owns
its name. PrinterAdd makes a stopped queue that refuses jobs, as CUPS
makes one; PrinterSetEnabled and PrinterSetAcceptJobs move it. Each change
sends the signal cupsd's dbus notifier sends for it, on
/org/cups/cupsd/Notifier, with the notifier's arguments (sssusb): text,
printer URI, printer name, printer state, reasons, accepting.
"""

import getpass
import json
import os
import sys

HELPER = "org.opensuse.CupsPkHelper.Mechanism"
NOTIFIER_PATH = "/org/cups/cupsd/Notifier"
NOTIFIER = "org.cups.cupsd.Notifier"
SINCE = "Sat 11 Oct 2026 09:00:00 AM UTC"
STATES = {"idle": 3, "printing": 4, "stopped": 5}
MISSING = "The printer or class does not exist."


def world_path(state):
    return os.path.join(state, "cups.json")


def load(state):
    path = world_path(state)
    doc = json.load(open(path)) if os.path.exists(path) else {}
    doc.setdefault("down", False)
    doc.setdefault("printers", [])
    doc.setdefault("default", "")
    doc.setdefault("devices", [])
    doc.setdefault("refuse", False)
    doc.setdefault("quiet", False)
    doc.setdefault("subscriptions", {"next": 1, "live": [], "cancelled": []})
    return doc


def save(state, doc):
    path = world_path(state)
    with open(path + ".next", "w") as out:
        json.dump(doc, out)
    os.replace(path + ".next", path)


def append(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a") as out:
        out.write(json.dumps(value) + "\n")


# ---------------------------------------------------------------- lpstat

def lpstat(state, argv):
    doc = load(state)
    printers = sorted(doc["printers"], key=lambda p: p["name"].lower())
    for option in argv:
        if option not in ("-r", "-d", "-p", "-o", "-v"):
            print(f"stand-in: name=lpstat option={option} reason=unsupported", file=sys.stderr)
            sys.exit(1)
    for option in argv:
        if option == "-r":
            print("scheduler is not running" if doc["down"] else "scheduler is running")
            continue
        if doc["down"]:
            sys.stdout.flush()
            print("lpstat: Scheduler is not running.", file=sys.stderr)
            sys.exit(1)
        if option == "-d":
            print(f"system default destination: {doc['default']}" if doc["default"] else "no system default destination")
        elif option == "-p":
            for p in printers:
                if p["state"] == "idle":
                    print(f"printer {p['name']} is idle.  enabled since {SINCE}")
                elif p["state"] == "printing":
                    print(f"printer {p['name']} now printing {p['name']}-100.  enabled since {SINCE}")
                else:
                    print(f"printer {p['name']} disabled since {SINCE} -")
                    if not p.get("message"):
                        print("\treason unknown")
                if p.get("message"):
                    print("\t" + p["message"])
        elif option == "-o":
            for p in printers:
                for n in range(p.get("jobs", 0)):
                    print("%-23s %-13s %8.0f   %s" % (f"{p['name']}-{100 + n}", "smoke", 1024.0, SINCE))
        elif option == "-v":
            for p in printers:
                print(f"device for {p['name']}: {p['uri']}")


# ---------------------------------------------------------------- ipptool

def ipptool(state, argv):
    names, positional, rest = {}, [], list(argv)
    while rest:
        word = rest.pop(0)
        if word == "-d" and rest:
            key, _, value = rest.pop(0).partition("=")
            names[key] = value
        elif word == "-T" and rest:
            rest.pop(0)
        elif word == "-t":
            continue
        else:
            positional.append(word)
    if len(positional) != 2:
        print("stand-in: name=ipptool usage=URI FILE", file=sys.stderr)
        sys.exit(1)
    doc = load(state)
    if doc["down"]:
        print('ipptool: Unable to connect to "localhost" on port 631 - Connection refused', file=sys.stderr)
        sys.exit(1)
    test = os.path.basename(positional[1])
    print(f'"{test}":')
    subs = doc["subscriptions"]
    owners = subs.setdefault("owners", {})
    # cupsd authenticates a peer by PeerCred only on its domain socket; a
    # TCP client is no user the owner rule admits.
    peer = getpass.getuser() if positional[0].lower().startswith(("ipp://%2f", "ipp:///")) else ""
    if test == "default.test":
        report("Get the default printer", True)
        if doc["default"]:
            print(f"        printer-name (nameWithoutLanguage) = {doc['default']}")
        return
    if test == "subscribe.test":
        if names.get("recipient") != "dbus://":
            report("Create a printer subscription", False)
        sub_id = subs["next"]
        subs["next"] += 1
        subs["live"].append(sub_id)
        # cupsd records requesting-user-name as an unauthenticated
        # subscription's owner, else "anonymous".
        sends_user = "ATTR name requesting-user-name $user" in open(positional[1]).read()
        owners[str(sub_id)] = getpass.getuser() if sends_user else "anonymous"
        save(state, doc)
        report("Create a printer subscription", True)
        print(f"        notify-subscription-id (integer) = {sub_id}")
        return
    sub_id = int(names.get("id", "0"))
    # The stock policy's `Require user @OWNER @SYSTEM` for Renew and Cancel.
    if test in ("renew.test", "cancel.test") and (peer == "" or owners.get(str(sub_id)) != peer):
        report("Renew the subscription" if test == "renew.test" else "Cancel the subscription", False)
    if test == "renew.test":
        report("Renew the subscription", sub_id in subs["live"])
        return
    if test == "cancel.test":
        if sub_id in subs["live"]:
            subs["live"].remove(sub_id)
            subs["cancelled"].append(sub_id)
            save(state, doc)
            report("Cancel the subscription", True)
        else:
            report("Cancel the subscription", False)
        return
    print(f"stand-in: name=ipptool test={test} reason=unknown", file=sys.stderr)
    sys.exit(1)


def report(name, passed):
    print("    %-68.68s [%s]" % (name, "PASS" if passed else "FAIL"))
    if not passed:
        sys.exit(1)


# ---------------------------------------------------------------- the helper

def bus_connection(mainloop=None):
    import dbus
    address = os.environ["DBUS_SYSTEM_BUS_ADDRESS"]
    return dbus.bus.BusConnection(address, mainloop=mainloop) if mainloop is not None else dbus.bus.BusConnection(address)


def notifier_args(doc, name, text):
    import dbus
    printer = next((p for p in doc["printers"] if p["name"] == name), None)
    state = STATES[printer["state"]] if printer else STATES["stopped"]
    accepting = bool(printer and printer.get("accepting", True))
    return [dbus.String(text), dbus.String(f"ipp://localhost/printers/{name}"), dbus.String(name),
            dbus.UInt32(state), dbus.String("none"), dbus.Boolean(accepting)]


def send_signal(bus, member, args):
    import dbus.lowlevel
    message = dbus.lowlevel.SignalMessage(NOTIFIER_PATH, NOTIFIER, member)
    message.append(signature="sssusb", *args)
    bus.send_message(message)


def helper(state):
    import dbus
    import dbus.service
    from dbus.mainloop.glib import DBusGMainLoop
    from gi.repository import GLib

    calls = os.path.join(state, "calls", "cups-pk-helper.calls")
    bus = bus_connection(DBusGMainLoop())

    class NotPrivileged(dbus.DBusException):
        _dbus_error_name = HELPER + ".NotPrivileged"

    def valid_name(name):
        return 0 < len(name) <= 127 and name.isprintable() and not any(c in name for c in " \t/#")

    class Mechanism(dbus.service.Object):
        def begin(self, method, *args):
            append(calls, {"method": method, "args": [a if isinstance(a, (str, bool)) else (list(a) if isinstance(a, (list, dbus.Array)) else int(a)) for a in args]})
            doc = load(state)
            if doc["refuse"]:
                raise NotPrivileged("Not Authorized for action: org.opensuse.cupspkhelper.mechanism." + method)
            return doc

        def changed(self, doc, member, name, text):
            save(state, doc)
            if not doc["quiet"]:
                send_signal(bus, member, notifier_args(doc, name, text))

        @dbus.service.method(HELPER, in_signature="sssss", out_signature="s")
        def PrinterAdd(self, name, uri, ppd, info, location):
            doc = self.begin("PrinterAdd", str(name), str(uri), str(ppd), str(info), str(location))
            if not valid_name(name):
                return f'"{name}" is not a valid printer name.'
            found = next((p for p in doc["printers"] if p["name"].lower() == name.lower()), None)
            if found:
                found["uri"] = str(uri)
                self.changed(doc, "PrinterModified", found["name"], f'Printer "{name}" modified.')
                return ""
            doc["printers"].append({"name": str(name), "uri": str(uri), "state": "stopped", "message": "", "jobs": 0, "accepting": False})
            self.changed(doc, "PrinterAdded", str(name), f'New printer "{name}" added.')
            return ""

        @dbus.service.method(HELPER, in_signature="sb", out_signature="s")
        def PrinterSetEnabled(self, name, enabled):
            doc = self.begin("PrinterSetEnabled", str(name), bool(enabled))
            found = next((p for p in doc["printers"] if p["name"] == name), None)
            if found is None:
                return MISSING
            found["state"] = "idle" if enabled else "stopped"
            self.changed(doc, "PrinterStateChanged", found["name"], "Printer state changed.")
            return ""

        @dbus.service.method(HELPER, in_signature="sbs", out_signature="s")
        def PrinterSetAcceptJobs(self, name, enabled, reason):
            doc = self.begin("PrinterSetAcceptJobs", str(name), bool(enabled), str(reason))
            found = next((p for p in doc["printers"] if p["name"] == name), None)
            if found is None:
                return MISSING
            found["accepting"] = bool(enabled)
            self.changed(doc, "PrinterModified", found["name"], "Printer modified.")
            return ""

        @dbus.service.method(HELPER, in_signature="s", out_signature="s")
        def PrinterSetDefault(self, name):
            doc = self.begin("PrinterSetDefault", str(name))
            if not any(p["name"] == name for p in doc["printers"]):
                return MISSING
            doc["default"] = str(name)
            self.changed(doc, "PrinterModified", str(name), f'Default destination set to "{name}".')
            return ""

        @dbus.service.method(HELPER, in_signature="s", out_signature="s")
        def PrinterDelete(self, name):
            doc = self.begin("PrinterDelete", str(name))
            if not any(p["name"] == name for p in doc["printers"]):
                return MISSING
            doc["printers"] = [p for p in doc["printers"] if p["name"] != name]
            if doc["default"] == name:
                doc["default"] = ""
            self.changed(doc, "PrinterDeleted", str(name), f'Printer "{name}" deleted.')
            return ""

        @dbus.service.method(HELPER, in_signature="iiasas", out_signature="sa{ss}")
        def DevicesGet(self, timeout, limit, include_schemes, exclude_schemes):
            doc = self.begin("DevicesGet", int(timeout), int(limit), list(include_schemes), list(exclude_schemes))
            out = {}
            for n, device in enumerate(doc["devices"][: limit if limit > 0 else None]):
                for field, key in (("class", "device-class"), ("info", "device-info"), ("make", "device-make-and-model"), ("uri", "device-uri")):
                    if device.get(field):
                        out[f"{key}:{n}"] = device[field]
            return "", dbus.Dictionary(out, signature="ss")

    name = dbus.service.BusName(HELPER, bus, do_not_queue=True)
    Mechanism(bus, "/")
    print("helper=ready", flush=True)
    loop = GLib.MainLoop()
    loop.run()
    del name


def uninstalled(source, dest):
    import shutil
    shutil.copytree(source, dest)
    for name, old, new in [
        ("manifest.json", '{ "command": "lpstat",', '{ "command": "vgs-smoke-lpstat",'),
        ("PrintersLogic.js", 'var CUPS_COMMANDS = ["lpstat", "ipptool"];', 'var CUPS_COMMANDS = ["vgs-smoke-lpstat", "ipptool"];'),
    ]:
        path = os.path.join(dest, name)
        text = open(path).read()
        if text.count(old) != 1:
            print(f"copy=failed file={name} match={text.count(old)}", file=sys.stderr)
            sys.exit(1)
        open(path, "w").write(text.replace(old, new))
    print("copy=written")


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "uninstalled":
        uninstalled(sys.argv[2], sys.argv[3])
        return
    if len(sys.argv) >= 3 and sys.argv[1] == "helper":
        helper(sys.argv[2])
        return
    if len(sys.argv) == 5 and sys.argv[1] == "signal":
        doc = load(sys.argv[2])
        send_signal(bus_connection(), sys.argv[3], notifier_args(doc, sys.argv[4], "Printer changed."))
        print("signal=sent")
        return
    print("cups: usage=helper STATE | signal STATE MEMBER PRINTER | uninstalled SOURCE DEST", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
