import type { EmailAddress } from './email.types';

export type SenderProfile = 'default' | 'billing' | 'security' | 'support' | 'notifications';

export interface ResolvedSender {
  from: EmailAddress;
  replyTo: EmailAddress;
}

const SENDER_PROFILES: Record<SenderProfile, { from: string; replyTo: string }> = {
  default: {
    from: 'Recurva <noreply@mail.recurva.xyz>',
    replyTo: 'support@mail.recurva.xyz',
  },
  billing: {
    from: 'Recurva Billing <billing@mail.recurva.xyz>',
    replyTo: 'billing@mail.recurva.xyz',
  },
  security: {
    from: 'Recurva Security <security@mail.recurva.xyz>',
    replyTo: 'support@mail.recurva.xyz',
  },
  support: {
    from: 'Recurva Support <support@mail.recurva.xyz>',
    replyTo: 'support@mail.recurva.xyz',
  },
  notifications: {
    from: 'Recurva <notifications@mail.recurva.xyz>',
    replyTo: 'support@mail.recurva.xyz',
  },
};

export function resolveSender(profile: SenderProfile, defaultFromOverride?: string): ResolvedSender {
  const config = SENDER_PROFILES[profile] ?? SENDER_PROFILES.default;
  return {
    from: profile === 'default' && defaultFromOverride ? defaultFromOverride : config.from,
    replyTo: config.replyTo,
  };
}
