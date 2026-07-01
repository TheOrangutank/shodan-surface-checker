import type { ScanSummary, ShodanDomainInfo, ShodanHostInfo } from "@/types/shodan";

export type AssetType = "domain" | "ip";

export interface DomainAssetSummary {
  type: "domain";
  subdomainCount: number;
}

export interface IpAssetSummary extends ScanSummary {
  type: "ip";
}

export type AssetSummary = DomainAssetSummary | IpAssetSummary;

export interface HostScanSnapshot {
  host: ShodanHostInfo;
  summary: ScanSummary;
}

export type AssetSnapshot = ShodanDomainInfo | HostScanSnapshot;

export interface MonitoredAsset {
  id: string;
  type: AssetType;
  value: string;
  label: string | null;
  last_queried_at: string | null;
  last_result: AssetSnapshot | null;
  last_summary: AssetSummary | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetPayload {
  type: AssetType;
  value: string;
  label?: string | null;
}

export interface AssetPatchPayload {
  type?: AssetType;
  value?: string;
  label?: string | null;
}
