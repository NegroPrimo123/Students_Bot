import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParticipationsService } from './participations.service';
import { ParticipationsController } from './participations.controller';
import { Participation } from './participation.entity';
import { Event } from '../events/event.entity'; 
import { StudentsModule } from '../students/students.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Participation, Event]), 
    StudentsModule,
    EventsModule,
  ],
  providers: [ParticipationsService],
  controllers: [ParticipationsController],
  exports: [ParticipationsService],
})
export class ParticipationsModule {}