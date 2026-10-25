import type { DecisionProfile, Dimension, ExplicitConstraints } from "@/lib/contracts/advice";
import type { WriterOutput } from "@/lib/server/synthesis/schema";

/**
 * Prewritten sample analyses for preview mode. They are labelled as samples
 * in the UI, their ratings are illustrative rubric levels rather than Jev
 * output, and they pass through the same deterministic validation and
 * assembly code as live answers.
 */

export interface SampleCase {
  case_id: string;
  role: "supporting" | "challenging";
  levels: Record<Dimension, number>;
}

export interface SampleVariant {
  id: string;
  preset_id: string;
  /** Which explicit constraints this variant reflects. */
  modelled: (keyof ExplicitConstraints)[];
  matches: (c: ExplicitConstraints) => boolean;
  profile: Omit<DecisionProfile, "explicit_constraints" | "source">;
  cases: SampleCase[];
  challenging_note: string | null;
  draft: WriterOutput;
}

const A13 = "CASE_APOLLO13_TRIAGE";
const A11 = "CASE_APOLLO11_ALARMS";
const CH = "CASE_CHALLENGER_LAUNCH";

const CH_DISPUTE = {
  case_id: CH,
  dispute_id: "DSP_CH_001",
  summary: "Witnesses disagreed about whether Thiokol's early concerns amounted to a recommendation to delay. The record keeps both accounts rather than settling it.",
};

const hackathonProfile = {
  decision: "Whether to let a teammate replace a partly working backend with a new framework the night before a hackathon demo.",
  options: ["Keep and stabilise the current backend", "Replace it with the new framework tonight", "Try the new framework in an isolated, time-boxed experiment"],
  actors: ["You", "Your teammate", "The demo judges"],
  known_constraints: ["About one day until the demo", "The current backend partly works"],
  urgency: "days" as const,
  time_horizon: "About 24 hours until the demo",
  relationship: "repeated" as const,
  stakes: "medium" as const,
  user_interpretations: ["You expect the rebuild could leave nothing working for the demo."],
};

export const SAMPLE_VARIANTS: SampleVariant[] = [
  {
    id: "hackathon_rebuild/no_rollback",
    preset_id: "hackathon_rebuild",
    modelled: ["rollback_tested"],
    matches: (c) => c.rollback_tested !== true,
    profile: {
      ...hackathonProfile,
      reversibility: "unknown",
      known_facts: ["Your teammate wants the new framework because it would be cleaner"],
      uncertainties: ["Whether a tested rollback exists", "How much of the current backend still needs fixing", "How well your teammate knows the new framework"],
      assumptions: ["There is no tested way to switch back if the rebuild fails."],
    },
    cases: [
      { case_id: CH, role: "supporting", levels: { structural: 3, incentives: 3, constraints: 2, time: 3 } },
      { case_id: A13, role: "supporting", levels: { structural: 3, incentives: 2, constraints: 3, time: 2 } },
      { case_id: A11, role: "challenging", levels: { structural: 2, incentives: 2, constraints: 2, time: 2 } },
    ],
    challenging_note: null,
    draft: {
      decision_summary:
        "You have about a day before the demo. The backend partly works, and your teammate wants to replace it with a cleaner framework tonight. You are worried the switch could leave you with nothing that works.",
      assumptions: ["No tested rollback exists, so a failed rebuild could not simply be undone before the demo."],
      unknowns: ["How much work the current backend still needs", "How familiar your teammate is with the new framework"],
      recommendation: {
        text: "Keep the working backend as the version you demo and spend tonight stabilising it. Do not replace it tonight unless you first have a tested way to switch back, and even then treat the new framework as an experiment rather than the plan.",
        conditions: ["There is no tested rollback to the current backend.", "The demo depends on the backend working end to end."],
        basis_case_ids: [CH, A13],
      },
      conditional_alternatives: [
        {
          condition: "If you can leave the current backend untouched and test a rollback before starting",
          action: "Allow a strictly time-boxed experiment with the new framework on a separate branch, with an agreed hour at which you stop and demo whichever version passes your checks.",
          basis_case_ids: [A11],
        },
      ],
      lesson_tension:
        "Challenger points against taking a step that cannot be undone under schedule pressure while the people closest to the risk still have doubts. Apollo 11 shows that pressing on can be right when someone who knows the system can diagnose the problem quickly and a safe way back remains open. What separates them is reversibility: without a tested rollback your situation resembles the first; with one, it moves towards the second.",
      comparisons: [
        {
          case_id: CH,
          lesson: "Don't take a step you can't undo on deadline day while the people closest to the risk still have doubts; make the change prove it is safe first.",
          shared_mechanism:
            "Both are decisions to take a step that cannot easily be undone, under deadline pressure, while someone close to the work has unresolved doubts. In 1986 the burden of proof shifted towards proving danger rather than proving safety; here the question is whether the rebuild has to show it is safe for the demo, or you have to show it is not.",
          important_differences: [
            "No one's safety is at stake; the worst outcome is a failed demo.",
            "A two-person team can talk directly, without contractor and agency layers.",
            "Your concern is about delivery risk, not a physical failure with test data behind it.",
          ],
          applies_when: "The change cannot be undone before the deadline and doubts about it have not been resolved.",
          historical_points: [
            { text: "Thiokol engineering initially recommended not launching below 53 degrees, the lowest temperature of any previous launch, because their data went no lower.", claim_ids: ["CLM_CH_002", "CLM_CH_003"] },
            { text: "The Presidential Commission found that NASA appeared to be requiring the contractor to prove it was not safe to launch, rather than proving it was safe.", claim_ids: ["CLM_CH_008"] },
            { text: "The Commission concluded that the decision makers were unaware of the engineers' continuing opposition and judged the decision to launch flawed.", claim_ids: ["CLM_CH_010"] },
          ],
          quotes: [{ passage_id: "PSG_CH_BURDEN", text: "NASA appeared to be requiring a contractor to prove that it was not safe to launch, rather than proving it was safe." }],
        },
        {
          case_id: A13,
          lesson: "Protect the one thing the demo needs to work, and switch off everything else until the deadline has passed.",
          shared_mechanism:
            "Both involve a short, fixed stretch of time that cannot be extended, and the question of what to keep running so the final step still works. Apollo 13's controllers switched off everything not needed to get home and tested new procedures before relying on them.",
          important_differences: [
            "Your limiting resource is time and attention, not power and water.",
            "Lives were at stake; your stakes are a demo.",
            "The flight controllers could test every new procedure in a simulator; you may only have a quick manual check.",
          ],
          applies_when: "There is a hard end point and you can name the one capability that must work when you reach it.",
          historical_points: [
            { text: "All noncritical systems were turned off and energy use was cut to one-fifth, leaving about 20 percent of the lunar module's power at the end.", claim_ids: ["CLM_A13_007"] },
            { text: "New procedures were written and tested in the simulator before they were passed up to the crew.", claim_ids: ["CLM_A13_006"] },
          ],
          quotes: [{ passage_id: "PSG_A13_PROCEDURES", text: "Completely new procedures had to be written and tested in the simulator before being passed up to the crew." }],
        },
        {
          case_id: A11,
          lesson: "Pressing on through a warning can be right, but only when someone can diagnose it quickly and a safe way back stays open.",
          shared_mechanism:
            "Apollo 11 challenges the simple rule that any warning means stop. The landing continued through unfamiliar alarms because the specialist who knew the computer best diagnosed them within seconds, and an abort remained possible throughout.",
          important_differences: [
            "The specialist's diagnosis took seconds; the risk of a framework rebuild cannot be judged that quickly.",
            "The landing kept an abort option; without a tested rollback, you do not have one.",
            "The alarms came from a system already built and tested; your rebuild would be new code.",
          ],
          applies_when: "Someone can quickly confirm the risk is manageable and a safe way back stays open.",
          historical_points: [
            { text: "During the descent the computer raised alarms the crew did not recognise, while the trajectory looked good.", claim_ids: ["CLM_A11_002"] },
            { text: "Engineer Steven Bales diagnosed the problem within seconds and recommended that the landing continue.", claim_ids: ["CLM_A11_003"] },
            { text: "The fuel margin was uncertain by about 20 seconds, and an abort would have been ordered if fuel ran too low.", claim_ids: ["CLM_A11_005"] },
          ],
          quotes: [],
        },
      ],
      source_conflicts: [CH_DISPUTE],
      next_steps: [
        { text: "Agree tonight's demo path out loud: the current backend, frozen except for fixes that make the demo flow work end to end.", basis_case_ids: [A13] },
        { text: "Ask your teammate to write down what the new framework would fix for the demo itself, and what would have to be true to switch, before any code is written.", basis_case_ids: [CH] },
        { text: "If you still want to try the new framework, first tag the working version and check you can return to it in minutes; then set a stop time.", basis_case_ids: [A11] },
      ],
      what_would_change: [
        { condition: "You have tested that you can switch back to the working backend in minutes.", effect: "A time-boxed experiment with the new framework becomes reasonable, because the safe option stays open.", constraint_key: "rollback_tested", constraint_value: "true" },
        { condition: "The demo is several days away rather than one.", effect: "There would be time to rebuild and test, so the case for keeping the old backend weakens.", constraint_key: "deadline_hours", constraint_value: "96" },
        { condition: "The current backend has a defect that would break the demo itself.", effect: "Fixing or replacing that part becomes necessary, and the question becomes how to do it with least risk.", constraint_key: "none", constraint_value: "" },
      ],
      uncertainties: ["Whether the new framework would actually be quicker to finish", "How the judges weigh polish against a working demo"],
    },
  },
  {
    id: "hackathon_rebuild/rollback_tested",
    preset_id: "hackathon_rebuild",
    modelled: ["rollback_tested"],
    matches: (c) => c.rollback_tested === true,
    profile: {
      ...hackathonProfile,
      reversibility: "reversible",
      known_facts: ["Your teammate wants the new framework because it would be cleaner", "A rollback to the working backend has been tested (stated)"],
      uncertainties: ["How long the new framework would take to reach the demo's needs", "How well your teammate knows the new framework"],
      assumptions: ["The rollback test covers the whole demo path, not just part of it."],
    },
    cases: [
      { case_id: A11, role: "supporting", levels: { structural: 3, incentives: 2, constraints: 3, time: 3 } },
      { case_id: A13, role: "supporting", levels: { structural: 3, incentives: 2, constraints: 3, time: 2 } },
      { case_id: CH, role: "challenging", levels: { structural: 2, incentives: 3, constraints: 2, time: 3 } },
    ],
    challenging_note: null,
    draft: {
      decision_summary:
        "You have about a day before the demo, a partly working backend, and a tested way to return to it. Your teammate wants to try a cleaner framework tonight.",
      assumptions: ["The rollback test covers the whole demo path, not just part of it."],
      unknowns: ["How long the new framework would take to reach what the demo needs"],
      recommendation: {
        text: "Allow a strictly time-boxed experiment with the new framework on a separate branch, while the tested working version stays untouched as the demo path. Agree the stop time now, and demo whichever version passes your end-to-end check when that time comes.",
        conditions: ["The rollback has been tested on the full demo path.", "The working version is not changed during the experiment.", "You agree the stop time before starting."],
        basis_case_ids: [A11, A13],
      },
      conditional_alternatives: [
        {
          condition: "If the rollback test fails, or covers only part of the demo",
          action: "Go back to the first plan: freeze the working backend and stabilise it.",
          basis_case_ids: [CH],
        },
      ],
      lesson_tension:
        "Apollo 11 supports pressing on when a safe way back stays open and someone can judge the risk quickly. Challenger is a reminder that deadline pressure can wear down the limits a team set itself, so the stop time and the check that decides the demo version should be agreed before the experiment starts, not during it.",
      comparisons: [
        {
          case_id: A11,
          lesson: "With a tested way back and someone who can judge progress quickly, a bounded experiment is a reasonable risk.",
          shared_mechanism:
            "Both are choices to press on with something risky while a safe option stays available. Apollo 11 continued through unfamiliar alarms because a specialist diagnosed them quickly and an abort was still possible; your tested rollback plays the part of the abort.",
          important_differences: [
            "Bales diagnosed the alarm in seconds; judging a new framework will take hours.",
            "The lunar module's software was built to keep its most important tasks running; keep your experiment just as separate from the working version.",
            "The landing had to happen at that moment; your experiment is optional.",
          ],
          applies_when: "A tested way back exists and someone can tell quickly whether the new path is working.",
          historical_points: [
            { text: "During the descent the computer raised alarms the crew did not recognise, while the trajectory looked good.", claim_ids: ["CLM_A11_002"] },
            { text: "Engineer Steven Bales diagnosed the problem within seconds and recommended that the landing continue.", claim_ids: ["CLM_A11_003"] },
            { text: "The computer had been programmed so that it could keep handling high-priority tasks while its memory was being overloaded.", claim_ids: ["CLM_A11_004"] },
          ],
          quotes: [{ passage_id: "PSG_A11_ALARMS", text: "needed only a few seconds to diagnose the problem and recommend that the landing continue" }],
        },
        {
          case_id: A13,
          lesson: "Keep the working version untouched as the capability you protect, and experiment only alongside it.",
          shared_mechanism:
            "Both protect the one capability needed at the end. Apollo 13's controllers kept what the return required and switched off the rest; here, the working backend is the capability to protect while you experiment elsewhere.",
          important_differences: [
            "Your spare capacity is time, which the experiment spends; Apollo 13 had no option that spent resources speculatively.",
            "Lives were at stake; your stakes are a demo.",
          ],
          applies_when: "There is a hard end point and the capability needed then can be kept separate from anything experimental.",
          historical_points: [
            { text: "All noncritical systems were turned off and energy use was cut to one-fifth, leaving about 20 percent of the lunar module's power at the end.", claim_ids: ["CLM_A13_007"] },
            { text: "New procedures were written and tested in the simulator before they were passed up to the crew.", claim_ids: ["CLM_A13_006"] },
          ],
          quotes: [],
        },
        {
          case_id: CH,
          lesson: "Agree the stop rule before the experiment starts, because deadline pressure wears down limits set in the moment.",
          shared_mechanism:
            "Challenger challenges the plan by showing how a firm limit can give way under schedule pressure: the engineers' recommendation not to launch outside their experience gave way after a call for a management decision.",
          important_differences: [
            "Your stop time is your own rule, not an engineering limit backed by test data.",
            "Lives were at stake.",
            "Your team is two people who can talk directly.",
          ],
          applies_when: "A deadline is close and the rule for stopping was not agreed in advance.",
          historical_points: [
            { text: "Thiokol engineering initially recommended not launching below 53 degrees, the lowest temperature of any previous launch.", claim_ids: ["CLM_CH_002"] },
            { text: "Mr. Mason said a management decision was needed and asked Bob Lund, Thiokol's Vice President and Director of Engineering, to put on his management hat.", claim_ids: ["CLM_CH_005", "CLM_CH_002"] },
            { text: "The next morning, a Marshall manager reported that Thiokol had at first recommended not launching and then recommended launching.", claim_ids: ["CLM_CH_006"] },
          ],
          quotes: [{ passage_id: "PSG_CH_MANAGEMENT_HAT", text: "take off his engineering hat and put on his management hat" }],
        },
      ],
      source_conflicts: [CH_DISPUTE],
      next_steps: [
        { text: "Tag the working version and run the full demo from it once more, so you know the rollback works end to end.", basis_case_ids: [A13] },
        { text: "Agree the stop time and the single end-to-end check that decides which version you demo, and write both down.", basis_case_ids: [CH] },
        { text: "Have your teammate build on a separate branch and report at the halfway point whether it is on track.", basis_case_ids: [A11] },
      ],
      what_would_change: [
        { condition: "The rollback test fails or covers only part of the demo.", effect: "Freeze the working backend and stabilise it instead.", constraint_key: "rollback_tested", constraint_value: "false" },
        { condition: "The demo is moved to several days away.", effect: "A full rebuild with proper testing becomes realistic.", constraint_key: "deadline_hours", constraint_value: "96" },
        { condition: "Your teammate is new to the framework.", effect: "The experiment is less likely to finish in time; shorten it or skip it.", constraint_key: "none", constraint_value: "" },
      ],
      uncertainties: ["How long the new framework would take to reach the demo's needs", "Whether the stop time will hold under pressure"],
    },
  },
  {
    id: "launch_bug/base",
    preset_id: "launch_bug",
    modelled: [],
    matches: () => true,
    profile: {
      decision: "Whether to launch an app on its publicly announced date despite an intermittent bug that can corrupt user data.",
      options: ["Launch on schedule", "Delay the launch", "Launch with the affected feature disabled"],
      actors: ["You", "The engineers who found the bug", "Management", "Your users"],
      known_constraints: ["The launch date has been announced publicly", "The bug is intermittent and rare"],
      urgency: "days",
      time_horizon: "A few days until Monday",
      reversibility: "partly_reversible",
      relationship: "repeated",
      stakes: "high",
      known_facts: ["QA found an intermittent bug that can corrupt user data", "The engineers who found it want a delay", "Management judges the risk tiny"],
      user_interpretations: ["Management sees a delay as embarrassing."],
      uncertainties: ["How often the bug occurs in normal use", "Whether the affected feature can be switched off", "Whether corrupted data can be restored"],
      assumptions: ["Corrupted user data could not be fully restored once it happens."],
    },
    cases: [
      { case_id: CH, role: "supporting", levels: { structural: 4, incentives: 3, constraints: 3, time: 3 } },
      { case_id: A11, role: "challenging", levels: { structural: 3, incentives: 2, constraints: 2, time: 2 } },
    ],
    challenging_note: null,
    draft: {
      decision_summary:
        "Your launch on Monday is public. Engineers who found a rare bug that can corrupt user data want to delay; management thinks the risk is tiny and a delay would be embarrassing.",
      assumptions: ["Corrupted user data could not be fully restored once it happens."],
      unknowns: ["How often the bug occurs in normal use", "Whether the affected feature can be switched off"],
      recommendation: {
        text: "Do not ship the affected data path on Monday unless the engineers who found the bug can show it is safe. Put the burden of proof on launching, not on the people raising the concern: launch without that feature if it can be switched off, and delay if it cannot.",
        conditions: ["The bug can damage user data in a way that is hard to undo.", "The engineers' concern has not yet been answered with evidence."],
        basis_case_ids: [CH],
      },
      conditional_alternatives: [
        {
          condition: "If the affected feature can be disabled without breaking the rest of the app",
          action: "Launch on Monday with that feature switched off, and say plainly that it will follow.",
          basis_case_ids: [CH],
        },
        {
          condition: "If the engineers diagnose the cause and show the bug cannot occur in the launch configuration",
          action: "Launch as planned, with monitoring and a rehearsed rollback.",
          basis_case_ids: [A11],
        },
      ],
      lesson_tension:
        "Challenger argues for delay when the people closest to the risk object and the damage cannot be undone. Apollo 11 shows that pressing on can be justified once someone who understands the system has diagnosed the warning and a way back exists. What separates them is whether the problem has actually been diagnosed.",
      comparisons: [
        {
          case_id: CH,
          lesson: "When the damage can't be undone, launching should have to prove it is safe; the people raising the concern shouldn't have to prove it isn't.",
          shared_mechanism:
            "Both are launch decisions under public schedule pressure, in which the engineers closest to a rare but serious failure want to wait and managers judge the risk acceptable. In 1986 the engineers' recommendation gave way after a call for a management decision.",
          important_differences: [
            "Data corruption is serious but not life-threatening.",
            "Software can often be patched, or a feature switched off, after launch; a launched shuttle could not be recalled.",
            "Your engineers may be able to reproduce the bug before Monday.",
          ],
          applies_when: "The failure would be hard to undo and the engineers' concern has not been answered with evidence.",
          historical_points: [
            { text: "The engineering conclusion presented on the eve of launch was not to fly outside their data base, which went down to 53 degrees.", claim_ids: ["CLM_CH_003"] },
            { text: "Mr. Mulloy testified that he may have voiced the thought that a new temperature limit could mean not launching until the following April.", claim_ids: ["CLM_CH_004"] },
            { text: "Mr. Mason said a management decision was needed and asked Bob Lund, Thiokol's Vice President and Director of Engineering, to put on his management hat.", claim_ids: ["CLM_CH_005", "CLM_CH_002"] },
            { text: "The Commission judged it highly unlikely that the launch would have been approved if the decision makers had known all of the facts.", claim_ids: ["CLM_CH_011"] },
          ],
          quotes: [{ passage_id: "PSG_CH_DATABASE", text: "we should not fly outside of our data base" }],
        },
        {
          case_id: A11,
          lesson: "Proceed past a warning only once someone who knows the system has diagnosed it and you still have a way back.",
          shared_mechanism:
            "Apollo 11 is the case for pressing on: the landing continued through alarms the crew did not recognise, because the specialist who knew the computer diagnosed them within seconds and the software kept its most important work running.",
          important_differences: [
            "The alarms were diagnosed before the decision to continue; your bug has not been diagnosed yet.",
            "An abort stayed available during the descent; corrupted user data may not be recoverable.",
          ],
          applies_when: "The warning has been diagnosed by someone who knows the system and a safe fallback remains.",
          historical_points: [
            { text: "During the descent the computer raised alarms the crew did not recognise, while the trajectory looked good.", claim_ids: ["CLM_A11_002"] },
            { text: "Engineer Steven Bales diagnosed the problem within seconds and recommended that the landing continue.", claim_ids: ["CLM_A11_003"] },
            { text: "The computer had been programmed so that it could keep handling high-priority tasks while its memory was being overloaded.", claim_ids: ["CLM_A11_004"] },
          ],
          quotes: [],
        },
      ],
      source_conflicts: [CH_DISPUTE],
      next_steps: [
        { text: "Ask the engineers under what conditions the bug occurs, and whether they can reproduce it before Monday.", basis_case_ids: [A11] },
        { text: "Check whether the affected feature can be switched off for launch without breaking anything else.", basis_case_ids: [CH] },
        { text: "Agree in advance who makes the call, and that launching needs evidence of safety rather than proof of danger.", basis_case_ids: [CH] },
      ],
      what_would_change: [
        { condition: "The engineers reproduce and fix the bug, and the fix is tested.", effect: "Launching on schedule becomes reasonable.", constraint_key: "none", constraint_value: "" },
        { condition: "Affected data can be backed up and restored quickly.", effect: "The harm becomes reversible, which weakens the case for delay.", constraint_key: "reversibility", constraint_value: "reversible" },
        { condition: "The launch can move by a week at little cost.", effect: "Delay becomes the clear choice.", constraint_key: "deadline_hours", constraint_value: "168" },
      ],
      uncertainties: ["How rare the bug really is in normal use", "The real cost of a short delay"],
    },
  },
  {
    id: "charity_funding/base",
    preset_id: "charity_funding",
    modelled: [],
    matches: () => true,
    profile: {
      decision: "Whether a small charity should cut some programmes now or keep everything running while it tries to replace a lost grant.",
      options: ["Cut or pause some programmes now", "Keep everything running while fundraising", "Reduce programmes partially and set a review date"],
      actors: ["Trustees", "Staff", "The people the programmes serve", "Potential funders"],
      known_constraints: ["About four months of funding left", "The main grant has been lost"],
      urgency: "weeks",
      time_horizon: "About four months until funds run out",
      reversibility: "partly_reversible",
      relationship: "repeated",
      stakes: "high",
      known_facts: ["The charity lost its main grant halfway through the year", "There is enough money for about four months"],
      user_interpretations: [],
      uncertainties: ["How likely new funding is within four months", "Which programmes are essential to the charity's purpose", "How costly it is to restart a paused programme"],
      assumptions: ["New funding is not yet committed."],
    },
    cases: [{ case_id: A13, role: "supporting", levels: { structural: 3, incentives: 2, constraints: 4, time: 2 } }],
    challenging_note:
      "None of the cases in the current collection clearly challenges this lesson, so none is shown. A case in which waiting for new resources paid off would be a useful addition to the collection.",
    draft: {
      decision_summary:
        "Your charity has about four months of money left after losing its main grant. You are deciding whether to cut programmes now or keep them all running while you fundraise.",
      assumptions: ["New funding is not yet committed."],
      unknowns: ["How likely new funding is within four months", "How costly it would be to restart a paused programme"],
      recommendation: {
        text: "Decide now which programmes are essential to your purpose and protect them. Reduce or pause the rest while you fundraise, rather than running everything at full cost and hoping new money arrives in time.",
        conditions: ["Your remaining funds cannot be replenished before they run out.", "You can identify which programmes are essential."],
        basis_case_ids: [A13],
      },
      conditional_alternatives: [
        {
          condition: "If a funder has firmly committed money that will arrive within the four months",
          action: "Keep more programmes running, but still agree which you would pause first if the money slips.",
          basis_case_ids: [A13],
        },
      ],
      lesson_tension: null,
      comparisons: [
        {
          case_id: A13,
          lesson: "When money will run out before it can be replaced, decide now what is essential and pause the rest, rather than spending at full rate on hope.",
          shared_mechanism:
            "Both face a fixed store of resources that cannot be topped up in time, with a hard point at which it runs out. Apollo 13's controllers kept running only what the return required, rationed the rest, and accepted real hardship to keep the essential capability.",
          important_differences: [
            "Your funds might be replenished by fundraising; Apollo 13's supplies could not be.",
            "Cutting a programme affects the people it serves, a cost with no direct parallel in the spacecraft.",
            "Trustees and staff share decisions; Apollo 13 had one command structure.",
          ],
          applies_when: "Resources will run out before they can be replenished, and the essential activities can be named.",
          historical_points: [
            { text: "The lunar module was built for a 45-hour lifetime and had to be stretched to 90 hours.", claim_ids: ["CLM_A13_004"] },
            { text: "All noncritical systems were turned off and energy use was cut to one-fifth, leaving about 20 percent of the lunar module's power at the end.", claim_ids: ["CLM_A13_007"] },
            { text: "The crew cut their water to one-fifth of normal intake and finished with about 9 percent of the total.", claim_ids: ["CLM_A13_008"] },
            { text: "The cost was real: with systems switched off, the cabin fell to 38 degrees Fahrenheit and sleep was almost impossible.", claim_ids: ["CLM_A13_010"] },
          ],
          quotes: [{ passage_id: "PSG_A13_POWER", text: "All noncritical systems were turned off and energy consumption was reduced to 1/5" }],
        },
      ],
      source_conflicts: [],
      next_steps: [
        { text: "List every programme and mark which ones your purpose cannot do without; agree that list with the trustees this month.", basis_case_ids: [A13] },
        { text: "Work out how long the money lasts if you pause the rest, compared with keeping everything running.", basis_case_ids: [A13] },
        { text: "Set a date by which new funding must be confirmed, after which the agreed pauses go ahead.", basis_case_ids: [A13] },
      ],
      what_would_change: [
        { condition: "A new funder commits money that arrives before you run out.", effect: "Fewer cuts are needed; keep a pause list ready in case it slips.", constraint_key: "none", constraint_value: "" },
        { condition: "Paused programmes would be very hard to restart.", effect: "Pausing costs more, so consider reducing programmes rather than stopping them.", constraint_key: "reversibility", constraint_value: "irreversible" },
      ],
      uncertainties: ["How likely new funding is within four months", "How much each programme costs to pause and restart"],
    },
  },
];
