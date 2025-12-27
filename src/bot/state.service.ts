import { Injectable } from '@nestjs/common';
import { UserState } from './interfaces';

@Injectable()
export class StateService {
  private userStates = new Map<number, UserState>();

  ensureUserState(telegramId: number): UserState {
    let userState = this.userStates.get(telegramId);
    if (!userState) {
      userState = {};
      this.userStates.set(telegramId, userState);
    }
    return userState;
  }

  getUserState(telegramId: number): UserState | undefined {
    return this.userStates.get(telegramId);
  }

  setUserState(telegramId: number, state: UserState): void {
    this.userStates.set(telegramId, state);
  }

  updateUserState(telegramId: number, updates: Partial<UserState>): void {
    const currentState = this.ensureUserState(telegramId);
    this.userStates.set(telegramId, { ...currentState, ...updates });
  }

  deleteUserState(telegramId: number): void {
    this.userStates.delete(telegramId);
  }

  clearState(telegramId: number): void {
    this.userStates.delete(telegramId);
  }

  getStateCount(): number {
    return this.userStates.size;
  }
}