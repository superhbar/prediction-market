import { fetchTopicMessages } from "./hcs";
import { afterEach, describe, expect, it, vi } from "vitest";

const TESTNET = 296;
const TOPIC = "0.0.10842926";

function message(sequence: number) {
  return { sequence_number: sequence, consensus_timestamp: `${sequence}.0`, message: "" };
}

/** Mirror pages of one message each; every page but the last links to the next. */
function mockPages(total: number) {
  const fetchMock = vi.fn(async (url: string) => {
    const page = Number(new URL(url).searchParams.get("page") ?? "1");
    const next = page < total ? `/api/v1/topics/${TOPIC}/messages?limit=100&order=asc&page=${page + 1}` : null;
    return new Response(JSON.stringify({ messages: [message(page)], links: { next } }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchTopicMessages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows pagination to the end", async () => {
    mockPages(3);
    const { messages, complete } = await fetchTopicMessages(TESTNET, TOPIC, 5);
    expect(messages.map(entry => entry.sequence_number)).toEqual([1, 2, 3]);
    expect(complete).toBe(true);
  });

  it("reports an incomplete read when the topic outgrows the page limit", async () => {
    mockPages(4);
    const { messages, complete } = await fetchTopicMessages(TESTNET, TOPIC, 2);
    expect(messages).toHaveLength(2);
    expect(complete).toBe(false);
  });

  it("treats a missing topic as complete and empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    await expect(fetchTopicMessages(TESTNET, TOPIC)).resolves.toEqual({ messages: [], complete: true });
  });
});
