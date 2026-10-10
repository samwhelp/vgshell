import QtQuick
import qs.Commons
import qs.Ui

// One read-only Requirements row of a plugin's page, drawn from one entry
// of its manager row's `requirements` (PluginLogic.requirementRows): the
// requirement beside its state from the last scan as a Badge, Present in the
// success tone, Missing in the danger tone or, for an optional requirement, the
// warning tone, Outdated in the warning tone for a command below the version
// the plugin needs, and the manifest's purpose under it. The row draws no step
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
        case "missing": return requirement.optional ? { text: "Missing, optional", tone: "warning" } : { text: "Missing", tone: "danger" };
        case "outdated": return { text: requirement.optional ? "Outdated, optional" : "Outdated", tone: "warning" };
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
