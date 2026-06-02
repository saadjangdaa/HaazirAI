export type AdminRole =
  | 'super_admin'
  | 'provider_manager'
  | 'dispute_manager'
  | 'analytics_manager'
  | 'viewer'

export type ProviderStatus = 'pending' | 'active' | 'inactive' | 'suspended' | 'rejected'
