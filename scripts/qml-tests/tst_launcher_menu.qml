import QtQuick
import QtTest
import qs.Commons
import qs.Unit
import "../../shell/plugins/vgs.launcher"

// The launcher's pointer flyout, ContextMenu.qml, with glass on: it hands
// the launcher card's fill and no radius, so drawn solid it is that fill
// opaque and lifted, at the glass corner. The test window is opaque, so
// every glass surface in it is solid, as the flyout is over the launcher's
// card (tst_glasssurface.qml holds what makes glass solid). Expected values
// are worked by hand from the launcher's Appearance.js and Glass.js: the
// card fill #151515 lifted by 0.05, 21 + 234 * 0.05 = 32.7, #212121; in
// light mode #efefef lifted by 0.1, 239 + 16 * 0.1 = 240.6, #f1f1f1; the
// glass corner 16.
Item {
    id: root
    width: 800
    height: 600

    Launcher {
        id: launcher
        anchors.fill: parent
    }

    TestCase {
        name: "launcherMenu"
        when: windowShown

        function init() {
            UnitTheme.reset();
            Theme.appearanceInput = JSON.stringify({ glass: "on" });
        }

        function cleanup() {
            Theme.appearanceInput = "";
        }

        // The flyout among the launcher's children, and its glass surface.
        function flyout() {
            for (const child of launcher.children)
                if (typeof child.openAt === "function") return child;
            fail("the launcher holds no flyout");
        }
        function surfaceOf(menu) {
            for (const child of menu.children)
                if (child.glassSurface === true) return child;
            fail("the flyout holds no glass surface");
        }

        function test_the_flyout_draws_the_card_fill_solid_at_the_glass_corner() {
            const menu = flyout();
            menu.items = [{ id: "open", label: "Open" }, { id: "reveal", label: "Reveal" }, { id: "copy", label: "Copy path" }];
            menu.openAt(100, 100);
            const surface = surfaceOf(menu);
            compare([surface.on, surface.solid], [true, true]);
            const body = surface.children[1];
            // A Column sizes itself on its next polish.
            tryVerify(() => surface.height >= 32, 1000, "the flyout is taller than two glass corners");
            compare([String(body.color), body.radius], ["#212121", 16], "dark");
            compare(UnitTheme.override({ scheme: { mode: "light" } }), "ok");
            compare([String(body.color), body.radius], ["#f1f1f1", 16], "light");
            compare(UnitTheme.override({ radius: { md: 8 } }), "ok");
            compare(body.radius, 16, "a rounded theme leaves the launcher's own look");
            menu.close();
        }
    }
}
