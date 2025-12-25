import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { StudentsModule } from '../students/students.module';
import { EventsModule } from '../events/events.module';
import { ParticipationsModule } from '../participations/participations.module';
import { GroupsService } from '../groups/groups.service';
import { StatisticsModule } from '../statistics/statistics.module'; 

@Module({
  imports: [
    StudentsModule, 
    EventsModule, 
    ParticipationsModule,
    StatisticsModule, 
  ],
  providers: [BotService, GroupsService],
  exports: [BotService],
})
export class BotModule {}