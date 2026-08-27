import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import WebSocket from 'ws';
import { SessionService } from './session.service';

@WebSocketGateway({ path: '/ws' })
export class SessionGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private readonly session: SessionService) {}

  handleConnection(client: WebSocket): void {
    this.session.addClient(client);
    client.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString();
      this.session.handleMessage(client, raw);
    });
  }

  handleDisconnect(): void {
    // SessionService removes the socket on close.
  }
}
