export interface UserPayload {
  id: string;
  email: string;
  name?: string;
}

export interface OrganizationPayload {
  id: string;
  name: string;
}

export interface NewUserPayload {
  user: UserPayload;
  organization: OrganizationPayload;
}

export interface PendingChannel {
  channelId: string;
  orgName: string;
  invitedExternalUsers: Set<string>;
}

export interface SlackEventPayload {
  type: 'url_verification' | 'event_callback';
  challenge?: string;
  event?: {
    type: string;
    user: string;
    channel: string;
    channel_type?: string;
    team?: string;
    inviter?: string;
  };
}
