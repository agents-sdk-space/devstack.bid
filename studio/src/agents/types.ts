import type { AgentKind } from '@/broker/events';

export interface RoutePlan {
  targets: AgentKind[];
  reason: string;
  summary: string;
  codeIntent?: string;
  dbIntent?: string;
  designIntent?: string;
  assetName?: string;
}
