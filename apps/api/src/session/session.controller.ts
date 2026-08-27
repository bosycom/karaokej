import { Controller, Get } from '@nestjs/common';
import { SessionService } from './session.service';

@Controller('session')
export class SessionController {
  constructor(private readonly session: SessionService) {}

  @Get()
  get() {
    return this.session.getState();
  }
}
