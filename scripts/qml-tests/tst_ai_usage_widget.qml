import QtQuick
import QtTest
import qs.Commons
import qs.Ui
import qs.Unit
import "../../shell/plugins/vgs.ai-usage"

// The AI Usage gauge draws a share from the warning percent in
// Theme.color.warning, under the shipped vgs theme and the catalog's
// flexoki-light, and never in the warning badge foreground; a lower share
// draws in the bar's foreground.
Item {
    id: root
    width: 200
    height: 60

    Widget { id: widget }

    TestCase {
        name: "aiUsageWidget"
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
        function usedAt(percent) {
            widget.shell = { settings: {}, status: { values: { usage: { accounts: [
                { id: "a", provider: "claude", state: "ok", email: "a@example.com", windows: [{ name: "5h", usedPercent: percent }] }] } } } };
        }

        function test_shares_draw_their_colour_data() {
            return [{ tag: "vgs", theme: "vgs" }, { tag: "flexoki-light", theme: "catalog/flexoki-light" }];
        }
        function test_shares_draw_their_colour(data) {
            compare(UnitTheme.override(themeTokens(data.theme)), "ok");
            usedAt(90);
            compare(widget.tone, "warning");
            compare(String(glyph().color), String(Qt.color(Theme.color.warning)), "warning");
            verify(String(glyph().color) !== String(Qt.color(Theme.badge.tone.warning.foreground)), "warning draws no badge foreground");
            usedAt(40);
            compare(widget.tone, "normal");
            compare(String(glyph().color), String(Qt.color(Theme.bar.foreground)), "normal");
        }
    }
}
