// Buffer posting (section 10). Buffer's public API is GraphQL at https://api.buffer.com
// with a personal key (free plan: 3,000 requests per 30 days, so callers budget). The
// client is behind one interface so the fake and the real one are interchangeable and
// the rest of the dashboard never learns which is in play.
import type { Env } from "../env";
import { fakeServices } from "../env";
import type { Platform } from "@shared/constants";
import { getConnectionSecret } from "../lib/connections";
import { log } from "../lib/log";

export interface BufferChannel {
  id: string;
  platform: Platform;
  handle: string;
  connected: boolean;
  /** Queue paused inside Buffer: nothing publishes until she presses Resume there. */
  paused?: boolean;
}

export interface BufferPostStatus {
  id: string;
  /** unknown = the read did not get through; the post is left as it is. */
  status: "queued" | "posted" | "failed" | "unknown";
  url: string | null;
  error: string | null;
}

export interface BufferClient {
  checkKey(): Promise<{ ok: boolean; channels: BufferChannel[]; error: string | null; organizationId?: string }>;
  createPost(input: { channelId: string; text: string; mediaUrl: string; scheduledAt: string }): Promise<{ ok: boolean; id: string | null; error: string | null }>;
  getPost(id: string): Promise<BufferPostStatus>;
  deletePost(id: string): Promise<boolean>;
  /** Posts waiting in the channel's queue; -1 when Buffer could not say. */
  queueCount(channelId: string): Promise<number>;
}

// ---- fake: realistic answers including the failure shapes tests need.
// Stateful across calls in one Worker isolate so the hourly sync can be exercised end to end:
//   createPost → the post sits "queued" in the channel (queueCount counts it); the sync only
//   reads a post back once its time has come, and the fake answers that read "posted" (the
//   fake compresses the platform's publish into that one read). A media link containing
//   "fail" is accepted and then fails on every read; one containing "reject" is refused at
//   create. queueCount = created, not yet read back, not deleted.
// An id the fake has never seen (the isolate restarted) reads as posted, or failed if it
// carries "fail", so a restart never strands a post.
interface FakePostState {
  channelId: string;
  reads: number;
  fail: boolean;
  deleted: boolean;
}
const FAKE_POSTS = new Map<string, FakePostState>();

/** Test hook: forget every fake post (unit tests start from an empty Buffer). */
export function resetFakeBuffer(): void {
  FAKE_POSTS.clear();
}

export class FakeBuffer implements BufferClient {
  constructor(private key: string | null) {}
  async checkKey() {
    if (!this.key) return { ok: false, channels: [], error: "No key pasted yet." };
    if (this.key.startsWith("bad")) return { ok: false, channels: [], error: "Buffer says this key is not valid." };
    if (this.key.startsWith("expired")) return { ok: false, channels: [], error: "Buffer says this key has expired." };
    // "no-channels": a real Buffer account where nothing has been added yet (her state on 25 Sep).
    if (this.key.includes("no-channels")) return { ok: true, channels: [], error: null, organizationId: "fake_org" };
    const channels: BufferChannel[] = [
      { id: "ch_tiktok", platform: "tiktok", handle: "@sheila.bruce", connected: true },
      { id: "ch_instagram", platform: "instagram", handle: "@asheilabruceaffair", connected: !this.key.includes("ig-missing") },
      { id: "ch_youtube", platform: "youtube", handle: "Sheila Bruce", connected: true },
    ];
    return { ok: true, channels, error: null, organizationId: "fake_org" };
  }
  async createPost(input: { channelId: string; text: string; mediaUrl: string; scheduledAt: string }) {
    if (!this.key) return { ok: false, id: null, error: "Buffer is not connected." };
    if (input.mediaUrl.includes("reject")) return { ok: false, id: null, error: "Buffer rejected the video (too long for this channel)." };
    const fail = input.mediaUrl.includes("fail");
    const id = `fake_post_${fail ? "fail_" : ""}${Math.random().toString(36).slice(2, 10)}`;
    FAKE_POSTS.set(id, { channelId: input.channelId, reads: 0, fail, deleted: false });
    return { ok: true, id, error: null };
  }
  async getPost(id: string): Promise<BufferPostStatus> {
    const st = FAKE_POSTS.get(id);
    if (!st) {
      if (id.includes("fail")) return { id, status: "failed", url: null, error: "The platform rejected the upload." };
      return { id, status: "posted", url: `https://example.invalid/post/${id}`, error: null };
    }
    st.reads++;
    if (st.fail) return { id, status: "failed", url: null, error: "The platform rejected the upload." };
    return { id, status: "posted", url: `https://example.invalid/post/${id}`, error: null };
  }
  async deletePost(id: string) {
    const st = FAKE_POSTS.get(id);
    if (st) st.deleted = true;
    return true;
  }
  async queueCount(channelId: string) {
    let n = 0;
    for (const st of FAKE_POSTS.values()) if (st.channelId === channelId && !st.deleted && !st.fail && st.reads === 0) n++;
    return n;
  }
}

// ---- real: GraphQL at https://api.buffer.com with the personal key (Bearer).
// Shapes CONFIRMED against a live key on 25 Sep 2026 (coordinator probe): account →
// organizations; channels(input:{organizationId}) with service / isDisconnected /
// isQueuePaused; createPost(input: CreatePostInput!) with mode customScheduled + dueAt +
// schedulingType automatic + needsApproval false; post(input:{id}) status enum
// (draft | error | needs_approval | scheduled | sending | sent); deletePost(input:{id});
// the PostActionSuccess | MutationError result union.
// NOT YET PROVEN (could not be introspected without the key): the AssetInput shape for a
// video by URL (VIDEO_ASSET below), PostInputMetaData (a YouTube title may be required),
// the Service enum's exact casing (matched case-insensitively), the PostId / OrganizationId
// scalar names in variables, and the posts(...) connection shape used by queueCount.
const VIDEO_ASSET = (url: string) => ({ video: { url } });

class RealBuffer implements BufferClient {
  private orgId: string | null = null;
  constructor(private key: string) {}
  private async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch("https://api.buffer.com/", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401) throw new Error("Buffer says this key is not valid.");
    if (res.status === 429) throw new Error("Buffer says we asked too often. We will try again next hour.");
    if (!res.ok) throw new Error(`Buffer answered ${res.status}`);
    const data = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
    if (data.errors?.length) {
      const e = data.errors[0];
      if (e.extensions?.code === "UNAUTHENTICATED") throw new Error("Buffer says this key is not valid.");
      throw new Error(e.message.slice(0, 120));
    }
    return data.data as T;
  }
  private async organization(): Promise<string> {
    if (this.orgId) return this.orgId;
    const data = await this.gql<{ account: { id: string; organizations: { id: string; name: string }[] } }>(`query { account { id organizations { id name } } }`);
    const org = data.account.organizations[0]?.id;
    if (!org) throw new Error("Buffer shows no organization on this account.");
    this.orgId = org;
    return org;
  }
  async checkKey() {
    try {
      const org = await this.organization();
      const data = await this.gql<{ channels: { id: string; name: string; service: string; displayName: string | null; isDisconnected: boolean; isQueuePaused: boolean }[] }>(
        `query { channels(input: { organizationId: ${JSON.stringify(org)} }) { id name service displayName isDisconnected isQueuePaused } }`,
      );
      const channels: BufferChannel[] = [];
      for (const ch of data.channels) {
        const platform = platformOf(ch.service);
        if (!platform || channels.some((c) => c.platform === platform)) continue;
        channels.push({ id: ch.id, platform, handle: ch.displayName || ch.name, connected: !ch.isDisconnected, paused: ch.isQueuePaused });
      }
      return { ok: true, channels, error: null, organizationId: org };
    } catch (e) {
      return { ok: false, channels: [], error: e instanceof Error ? e.message : "Buffer did not answer." };
    }
  }
  async createPost(input: { channelId: string; text: string; mediaUrl: string; scheduledAt: string }) {
    try {
      const data = await this.gql<{ createPost: { post?: { id: string }; message?: string } }>(
        `mutation($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }`,
        {
          input: {
            channelId: input.channelId,
            text: input.text,
            assets: [VIDEO_ASSET(input.mediaUrl)],
            mode: "customScheduled",
            schedulingType: "automatic",
            needsApproval: false,
            dueAt: input.scheduledAt,
          },
        },
      );
      if (data.createPost.post) return { ok: true, id: data.createPost.post.id, error: null };
      return { ok: false, id: null, error: data.createPost.message ?? "Buffer did not accept the post." };
    } catch (e) {
      return { ok: false, id: null, error: e instanceof Error ? e.message : "Buffer did not answer." };
    }
  }
  async getPost(id: string): Promise<BufferPostStatus> {
    try {
      const data = await this.gql<{ post: { id: string; status: string; error: unknown; externalLink: string | null } | null }>(
        `query($id: PostId!) { post(input: { id: $id }) { id status error externalLink sentAt dueAt } }`,
        { id },
      );
      if (!data.post) return { id, status: "failed", url: null, error: "Buffer no longer has this post." };
      const s = data.post.status.toLowerCase();
      const err = typeof data.post.error === "string" ? data.post.error : data.post.error ? "Buffer reported a problem with this post." : null;
      return { id, status: s === "sent" ? "posted" : s === "error" ? "failed" : "queued", url: data.post.externalLink, error: err };
    } catch (e) {
      // A read that did not get through says nothing about the post: never count it as a failure.
      return { id, status: "unknown", url: null, error: e instanceof Error ? e.message : "Buffer did not answer." };
    }
  }
  async deletePost(id: string) {
    try {
      const data = await this.gql<{ deletePost: { __typename: string; message?: string } }>(
        `mutation($id: PostId!) { deletePost(input: { id: $id }) { __typename ... on MutationError { message } } }`,
        { id },
      );
      return !data.deletePost.message;
    } catch {
      return false;
    }
  }
  async queueCount(channelId: string) {
    try {
      const org = await this.organization();
      const data = await this.gql<{ posts: { edges: { node: { id: string } }[] } }>(
        `query($channelId: ChannelId!) { posts(first: 100, input: { organizationId: ${JSON.stringify(org)}, filter: { channelIds: [$channelId], status: [scheduled] } }) { edges { node { id } } } }`,
        { channelId },
      );
      return data.posts.edges.length;
    } catch {
      return -1; // unknown: the sync falls back to its own count
    }
  }
}

/** Buffer's Service enum → our platform, case-insensitively (the enum's casing is unproven). */
export function platformOf(service: string): Platform | null {
  const s = service.toLowerCase();
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("instagram")) return "instagram";
  if (s.includes("youtube")) return "youtube";
  return null;
}

export async function getBuffer(env: Env, keyOverride?: string): Promise<BufferClient> {
  const key = keyOverride ?? (await getConnectionSecret(env, "buffer"));
  if (fakeServices(env)) return new FakeBuffer(key);
  if (!key) {
    log.warn("buffer.nokey");
    return new FakeBuffer(null);
  }
  return new RealBuffer(key);
}
