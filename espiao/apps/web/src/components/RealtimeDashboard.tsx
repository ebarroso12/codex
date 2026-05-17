"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSocket } from "../hooks/use-socket";
import type {
  ConversationCreatedPayload,
  MessageCreatedPayload,
  RealtimeEnvelope
} from "../lib/realtime-events.types";

export type ConversationRow = {
  id: string;
  patient: string;
  agent: string;
  channel: string;
  status: string;
  score: number;
  lastMessage: string;
};

type Props = {
  initialConversations: ConversationRow[];
  initialActiveCount: number;
};

export function RealtimeDashboard({ initialConversations, initialActiveCount }: Props) {
  const [conversations, setConversations] = useState<ConversationRow[]>(initialConversations);
  const [activeCount, setActiveCount] = useState(initialActiveCount);
  const [online, setOnline] = useState(false);
  const lastMessageToastRef = useRef<number>(0);
  const lastReconnectToastRef = useRef<number>(0);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? apiUrl;
  const socket = useSocket(socketUrl);

  useEffect(() => {
    if (!socket) return;

    function onConnect() {
      setOnline(true);
    }

    function onDisconnect() {
      setOnline(false);
      toast.warning("Conexão perdida. Reconectando...", {
        id: "socket-disconnect",
        duration: Infinity
      });
    }

    function onMessageCreated(envelope: RealtimeEnvelope<MessageCreatedPayload>) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === envelope.data.conversationId
            ? {
                ...c,
                lastMessage: new Date(envelope.data.sentAt).toLocaleTimeString("pt-BR")
              }
            : c
        )
      );
      const now = Date.now();
      if (now - lastMessageToastRef.current > 1000) {
        toast.info("Nova mensagem recebida", { duration: 3000 });
        lastMessageToastRef.current = now;
      }
    }

    function onConversationCreated(
      envelope: RealtimeEnvelope<ConversationCreatedPayload>
    ) {
      setActiveCount((prev) => prev + 1);
      toast.success(
        `Nova conversa iniciada — ${envelope.data.patientPhone}`,
        { duration: 4000 }
      );
    }

    function onReconnect() {
      setOnline(true);
      toast.dismiss("socket-disconnect");
      const now = Date.now();
      if (now - lastReconnectToastRef.current > 5_000) {
        toast.success("Conexão restabelecida", { duration: 3000 });
        lastReconnectToastRef.current = now;
      }
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("message.created", onMessageCreated);
    socket.on("conversation.created", onConversationCreated);
    socket.io.on("reconnect", onReconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message.created", onMessageCreated);
      socket.off("conversation.created", onConversationCreated);
      socket.io.off("reconnect", onReconnect);
    };
  }, [socket]);

  return (
    <>
      <div className="realtimeStatus">
        <span className={`onlineDot ${online ? "online" : "offline"}`} />
        <span className="realtimeLabel">
          {online ? "Realtime ativo" : "Reconectando..."}
        </span>
        <span className="activeCount">{activeCount} ativas</span>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Atendente</th>
              <th>Status</th>
              <th>Score</th>
              <th>Ultima mensagem</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((conversation) => (
              <tr key={conversation.id}>
                <td>
                  <strong>{conversation.patient}</strong>
                  <span>{conversation.channel}</span>
                </td>
                <td>{conversation.agent}</td>
                <td>
                  <span
                    className={`statusPill ${conversation.status
                      .toLowerCase()
                      .replace(/\s+/g, "-")}`}
                  >
                    {conversation.status}
                  </span>
                </td>
                <td>{conversation.score}%</td>
                <td>{conversation.lastMessage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
