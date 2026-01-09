import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotService } from './bot.service';
import { RegistrationService } from './RegistrationService';
import { CertificateService } from './CertificateService';
import { NotificationService } from './NotificationService';
import { StudentsService } from '../students/students.service';
import { EventsService } from '../events/events.service';
import { ParticipationsService } from '../participations/participations.service';
import { GroupsService } from '../groups/groups.service';
import { StatisticsService } from '../statistics/statistics.service';
import { Student } from '../students/student.entity';
import { Event } from '../events/event.entity';
import { Participation } from '../participations/participation.entity';
import { TextHandler } from './handlers/TextHandler';
import { CallbackHandler } from './handlers/CallbackHandler';
import { DocumentHandler } from './handlers/DocumentHandler';
import { StateService } from './state.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Student, Event, Participation]),
  ],
  providers: [
    BotService,
    RegistrationService,
    CertificateService,
    NotificationService, 
    StudentsService,
    EventsService,
    ParticipationsService,
    GroupsService,
    StatisticsService,
    TextHandler,
    CallbackHandler,
    DocumentHandler,
    StateService,
  ],
  exports: [
    BotService,
    RegistrationService,
    CertificateService,
    NotificationService,
    StateService,
  ],
})
export class BotModule {}