import QtQuick
import QtQuick.Templates as T
import qs.Commons
import qs.Ui

// Text with one cited substring as a link. The text property is plain
// text; every occurrence of `link` is drawn as a link and activates the
// component. `lineCount` is the wrapped label's line count, for owners that
// measure whether the message stayed on one line, `inkAbove()` is the
// label's (Label.qml), and `inkBelow()` is the
// label's over the last line's text, which the plain twin
// lays out at the same width, or the link's underline where an
// occurrence reaches that line and the underline ends lower. Use it where a consumer
// surface cites a file that the core can open through `vgshell edit`.
// A page reference in the text, `[words](page:<plugin id>)` or
// `[words](page:<plugin id>/<tab>)`, which PageReference.js reads, draws
// its words alone, as a link while the text holds no `link` words and the reference names a page, so an
// owner's fixed `link` gives way in a text that does not cite it, and activating it emits
// `pageActivated` with that page and tab, "" for no tab, in place of
// `activated`. The owner opens the page; a reference to no page, as
// `[words](page:)`, reads as its words.
// The focus ring goes round the first occurrence's words, `linkBox`, not
// the whole text, so a ring on a line of prose shows which words act.
// The box runs on to the spaces around the occurrence, so punctuation
// against it sits inside the ring, and the ring reaches sideways no
// further than one space less a pixel, so it touches no neighbouring word.
// `focusPreview` draws that ring for an owner that keeps the keyboard and
// names this link as its current one, as a tooltip's item does.
// Every occurrence is drawn in the accent over its own underline, the
// label's `underlineOffset` under each line's baseline, since Qt Quick
// draws a link's or `<u>`'s underline at the font's underline position,
// which a descender meets (Qt 6.11 qquickstyledtext.cpp,
// parseAnchorAttributes; qquicktextnodeengine.cpp, addTextDecorations).
// The pointer reaches the words on those underlined runs.
T.Control {
    id: root

    property string text: ""
    property string link: ""
    property string role: "body"
    property bool focusPreview: false
    property alias color: label.color
    property alias wrapMode: label.wrapMode
    property alias horizontalAlignment: label.horizontalAlignment
    readonly property alias lineCount: label.lineCount
    readonly property var reference: PageReference.parse(text)
    // The text drawn and the words of it that are the link.
    readonly property string plain: reference.text
    // Whether the text cites `link`: a link it does not cite gives way to
    // the page reference.
    readonly property bool cited: link !== "" && plain.indexOf(link) !== -1
    readonly property string words: cited ? link : reference.page !== "" ? reference.words : ""
    readonly property bool linked: words !== "" && plain.indexOf(words) !== -1
    readonly property bool hoveredLink: linked && pointer.containsMouse && onWords(pointer.mouseX, pointer.mouseY)
    // The first occurrence widened to the spaces around it, as the
    // [start, end) indices of `text`.
    readonly property var run: linked ? wordRun(plain.indexOf(words), plain.indexOf(words) + words.length) : [0, 0]
    // That run's box in this item: its x span on the line it is laid out
    // on, one label line box tall, once the twin holds the text. The
    // arguments name what the twin's layout depends on, since its
    // positions are a function a binding cannot follow. A new text
    // reaches the twin before `run` follows it, so the box waits for a run
    // that lies inside the text; the twin has no position past its end.
    readonly property rect linkBox: linked && twin.length === plain.length && run[1] <= plain.length ? wordsBox(twin.contentWidth, twin.contentHeight, twin.lineCount, label.lineBox) : Qt.rect(0, 0, width, height)
    // Each occurrence's span on each line it is laid out on, as
    // { line, left, right }, under the same wait for the twin.
    readonly property var underlined: linked && twin.length === plain.length ? wordSpans(twin.contentWidth, twin.contentHeight, twin.lineCount) : []
    // The label's distance from one line's baseline to the next.
    readonly property real linePitch: label.contentHeight / Math.max(1, label.lineCount)
    readonly property real underlineThickness: Inset.underlineWidth(underline.lineWidth)
    // How far the ring's outer edge lies beside the run: the standard
    // offset and width, cut to one space less a pixel.
    readonly property real ringReach: Math.min(Theme.focusRing.offset + Theme.focusRing.width, spaceGlyph.advanceWidth - 1)
    signal activated()
    signal pageActivated(string page, string tab)
    signal clicked()

    function htmlEscaped(value) {
        return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function markup(plain, cited, colour) {
        const escaped = htmlEscaped(plain);
        const needle = htmlEscaped(cited);
        if (needle === "") return escaped;
        const parts = escaped.split(needle);
        return parts.join("<font color=\"" + colour + "\">" + needle + "</font>");
    }

    function wordRun(start, end) {
        while (start > 0 && !/\s/.test(plain.charAt(start - 1))) start--;
        while (end < plain.length && !/\s/.test(plain.charAt(end))) end++;
        return [start, end];
    }

    // Text reports no character position, so a TextEdit twin laid out in
    // the label's font, width, wrap and alignment gives the words' x and
    // line; Text and TextEdit break lines through the same QTextLayout.
    // Words that close one line and wrap at their end read the cursor at
    // the next line's start, so their end is their last glyph's start plus
    // its advance.
    function wordsBox(twinWidth, twinHeight, twinLines, lineBox) {
        const start = run[0];
        const end = run[1];
        const lineAt = r => lineOf(r, twinHeight, twinLines);
        const from = twin.positionToRectangle(start);
        let to = twin.positionToRectangle(end);
        let right = to.x;
        if (lineAt(to) !== lineAt(from)) {
            to = twin.positionToRectangle(end - 1);
            right = to.x + lastGlyph.advanceWidth;
        }
        if (lineAt(to) !== lineAt(from))
            return Qt.rect(0, lineAt(from) * lineBox, width, (lineAt(to) - lineAt(from) + 1) * lineBox);
        return Qt.rect(from.x, lineAt(from) * lineBox, right - from.x, lineBox);
    }

    function lineOf(r, twinHeight, twinLines) {
        return Math.floor((r.y + r.height / 2) / (twinLines > 0 ? twinHeight / twinLines : 1));
    }

    function wordSpans(twinWidth, twinHeight, twinLines) {
        const spans = [];
        for (let at = plain.indexOf(words); at !== -1; at = plain.indexOf(words, at + words.length)) {
            let span = null;
            for (let i = at; i < at + words.length; i++) {
                const glyph = twin.positionToRectangle(i);
                const line = lineOf(glyph, twinHeight, twinLines);
                const right = glyph.x + underline.advanceWidth(plain.charAt(i));
                if (span !== null && span.line === line) {
                    span.right = right;
                } else {
                    span = { line: line, left: glyph.x, right: right };
                    spans.push(span);
                }
            }
        }
        return spans;
    }

    function onWords(x, y) {
        return underlined.some(span => x >= span.left && x < span.right && y >= span.line * linePitch && y < (span.line + 1) * linePitch);
    }

    onClicked: {
        if (!cited && reference.page !== "") pageActivated(reference.page, reference.tab);
        else activated();
    }

    function inkAbove() { return label.y + label.inkAbove(); }

    // Every occurrence is underlined, so the underline reaches the last
    // line when the last occurrence ends past that line's start.
    function inkBelow() {
        const lastStart = twin.length === plain.length ? twin.positionAt(0, twin.contentHeight - 1) : -1;
        const glyphs = label.inkBelow(lastStart < 0 ? undefined : plain.slice(lastStart));
        const lastUnderlined = linked && lastStart >= 0 && plain.lastIndexOf(words) + words.length > lastStart;
        const underlineBottom = label.lastBaseline() + label.underlineOffset + underlineThickness;
        return height - label.y - label.height + (lastUnderlined ? Math.min(glyphs, label.height - underlineBottom) : glyphs);
    }

    implicitWidth: label.implicitWidth
    implicitHeight: label.implicitHeight
    height: implicitHeight
    activeFocusOnTab: linked
    Accessible.name: plain
    Accessible.role: linked ? Accessible.Link : Accessible.StaticText

    Keys.onReturnPressed: event => { if (root.linked) root.clicked(); else event.accepted = false; }
    Keys.onEnterPressed: event => { if (root.linked) root.clicked(); else event.accepted = false; }
    Keys.onSpacePressed: event => { if (root.linked) root.clicked(); else event.accepted = false; }

    Label {
        id: label
        role: root.role
        width: root.width
        text: root.markup(root.plain, root.words, Theme.color.accent)
        textFormat: Text.StyledText
    }

    Repeater {
        model: root.underlined
        Rectangle {
            required property var modelData
            x: modelData.left
            y: label.baselineOffset + modelData.line * root.linePitch + label.underlineOffset
            width: modelData.right - modelData.left
            height: root.underlineThickness
            color: Theme.color.accent
        }
    }

    TextEdit {
        id: twin
        visible: false
        readOnly: true
        width: label.width
        text: root.plain
        textFormat: TextEdit.PlainText
        font: label.font
        wrapMode: label.wrapMode
        horizontalAlignment: label.horizontalAlignment
    }

    TextMetrics {
        id: lastGlyph
        font: label.font
        text: root.plain.charAt(root.run[1] - 1)
    }

    FontMetrics {
        id: underline
        font: label.font
    }

    TextMetrics {
        id: spaceGlyph
        font: label.font
        text: " "
    }

    // FocusRing reaches its standard extent outside this item, which
    // stands in from the run by the part of it the reach cuts.
    Item {
        readonly property real inset: Theme.focusRing.offset + Theme.focusRing.width - root.ringReach
        x: root.linkBox.x + inset
        y: root.linkBox.y
        width: root.linkBox.width - 2 * inset
        height: root.linkBox.height

        FocusRing {
            target: root
            outside: true
        }
    }

    // keyboard-path: Return, Enter and Space activate the focused link
    MouseArea {
        id: pointer
        anchors.fill: label
        hoverEnabled: true
        acceptedButtons: Qt.LeftButton
        onPressed: mouse => { mouse.accepted = root.onWords(mouse.x, mouse.y); }
        onClicked: root.clicked()
        PointerCursor {
            enabled: root.hoveredLink
        }
    }
}
