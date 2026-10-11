import QtQuick
import QtTest
import qs.Commons
import qs.Ui
import qs.Unit
import "../../shell/plugins/vgs.sudo"

// The passwordless sudo lock draws in the Theme.color role of its tone,
// `neutral` in textMuted and `bar` in the bar's foreground, under the
// shipped vgs theme and the catalog's flexoki-light, and never in the
// badge foreground of that tone.
Item {
    id: root
    width: 200
    height: 60

    Widget { id: widget }

    TestCase {
        name: "sudoWidget"
        when: windowShown

        function init() { UnitTheme.reset(); }

        function themeTokens(path) {
            const request = new XMLHttpRequest();
            request.open("GET", Qt.resolvedUrl("../../themes/" + path + "/theme.json"), false);
            request.send();
            return JSON.parse(request.responseText).tokens;
        }
        function find(node, test) {
            if (test(node)) return node;
            for (const child of node.children) {
                const found = find(child, test);
                if (found !== null) return found;
            }
            return null;
        }
        function glyph() {
            const button = find(widget, n => n.iconName !== undefined && n.label !== undefined);
            return find(button.contentItem, n => n.name !== undefined && n.paths !== undefined);
        }

        function test_states_draw_their_colour_role_data() {
            return [{ tag: "vgs", theme: "vgs" }, { tag: "flexoki-light", theme: "catalog/flexoki-light" }];
        }
        function test_states_draw_their_colour_role(data) {
            compare(UnitTheme.override(themeTokens(data.theme)), "ok");
            const rows = [
                ["on", { state: "active", until: "indefinite" }, Theme.color.warning, "warning"],
                ["nixos", { state: "nixos" }, Theme.color.info, "info"],
                ["unknown", null, Theme.color.textMuted, "neutral"],
                ["off", { state: "inactive" }, Theme.bar.foreground, null]
            ];
            for (const [name, grant, colour, badge] of rows) {
                widget.shell = { sudo: { state: grant } };
                const drawn = String(glyph().color);
                compare(drawn, String(Qt.color(colour)), name);
                if (badge !== null) verify(drawn !== String(Qt.color(Theme.badge.tone[badge].foreground)), name + " draws no badge foreground");
            }
        }

        function test_an_unknown_tone_throws() {
            let message = "";
            try { widget.toneColor("loud"); } catch (e) { message = e.message; }
            compare(message, 'sudo widget: tone "loud" is not one of bar, warning, info, neutral');
        }
    }
}
