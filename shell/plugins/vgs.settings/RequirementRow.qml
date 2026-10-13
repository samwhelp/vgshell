import QtQuick
import qs.Commons
import qs.Ui

// One read-only Requirements row of a plugin's page, drawn from one entry
// of its manager row's `requirements` (PluginLogic.requirementRows): the
// requirement beside its state from the last scan as a Badge of one word,
// Present in the success tone, Missing in the danger tone or, for an optional
// requirement, Optional in the info tone, since the purpose under it says what
// the tool adds, and Outdated in the warning tone for a command below the
// version the plugin needs, optional or not, since an installed tool the
// plugin calls fails below that version. The row draws no step
// of its own: the page's Install all missing or Update all outdated button,
// shown while one requirement's step applies (Steps.js), installs what is
// missing and updates what is outdated.
Column {
    id: row

    // One entry of a manager row's `requirements`.
    required property var requirement

    readonly property var view: {
        switch (requirement.state) {
        case "present": return { text: "Present", tone: "success" };
        case "missing": return requirement.optional ? { text: "Optional", tone: "info" } : { text: "Missing", tone: "danger" };
        case "outdated": return { text: "Outdated", tone: "warning" };
        }
        console.error("RequirementRow: no rule for requirement state " + JSON.stringify(requirement.state));
        return { text: "", tone: "neutral" };
    }

    Field {
        width: row.width
        label: row.requirement.name
        inline: true
        hint: row.requirement.purpose
        Item {
            implicitHeight: chip.height
            Badge { id: chip; text: row.view.text; tone: row.view.tone }
        }
    }
}
