// The reference project's shots.json (timing in seconds, transitions, letterbox), and a beat's shots from it.
import type { Shot2D } from "@kit";
import { SHOTS } from "./registry";
import "./shots01";
import "./shots02";
import "./shots03";

const META: Record<string, Partial<Shot2D>> = {
 "s001": {
  "dur": 3.4,
  "line": "A fly buzzes past your face.",
  "in": {
   "type": "cut"
  }
 },
 "s002": {
  "dur": 1.5,
  "line": "You don't even think.",
  "in": {
   "type": "cut"
  },
  "bars": "scope"
 },
 "s003": {
  "dur": 2.3,
  "line": "You just catch it.",
  "in": {
   "type": "cut"
  }
 },
 "s004": {
  "dur": 3.2,
  "in": {
   "type": "cut"
  }
 },
 "s005": {
  "dur": 3.1,
  "line": "Your friend knocks his coffee off the table.",
  "in": {
   "type": "cut"
  }
 },
 "s006": {
  "dur": 2.7,
  "line": "The cup hasn't even started to fall,",
  "in": {
   "type": "flash",
   "dur": 0.4
  },
  "bars": "scope"
 },
 "s007": {
  "dur": 3.4,
  "line": "and your hand is already under it.",
  "in": {
   "type": "cut"
  }
 },
 "s008": {
  "dur": 3.45,
  "in": {
   "type": "cut"
  }
 },
 "s009": {
  "dur": 4.15,
  "line": "\"How? How did you do that?\"",
  "in": {
   "type": "cut"
  }
 },
 "s010": {
  "dur": 4.1,
  "line": "A normal human reacts in about a quarter of a second.",
  "in": {
   "type": "dip",
   "dur": 0.6
  }
 },
 "s011": {
  "dur": 2.8,
  "line": "You react in 2.5 hundredths.",
  "in": {
   "type": "cut"
  }
 },
 "s012": {
  "dur": 5.7,
  "line": "So what if your reaction time was 10x faster?",
  "in": {
   "type": "fade",
   "dur": 0.6
  },
  "bars": "scope"
 },
 "s013": {
  "dur": 2.4,
  "line": "Here's how it works.",
  "in": {
   "type": "whip",
   "dur": 0.35
  }
 },
 "s014": {
  "dur": 5.16,
  "line": "Your eyes see. Your brain decides. Your muscles move.",
  "in": {
   "type": "zoom",
   "dur": 0.5
  }
 }
};

export const shotsOf = (ids: string[]): Shot2D[] => ids.map((id, i) => ({ id, ...META[id], ...(i === ids.length - 1 ? { dur: undefined } : {}), ...SHOTS[id] }) as Shot2D);
