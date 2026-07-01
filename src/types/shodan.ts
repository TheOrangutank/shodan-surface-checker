export interface ShodanProfile {
  member: boolean;
  credits: number;
  display_name: string;
  created: string;
}

export interface ShodanDomainInfo {
  domain: string;
  tags: string[];
  subdomains: string[];
  data: ShodanDnsRecord[];
}

export interface ShodanDnsRecord {
  subdomain: string;
  type: string;
  value: string;
  last_seen: string;
}

export interface ShodanHostInfo {
  ip_str: string;
  org: string | null;
  isp: string | null;
  country_name: string | null;
  city: string | null;
  hostnames: string[];
  ports: number[];
  last_update: string;
  data: ShodanBanner[];
}

export interface ShodanBanner {
  port: number;
  transport: string;
  product?: string;
  version?: string;
  module?: string;
  data?: string;
  _shodan?: { module: string };
}

export type RiskLevel = "high" | "medium" | "low" | "info";

export interface PortRisk {
  level: RiskLevel;
  label: string;
}

export interface ScanSummary {
  highRiskPorts: number[];
  mediumRiskPorts: number[];
  totalOpenPorts: number;
}
