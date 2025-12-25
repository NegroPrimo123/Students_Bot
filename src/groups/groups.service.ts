import { Injectable } from '@nestjs/common';

@Injectable()
export class GroupsService {
  private readonly groups = [
    // 1 курс
    { id: 1, name: 'ИС-1-1', course: 1 },
    { id: 2, name: 'ИС-1-2', course: 1 },
    { id: 3, name: 'ИС-1-3', course: 1 },
    { id: 4, name: 'ПИ-1-1', course: 1 },
    { id: 5, name: 'ПИ-1-2', course: 1 },
    { id: 6, name: 'ПИ-1-3', course: 1 },
    { id: 7, name: 'ПИ-1-4', course: 1 },
    { id: 8, name: 'КБ-1-1', course: 1 },
    { id: 9, name: 'КБ-1-2', course: 1 },
    { id: 10, name: 'ИБ-1-1', course: 1 },
    { id: 11, name: 'ИБ-1-2', course: 1 },
    { id: 12, name: 'РП-1-1', course: 1 },
    { id: 13, name: 'РП-1-2', course: 1 },
    { id: 14, name: 'УП-1-1', course: 1 },
    { id: 15, name: 'УП-1-2', course: 1 },

    // 2 курс
    { id: 16, name: 'ИС-2-1', course: 2 },
    { id: 17, name: 'ИС-2-2', course: 2 },
    { id: 18, name: 'ИС-2-3', course: 2 },
    { id: 19, name: 'ПИ-2-1', course: 2 },
    { id: 20, name: 'ПИ-2-2', course: 2 },
    { id: 21, name: 'ПИ-2-3', course: 2 },
    { id: 22, name: 'ПИ-2-4', course: 2 },
    { id: 23, name: 'КБ-2-1', course: 2 },
    { id: 24, name: 'КБ-2-2', course: 2 },
    { id: 25, name: 'ИБ-2-1', course: 2 },
    { id: 26, name: 'ИБ-2-2', course: 2 },
    { id: 27, name: 'РП-2-1', course: 2 },
    { id: 28, name: 'РП-2-2', course: 2 },
    { id: 29, name: 'УП-2-1', course: 2 },
    { id: 30, name: 'УП-2-2', course: 2 },

    // 3 курс
    { id: 31, name: 'ИС-3-1', course: 3 },
    { id: 32, name: 'ИС-3-2', course: 3 },
    { id: 33, name: 'ИС-3-3', course: 3 },
    { id: 34, name: 'ПИ-3-1', course: 3 },
    { id: 35, name: 'ПИ-3-2', course: 3 },
    { id: 36, name: 'ПИ-3-3', course: 3 },
    { id: 37, name: 'ПИ-3-4', course: 3 },
    { id: 38, name: 'КБ-3-1', course: 3 },
    { id: 39, name: 'КБ-3-2', course: 3 },
    { id: 40, name: 'ИБ-3-1', course: 3 },
    { id: 41, name: 'ИБ-3-2', course: 3 },
    { id: 42, name: 'РП-3-1', course: 3 },
    { id: 43, name: 'РП-3-2', course: 3 },
    { id: 44, name: 'УП-3-1', course: 3 },
    { id: 45, name: 'УП-3-2', course: 3 },

    // 4 курс 
    { id: 46, name: 'ИС-4-1', course: 4 },
    { id: 47, name: 'ИС-4-2', course: 4 },
    { id: 48, name: 'ПИ-4-1', course: 4 },
    { id: 49, name: 'ПИ-4-2', course: 4 },
    { id: 50, name: 'КБ-4-1', course: 4 },
    { id: 51, name: 'ИБ-4-1', course: 4 },
    { id: 52, name: 'РП-4-1', course: 4 },
    { id: 53, name: 'УП-4-1', course: 4 },
  ];

  getAllGroups() {
    return this.groups;
  }

  getGroupsByCourse(course: number) {
    return this.groups.filter(group => group.course === course);
  }

  getGroupById(id: number) {
    return this.groups.find(group => group.id === id);
  }

  isValidGroup(groupId: number, course: number): boolean {
    const group = this.getGroupById(groupId);
    return group ? group.course === course : false;
  }

  // Новый метод для поиска групп по названию
  searchGroups(query: string, course?: number) {
    let filteredGroups = this.groups;
    
    if (course) {
      filteredGroups = filteredGroups.filter(group => group.course === course);
    }
    
    return filteredGroups.filter(group => 
      group.name.toLowerCase().includes(query.toLowerCase())
    );
  }
}