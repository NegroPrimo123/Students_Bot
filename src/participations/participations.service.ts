import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Participation } from './participation.entity';
import { StudentsService } from '../students/students.service';
import { EventsService } from '../events/events.service';
import { Student } from '../students/student.entity';
import { Event } from '../events/event.entity';

@Injectable()
export class ParticipationsService {
  private readonly logger = new Logger(ParticipationsService.name);

  constructor(
    @InjectRepository(Participation)
    private participationsRepository: Repository<Participation>,
    @InjectRepository(Event) 
    private eventsRepository: Repository<Event>, 
    private studentsService: StudentsService,
    private eventsService: EventsService,
  ) {}

  async createParticipation(participationData: {
    studentId: number;
    eventId: number;
    certificateFileId?: string;
  }): Promise<Participation> {
    // Проверяем, не существует ли уже участие
    const existingParticipation = await this.participationsRepository.findOne({
      where: {
        student: { id: participationData.studentId },
        event: { id: participationData.eventId },
      },
    });

    if (existingParticipation) {
      throw new Error('Вы уже участвуете в этом мероприятии');
    }

    const participation = this.participationsRepository.create({
      student: { id: participationData.studentId },
      event: { id: participationData.eventId },
      certificate_file_id: participationData.certificateFileId,
      status: 'pending',
    });

    try {
      return await this.participationsRepository.save(participation);
    } catch (error) {
      if (error.code === '23505') {
        throw new Error('Вы уже участвуете в этом мероприятии');
      }
      throw error;
    }
  }

  async getStudentParticipations(studentId: number): Promise<Participation[]> {
  return await this.participationsRepository.find({
    where: { 
      student: { id: studentId }
    },
    relations: ['event'],
    order: { created_at: 'DESC' },
  });
}

  
  async applyMissedEventPenalty(): Promise<{ penalizedStudents: number }> {
  const penaltyAmount = 1.0; // Штраф -1 к рейтингу
  const recentDays = 30; // Период для проверки мероприятий (последние 30 дней)
  
  const students = await this.studentsService.getAllStudents();
  let penalizedCount = 0;

  // Получаем все мероприятия за последние 30 дней
  const recentEvents = await this.getRecentEvents(recentDays);
  
  if (recentEvents.length === 0) {
    this.logger.log('No recent events found for penalty calculation');
    return { penalizedStudents: 0 };
  }

  this.logger.log(`Found ${recentEvents.length} recent events for penalty check`);

  for (const student of students) {
    try {
      const shouldBePenalized = await this.shouldStudentBePenalized(student.id, recentEvents);
      
      if (shouldBePenalized) {
        const newRating = Math.max(1.0, Number(student.rating) - penaltyAmount);
        await this.studentsService.updateRating(student.id, newRating);
        penalizedCount++;

        this.logger.log(`Applied penalty to student ${student.id}. Rating: ${student.rating} -> ${newRating}`);
        
        // Уведомление студента о штрафе
        await this.notifyMissedEventPenalty(student, recentEvents.length, newRating);
      }
    } catch (error) {
      this.logger.error(`Error processing student ${student.id} for penalties:`, error);
    }
  }

  this.logger.log(`Missed event penalties applied: ${penalizedCount} students penalized`);
  return { penalizedStudents: penalizedCount };
}

/**
 * Получить мероприятия за последние N дней
 */
private async getRecentEvents(days: number): Promise<Event[]> {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);

  return await this.eventsRepository
    .createQueryBuilder('event')
    .where('event.created_at >= :threshold', { threshold: dateThreshold })
    .andWhere('event.is_archived = false')
    .getMany();
}

/**
 * Проверить, должен ли студент быть оштрафован
 */
private async shouldStudentBePenalized(studentId: number, recentEvents: Event[]): Promise<boolean> {
  if (recentEvents.length === 0) return false;

  // Получаем все участия студента за этот период
  const studentParticipations = await this.participationsRepository
    .createQueryBuilder('participation')
    .leftJoinAndSelect('participation.event', 'event')
    .where('participation.student_id = :studentId', { studentId })
    .andWhere('event.created_at >= :threshold', { 
      threshold: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) 
    })
    .getMany();

  // Если студент не участвовал ни в одном из recentEvents - штрафуем
  return studentParticipations.length === 0;
}

/**
 * Уведомление о штрафе за пропущенные мероприятия
 */
private async notifyMissedEventPenalty(student: Student, eventsCount: number, newRating: number) {
  const message = `⚠️ Внимание! Ваш рейтинг снижен на 1.0\n\n` +
    `Вы не участвовали ни в одном из ${eventsCount} мероприятий за последние 30 дней.\n` +
    `📉 Новый рейтинг: ${newRating.toFixed(2)}/5.0\n\n` +
    `🎯 Участвуйте в мероприятиях и прикрепляйте сертификаты, чтобы избежать штрафов!\n` +
    `Используйте команду /events для просмотра доступных мероприятий.`;

  // Этот метод будет вызываться из BotService для отправки уведомления
  this.logger.log(`Penalty notification for student ${student.id}: ${message}`);
  
  // Вызываем уведомление через BotService
  await this.notifyStudent(student.telegram_id, message);
}

/**
 * Вспомогательный метод для уведомлений (нужно будет реализовать в BotService)
 */
private async notifyStudent(telegramId: number, message: string): Promise<void> {
  // Этот метод будет реализован через BotService
  // Пока просто логируем
  this.logger.log(`Should notify student ${telegramId}: ${message}`);
}

/**
 * Альтернативный вариант: штрафовать только если студент не участвовал в мероприятиях своего курса
 */
private async shouldStudentBePenalizedByCourse(studentId: number, studentCourse: number, recentEvents: Event[]): Promise<boolean> {
  if (recentEvents.length === 0) return false;

  // Фильтруем мероприятия по курсу студента
  const courseEvents = recentEvents.filter(event => event.course === studentCourse);
  
  if (courseEvents.length === 0) return false; // Нет мероприятий для курса студента

  // Получаем участия студента в мероприятиях его курса
  const courseEventIds = courseEvents.map(event => event.id);
  
  const studentParticipations = await this.participationsRepository
    .createQueryBuilder('participation')
    .where('participation.student_id = :studentId', { studentId })
    .andWhere('participation.event_id IN (:...eventIds)', { eventIds: courseEventIds })
    .getCount();

  // Штрафуем только если студент не участвовал ни в одном мероприятии своего курса
  return studentParticipations === 0;
}
  async getPendingParticipations(): Promise<Participation[]> {
    return await this.participationsRepository.find({
      where: { status: 'pending' },
      relations: ['student', 'event'],
      order: { created_at: 'DESC' },
    });
  }

  async updateParticipationStatus(
  participationId: number,
  status: 'approved' | 'rejected',
  adminComment?: string,
): Promise<Participation> {
  const participation = await this.participationsRepository.findOne({
    where: { id: participationId },
    relations: ['student', 'event'],
  });

  if (!participation) {
    throw new Error('Participation not found');
  }

  const oldStatus = participation.status;
  
  // Если статус не изменился, просто обновляем комментарий
  if (oldStatus === status) {
    if (adminComment) {
      participation.admin_comment = adminComment;
    }
    return await this.participationsRepository.save(participation);
  }

  // Рассчитываем изменение рейтинга
  let ratingChange = 0;
  
  if (status === 'approved' && oldStatus !== 'approved') {
    // Добавляем баллы при подтверждении
    ratingChange = this.calculateRatingChange(participation.event.points_awarded, true);
  } else if (status === 'rejected' && oldStatus === 'approved') {
    // Отнимаем баллы при отклонении ранее подтвержденного
    ratingChange = this.calculateRatingChange(participation.event.points_awarded, false);
  }
  // Если было pending -> rejected, рейтинг не меняется

  // Обновляем статус и комментарий
  participation.status = status;
  if (adminComment) {
    participation.admin_comment = adminComment;
  }

  const updatedParticipation = await this.participationsRepository.save(participation);

  // Обновляем рейтинг студента если есть изменения
  if (ratingChange !== 0) {
    const currentRating = Number(participation.student.rating) || 3.0;
    const newRating = Math.max(1.0, Math.min(5.0, currentRating + ratingChange));
    await this.studentsService.updateRating(participation.student.id, newRating);
  }

  await this.notifyStatusChange(updatedParticipation, oldStatus);
  return updatedParticipation;
}

private calculateRatingChange(pointsAwarded: number, isPositive: boolean): number {
  const baseChange = pointsAwarded * 0.25; 
  return isPositive ? baseChange : -baseChange;
}

  async checkExistingParticipation(studentId: number, eventId: number): Promise<boolean> {
    const participation = await this.participationsRepository.findOne({
      where: {
        student: { id: studentId },
        event: { id: eventId },
      },
    });
    return !!participation;
  }

  

  async getStudentParticipationInEvent(studentId: number, eventId: number): Promise<Participation | null> {
    return await this.participationsRepository.findOne({
      where: {
        student: { id: studentId },
        event: { id: eventId },
      },
      relations: ['event'],
    });
  }

  /**
   * Применение штрафов за неактивность
   */
  async applyInactivityPenalty(): Promise<{ penalizedStudents: number }> {
    const inactiveThreshold = 30; // дней
    const penaltyAmount = 0.2; // Штраф за неактивность
    
    const students = await this.studentsService.getAllStudents();
    let penalizedCount = 0;

    for (const student of students) {
      const lastParticipation = await this.getLastParticipation(student.id);
      
      let daysSinceLastActivity = inactiveThreshold + 1; // По умолчанию штрафуем
      
      if (lastParticipation) {
        daysSinceLastActivity = this.getDaysDifference(
          lastParticipation.created_at, 
          new Date()
        );
      }

      if (daysSinceLastActivity > inactiveThreshold) {
        const newRating = Math.max(1, Number(student.rating) - penaltyAmount);
        await this.studentsService.updateRating(student.id, newRating);
        penalizedCount++;

        this.logger.log(`Applied penalty to student ${student.id}. New rating: ${newRating}`);
        
        // Уведомление студента
        await this.notifyInactivityPenalty(student, daysSinceLastActivity, newRating);
      }
    }

    return { penalizedStudents: penalizedCount };
  }

  private async getLastParticipation(studentId: number): Promise<Participation | null> {
    return await this.participationsRepository.findOne({
      where: { student: { id: studentId } },
      order: { created_at: 'DESC' },
    });
  }

  private getDaysDifference(date1: Date, date2: Date): number {
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  private async notifyInactivityPenalty(student: Student, daysInactive: number, newRating: number) {
    // Этот метод будет вызываться из BotService для отправки уведомления
    // Пока просто логируем
    this.logger.log(`Student ${student.id} inactive for ${daysInactive} days. New rating: ${newRating}`);
  }

  private async notifyStatusChange(participation: Participation, oldStatus: string) {
    // Этот метод будет вызываться из BotService
    this.logger.log(`Status changed for participation ${participation.id}: ${oldStatus} -> ${participation.status}`);
  }

  /**
   * Получить количество ожидающих проверки участий
   */
  async getPendingCount(): Promise<number> {
    return await this.participationsRepository.count({ 
      where: { status: 'pending' } 
    });
  }
}