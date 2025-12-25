import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from './student.entity';

export interface UpdateProfileData {
  first_name?: string;
  last_name?: string;
  middle_name?: string | null;
  group?: string;
  course?: number;
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private studentsRepository: Repository<Student>,
  ) {}

  async registerStudent(studentData: Partial<Student>): Promise<Student> {
    if (!studentData.telegram_id) {
      throw new Error('Telegram ID is required');
    }

    const existingStudent = await this.findByTelegramId(studentData.telegram_id);
    if (existingStudent) {
      throw new Error('Student already registered');
    }

    // Гарантируем, что рейтинг будет числом
    const rating = studentData.rating && !isNaN(Number(studentData.rating)) 
      ? Number(studentData.rating) 
      : 3.0;

    const student = this.studentsRepository.create({
      ...studentData,
      rating: rating,
    });

    return await this.studentsRepository.save(student);
  }

  async updateStudentProfile(telegramId: number, updateData: UpdateProfileData): Promise<Student> {
    const student = await this.findByTelegramId(telegramId);
    if (!student) {
      throw new Error('Student not found');
    }

    // Преобразуем null в undefined для корректного обновления
    const updatePayload: any = { ...updateData };
    if (updatePayload.middle_name === null) {
      updatePayload.middle_name = undefined;
    }

    await this.studentsRepository.update(student.id, updatePayload);
    
    const updatedStudent = await this.findByTelegramId(telegramId);
    if (!updatedStudent) {
      throw new Error('Student not found after update');
    }
    
    return updatedStudent;
  }

  async findByTelegramId(telegramId: number): Promise<Student | null> {
    const student = await this.studentsRepository.findOne({ 
      where: { telegram_id: telegramId } 
    });
    
    // Исправляем рейтинг если он NaN
    if (student && (isNaN(Number(student.rating)) || student.rating === null)) {
      student.rating = 3.0;
      await this.studentsRepository.save(student);
    }
    
    return student;
  }

  async updateRating(studentId: number, newRating: number): Promise<void> {
    // Гарантируем, что рейтинг в допустимом диапазоне
    const safeRating = Math.max(1, Math.min(5, Number(newRating.toFixed(2))));
    await this.studentsRepository.update(studentId, { rating: safeRating });
  }

  async getStudentsWithLowRating(): Promise<Student[]> {
    return await this.studentsRepository
      .createQueryBuilder('student')
      .where('student.rating < :minRating', { minRating: 3.0 })
      .getMany();
  }

  async findById(id: number): Promise<Student | null> {
    const student = await this.studentsRepository.findOne({ where: { id } });
    
    // Исправляем рейтинг если он NaN
    if (student && (isNaN(Number(student.rating)) || student.rating === null)) {
      student.rating = 3.0;
      await this.studentsRepository.save(student);
    }
    
    return student;
  }

  // НОВЫЕ МЕТОДЫ ДЛЯ СТАТИСТИКИ И ШТРАФОВ

  async getAllStudents(): Promise<Student[]> {
    const students = await this.studentsRepository.find();
    
    // Исправляем рейтинги если нужно
    for (const student of students) {
      if (isNaN(Number(student.rating)) || student.rating === null) {
        student.rating = 3.0;
        await this.studentsRepository.save(student);
      }
    }
    
    return students;
  }

  async getStudentsByCourse(course: number): Promise<Student[]> {
    const students = await this.studentsRepository.find({ 
      where: { course }
    });
    
    // Исправляем рейтинги в фоновом режиме
    for (const student of students) {
      if (isNaN(Number(student.rating)) || student.rating === null) {
        student.rating = 3.0;
        await this.studentsRepository.save(student);
      }
    }
    
    return students;
  }

  // Метод для исправления всех некорректных рейтингов
  async fixAllRatings(): Promise<void> {
    const students = await this.studentsRepository.find();
    
    for (const student of students) {
      if (isNaN(Number(student.rating)) || student.rating === null) {
        student.rating = 3.0;
        await this.studentsRepository.save(student);
      }
    }
  }

  // Метод для получения количества студентов с низким рейтингом
  async getLowRatingCount(): Promise<number> {
    return await this.studentsRepository
      .createQueryBuilder('student')
      .where('student.rating < :minRating', { minRating: 3.0 })
      .getCount();
  }

  // Метод для получения общего количества студентов
  async getTotalCount(): Promise<number> {
    return await this.studentsRepository.count();
  }
}