// Buffer posting (section 10). Buffer's public API is GraphQL at https://api.buffer.com
// with a personal key; Phase 0 confirms the exact schema against a real account. The
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
}

export interface BufferPostStatus {
  id: string;
  status: "queued" | "posted" | "failed";
  url: string | null;
  error: string | null;
}

export interface BufferClient {
  checkKey(): Promise<{ ok: boolean; channels: BufferChannel[]; error: string | null }>;
  createPost(input: { channelId: string; text: string; mediaUrl: string; scheduledAt: string }): Promise<{ ok: boolean; id: string | null; error: string | null }>;
  getPost(id: string): Promise<BufferPostStatus>;
  deletePost(id: string): Promise<boolean>;
  queueCount(channelId: string): Promise<number>;
}

// ---- fake: realistic answers including the failure shapes tests need
class FakeBuffer implements BufferClient {
  constructor(private key: string | null) {}
  async checkKey() {
    if (!this.key) return { ok: false, channels: [], error: "No key pasted yet." };
    if (this.key.startsWith("bad")) return { ok: false, channels: [], error: "Buffer says this key is not valid." };
    if (this.key.startsWith("expired")) return { ok: false, channels: [], error: "Buffer says this key has expired." };
    const channels: BufferChannel[] = [
      { id: "ch_tiktok", platform: "tiktok", handle: "@sheila.bruce", connected: true },
      { id: "ch_instagram", platform: "instagram", handle: "@asheilabruceaffair", connected: !this.key.includes("ig-missing") },
      { id: "ch_youtube", platform: "youtube", handle: "Sheila Bruce", connected: true },
    ];
    return { ok: true, channels, error: null };
  }
  async createPost(input: { channelId: string; text: string; mediaUrl: string; scheduledAt: string }) {
    if (input.mediaUrl.includes("reject")) return { ok: false, id: null, error: "Buffer rejected the video (too long for this channel)." };
    return { ok: true, id: `fake_post_${Math.random().toString(36).slice(2, 10)}`, error: null };
  }
  async getPost(id: string): Promise<BufferPostStatus> {
    if (id.includes("fail")) return { id, status: "failed", url: null, error: "TikTok rejected the upload." };
    return { id, status: "posted", url: `https://example.invalid/post/${id}`, error: null };
  }
  async deletePost() {
    return true;
  }
  async queueCount() {
    return 3;
  }
}

// ---- real: minimal GraphQL wrapper; exact queries pinned in Phase 0 against a live key.
class RealBuffer implements BufferClient {
  constructor(private key: string) {}
  private async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch("https://api.buffer.com/", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401) throw new Error("Buffer says this key is not valid.");
    if (!res.ok) throw new Error(`Buffer answered ${res.status}`);
    const data = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (data.errors?.length) throw new Error(data.errors[0].message.slice(0, 120));
    return data.data as T;
  }
  async checkKey() {
    try {
      const data = await this.gql<{ account: { channels: { id: string; service: string; name: string; isDisconnected: boolean }[] } }>(
        `query { account { channels { id service name isDisconnected } } }`,
      );
      const map: Record<string, Platform> = { tiktok: "tiktok", instagram: "instagram", youtube: "youtube" };
      const channels = data.account.channels
        .filter((ch) => map[ch.service])
        .map((ch) => ({ id: ch.id, platform: map[ch.service], handle: ch.name, connected: !ch.isDisconnected }));
      return { ok: true, channels, error: null };
    } catch (e) {
      return { ok: false, channels: [], error: e instanceof Error ? e.message : "Buffer did not answer." };
    }
  }
  async createPost(input: { channelId: string; text: string; mediaUrl: string; scheduledAt: string }) {
    try {
      const data = await this.gql<{ createPost: { post?: { id: string }; message?: string } }>(
        `mutation($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }`,
        { input: { channelId: input.channelId, text: input.text, media: { video: { url: input.mediaUrl } }, schedulingType: "custom", dueAt: input.scheduledAt } },
      );
      if (data.createPost.post) return { ok: true, id: data.createPost.post.id, error: null };
      return { ok: false, id: null, error: data.createPost.message ?? "Buffer did not accept the post." };
    } catch (e) {
      return { ok: false, id: null, error: e instanceof Error ? e.message : "Buffer did not answer." };
    }
  }
  async getPost(id: string): Promise<BufferPostStatus> {
    try {
      const data = await this.gql<{ post: { id: string; status: string; externalUrl: string | null; error: string | null } }>(
        `query($id: PostId!) { post(input: { id: $id }) { id status externalUrl error } }`,
        { id },
      );
      const s = data.post.status.toLowerCase();
      return { id, status: s === "sent" ? "posted" : s === "error" ? "failed" : "queued", url: data.post.externalUrl, error: data.post.error };
    } catch (e) {
      return { id, status: "failed", url: null, error: e instanceof Error ? e.message : "Buffer did not answer." };
    }
  }
  async deletePost(id: string) {
    try {
      await this.gql(`mutation($id: PostId!) { deletePost(input: { id: $id }) { ... on PostActionSuccess { post { id } } } }`, { id });
      return true;
    } catch {
      return false;
    }
  }
  async queueCount(channelId: string) {
    try {
      const data = await this.gql<{ posts: { totalCount: number } }>(
        `query($channelId: ChannelId!) { posts(input: { filter: { channelIds: [$channelId], status: [scheduled] } }) { totalCount } }`,
        { channelId },
      );
      return data.posts.totalCount;
    } catch {
      return 0;
    }
  }
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
