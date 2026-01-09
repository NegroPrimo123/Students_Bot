import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private eventsRepository: Repository<Event>,
  ) {}

  async createEvent(eventData: Partial<Event>): Promise<Event> {
    // Простой подход без сложных типов
    const event = this.eventsRepository.create(eventData);
    return await this.eventsRepository.save(event);
  }

  async getEventsByCourse(course: number): Promise<Event[]> {
    return await this.eventsRepository.find({
      where: { course, is_archived: false },
      order: { created_at: 'DESC' },
    });
  }

  async findAll(): Promise<Event[]> {
    return await this.eventsRepository.find({
      where: { is_archived: false },
      order: { created_at: 'DESC' },
    });
  }

  async findAllIncludingArchived(): Promise<Event[]> {
    return await this.eventsRepository.find({
      order: { created_at: 'DESC' },
    });
  }

  async findArchivedEvents(): Promise<Event[]> {
    return await this.eventsRepository.find({
      where: { is_archived: true },
      order: { archived_at: 'DESC' },
    });
  }

  async findById(id: number): Promise<Event | null> {
    return await this.eventsRepository.findOne({ 
      where: { id, is_archived: false } 
    });
  }

  async findByIdIncludingArchived(id: number): Promise<Event | null> {
    return await this.eventsRepository.findOne({ 
      where: { id } 
    });
  }

   async archiveEvent(id: number): Promise<Event> {
    const event = await this.eventsRepository.findOne({
      where: { id },
      relations: ['participations']
    });

    if (!event) {
      throw new NotFoundException('Мероприятие не найдено');
    }

    event.is_archived = true;
    event.archived_at = new Date(); // Используем new Date() вместо null

    return await this.eventsRepository.save(event);
  }

  async restoreEvent(id: number): Promise<Event> {
    const event = await this.eventsRepository.findOne({
      where: { id }
    });

    if (!event) {
      throw new NotFoundException('Мероприятие не найдено');
    }

    event.is_archived = false;
    event.archived_at = undefined; 

    return await this.eventsRepository.save(event);
  }

  async safeDeleteEvent(eventId: number): Promise<void> {
    const event = await this.findByIdIncludingArchived(eventId);
    
    if (!event) {
      throw new NotFoundException('Мероприятие не найдено');
    }

    // Проверяем, есть ли участия в этом мероприятии
    const participationsCount = await this.eventsRepository
      .createQueryBuilder('event')
      .innerJoin('event.participations', 'participation')
      .where('event.id = :eventId', { eventId })
      .getCount();

    if (participationsCount > 0) {
      throw new Error(
        `Невозможно удалить мероприятие. Существует ${participationsCount} записей об участии. Используйте архивацию.`
      );
    }

    await this.eventsRepository.delete(eventId);
  }

  async updateEvent(eventId: number, updateData: Partial<Event>): Promise<Event> {
    const event = await this.findByIdIncludingArchived(eventId);
    
    if (!event) {
      throw new NotFoundException('Мероприятие не найдено');
    }

    // Обновляем только разрешенные поля
    if (updateData.title !== undefined) event.title = updateData.title;
    if (updateData.description !== undefined) event.description = updateData.description;
    if (updateData.points_awarded !== undefined) event.points_awarded = updateData.points_awarded;
    if (updateData.course !== undefined) event.course = updateData.course;
    
    return await this.eventsRepository.save(event);
  }

  // Простой метод для получения события без проверки архивации
  async getEventById(id: number): Promise<Event | null> {
    return await this.eventsRepository.findOne({ where: { id } });
  }
}