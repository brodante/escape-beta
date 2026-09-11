import type { ScenarioModule } from "./types";

const LEVELS = [
  {
    index: 0,
    name: "Outbreak: Ward 3",
    briefing:
      "A novel pathogen has broken out in Ward 3. Sequence the strain, stabilize the patient, mix the antidote compound, and triage the ward to synthesize a cure.",
    recommendedPlayers: 3,
    strains: ["H5N-alpha", "V-Cov9", "N-Reaper", "Strain-X12"],
    correctStrain: "V-Cov9",
    interventions: ["Administer epinephrine", "Apply pressure bandage", "Start IV fluids", "Begin chest compressions"],
    correctIntervention: "Start IV fluids",
    correctRatio: "3:1",
    patients: ["P1 - stable", "P2 - critical", "P3 - moderate"],
    correctOrder: ["P2 - critical", "P3 - moderate", "P1 - stable"],
    fragStrain: "VCOV9",
    fragVitals: "IV-OK",
    fragRatio: "R31",
  },
  {
    index: 1,
    name: "Outbreak: Level-4 Containment",
    briefing:
      "The pathogen mutated. Containment protocol requires precise sequencing, a tighter compound ratio, and triaging five patients under time pressure.",
    recommendedPlayers: 4,
    strains: ["Strain-X12", "Omega-Flu", "V-Cov9-B", "Rift Valley V2", "Marburg-Delta"],
    correctStrain: "Marburg-Delta",
    interventions: ["Induce hypothermia", "Administer antiviral cocktail", "Perform tracheotomy", "Apply tourniquet"],
    correctIntervention: "Administer antiviral cocktail",
    correctRatio: "5:2",
    patients: ["P1 - moderate", "P2 - critical", "P3 - stable", "P4 - critical", "P5 - minor"],
    correctOrder: ["P2 - critical", "P4 - critical", "P1 - moderate", "P3 - stable", "P5 - minor"],
    fragStrain: "MARBDELTA",
    fragVitals: "ANTIVIRAL",
    fragRatio: "R52",
  },
];

export const biologyScenario: ScenarioModule = {
  id: "biology",
  name: "Biology / Medical Mode",
  description: "An outbreak-response scenario: sequence the pathogen, stabilize patients, mix compounds, and triage the ward to synthesize a cure.",
  roles: [
    {
      id: "virologist",
      name: "Virologist",
      tagline: "Sequences the pathogen genome.",
      color: "#ec4899",
      icon: "🧬",
      abilities: ["Identify the correct strain from genome candidates."],
    },
    {
      id: "surgeon",
      name: "Surgeon",
      tagline: "Stabilizes critical patients.",
      color: "#f43f5e",
      icon: "🩺",
      abilities: ["Choose the correct medical intervention."],
    },
    {
      id: "pharmacologist",
      name: "Pharmacologist",
      tagline: "Mixes the antidote compound.",
      color: "#d946ef",
      icon: "🧪",
      abilities: ["Determine the correct mixing ratio."],
    },
    {
      id: "fieldmedic",
      name: "Field Medic",
      tagline: "Triages the ward.",
      color: "#f97316",
      icon: "⛑️",
      abilities: ["Order patients by severity for treatment."],
    },
  ],
  levels: LEVELS.map((l) => ({ index: l.index, name: l.name, briefing: l.briefing, recommendedPlayers: l.recommendedPlayers })),
  createInitialData(levelIndex) {
    const lvl = LEVELS[Math.min(levelIndex, LEVELS.length - 1)];
    const cureCode = `${lvl.fragStrain}-${lvl.fragVitals}-${lvl.fragRatio}`;
    return {
      pub: {
        title: lvl.name,
        strainDone: false,
        vitalsDone: false,
        ratioDone: false,
        triageDone: false,
        strains: lvl.strains,
        interventions: lvl.interventions,
        patients: lvl.patients,
        fragments: { virologist: null, surgeon: null, pharmacologist: null, fieldmedic: null },
        attemptsLeft: 5,
      },
      secrets: {
        correctStrain: lvl.correctStrain,
        correctIntervention: lvl.correctIntervention,
        correctRatio: lvl.correctRatio,
        correctOrder: lvl.correctOrder,
        cureCode,
        fragStrain: lvl.fragStrain,
        fragVitals: lvl.fragVitals,
        fragRatio: lvl.fragRatio,
      },
    };
  },
  applyAction({ data, player, action }) {
    const pub = data.pub;
    const secrets = data.secrets;

    switch (action.type) {
      case "sequence_pathogen": {
        if (player.role !== "virologist") return { ok: false, reason: "Only the Virologist can sequence the pathogen." };
        if (pub.strainDone) return { ok: false, reason: "Already sequenced." };
        const strain = String(action.payload?.strain ?? "");
        if (strain === secrets.correctStrain) {
          return {
            ok: true,
            patch: { pub: { strainDone: true, fragments: { ...(pub.fragments as object), virologist: secrets.fragStrain } } },
            feed: [{ message: `${player.name} (Virologist) identified the strain: ${strain}.`, tone: "success" }],
          };
        }
        return { ok: true, feed: [{ message: `${player.name} (Virologist) misidentified the strain as ${strain}.`, tone: "warning" }] };
      }
      case "stabilize_patient": {
        if (player.role !== "surgeon") return { ok: false, reason: "Only the Surgeon can stabilize the patient." };
        if (pub.vitalsDone) return { ok: false, reason: "Already stabilized." };
        const choice = String(action.payload?.action ?? "");
        if (choice === secrets.correctIntervention) {
          return {
            ok: true,
            patch: { pub: { vitalsDone: true, fragments: { ...(pub.fragments as object), surgeon: secrets.fragVitals } } },
            feed: [{ message: `${player.name} (Surgeon) stabilized the patient.`, tone: "success" }],
          };
        }
        return { ok: true, feed: [{ message: `${player.name} (Surgeon) attempted "${choice}" — patient worsened.`, tone: "warning" }] };
      }
      case "mix_compound": {
        if (player.role !== "pharmacologist") return { ok: false, reason: "Only the Pharmacologist can mix compounds." };
        if (pub.ratioDone) return { ok: false, reason: "Already mixed." };
        const ratio = String(action.payload?.ratio ?? "").trim();
        if (ratio === secrets.correctRatio) {
          return {
            ok: true,
            patch: { pub: { ratioDone: true, fragments: { ...(pub.fragments as object), pharmacologist: secrets.fragRatio } } },
            feed: [{ message: `${player.name} (Pharmacologist) mixed the compound at ratio ${ratio}.`, tone: "success" }],
          };
        }
        return { ok: true, feed: [{ message: `${player.name} (Pharmacologist) tried ratio ${ratio} — unstable mixture.`, tone: "warning" }] };
      }
      case "triage_order": {
        if (player.role !== "fieldmedic") return { ok: false, reason: "Only the Field Medic can triage the ward." };
        if (pub.triageDone) return { ok: false, reason: "Already triaged." };
        const order = Array.isArray(action.payload?.order) ? (action.payload?.order as string[]) : [];
        const correct = JSON.stringify(order) === JSON.stringify(secrets.correctOrder);
        if (correct) {
          return {
            ok: true,
            patch: { pub: { triageDone: true, fragments: { ...(pub.fragments as object), fieldmedic: "TRIAGED" } } },
            feed: [{ message: `${player.name} (Field Medic) triaged the ward correctly.`, tone: "success" }],
          };
        }
        return { ok: true, feed: [{ message: `${player.name} (Field Medic) submitted an incorrect triage order.`, tone: "warning" }] };
      }
      case "synthesize_cure": {
        if (!pub.strainDone || !pub.vitalsDone || !pub.ratioDone || !pub.triageDone) {
          return { ok: false, reason: "All four specialists must finish their task before the cure can be synthesized." };
        }
        const code = String(action.payload?.code ?? "").trim().toUpperCase();
        if (code === String(secrets.cureCode).toUpperCase()) {
          return { ok: true, status: "won", feed: [{ message: `${player.name} synthesized the cure! The outbreak is contained.`, tone: "success" }] };
        }
        const attemptsLeft = Math.max(0, (pub.attemptsLeft as number) - 1);
        if (attemptsLeft <= 0) {
          return { ok: true, status: "lost", patch: { pub: { attemptsLeft } }, feed: [{ message: `${player.name} synthesized the wrong compound. Containment failed.`, tone: "danger" }] };
        }
        return { ok: true, patch: { pub: { attemptsLeft } }, feed: [{ message: `${player.name} tried cure code "${code}" — incorrect. ${attemptsLeft} attempts left.`, tone: "danger" }] };
      }
      default:
        return { ok: false, reason: `Unknown action "${action.type}".` };
    }
  },
};
