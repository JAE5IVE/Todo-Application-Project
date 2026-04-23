/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Category = 'work' | 'personal' | 'urgent' | 'shopping' | 'health';

export interface Todo {
  id: string;
  text: string;
  description?: string;
  completed: boolean;
  category: Category;
  createdAt: number;
}

export interface TodoStats {
  total: number;
  completed: number;
  pending: number;
}
