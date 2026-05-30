export interface UserInfo {
  id: number;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  created_at: number;
}

export interface FormState {
  id: number | null;
  username: string;
  password: string;
  role: 'admin' | 'operator' | 'viewer';
}
