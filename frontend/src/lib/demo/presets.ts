/** Example dilemmas offered on the start screen. Shared by client and server. */
export interface Preset {
  id: string;
  label: string;
  query: string;
}

export const PRESETS: Preset[] = [
  {
    id: "hackathon_rebuild",
    label: "A risky rebuild before a deadline",
    query:
      "We have one day left at a hackathon. Our backend partly works, but my teammate wants to replace it with a new framework tonight because it would be cleaner. I worry we will end up with nothing working for the demo. Should we agree to the rebuild?",
  },
  {
    id: "launch_bug",
    label: "Launching with an unresolved bug",
    query:
      "Our app launches on Monday and the date has been announced publicly. QA found an intermittent bug that can corrupt user data in a rare case, and the engineers who found it want a delay. Management says the risk is tiny and a delay would be embarrassing. Should we launch on schedule?",
  },
  {
    id: "charity_funding",
    label: "Funding runs out mid-year",
    query:
      "Our small charity has lost its main grant halfway through the year. We have enough money for about four months. Should we cut some programmes now, or keep everything running while we try to raise new funds?",
  },
];

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function matchPreset(query: string): Preset | null {
  const q = normalise(query);
  return PRESETS.find((p) => normalise(p.query) === q) ?? null;
}
