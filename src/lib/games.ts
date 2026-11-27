import { supabase } from "@/lib/supabase";

/** Parent control for one child's games. 'weekend' is the school
 *  rule (Saturday and Sunday only). 'always' opens games on
 *  weekdays too. 'blocked' closes them even on weekends. No row
 *  means the school rule applies. */
export type GameMode = "weekend" | "always" | "blocked";

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  weekend: "Weekends only (school rule)",
  always: "Allowed any day",
  blocked: "Blocked",
};

/** Games open on Saturday and Sunday by default. Local time. */
export function isWeekend(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Effective access for one pupil, from every parent setting on
 *  that pupil. Any parent allowing any day wins; otherwise any
 *  parent blocking wins; otherwise the weekend rule applies. */
export function pupilGamesOpen(
  modes: GameMode[],
  date: Date = new Date(),
): boolean {
  if (modes.includes("always")) return true;
  if (modes.includes("blocked")) return false;
  return isWeekend(date);
}

export async function loadPupilGameModes(
  studentId: string,
): Promise<GameMode[]> {
  const { data } = await supabase
    .from("parent_game_settings")
    .select("mode")
    .eq("student_id", studentId);
  return ((data as { mode: string }[] | null) ?? [])
    .map((r) => r.mode)
    .filter((m): m is GameMode => m === "weekend" || m === "always" || m === "blocked");
}

export async function loadGameMode(
  parentId: string,
  studentId: string,
): Promise<GameMode> {
  const { data } = await supabase
    .from("parent_game_settings")
    .select("mode")
    .eq("parent_id", parentId)
    .eq("student_id", studentId)
    .maybeSingle();
  const mode = (data as { mode: string } | null)?.mode;
  return mode === "always" || mode === "blocked" ? mode : "weekend";
}

/** Save one parent's setting for one child. 'weekend' is the
 *  school rule, so it deletes the row instead of storing it. */
export async function saveGameMode(
  schoolId: string,
  parentId: string,
  studentId: string,
  mode: GameMode,
): Promise<string | null> {
  if (mode === "weekend") {
    const { error } = await supabase
      .from("parent_game_settings")
      .delete()
      .eq("parent_id", parentId)
      .eq("student_id", studentId);
    return error ? error.message : null;
  }
  const { error } = await supabase.from("parent_game_settings").upsert(
    {
      school_id: schoolId,
      parent_id: parentId,
      student_id: studentId,
      mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "parent_id,student_id" },
  );
  return error ? error.message : null;
}

// ---------------------------------------------------------------- numbers

export type NumberQuestion = { text: string; answer: number };

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 10 mental-maths questions at primary level: addition and
 *  subtraction up to 100, multiplication up to 12 times 12. */
export function makeNumberQuestions(count = 10): NumberQuestion[] {
  const out: NumberQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const kind = i % 3;
    if (kind === 0) {
      const a = randInt(11, 99);
      const b = randInt(11, 99);
      out.push({ text: `${a} + ${b} = ?`, answer: a + b });
    } else if (kind === 1) {
      const a = randInt(21, 100);
      const b = randInt(11, a);
      out.push({ text: `${a} - ${b} = ?`, answer: a - b });
    } else {
      const a = randInt(2, 12);
      const b = randInt(2, 12);
      out.push({ text: `${a} x ${b} = ?`, answer: a * b });
    }
  }
  return out;
}

// ---------------------------------------------------------------- words

/** School-friendly word bank for the scramble game. */
export const WORD_BANK: string[] = [
  "apple",
  "banana",
  "school",
  "teacher",
  "pencil",
  "book",
  "garden",
  "family",
  "friend",
  "happy",
  "water",
  "market",
  "animal",
  "bridge",
  "candle",
  "doctor",
  "eagle",
  "flower",
  "guitar",
  "house",
  "island",
  "jungle",
  "kitten",
  "lemon",
  "monkey",
  "orange",
  "purple",
  "queen",
  "rabbit",
  "sunset",
  "tiger",
  "uncle",
  "village",
  "window",
  "yellow",
  "zebra",
  "chalk",
  "dream",
  "earth",
  "farm",
];

export function scramble(word: string): string {
  const letters = word.split("");
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  const out = letters.join("");
  return out === word ? scramble(word) : out;
}

export function pickWords(count = 10): string[] {
  const copy = [...WORD_BANK];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

// ---------------------------------------------------------------- current affairs

export type AffairsQuestion = {
  question: string;
  options: string[];
  answer: number;
};

/** Starter question bank - Nigerian and world general knowledge.
 *  The school can update this set later; it is not a live feed. */
export const AFFAIRS_BANK: AffairsQuestion[] = [
  {
    question: "What is the capital of Nigeria?",
    options: ["Lagos", "Abuja", "Kano", "Ibadan"],
    answer: 1,
  },
  {
    question: "Which river is the longest in Nigeria?",
    options: ["River Benue", "River Niger", "River Kaduna", "River Cross"],
    answer: 1,
  },
  {
    question: "How many states are in Nigeria?",
    options: ["30", "36", "37", "42"],
    answer: 1,
  },
  {
    question: "What colours are on the Nigerian flag?",
    options: ["Red, white and blue", "Green, white and green", "Green and yellow", "Blue and white"],
    answer: 1,
  },
  {
    question: "Which Nigerian city is known as the Centre of Excellence?",
    options: ["Abuja", "Kano", "Lagos", "Enugu"],
    answer: 2,
  },
  {
    question: "What is the currency of Nigeria?",
    options: ["Cedi", "Naira", "Rand", "Shilling"],
    answer: 1,
  },
  {
    question: "Which ocean is on the coast of Lagos?",
    options: ["Indian Ocean", "Pacific Ocean", "Atlantic Ocean", "Arctic Ocean"],
    answer: 2,
  },
  {
    question: "What is the capital of Ghana?",
    options: ["Accra", "Kumasi", "Abuja", "Lome"],
    answer: 0,
  },
  {
    question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Jupiter", "Saturn", "Mars"],
    answer: 3,
  },
  {
    question: "How many days are in a leap year?",
    options: ["364", "365", "366", "367"],
    answer: 2,
  },
  {
    question: "What is the largest continent in the world?",
    options: ["Africa", "Europe", "Asia", "North America"],
    answer: 2,
  },
  {
    question: "Which gas do plants take in from the air?",
    options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"],
    answer: 1,
  },
  {
    question: "What is the capital of the United Kingdom?",
    options: ["Paris", "London", "Dublin", "Madrid"],
    answer: 1,
  },
  {
    question: "Which instrument tells us the temperature?",
    options: ["Barometer", "Thermometer", "Compass", "Scale"],
    answer: 1,
  },
  {
    question: "What is the first month of the school year in Nigeria?",
    options: ["January", "September", "May", "March"],
    answer: 1,
  },
];

export function pickAffairs(count = 10): AffairsQuestion[] {
  const copy = [...AFFAIRS_BANK];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}
