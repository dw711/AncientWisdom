import type { Dimension } from "@/lib/contracts/advice";

export const RUBRIC_VERSION = "rubric-2026-10-24.2";

export interface DimensionRubric {
  dimension: Dimension;
  label: string;
  question: string;
  /** Ordered 0–4. Each level describes a situation, not a degree (per the Score guidance). */
  levels: [string, string, string, string, string];
}

export const RUBRIC: DimensionRubric[] = [
  {
    dimension: "structural",
    label: "Decision structure",
    question:
      "How closely does the underlying decision structure of the candidate historical case match the present decision: the kind of choice being made, the options, and the trade-off between them? Judge only the supplied pre-decision information and ignore similarity of topic, era or vocabulary.",
    levels: [
      "The historical choice has no decision mechanism in common with the present decision; any resemblance is in topic or wording only.",
      "Surface resemblance only: a similar setting, vocabulary or stakes, but the options and the trade-off being made are of a different kind.",
      "Some shared mechanism, such as a similar trade-off between options, but with major differences in what is actually being decided.",
      "A strong shared decision mechanism: comparable options and a comparable trade-off, with some important structural limits.",
      "A close structural match: the same kind of choice between comparable options, differing only in minor structural respects.",
    ],
  },
  {
    dimension: "incentives",
    label: "Incentives and power",
    question:
      "How comparable are the incentives, pressures and power relationships among the people deciding in the candidate historical case and in the present decision: who wants what, who decides, who bears the risk, and whether they cooperate or conflict?",
    levels: [
      "The incentives, power relationships and patterns of cooperation or conflict are unrelated or opposite.",
      "Incentives overlap only superficially; who gains, who bears the risk and who decides are substantially different.",
      "Some comparable incentives or pressures, but major differences in who decides, who bears the risk, or how the people depend on each other.",
      "Comparable incentives and power relationships, with notable differences.",
      "Closely comparable incentives, pressures and power relationships among the people deciding.",
    ],
  },
  {
    dimension: "constraints",
    label: "Constraints",
    question:
      "How similar are the binding constraints in the candidate historical case and the present decision: limits on resources, the information available at the time, and whether the choice can be undone?",
    levels: [
      "The limits on resources, information and the ability to undo the choice are unrelated or opposite.",
      "Few shared constraints; the binding limits on resources, information or reversibility differ substantially.",
      "Some shared constraints, but at least one binding limit (resources, information, or the ability to undo the choice) differs materially.",
      "Similar binding constraints on resources, information and reversibility, with some differences.",
      "Closely similar binding constraints on resources, available information and the ability to undo the choice.",
    ],
  },
  {
    dimension: "time",
    label: "Time and urgency",
    question:
      "How comparable are the urgency, the speed of feedback and the decision horizon in the candidate historical case and the present decision?",
    levels: [
      "Urgency, speed of feedback and horizon are unrelated, for example seconds against decades.",
      "Time pressure and horizon differ substantially.",
      "Partly comparable urgency or horizon, but the speed of feedback or the deadline pressure differs materially.",
      "Comparable urgency and horizon, with some differences in how quickly results become visible.",
      "Closely comparable urgency, speed of feedback and decision horizon.",
    ],
  },
];

/**
 * Gate for structural incompatibility only. The first wording ("a central
 * condition is absent or reversed") fired at 0.73–0.79 for every case in live
 * testing, because differences of field and stakes counted as critical. Cross-
 * domain analogies are intended, so those differences are excluded explicitly.
 */
export const CRITICAL_MISMATCH = {
  instructions: {
    task: "Would drawing a lesson from the identified candidate historical case about the present decision be fundamentally misleading, because the two decisions are different kinds of choice?",
    judge_only: "The structure of the choice in the supplied pre-decision information: what is being decided, between which kinds of option, and what trade-off drives it.",
    do_not_count:
      "Differences of field, era, scale, technology, stakes or who the people are. Comparisons across very different domains are intended, so these differences alone never make the analogy misleading.",
  },
  criteria: {
    true: {
      what: "The two decisions are different kinds of choice, so no lesson about the trade-off can transfer.",
      examples: [
        "choosing which of two equally good venues to book, compared with deciding whether to continue a risky step under a deadline",
        "a negotiation with an opponent over terms, compared with an internal decision about how to ration supplies",
      ],
    },
    false: {
      what: "The two decisions are the same kind of choice with a comparable trade-off, even if the domains, eras and stakes are very different.",
      examples: [
        "whether to press on with a risky step or stop, in a software team and in a space mission",
        "how to ration limited resources until a fixed end point, in a charity and in a spacecraft",
      ],
    },
  },
};
