export type TokenUsage = {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
};

export type ConversationMetadata = {
  conversationId: string;
  status: string;
  durationSeconds: number;
  totalMessages: number;
  inboundCount: number;
  outboundCount: number;
  avgResponseTimeSeconds: number | null;
  secondsSinceLastMessage: number;
  hasMedia: boolean;
  messageTypes: string[];
  // Fields intentionally excluded: message.text, patient.name, patient.phoneE164
};

export type AnalysisResult = {
  summary: string;
  riskScore: number;                               // 0-100
  confidenceLevel: "low" | "medium" | "high";
  sentimentEstimate: "positive" | "neutral" | "negative" | "unknown";
  sentimentBasis: "behavioral_patterns_only";
  responseDelayRisk: "none" | "low" | "medium" | "high";
  needsSupervisorReview: boolean;
  recommendedAction: string;
  analysisNote: string;
};
