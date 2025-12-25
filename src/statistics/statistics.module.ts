import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';
import { Student } from '../students/student.entity';
import { Event } from '../events/event.entity';
import { Participation } from '../participations/participation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Student, Event, Participation])],
  providers: [StatisticsService],
  controllers: [StatisticsController],
  exports: [StatisticsService],
})
export class StatisticsModule {}