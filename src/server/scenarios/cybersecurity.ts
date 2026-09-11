import type { ScenarioModule } from "./types";

function rot13(text: string) {
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

const LEVELS = [
  {
    index: 0,
    name: "Compromised Web Server",
    briefing:
      "Intrusion detection fired an alert on the DMZ web server. Scan for the vulnerable service, patch it, decode the intercepted note, and identify the attacker's IP to compile the flag.",
    recommendedPlayers: 3,
    services: [
      { port: 22, name: "OpenSSH 9.3", vulnerable: false },
      { port: 80, name: "nginx 1.25", vulnerable: false },
      { port: 8080, name: "legacy-admin-panel v1.2", vulnerable: true },
      { port: 3306, name: "MySQL 8.0", vulnerable: false },
    ],
    vulnerablePort: 8080,
    secretMessage: "breach at midnight",
    logs: [
      { ip: "10.0.0.4", note: "internal - workstation" },
      { ip: "10.0.0.9", note: "internal - printer" },
      { ip: "185.220.101.7", note: "5 failed logins then success, 3:12am" },
      { ip: "8.8.8.8", note: "DNS resolver" },
    ],
    maliciousIp: "185.220.101.7",
    fragA: "PORT8080",
    fragB: "PATCHED",
  },
  {
    index: 1,
    name: "Ransomware on the Domain Controller",
    briefing:
      "A ransomware strain is spreading from the domain controller. The scan surface is noisier, the cipher is layered, and the log has more decoys.",
    recommendedPlayers: 4,
    services: [
      { port: 21, name: "vsftpd 3.0.3", vulnerable: false },
      { port: 445, name: "SMBv1 (legacy)", vulnerable: true },
      { port: 443, name: "Apache 2.4 (TLS 1.3)", vulnerable: false },
      { port: 3389, name: "RDP - patched", vulnerable: false },
      { port: 5900, name: "VNC - no auth", vulnerable: false },
    ],
    vulnerablePort: 445,
    secretMessage: "wire the ransom now",
    logs: [
      { ip: "10.0.5.11", note: "internal - domain controller" },
      { ip: "45.148.10.22", note: "beaconing every 60s to unknown host" },
      { ip: "172.16.0.3", note: "internal - backup server" },
      { ip: "203.0.113.9", note: "single blocked probe" },
      { ip: "198.51.100.4", note: "internal VPN gateway" },
    ],
    maliciousIp: "45.148.10.22",
    fragA: "SMB445",
    fragB: "ISOLATED",
  },
];

export const cybersecurityScenario: ScenarioModule = {
  id: "cybersecurity",
  name: "Cybersecurity Mode",
  description: "A CTF-style incident response: scan the network, patch vulnerabilities, break ciphers, and trace the attacker to capture the flag.",
  roles: [
    {
      id: "pentester",
      name: "Pentester",
      tagline: "Runs reconnaissance scans against the network.",
      color: "#10b981",
      icon: "🛰️",
      abilities: ["Run nmap-style scans to reveal open ports/services."],
    },
    {
      id: "itsecadmin",
      name: "IT Sec Admin",
      tagline: "Patches vulnerable services found by the Pentester.",
      color: "#3b82f6",
      icon: "🛡️",
      abilities: ["Patch the vulnerable service by port number."],
    },
    {
      id: "cryptographer",
      name: "Cryptographer",
      tagline: "Breaks intercepted ciphertext.",
      color: "#a855f7",
      icon: "🔐",
      abilities: ["Decode the intercepted attacker message."],
    },
    {
      id: "forensics",
      name: "Forensics",
      tagline: "Hunts for the attacker's IP inside access logs.",
      color: "#ef4444",
      icon: "🔍",
      abilities: ["Analyze the access log to flag the malicious IP."],
    },
  ],
  levels: LEVELS.map((l) => ({ index: l.index, name: l.name, briefing: l.briefing, recommendedPlayers: l.recommendedPlayers })),
  createInitialData(levelIndex) {
    const lvl = LEVELS[Math.min(levelIndex, LEVELS.length - 1)];
    const flag = `FLAG{${lvl.fragA}_${lvl.fragB}_${lvl.maliciousIp.replace(/\./g, "-")}}`;
    return {
      pub: {
        title: lvl.name,
        scanDone: false,
        patched: false,
        cryptoSolved: false,
        forensicsSolved: false,
        scanOutput: null,
        cipherText: rot13(lvl.secretMessage),
        logs: lvl.logs,
        fragments: { pentester: null, itsecadmin: null, cryptographer: null, forensics: null },
        attemptsLeft: 5,
      },
      secrets: {
        services: lvl.services,
        vulnerablePort: lvl.vulnerablePort,
        secretMessage: lvl.secretMessage,
        maliciousIp: lvl.maliciousIp,
        flag,
        fragA: lvl.fragA,
        fragB: lvl.fragB,
      },
    };
  },
  applyAction({ data, player, action }) {
    const pub = data.pub;
    const secrets = data.secrets;

    switch (action.type) {
      case "run_scan": {
        if (player.role !== "pentester") return { ok: false, reason: "Only the Pentester can run scans." };
        if (pub.scanDone) return { ok: false, reason: "Scan already completed." };
        return {
          ok: true,
          patch: {
            pub: {
              scanDone: true,
              scanOutput: secrets.services,
              fragments: { ...(pub.fragments as object), pentester: secrets.fragA },
            },
          },
          feed: [{ message: `${player.name} (Pentester) completed a port scan.`, tone: "success" }],
        };
      }
      case "patch_service": {
        if (player.role !== "itsecadmin") return { ok: false, reason: "Only the IT Sec Admin can patch services." };
        if (!pub.scanDone) return { ok: false, reason: "Wait for the Pentester's scan results first." };
        if (pub.patched) return { ok: false, reason: "Already patched." };
        const port = Number(action.payload?.port);
        if (port === secrets.vulnerablePort) {
          return {
            ok: true,
            patch: { pub: { patched: true, fragments: { ...(pub.fragments as object), itsecadmin: secrets.fragB } } },
            feed: [{ message: `${player.name} (IT Sec Admin) patched port ${port}. Vulnerability closed.`, tone: "success" }],
          };
        }
        return { ok: true, feed: [{ message: `${player.name} (IT Sec Admin) patched the wrong service (port ${port}).`, tone: "warning" }] };
      }
      case "decode_message": {
        if (player.role !== "cryptographer") return { ok: false, reason: "Only the Cryptographer can decode the intercepted message." };
        if (pub.cryptoSolved) return { ok: false, reason: "Already solved." };
        const answer = String(action.payload?.answer ?? "").trim().toLowerCase();
        if (answer === String(secrets.secretMessage).toLowerCase()) {
          return {
            ok: true,
            patch: { pub: { cryptoSolved: true, fragments: { ...(pub.fragments as object), cryptographer: "DECODED" } } },
            feed: [{ message: `${player.name} (Cryptographer) decoded the attacker's message!`, tone: "success" }],
          };
        }
        return { ok: true, feed: [{ message: `${player.name} (Cryptographer) submitted an incorrect decode.`, tone: "warning" }] };
      }
      case "analyze_logs": {
        if (player.role !== "forensics") return { ok: false, reason: "Only Forensics can analyze the access log." };
        if (pub.forensicsSolved) return { ok: false, reason: "Already solved." };
        const ip = String(action.payload?.ip ?? "");
        if (ip === secrets.maliciousIp) {
          return {
            ok: true,
            patch: { pub: { forensicsSolved: true, fragments: { ...(pub.fragments as object), forensics: secrets.maliciousIp } } },
            feed: [{ message: `${player.name} (Forensics) flagged the malicious IP ${ip}.`, tone: "success" }],
          };
        }
        return { ok: true, feed: [{ message: `${player.name} (Forensics) flagged ${ip} — not the attacker.`, tone: "warning" }] };
      }
      case "submit_flag": {
        if (!pub.scanDone || !pub.patched || !pub.cryptoSolved || !pub.forensicsSolved) {
          return { ok: false, reason: "All four roles must complete their task before the flag can be assembled." };
        }
        const flag = String(action.payload?.flag ?? "").trim();
        if (flag === secrets.flag) {
          return { ok: true, status: "won", feed: [{ message: `${player.name} submitted the correct flag! Network secured.`, tone: "success" }] };
        }
        const attemptsLeft = Math.max(0, (pub.attemptsLeft as number) - 1);
        if (attemptsLeft <= 0) {
          return { ok: true, status: "lost", patch: { pub: { attemptsLeft } }, feed: [{ message: `${player.name} submitted an incorrect flag. Lockout triggered — mission failed.`, tone: "danger" }] };
        }
        return { ok: true, patch: { pub: { attemptsLeft } }, feed: [{ message: `${player.name} submitted an incorrect flag. ${attemptsLeft} attempts left.`, tone: "danger" }] };
      }
      default:
        return { ok: false, reason: `Unknown action "${action.type}".` };
    }
  },
};
