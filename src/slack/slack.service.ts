import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WebClient } from '@slack/web-api';
import { LinkupApiClient } from '../linkup-api/linkup-api.client';
import type { NewUserPayload } from './slack.types';

export interface InternalUserConfig {
  userId: string;
  token: string;
  message: string;
  threadMessage1?: string;
  threadMessage2?: string;
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
    private readonly shauryaUserId: string,
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

      await this.sendWelcomeMessageToChannel(channelId, orgName);

      await this.inviteExternalUsersToChannel(userEmail, channelId);
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
      this.shauryaUserId,
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

  private async sendMessageAsUserAndGetTs(
    channelId: string,
    userToken: string,
    message: string,
    orgName: string,
    userId?: string,
  ): Promise<string | undefined> {
    if (!userToken || !message) {
      return undefined;
    }

    let interpolatedMessage = message.replace(
      /\{\{organization\}\}/gi,
      orgName,
    );

    if (userId) {
      interpolatedMessage = interpolatedMessage.replace(
        /\{\{user\}\}/gi,
        `<@${userId}>`,
      );
    }

    const userClient = new WebClient(userToken);
    const response = await userClient.chat
      .postMessage({
        channel: channelId,
        text: interpolatedMessage,
      })
      .then(this.handleResponseError);

    return response.ts;
  }

  private async sendMessageAsUser(
    channelId: string,
    userToken: string,
    message: string,
    orgName: string,
    userId?: string,
    threadTs?: string,
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
        ...(threadTs && { thread_ts: threadTs }),
      })
      .then(this.handleResponseError);
  }

  private scheduleInternalUserMessages(
    channelId: string,
    orgName: string,
    externalUserId?: string,
  ): void {
    // Phil's top-level message at 20 seconds
    setTimeout(() => {
      this.sendMessageAsUserAndGetTs(
        channelId,
        this.philConfig.token,
        this.philConfig.message,
        orgName,
        externalUserId,
      )
        .then((philMessageTs) => {
          if (!philMessageTs) return;

          // Phil's first thread reply 2s after top-level
          if (this.philConfig.threadMessage1) {
            setTimeout(() => {
              this.sendMessageAsUser(
                channelId,
                this.philConfig.token,
                this.philConfig.threadMessage1!,
                orgName,
                externalUserId,
                philMessageTs,
              ).catch((e) =>
                this.LOG.error(
                  `Error sending Phil's thread reply 1 to channel ${channelId}: ${e.message}`,
                ),
              );
            }, 2_000);
          }

          // Phil's second thread reply 5s after top-level
          if (this.philConfig.threadMessage2) {
            setTimeout(() => {
              this.sendMessageAsUser(
                channelId,
                this.philConfig.token,
                this.philConfig.threadMessage2!,
                orgName,
                externalUserId,
                philMessageTs,
              ).catch((e) =>
                this.LOG.error(
                  `Error sending Phil's thread reply 2 to channel ${channelId}: ${e.message}`,
                ),
              );
            }, 5_000);
          }
        })
        .catch((e) =>
          this.LOG.error(
            `Error sending Phil's message to channel ${channelId}: ${e.message}`,
          ),
        );
    }, 20_000);

    // Sacha's message at 90 seconds (skipped if message is empty)
    setTimeout(() => {
      this.sendMessageAsUser(
        channelId,
        this.sashaConfig.token,
        this.sashaConfig.message,
        orgName,
        externalUserId,
      ).catch((e) =>
        this.LOG.error(
          `Error sending Sacha's message to channel ${channelId}: ${e.message}`,
        ),
      );
    }, 90_000);

    // Boris's message at 120 seconds (skipped if message is empty)
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
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

    // Step 1: Get all channels each internal user is in (3 parallel paginated calls)
    const getUserChannelIds = async (userId: string): Promise<Set<string>> => {
      if (!userId) return new Set();
      const ids = new Set<string>();
      let cursor: string | undefined;
      do {
        const result = await this.slackProvider.users.conversations({
          user: userId,
          types: 'public_channel',
          limit: 200,
          cursor,
        });
        for (const ch of result.channels ?? []) {
          if (ch.id) ids.add(ch.id);
        }
        cursor = result.response_metadata?.next_cursor || undefined;
      } while (cursor);
      return ids;
    };

    this.LOG.log('Dashboard: fetching user memberships + channel list...');
    const [philChannels, sashaChannels, borisChannels] = await Promise.all([
      getUserChannelIds(this.philConfig.userId),
      getUserChannelIds(this.sashaConfig.userId),
      getUserChannelIds(this.borisConfig.userId),
    ]);

    // Step 2: List all -linkup channels created in the last 30 days
    const channels: Awaited<ReturnType<typeof this.getChannelStatuses>> = [];
    let cursor: string | undefined;

    do {
      const result = await this.slackProvider.conversations.list({
        types: 'public_channel',
        limit: 200,
        cursor,
      });

      for (const ch of result.channels ?? []) {
        if (!ch.name?.endsWith('-linkup') || !ch.id) continue;
        if ((ch.created ?? 0) < thirtyDaysAgo) continue;

        const philIn = philChannels.has(ch.id);
        const sashaIn = sashaChannels.has(ch.id);
        const borisIn = borisChannels.has(ch.id);

        // num_members > known internal members means external user is present
        const knownInternals =
          (this.botUserId ? 1 : 0) +
          (philIn ? 1 : 0) +
          (sashaIn ? 1 : 0) +
          (borisIn ? 1 : 0);
        const hasExternalUser = (ch.num_members ?? 0) > knownInternals;

        channels.push({
          name: ch.name,
          id: ch.id,
          created: ch.created ?? 0,
          hasExternalUser,
          phil: philIn,
          sasha: sashaIn,
          boris: borisIn,
        });
      }

      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);

    this.LOG.log(`Dashboard: done, returning ${channels.length} channels`);
    channels.sort((a, b) => b.created - a.created);
    return channels;
  }

  async handleExternalUserJoined(
    channelId: string,
    userId: string,
  ): Promise<void> {
    // Skip if this is the bot itself or an internal team member joining
    if (
      userId === this.botUserId ||
      userId === this.philConfig.userId ||
      userId === this.sashaConfig.userId ||
      userId === this.borisConfig.userId ||
      userId === this.shauryaUserId
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
        this.shauryaUserId,
      ].filter(Boolean);

      const alreadyInvited = internalUserIds.some((id) =>
        memberIds.includes(id),
      );
      if (alreadyInvited) {
        return;
      }

      const orgName = channelName.replace(/-linkup$/, '');
      this.LOG.log(
        `External user joined channel ${channelName}, inviting Phil, Sacha & Boris`,
      );

      await this.inviteInternalUsersToChannel(channelId);
      this.scheduleInternalUserMessages(channelId, orgName, userId);
    } catch (e) {
      this.LOG.error(
        `Error handling external user join in channel ${channelId}: ${e.message}`,
      );
    }
  }

  /**
   * Test endpoint: runs the full flow without needing the Slack webhook.
   * Creates channel -> welcome message -> invites internal users -> schedules Phil's messages.
   */
  async testFlow(orgName: string, fakeExternalUserId: string): Promise<{ channelId: string }> {
    const channelId = await this.createChannel(orgName);
    this.LOG.log(`[TEST] Created channel ${channelId} for org: ${orgName}`);

    await this.sendWelcomeMessageToChannel(channelId, orgName);
    this.LOG.log(`[TEST] Sent welcome message`);

    await this.inviteInternalUsersToChannel(channelId);
    this.LOG.log(`[TEST] Invited internal users`);

    this.scheduleInternalUserMessages(channelId, orgName, fakeExternalUserId);
    this.LOG.log(`[TEST] Scheduled messages (Phil top-level in 20s, thread replies at 22s and 25s)`);

    return { channelId };
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
