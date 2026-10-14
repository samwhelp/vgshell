.pragma library

// The one reader of a page reference, `[words](page:<plugin id>)`,
// `[words](page:<plugin id>/<tab>)` or
// `[words](page:<plugin id>/Settings/<field key>)`, in text a user reads.
// LinkText draws the words as a link that opens the page, and a surface
// that cannot draw a link, such as a notice another server shows, gives
// the words alone. The third form opens Settings at the field: its tab,
// `Settings/<field key>`, travels as one tab, which place reads.

var REFERENCE = /\[([^\[\]]+)\]\(page:([^\s()\/]*)(?:\/(Settings\/[^\s()\/]+|[^\s()\/]+))?\)/;

// TEXT's first reference: `text`, TEXT with the reference's words in its
// place, `words`, `page` and `tab`, "" for no tab, and `reference`, the
// reference as written. With no reference, `text` is TEXT and the rest "".
// A reference to no page, as `[words](page:)`, answers page "".
function parse(text) {
    var found = REFERENCE.exec(text);
    if (found === null) return { text: text, words: "", page: "", tab: "", reference: "" };
    return { text: text.slice(0, found.index) + found[1] + text.slice(found.index + found[0].length),
        words: found[1], page: found[2], tab: found[3] === undefined ? "" : found[3], reference: found[0] };
}

// TEXT with its first reference's words in the reference's place.
function plain(text) {
    return parse(text).text;
}

// Where TAB, a reference's tab, opens a page: { tab, field }, `field` the
// key of the Settings field a `Settings/<field key>` tab shows, "" for a
// tab alone.
function place(tab) {
    var at = tab.indexOf("/");
    return at === -1 ? { tab: tab, field: "" } : { tab: tab.slice(0, at), field: tab.slice(at + 1) };
}
