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
// `[words](page:<plugin id>/<tab>)`, draws its words alone, as a link while
// the text holds no `link` words and the reference names a page, so an
// owner's fixed `link` gives way in a text that does not cite it, and activating it emits
// `pageActivated` with that page and tab, "" for no tab, in place of
// `activated`. The owner opens the page; a reference to no page, as
// `[words](page:)`, reads as its words.
// The focus ring goes round the first occurrence's words, `linkBox`, not
// the whole text, so a ring on a line of prose shows which words act.
// The box runs on to the spaces around the occurrence, so punctuation
// against it sits inside the ring, and the ring reaches sideways no
// further than one space less a pixel, so it touches no neighbouring word.
T.Control {
    id: root

    property string text: ""
    property string link: ""
    property string role: "body"
    property alias color: label.color
    property alias wrapMode: label.wrapMode
    property alias horizontalAlignment: label.horizontalAlignment
    readonly property alias lineCount: label.lineCount
    readonly property var reference: pageReference(text)
    // The text drawn and the words of it that are the link.
    readonly property string plain: reference.text
    // Whether the text cites `link`: a link it does not cite gives way to
    // the page reference.
    readonly property bool cited: link !== "" && plain.indexOf(link) !== -1
    readonly property string words: cited ? link : reference.page !== "" ? reference.words : ""
    readonly property bool linked: words !== "" && plain.indexOf(words) !== -1
    readonly property bool hoveredLink: linked && pointer.containsMouse && label.linkAt(pointer.mouseX, pointer.mouseY) !== ""
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
    // How far the ring's outer edge lies beside the run: the standard
    // offset and width, cut to one space less a pixel.
    readonly property real ringReach: Math.min(Theme.focusRing.offset + Theme.focusRing.width, spaceGlyph.advanceWidth - 1)
    signal activated()
    signal pageActivated(string page, string tab)
    signal clicked()

    function pageReference(value) {
        const found = /\[([^\[\]]+)\]\(page:([^\s()\/]*)(?:\/([^\s()\/]+))?\)/.exec(value);
        if (found === null) return { text: value, words: "", page: "", tab: "" };
        return { text: value.slice(0, found.index) + found[1] + value.slice(found.index + found[0].length),
            words: found[1], page: found[2], tab: found[3] === undefined ? "" : found[3] };
    }

    function htmlEscaped(value) {
        return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function markup(plain, cited) {
        const escaped = htmlEscaped(plain);
        const needle = htmlEscaped(cited);
        if (needle === "") return escaped;
        const parts = escaped.split(needle);
        const anchor = "<a href=\"file\"><u>" + needle + "</u></a>";
        return parts.join(anchor);
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
        const spacing = twinLines > 0 ? twinHeight / twinLines : 1;
        const lineOf = r => Math.floor((r.y + r.height / 2) / spacing);
        const from = twin.positionToRectangle(start);
        let to = twin.positionToRectangle(end);
        let right = to.x;
        if (lineOf(to) !== lineOf(from)) {
            to = twin.positionToRectangle(end - 1);
            right = to.x + lastGlyph.advanceWidth;
        }
        if (lineOf(to) !== lineOf(from))
            return Qt.rect(0, lineOf(from) * lineBox, width, (lineOf(to) - lineOf(from) + 1) * lineBox);
        return Qt.rect(from.x, lineOf(from) * lineBox, right - from.x, lineBox);
    }

    onClicked: {
        if (!cited && reference.page !== "") pageActivated(reference.page, reference.tab);
        else activated();
    }

    function inkAbove() { return label.y + label.inkAbove(); }

    // Qt Quick draws an underline from its line's baseline plus the font's
    // underline position, rounded, as tall as the font's line thickness
    // (Qt 6.11 qquicktextnodeengine.cpp, addTextDecorations and
    // processCurrentLine, from QRawFont::underlinePosition and lineThickness,
    // which read the same font engine values as FontMetrics). Every
    // occurrence is underlined, so the underline reaches the last line when
    // the last occurrence ends past that line's start.
    function inkBelow() {
        const lastStart = twin.length === plain.length ? twin.positionAt(0, twin.contentHeight - 1) : -1;
        const glyphs = label.inkBelow(lastStart < 0 ? undefined : plain.slice(lastStart));
        const underlined = linked && lastStart >= 0 && plain.lastIndexOf(words) + words.length > lastStart;
        const underlineBottom = Math.round(label.lastBaseline() + underline.underlinePosition) + underline.lineWidth;
        return height - label.y - label.height + (underlined ? Math.min(glyphs, label.height - underlineBottom) : glyphs);
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
        text: root.markup(root.plain, root.words)
        textFormat: Text.StyledText
        linkColor: Theme.color.accent
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
        onPressed: mouse => { mouse.accepted = label.linkAt(mouse.x, mouse.y) !== ""; }
        onClicked: root.clicked()
        PointerCursor {
            enabled: root.hoveredLink
        }
    }
}
