import type { ScenarioModule } from "./types";

// Simple Caesar cipher helper used by the Hacker role's puzzle.
function caesarEncode(text: string, shift: number) {
  return text
    .toUpperCase()
    .split("")
    .map((ch) => {
      if (ch < "A" || ch > "Z") return ch;
      const code = ((ch.charCodeAt(0) - 65 + shift) % 26) + 65;
      return String.fromCharCode(code);
    })
    .join("");
}

const LEVELS = [
  {
    index: 0,
    name: "The Sealed Study",
    briefing:
      "You wake up locked inside an old study. A vault door blocks the exit. Split up, gather clues, and combine them into an unlock code.",
    recommendedPlayers: 3,
    plain: "KEY",
    shift: 3,
    spots: ["Bookshelf", "Painting", "Writing Desk", "Fireplace"],
    correctSpot: "Fireplace",
    explorerFragment: "17",
    diagnosisOptions: [
      { id: "a", label: "Common cold" },
      { id: "b", label: "Poison ivy rash" },
      { id: "c", label: "Sedative overdose" },
    ],
    correctDiagnosis: "c",
    healerFragment: "R9",
  },
  {
    index: 1,
    name: "The Collapsing Archive",
    briefing:
      "Deeper in the facility, the archive room is flooding. The cipher is tougher and the vault only accepts one attempt window before guards return.",
    recommendedPlayers: 4,
    plain: "EXIT",
    shift: 7,
    spots: ["Filing Cabinet", "Ventilation Shaft", "Old Terminal", "Loose Floorboard", "Locker 12"],
    correctSpot: "Locker 12",
    explorerFragment: "42X",
    diagnosisOptions: [
      { id: "a", label: "Carbon monoxide exposure" },
      { id: "b", label: "Broken ankle" },
      { id: "c", label: "Severe dehydration" },
      { id: "d", label: "Electrical burn" },
    ],
    correctDiagnosis: "a",
    healerFragment: "Q3",
  },
];

export const adventureScenario: ScenarioModule = {
  id: "adventure",
  name: "Adventure Mode",
  description: "A traditional cooperative escape room: find clues, solve logic puzzles, and unlock the door together.",
  roles: [
    {
      id: "explorer",
      name: "Explorer",
      tagline: "Searches the room for physical clues.",
      color: "#f59e0b",
      icon: "🧭",
      abilities: ["Search hidden spots around the room for fragments."],
    },
    {
      id: "hacker",
      name: "Hacker",
      tagline: "Breaks ciphers and electronic locks.",
      color: "#8b5cf6",
      icon: "💻",
      abilities: ["Decode intercepted ciphertext."],
    },
    {
      id: "healer",
      name: "Healer",
      tagline: "Reads medical charts to diagnose survivors.",
      color: "#22c55e",
      icon: "💊",
      abilities: ["Diagnose the patient chart for a fragment."],
    },
    {
      id: "archer",
      name: "Archer",
      tagline: "Keeps watch so the team can safely act.",
      color: "#0ea5e9",
      icon: "🏹",
      abilities: ["Stand guard, which is required before the vault can be opened."],
    },
  ],
  levels: LEVELS.map((l) => ({
    index: l.index,
    name: l.name,
    briefing: l.briefing,
    recommendedPlayers: l.recommendedPlayers,
  })),
  createInitialData(levelIndex) {
    const lvl = LEVELS[Math.min(levelIndex, LEVELS.length - 1)];
    const doorCode = `${lvl.explorerFragment}-${lvl.plain}-${lvl.healerFragment}`;
    return {
      pub: {
        title: lvl.name,
        guardActive: false,
        explorerFound: false,
        hackerFound: false,
        healerFound: false,
        fragments: { explorer: null, hacker: null, healer: null },
        spots: lvl.spots,
        cipherText: caesarEncode(lvl.plain, lvl.shift),
        shift: lvl.shift,
        diagnosisOptions: lvl.diagnosisOptions,
        attemptsLeft: 5,
      },
      secrets: {
        correctSpot: lvl.correctSpot,
        plain: lvl.plain,
        correctDiagnosis: lvl.correctDiagnosis,
        explorerFragment: lvl.explorerFragment,
        healerFragment: lvl.healerFragment,
        doorCode,
      },
    };
  },
  applyAction({ data, player, action }) {
    const pub = data.pub;
    const secrets = data.secrets;

    switch (action.type) {
      case "search": {
        if (player.role !== "explorer") return { ok: false, reason: "Only the Explorer can search the room." };
        if (pub.explorerFound) return { ok: false, reason: "Already found." };
        const spot = String(action.payload?.spot ?? "");
        if (spot === secrets.correctSpot) {
          return {
            ok: true,
            patch: {
              pub: {
                explorerFound: true,
                fragments: { ...(pub.fragments as object), explorer: secrets.explorerFragment },
              },
            },
            feed: [{ message: `${player.name} (Explorer) found a fragment at the ${spot}!`, tone: "success" }],
          };
        }
        return {
          ok: true,
          feed: [{ message: `${player.name} (Explorer) searched the ${spot} and found nothing.`, tone: "warning" }],
        };
      }
      case "decode_cipher": {
        if (player.role !== "hacker") return { ok: false, reason: "Only the Hacker can decode ciphers." };
        if (pub.hackerFound) return { ok: false, reason: "Already solved." };
        const answer = String(action.payload?.answer ?? "").trim().toUpperCase();
        if (answer === secrets.plain) {
          return {
            ok: true,
            patch: { pub: { hackerFound: true, fragments: { ...(pub.fragments as object), hacker: secrets.plain } } },
            feed: [{ message: `${player.name} (Hacker) cracked the cipher!`, tone: "success" }],
          };
        }
        return { ok: true, feed: [{ message: `${player.name} (Hacker) tried "${answer}" — incorrect.`, tone: "warning" }] };
      }
      case "diagnose": {
        if (player.role !== "healer") return { ok: false, reason: "Only the Healer can diagnose." };
        if (pub.healerFound) return { ok: false, reason: "Already solved." };
        const optionId = String(action.payload?.optionId ?? "");
        if (optionId === secrets.correctDiagnosis) {
          return {
            ok: true,
            patch: { pub: { healerFound: true, fragments: { ...(pub.fragments as object), healer: secrets.healerFragment } } },
            feed: [{ message: `${player.name} (Healer) correctly diagnosed the patient!`, tone: "success" }],
          };
        }
        return { ok: true, feed: [{ message: `${player.name} (Healer) misdiagnosed the patient.`, tone: "warning" }] };
      }
      case "stand_guard": {
        if (player.role !== "archer") return { ok: false, reason: "Only the Archer can stand guard." };
        if (pub.guardActive) return { ok: false, reason: "Already guarding." };
        return {
          ok: true,
          patch: { pub: { guardActive: true } },
          feed: [{ message: `${player.name} (Archer) is standing guard. It's safe to act.`, tone: "info" }],
        };
      }
      case "unlock_door": {
        if (!pub.guardActive) return { ok: false, reason: "The Archer must stand guard first." };
        if (!pub.explorerFound || !pub.hackerFound || !pub.healerFound) {
          return { ok: false, reason: "Not all fragments have been recovered yet." };
        }
        const code = String(action.payload?.code ?? "").trim().toUpperCase();
        if (code === String(secrets.doorCode).toUpperCase()) {
          return { ok: true, status: "won", feed: [{ message: `${player.name} unlocked the vault door! The team escapes!`, tone: "success" }] };
        }
        const attemptsLeft = Math.max(0, (pub.attemptsLeft as number) - 1);
        if (attemptsLeft <= 0) {
          return {
            ok: true,
            status: "lost",
            patch: { pub: { attemptsLeft } },
            feed: [{ message: `${player.name} entered the wrong code. The vault locks permanently. Mission failed.`, tone: "danger" }],
          };
        }
        return {
          ok: true,
          patch: { pub: { attemptsLeft } },
          feed: [{ message: `${player.name} tried "${code}" — wrong code. ${attemptsLeft} attempts left.`, tone: "danger" }],
        };
      }
      default:
        return { ok: false, reason: `Unknown action "${action.type}".` };
    }
  },
};
