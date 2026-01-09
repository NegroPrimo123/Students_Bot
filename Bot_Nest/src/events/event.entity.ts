import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Participation } from '../participations/participation.entity';

@Entity('events')
export class Event {
  @ApiProperty({ description: 'Уникальный идентификатор', example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Название мероприятия', example: 'Хакатон по веб-разработке' })
  @Column()
  title: string;

  @ApiProperty({ description: 'Описание мероприятия', example: 'Соревнование по созданию веб-приложений' })
  @Column('text')
  description: string;

  @ApiProperty({ description: 'Баллы за участие', example: 10, default: 1 })
  @Column({ name: 'points_awarded', default: 1 })
  points_awarded: number;

  @ApiProperty({ description: 'Курс, для которого мероприятие', example: 2 })
  @Column()
  course: number;

  @ApiProperty({ description: 'Создано администратором', default: true })
  @Column({ name: 'created_by_admin', default: true })
  created_by_admin: boolean;

  @ApiProperty({ description: 'Дата создания', example: '2023-12-01T12:00:00.000Z' })
  @Column({ name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @ApiProperty({ description: 'Архивировано ли мероприятие', default: false })
  @Column({ name: 'is_archived', default: false })
  is_archived: boolean;

  @ApiProperty({ description: 'Дата архивации', nullable: true, required: false })
  @Column({ name: 'archived_at', nullable: true })
  archived_at?: Date;

  @ApiProperty({ description: 'Участия в мероприятии', type: () => [Participation] })
  @OneToMany(() => Participation, participation => participation.event)
  participations: Participation[];
}