/** Centralized query-key factory so invalidation after mutations can't typo a key out of sync with its query. */
export const queryKeys = {
  userDetails: ['userDetails'] as const,
  company: ['company'] as const,
  companyMembers: ['company', 'members'] as const,
  readers: ['company', 'readers'] as const,
  readerGrants: (userId: number) => ['company', 'readers', userId, 'devices'] as const,
  readerEffectiveAccess: (userId: number) => ['company', 'readers', userId, 'effectiveAccess'] as const,

  devices: ['devices'] as const,
  device: (deviceId: number) => ['devices', deviceId] as const,
  devicePrincipal: (deviceId: number) => ['devices', deviceId, 'principal'] as const,

  sensors: (deviceId: number) => ['devices', deviceId, 'sensors'] as const,
  sensor: (deviceId: number, sensorId: number) => ['devices', deviceId, 'sensors', sensorId] as const,

  aggregationPolicies: (deviceId: number, sensorId: number) =>
    ['devices', deviceId, 'sensors', sensorId, 'policies'] as const,
  aggregationPolicy: (deviceId: number, sensorId: number, policyId: number) =>
    ['devices', deviceId, 'sensors', sensorId, 'policies', policyId] as const,

  setpoints: (deviceId: number, sensorId: number) => ['devices', deviceId, 'sensors', sensorId, 'setpoints'] as const,
  effectiveSetpoint: (deviceId: number, sensorId: number, at?: string) =>
    ['devices', deviceId, 'sensors', sensorId, 'setpoints', 'effective', at ?? 'now'] as const,

  telemetryTrailing: (family: string, deviceId: number, sensorId: number, endDate: string, periods: number) =>
    ['telemetry', family, 'trailing', deviceId, sensorId, endDate, periods] as const,
  telemetryPeriodRange: (family: string, deviceId: number, sensorId: number, from: number, to: number) =>
    ['telemetry', family, 'periodRange', deviceId, sensorId, from, to] as const,
  telemetryDateRange: (family: string, deviceId: number, sensorId: number, start: string, end: string) =>
    ['telemetry', family, 'dateRange', deviceId, sensorId, start, end] as const,
  telemetryLastPeriod: (family: string, deviceId: number, sensorId: number) =>
    ['telemetry', family, 'lastPeriod', deviceId, sensorId] as const,

  issues: (deviceId?: number, includeMembers?: boolean) => ['issues', deviceId ?? 'all', !!includeMembers] as const,
  issue: (issueId: number) => ['issues', 'detail', issueId] as const,
  issueGroup: (issueId: number) => ['issues', 'detail', issueId, 'group'] as const,
  issueCategorySuggestion: (issueId: number) => ['issues', 'detail', issueId, 'categorySuggestion'] as const,

  issueCategories: (includeRetired?: boolean) => ['issueCategories', !!includeRetired] as const,

  knowledgeShares: (sourceDeviceId?: number, targetDeviceId?: number) =>
    ['knowledgeSharing', sourceDeviceId ?? 'any', targetDeviceId ?? 'any'] as const,
  knowledgeCompatibility: (sourceDeviceId: number, targetDeviceId: number) =>
    ['knowledgeSharing', 'compatibility', sourceDeviceId, targetDeviceId] as const,

  trainingRequests: (deviceId: number) => ['training', deviceId] as const,
  trainingRequest: (requestId: number) => ['training', 'detail', requestId] as const,

  modelQuery: (deviceId: number, referenceTime?: string) => ['modelQuery', deviceId, referenceTime ?? 'now'] as const,

  ollamaJob: (jobId: number) => ['ollama', jobId] as const,

  locations: ['locations'] as const,
  deviceGroups: ['deviceGroups'] as const,
  deviceClasses: ['deviceClasses'] as const,

  health: ['health'] as const,
};
