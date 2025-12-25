import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Participation } from '../participations/participation.entity';

@Entity('students')
export class Student {
  @ApiProperty({ description: 'Уникальный идентификатор' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Telegram ID пользователя' })
  @Column({ name: 'telegram_id', unique: true, type: 'bigint' })
  telegram_id: number;

  @ApiProperty({ description: 'Username в Telegram', required: false })
  @Column({ nullable: true })
  username: string;

  @ApiProperty({ description: 'Имя' })
  @Column({ name: 'first_name' })
  first_name: string;

  @ApiProperty({ description: 'Фамилия', required: false })
  @Column({ name: 'last_name', nullable: true })
  last_name: string;

  @ApiProperty({ description: 'Отчество', required: false })
  @Column({ name: 'middle_name', nullable: true })
  middle_name: string;

  @ApiProperty({ description: 'Курс обучения (1-3)' })
  @Column()
  course: number;

  @ApiProperty({ description: 'Группа' })
  @Column()
  group: string;

  @ApiProperty({ description: 'Рейтинг студента (1.0-5.0)', example: 3.5 })
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 3.0 })
  rating: number;

  @ApiProperty({ description: 'Дата регистрации' })
  @Column({ name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @OneToMany(() => Participation, participation => participation.student)
  participations: Participation[];
}