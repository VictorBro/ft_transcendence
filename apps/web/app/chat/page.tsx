'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// import type { Metadata } from 'next';

// export const metadata: Metadata = { title: 'Chat' };

export default function ChatPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const socket = io('/ws', {
      path: '/ws/socket.io/',
    });

    socket.on('connect', () => {
      console.log('CONNECTED:', socket.id);
      setConnected(true);
    });

    socket.on('connected', (data) => {
      console.log('SERVER CONNECTED EVENT:', data);
    });

    socket.on('chat', (data) => {
      console.log('CHAT FROM SERVER:', data);

      setMessages((messages) => [...messages, `${data.from}: ${data.message}`]);
    });

    socket.onAny((event, ...args) => {
      console.log('SOCKET EVENT:', event, args);
    });

    socket.on('disconnect', () => {
      console.log('DISCONNECTED');
      setConnected(false);
    });

    setSocket(socket);

    return () => {
      socket.disconnect();
    };
  }, []);

  function sendMessage() {
    if (!socket || !message.trim()) {
      return;
    }

    console.log('SENDING CHAT:', message);

    socket.emit('chat', message);

    setMessage('');
  }

  return (
    <main>
      <h1>Socket.IO test</h1>

      <p>Status: {connected ? '🟢 connected' : '🔴 disconnected'}</p>

      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            sendMessage();
          }
        }}
      />

      <button onClick={sendMessage}>Send</button>

      <ul>
        <li>Empty</li>
        {messages.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul>
    </main>
  );
}
