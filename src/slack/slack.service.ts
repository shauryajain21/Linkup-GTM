import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WebClient } from '@slack/web-api';
import { LinkupApiClient } from '../linkup-api/linkup-api.client';
import type { NewUserPayload } from './slack.types';

export interface InternalUserConfig {
  userId: string;
  token: string;
  message: string;
}

@Injectable()
export class SlackService implements OnModuleInit {
  private readonly LOG = new Logger(SlackService.name);
  private botUserId: string | undefined;

  private readonly welcomeMessage = (organizationName: string): string =>
    `Hello ${organizationName}! :wave:
Welcome to our shared Slack channel! The Linkup tech team is here to answer any question you might have as you start building with the <https://docs.linkup.so/pages/documentation/get-started/introduction|Linkup API>.
Let us know if you have any question!`;

  constructor(
    private readonly bannedDomains: string[],
    private readonly linkupApiClient: LinkupApiClient,
    private readonly slackProvider: WebClient,
    private readonly philConfig: InternalUserConfig,
    private readonly sashaConfig: InternalUserConfig,
    private readonly borisConfig: InternalUserConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const authResult = await this.slackProvider.auth.test();
      this.botUserId = authResult.user_id;
      this.LOG.log(`Bot user ID initialized: ${this.botUserId}`);
    } catch (e) {
      this.LOG.error(`Failed to fetch bot user ID: ${e.message}`);
    }
  }

  async createSupportChannel(payload: NewUserPayload): Promise<void> {
    const { id: orgId, name: orgName } = payload.organization;
    const { email: userEmail } = payload.user;

    try {
      const isValidEmail = this.isSupportedDomain(userEmail);
      const isNewOrganization = await this.isNewOrganization(orgId, orgName);

      if (!isValidEmail || !isNewOrganization) {
        return;
      }

      const channelId = await this.createChannel(orgName);

      await this.inviteExternalUsersToChannel(userEmail, channelId).then(() =>
        this.sendWelcomeMessageToChannel(channelId, orgName),
      );
    } catch (e) {
      this.LOG.error(
        `Error while creating slack support channel for org ${orgId}: ${e.message}`,
      );
    }
  }

  private isSupportedDomain(userEmail: string): boolean {
    const emailDomain = userEmail.split('@').at(1);
    return (
      emailDomain !== undefined && !this.bannedDomains.includes(emailDomain)
    );
  }

  private async isNewOrganization(
    orgId: string,
    orgName: string,
  ): Promise<boolean> {
    const response = await this.linkupApiClient.findOrganizationsByName(
      orgName,
    );
    // If count > 1, there are other orgs with this name (excluding current one conceptually)
    // But since we're checking by name only, we consider it "new" if count is 0 or 1 (only this org)
    // For safety, if the API returns any orgs, we check if there's more than 1
    // Actually, we need to reconsider: the linkup-api endpoint will return count of ALL orgs with that name
    // If count > 1, it means there's already an org with this name (the current one + others)
    // If count <= 1, it's either just this org or none (new)
    return response.count <= 1;
  }

  private createChannel(orgName: string): Promise<string> {
    const sanitizedOrgName = orgName
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .slice(0, 70);

    if (/^[-_]+$/.test(sanitizedOrgName)) {
      throw new Error(
        'Channel name cannot consist solely of hyphens or underscores.',
      );
    }

    return this.slackProvider.conversations
      .create({
        is_private: false,
        name: `${sanitizedOrgName}-linkup`,
      })
      .then(this.handleResponseError)
      .then((response) => response.channel?.id ?? '');
  }

  private async inviteExternalUsersToChannel(
    userEmail: string,
    channelId: string,
  ): Promise<void> {
    await this.slackProvider.conversations
      .inviteShared({
        channel: channelId,
        emails: [userEmail],
      })
      .then(this.handleResponseError);
  }

  private sendWelcomeMessageToChannel(
    channelId: string,
    orgName: string,
  ): Promise<unknown> {
    return this.slackProvider.chat
      .postMessage({
        blocks: [
          {
            text: {
              text: this.welcomeMessage(orgName),
              type: 'mrkdwn',
            },
            type: 'section',
          },
        ],
        channel: channelId,
        text: 'Welcome to Linkup!',
      })
      .then(this.handleResponseError);
  }

  private async inviteInternalUsersToChannel(channelId: string): Promise<void> {
    const userIds = [
      this.philConfig.userId,
      this.sashaConfig.userId,
      this.borisConfig.userId,
    ].filter(Boolean);

    if (userIds.length === 0) {
      return;
    }

    await this.slackProvider.conversations
      .invite({
        channel: channelId,
        users: userIds.join(','),
      })
      .then(this.handleResponseError);
  }

  private async sendMessageAsUser(
    channelId: string,
    userToken: string,
    message: string,
    orgName: string,
    userId?: string,
  ): Promise<void> {
    if (!userToken || !message) {
      return;
    }

    // Replace {{organization}} placeholder with actual org name
    let interpolatedMessage = message.replace(
      /\{\{organization\}\}/gi,
      orgName,
    );

    // Replace {{user}} with Slack mention format
    if (userId) {
      interpolatedMessage = interpolatedMessage.replace(
        /\{\{user\}\}/gi,
        `<@${userId}>`,
      );
    }

    const userClient = new WebClient(userToken);
    await userClient.chat
      .postMessage({
        channel: channelId,
        text: interpolatedMessage,
      })
      .then(this.handleResponseError);
  }

  private scheduleInternalUserMessages(
    channelId: string,
    orgName: string,
    externalUserId?: string,
  ): void {
    // Sasha's message at 30 seconds
    setTimeout(() => {
      this.sendMessageAsUser(
        channelId,
        this.sashaConfig.token,
        this.sashaConfig.message,
        orgName,
        externalUserId,
      ).catch((e) =>
        this.LOG.error(
          `Error sending Sasha's message to channel ${channelId}: ${e.message}`,
        ),
      );
    }, 30_000);

    // Phil's message at 90 seconds
    setTimeout(() => {
      this.sendMessageAsUser(
        channelId,
        this.philConfig.token,
        this.philConfig.message,
        orgName,
      ).catch((e) =>
        this.LOG.error(
          `Error sending Phil's message to channel ${channelId}: ${e.message}`,
        ),
      );
    }, 90_000);

    // Boris's message at 120 seconds
    setTimeout(() => {
      this.sendMessageAsUser(
        channelId,
        this.borisConfig.token,
        this.borisConfig.message,
        orgName,
      ).catch((e) =>
        this.LOG.error(
          `Error sending Boris's message to channel ${channelId}: ${e.message}`,
        ),
      );
    }, 120_000);
  }

  async getChannelStatuses(): Promise<
    {
      name: string;
      id: string;
      created: number;
      hasExternalUser: boolean;
      phil: boolean;
      sasha: boolean;
      boris: boolean;
    }[]
  > {
    const internalUserIds = new Set(
      [
        this.botUserId,
        this.philConfig.userId,
        this.sashaConfig.userId,
        this.borisConfig.userId,
      ].filter(Boolean),
    );

    // Step 1: Collect all -linkup channels (pagination only, no member lookups)
    const linkupChannels: { name: string; id: string; created: number }[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.slackProvider.conversations.list({
        types: 'public_channel',
        limit: 200,
        cursor,
      });

      for (const ch of result.channels ?? []) {
        if (!ch.name?.endsWith('-linkup') || !ch.id) continue;
        linkupChannels.push({
          name: ch.name,
          id: ch.id,
          created: ch.created ?? 0,
        });
      }

      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);

    // Step 2: Fetch members for all channels in parallel
    const channels = await Promise.all(
      linkupChannels.map(async (ch) => {
        const members = await this.slackProvider.conversations.members({
          channel: ch.id,
        });
        const memberIds = members.members ?? [];

        return {
          ...ch,
          hasExternalUser: memberIds.some((id) => !internalUserIds.has(id)),
          phil: memberIds.includes(this.philConfig.userId),
          sasha: memberIds.includes(this.sashaConfig.userId),
          boris: memberIds.includes(this.borisConfig.userId),
        };
      }),
    );

    channels.sort((a, b) => b.created - a.created);
    return channels;
  }

  async handleExternalUserJoined(
    channelId: string,
    userId: string,
  ): Promise<void> {
    // Skip if this is the bot itself, Phil, Sasha, or Boris joining
    if (
      userId === this.botUserId ||
      userId === this.philConfig.userId ||
      userId === this.sashaConfig.userId ||
      userId === this.borisConfig.userId
    ) {
      return;
    }

    try {
      // Fetch channel info from Slack API to check if it's a -linkup channel
      const channelInfo = await this.slackProvider.conversations.info({
        channel: channelId,
      });

      const channelName = channelInfo.channel?.name ?? '';
      if (!channelName.endsWith('-linkup')) {
        return;
      }

      // Check if internal users are already in the channel (avoid duplicate invites)
      const members = await this.slackProvider.conversations.members({
        channel: channelId,
      });
      const memberIds = members.members ?? [];
      const internalUserIds = [
        this.philConfig.userId,
        this.sashaConfig.userId,
        this.borisConfig.userId,
      ].filter(Boolean);

      const alreadyInvited = internalUserIds.some((id) =>
        memberIds.includes(id),
      );
      if (alreadyInvited) {
        return;
      }

      const orgName = channelName.replace(/-linkup$/, '');
      this.LOG.log(
        `External user joined channel ${channelName}, inviting Phil, Sasha & Boris`,
      );

      await this.inviteInternalUsersToChannel(channelId);
      this.scheduleInternalUserMessages(channelId, orgName, userId);
    } catch (e) {
      this.LOG.error(
        `Error handling external user join in channel ${channelId}: ${e.message}`,
      );
    }
  }

  private handleResponseError<T extends { ok: boolean; error?: string }>(
    response: T,
  ): T {
    if (!response.ok) {
      throw new Error(response.error || 'An unknown error occurred');
    }
    return response;
  }
}
