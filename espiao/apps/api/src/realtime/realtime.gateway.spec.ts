import { describe, expect, it, vi } from "vitest";
import { RealtimeGateway, maskPhone } from "./realtime.gateway";

describe("maskPhone", () => {
  it("masks middle digits of a valid E.164 number", () => {
    expect(maskPhone("+5511999990001")).toBe("+55119****0001");
  });

  it("returns *** for strings shorter than 8 characters", () => {
    expect(maskPhone("+55119")).toBe("***");
  });

  it("preserves first 5 and last 4 characters", () => {
    const result = maskPhone("+12345678901234");
    expect(result.startsWith("+1234")).toBe(true);
    expect(result.endsWith("1234")).toBe(true);
    expect(result).toContain("****");
  });
});

describe("RealtimeGateway.emit", () => {
  it("calls server.emit with correct envelope structure", () => {
    const gateway = new RealtimeGateway();
    const mockServer = { emit: vi.fn() };
    // @ts-expect-error — accessing private decorated field for unit testing
    gateway.server = mockServer;

    gateway.emit("message.created", {
      messageId: "msg-1",
      conversationId: "conv-1",
      fromNumber: "+55119****0001",
      messageType: "TEXT",
      sentAt: "2026-05-17T00:00:00.000Z"
    });

    expect(mockServer.emit).toHaveBeenCalledOnce();
    expect(mockServer.emit).toHaveBeenCalledWith(
      "message.created",
      expect.objectContaining({
        event: "message.created",
        version: 1,
        data: expect.objectContaining({
          messageId: "msg-1",
          conversationId: "conv-1"
        })
      })
    );
  });

  it("includes a valid ISO8601 timestamp in the envelope", () => {
    const gateway = new RealtimeGateway();
    const mockServer = { emit: vi.fn() };
    // @ts-expect-error
    gateway.server = mockServer;

    gateway.emit("conversation.created", {
      conversationId: "conv-2",
      patientPhone: "+55119****0001",
      accountPhoneNumberId: "PHONE_ID",
      startedAt: "2026-05-17T00:00:00.000Z"
    });

    const calls = (mockServer.emit as ReturnType<typeof vi.fn>).mock.calls as [
      [string, { timestamp: string }]
    ];
    const [, envelope] = calls[0];
    expect(() => new Date(envelope.timestamp)).not.toThrow();
    expect(new Date(envelope.timestamp).toISOString()).toBe(envelope.timestamp);
  });
});
