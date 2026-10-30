import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = module.get<AppController>(AppController);
  });

  it('should return a health payload with status ok', () => {
    const response = appController.getHealth();

    expect(response.status).toBe('ok');
    expect(response.service).toBe('api');
    expect(typeof response.timestamp).toBe('string');
  });
});
