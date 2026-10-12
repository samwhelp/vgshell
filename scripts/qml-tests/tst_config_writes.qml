import QtQuick
import QtTest
import qs.Core

// Config's one writer against the stand-in FileView, whose reads the test
// finishes by hand: a user-file write made from a handler of a change that
// a write or a read of that file brings is on the file, and in `effective`,
// beside the change that ran the handler, the write that returns the file
// to its earlier bytes included. An object here reads a value of
// `Config.effective` as a plugin's settings do and writes from its change
// handler, building on `Config.user` as the core's edits do.
Item {
    id: root

    // In the writer's own form, so a write that returns the file to it
    // writes the bytes the file held before.
    readonly property string baseText: JSON.stringify({ version: 2 }, null, 2) + "\n"

    // Adds `nested` once the outer write's `outer` arrives.
    Component {
        id: addsComponent
        QtObject {
            property var answers: []
            readonly property var outer: Config.effective.outer
            onOuterChanged: {
                if (outer === 1) answers.push(Config.writeUser(Object.assign({}, Config.user, { nested: 2 })));
            }
        }
    }

    // Takes `notice` out again as soon as a write sets it, as the Updates
    // service clears its Reboot notice request.
    Component {
        id: clearsComponent
        QtObject {
            property var answers: []
            readonly property var notice: Config.effective.notice
            onNoticeChanged: {
                if (notice === undefined) return;
                const user = Object.assign({}, Config.user);
                delete user.notice;
                answers.push(Config.writeUser(user));
            }
        }
    }

    // Adds `nested` once a read brings `read`.
    Component {
        id: readsComponent
        QtObject {
            property var answers: []
            readonly property var read: Config.effective.read
            onReadChanged: {
                if (read === 1) answers.push(Config.writeUser(Object.assign({}, Config.user, { nested: 2 })));
            }
        }
    }

    TestCase {
        name: "config-writes"

        // The WatchedFile of `path` among Config's children.
        function watched(path) {
            for (let i = 0; i < Config.data.length; i++) {
                if (Config.data[i].path === path) return Config.data[i];
            }
            fail("no watched file path=" + path);
        }

        // The view of `path` that reads and writes: the stand-in holds the
        // bytes a write left in `content`.
        function view(path) {
            return watched(path).data[1];
        }

        function finishNextRead(path, bytes) {
            const file = watched(path);
            if (!file.busy) file.read();
            tryCompare(view(path), "live", "read");
            view(path).finishRead(bytes);
            compare(file.busy, false);
        }

        function fileHolds(expected) {
            compare(JSON.parse(view(Config.userPath).content), expected);
        }

        function initTestCase() {
            finishNextRead(Config.shippedPath, root.baseText);
            finishNextRead(Config.userPath, root.baseText);
            compare(Config.ready, true);
        }

        // Every case starts from a read of the file holding the version
        // alone, whatever an earlier case wrote.
        function init() {
            finishNextRead(Config.userPath, "{\"version\": 2, \"reset\": true}\n");
            finishNextRead(Config.userPath, root.baseText);
            compare(Config.user, { version: 2 });
            compare(Config.effective, { version: 2 });
        }

        function test_write_from_a_write_handler_keeps_both() {
            const adds = createTemporaryObject(addsComponent, root);
            compare(Config.writeUser({ version: 2, outer: 1 }), "ok");
            compare(adds.answers, ["ok"]);
            fileHolds({ version: 2, outer: 1, nested: 2 });
            compare(Config.user, { version: 2, outer: 1, nested: 2 });
            compare(Config.effective, { version: 2, outer: 1, nested: 2 });
        }

        function test_write_back_to_the_earlier_bytes_is_written() {
            const clears = createTemporaryObject(clearsComponent, root);
            for (const round of [1, 2]) {
                compare(Config.writeUser({ version: 2, notice: "round-" + round }), "ok");
                compare(clears.answers.length, round);
                compare(clears.answers[round - 1], "ok");
                fileHolds({ version: 2 });
                compare(Config.user, { version: 2 });
                compare(Config.effective, { version: 2 });
            }
        }

        function test_write_from_a_read_handler_keeps_both() {
            const reads = createTemporaryObject(readsComponent, root);
            finishNextRead(Config.userPath, "{\"version\": 2, \"read\": 1}\n");
            compare(reads.answers, ["ok"]);
            fileHolds({ version: 2, read: 1, nested: 2 });
            compare(Config.user, { version: 2, read: 1, nested: 2 });
            compare(Config.effective, { version: 2, read: 1, nested: 2 });
        }
    }
}
