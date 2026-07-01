import type { PortRisk, RiskLevel } from "@/types/shodan";

const RISKY_PORTS: Record<number, PortRisk> = {
  23: { level: "high", label: "Telnet — unencrypted remote access" },
  3389: { level: "high", label: "RDP — remote desktop exposed" },
  5900: { level: "high", label: "VNC — remote desktop exposed" },
  6379: { level: "high", label: "Redis — often unauthenticated" },
  27017: { level: "high", label: "MongoDB — often unauthenticated" },
  445: { level: "medium", label: "SMB — file sharing" },
  21: { level: "medium", label: "FTP — often unencrypted" },
  3306: { level: "medium", label: "MySQL database" },
  5432: { level: "medium", label: "PostgreSQL database" },
  22: { level: "info", label: "SSH — ensure keys, not passwords" },
  80: { level: "low", label: "HTTP web server" },
  443: { level: "low", label: "HTTPS web server" },
};

export function getPortRisk(port: number): PortRisk {
  return RISKY_PORTS[port] ?? { level: "low", label: "Open service" };
}

export function summarizePorts(ports: number[]) {
  const highRiskPorts: number[] = [];
  const mediumRiskPorts: number[] = [];

  for (const port of ports) {
    const risk = getPortRisk(port);
    if (risk.level === "high") highRiskPorts.push(port);
    else if (risk.level === "medium") mediumRiskPorts.push(port);
  }

  return {
    highRiskPorts,
    mediumRiskPorts,
    totalOpenPorts: ports.length,
  };
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  high: "text-[var(--risk-high)]",
  medium: "text-[var(--risk-medium)]",
  low: "text-[var(--risk-low)]",
  info: "text-[var(--risk-info)]",
};
