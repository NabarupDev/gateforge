import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { HealthMonitorService } from './health-monitor.service';
import { HealthDashboardController } from './health-dashboard.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    HttpModule,
  ],
  controllers: [HealthDashboardController],
  providers: [HealthMonitorService],
})
export class HealthMonitorModule {}
